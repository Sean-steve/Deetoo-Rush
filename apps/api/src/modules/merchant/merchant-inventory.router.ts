import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../auth/auth.middleware';
import { AppError } from '../../middleware/error-handler';
import { ownBranch, durable } from './merchant-experience.scope';
export const merchantInventoryRouter=Router();
merchantInventoryRouter.use(requireAuth);
const run=(f:(req:AuthenticatedRequest,res:Response)=>Promise<void>)=>(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{Promise.resolve().then(()=>f(req,res)).catch(next);};

merchantInventoryRouter.get('/branches/:branchId/inventory',run(async(req,res)=>{
  const db=durable(),{id}=await ownBranch(req);
  const rows=await db.query(`SELECT i.item_id,i.quantity,i.low_stock_threshold,i.updated_at,m.name,m.sku,m.is_available
    FROM merchant_item_inventory i JOIN menu_items m ON m.id=i.item_id WHERE i.branch_id=$1 ORDER BY m.name`,[id]);
  res.json({data:rows.rows});
}));
merchantInventoryRouter.post('/branches/:branchId/inventory/:itemId/adjust',run(async(req,res)=>{
  const db=durable(),{id,merchantId}=await ownBranch(req,true);
  const itemId=z.string().uuid().parse(req.params.itemId);
  const input=z.object({delta:z.number().int().min(-100000).max(100000).refine(v=>v!==0),
    reason:z.string().trim().min(4).max(120),idempotency_key:z.string().min(8).max(128)}).parse(req.body);
  const c=await db.connect();
  try{
    await c.query('BEGIN');
    const valid=await c.query(`SELECT 1 FROM menu_items i JOIN menus m ON m.id=i.menu_id
      WHERE i.id=$1 AND (m.merchant_id=$2 OR EXISTS(SELECT 1 FROM merchant_branches b WHERE b.id=m.branch_id AND b.merchant_id=$2))
      AND (m.branch_id=$3 OR EXISTS(SELECT 1 FROM menu_branch_assignments a WHERE a.menu_id=m.id AND a.branch_id=$3))`,
      [itemId,merchantId,id]);
    if(!valid.rowCount)throw new AppError(404,'ITEM_NOT_IN_BRANCH','Item is not assigned to this branch');
    await c.query(`INSERT INTO merchant_item_inventory(merchant_id,branch_id,item_id,quantity,updated_by)
      VALUES($1,$2,$3,0,$4) ON CONFLICT(branch_id,item_id) DO NOTHING`,
      [merchantId,id,itemId,req.user!.id]);
    const prev=(await c.query('SELECT quantity,low_stock_threshold FROM merchant_item_inventory WHERE branch_id=$1 AND item_id=$2 FOR UPDATE',[id,itemId])).rows[0];
    const old=(await c.query('SELECT * FROM merchant_inventory_movements WHERE branch_id=$1 AND idempotency_key=$2',[id,input.idempotency_key])).rows[0];
    if(old){
      if(old.item_id!==itemId||old.delta!==input.delta||old.reason!==input.reason)
        throw new AppError(409,'IDEMPOTENCY_CONFLICT','Idempotency key is already in use');
      await c.query('COMMIT');res.json({data:old,replayed:true});return;
    }
    const newQty=Number(prev.quantity)+input.delta;
    if(newQty<0)throw new AppError(409,'INSUFFICIENT_STOCK','Stock cannot become negative');
    const row=(await c.query(`INSERT INTO merchant_inventory_movements(merchant_id,branch_id,item_id,delta,quantity_after,reason,idempotency_key,actor_user_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
       [merchantId,id,itemId,input.delta,newQty,input.reason,input.idempotency_key,req.user!.id])).rows[0];
    await c.query('UPDATE merchant_item_inventory SET quantity=$3,updated_by=$4,updated_at=NOW() WHERE branch_id=$1 AND item_id=$2',
      [id,itemId,newQty,req.user!.id]);
    if(prev.quantity>prev.low_stock_threshold&&newQty<=prev.low_stock_threshold)
      await c.query(`INSERT INTO notifications(recipient_type,recipient_id,channel,template_code,subject,payload,idempotency_key)
         VALUES('MERCHANT',$1,'IN_APP','LOW_STOCK','Item stock below threshold',$2,$3)`,
         [merchantId,JSON.stringify({branch_id:id,item_id:itemId,quantity:newQty}),'merchant-low-stock:'+row.id]);
    await c.query('COMMIT');res.status(201).json({data:row});
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}));
merchantInventoryRouter.put('/branches/:branchId/inventory/:itemId/threshold',run(async(req,res)=>{
  const db=durable(),{id}=await ownBranch(req,true);const itemId=z.string().uuid().parse(req.params.itemId);
  const threshold=z.object({low_stock_threshold:z.number().int().min(0).max(100000)}).parse(req.body).low_stock_threshold;
  const rows=await db.query(`UPDATE merchant_item_inventory SET low_stock_threshold=$3,updated_by=$4,updated_at=NOW()
    WHERE branch_id=$1 AND item_id=$2 RETURNING *`,[id,itemId,threshold,req.user!.id]);
  if(!rows.rowCount)throw new AppError(404,'INVENTORY_NOT_FOUND','Stock record must be initialized first');
  res.json({data:rows.rows[0]});
}));
