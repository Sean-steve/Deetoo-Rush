import { config } from '@deetoo/config';
import { getDbPool } from '../../db/client';
import { withTransaction } from '../../db/transaction';
import { AppError } from '../../middleware/error-handler';

export type MerchantOnboardingStage =
  | 'APPLICATION' | 'DOCUMENTS_PENDING' | 'COMMERCIAL_TERMS' | 'CONTENT_SETUP'
  | 'MENU_QA' | 'STAFF_TRAINING' | 'READY_FOR_REVIEW' | 'APPROVED' | 'LIVE' | 'BLOCKED';

class MerchantOnboardingService {
  async readiness(merchantId:string){
    if(config.storage.mode!=='postgres'){
      return { merchant_exists:true,branch_ready:false,menu_ready:false,staff_ready:false,commercial_ready:false,payout_ready:false,ready_for_live:false };
    }
    const row=(await getDbPool().query(`SELECT
      EXISTS(SELECT 1 FROM merchants m WHERE m.id=$1) AS merchant_exists,
      EXISTS(SELECT 1 FROM merchant_branches b WHERE b.merchant_id=$1 AND b.status='ACTIVE'
        AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL) AS branch_ready,
      EXISTS(SELECT 1 FROM menus mn JOIN merchant_branches b ON b.id=mn.branch_id
        WHERE b.merchant_id=$1 AND mn.status='ACTIVE'
        AND EXISTS(SELECT 1 FROM menu_items mi WHERE mi.menu_id=mn.id AND mi.is_available=true)) AS menu_ready,
      EXISTS(SELECT 1 FROM merchant_memberships mm WHERE mm.merchant_id=$1
        AND mm.status='ACTIVE' AND mm.role_code='merchant_owner') AS staff_ready,
      EXISTS(SELECT 1 FROM merchants m WHERE m.id=$1 AND m.commission_bps IS NOT NULL
        AND m.settlement_schedule IS NOT NULL) AS commercial_ready,
      EXISTS(SELECT 1 FROM payout_destinations pd WHERE pd.owner_type='MERCHANT'
        AND pd.owner_id=$1 AND pd.active=true AND pd.verified_at IS NOT NULL) AS payout_ready`,[merchantId])).rows[0];
    if(!row?.merchant_exists) throw new AppError(404,'MERCHANT_NOT_FOUND','Merchant not found');
    const result={...row};
    return {...result,ready_for_live:Boolean(row.branch_ready&&row.menu_ready&&row.staff_ready&&row.commercial_ready&&row.payout_ready)};
  }

  async list(stage?:string){
    if(config.storage.mode!=='postgres') return [];
    const params:any[]=[]; let filter='';
    if(stage){params.push(stage);filter=`WHERE COALESCE(s.stage,'APPLICATION')=$1`;}
    const res=await getDbPool().query(`SELECT m.id AS merchant_id,m.display_name,m.approval_status,m.status,
      COALESCE(s.stage,'APPLICATION') AS stage,s.readiness,s.assigned_to,s.note,s.updated_at
      FROM merchants m LEFT JOIN merchant_onboarding_state s ON s.merchant_id=m.id
      ${filter} ORDER BY COALESCE(s.updated_at,m.updated_at) DESC LIMIT 200`,params);
    const result=[];
    for(const row of res.rows){
      result.push({...row,readiness:await this.readiness(row.merchant_id)});
    }
    return result;
  }

  async update(merchantId:string,stage:MerchantOnboardingStage,actorId:string,note?:string,assignedTo?:string){
    const readiness=await this.readiness(merchantId);
    if(['READY_FOR_REVIEW','APPROVED','LIVE'].includes(stage)&&!readiness.ready_for_live){
      throw new AppError(409,'MERCHANT_ONBOARDING_INCOMPLETE','Merchant is not ready for activation',{readiness});
    }
    return withTransaction(async client=>{
      const res=await client.query(`INSERT INTO merchant_onboarding_state(
        merchant_id,stage,readiness,assigned_to,note,updated_by,updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,NOW())
      ON CONFLICT(merchant_id) DO UPDATE SET stage=EXCLUDED.stage,readiness=EXCLUDED.readiness,
        assigned_to=EXCLUDED.assigned_to,note=EXCLUDED.note,updated_by=EXCLUDED.updated_by,updated_at=NOW()
      RETURNING *`,[merchantId,stage,JSON.stringify(readiness),assignedTo||null,note||null,actorId]);
      if(stage==='APPROVED'||stage==='LIVE'){
        await client.query(`UPDATE merchants SET approval_status='APPROVED',status='ACTIVE',updated_at=NOW() WHERE id=$1`,[merchantId]);
      }
      await client.query(`INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
        VALUES($1,'MERCHANT_ONBOARDING_STAGE_CHANGED','MERCHANT',$2,$3)`,[actorId,merchantId,JSON.stringify({stage,note:note||null})]);
      return {...res.rows[0],readiness};
    });
  }
}

export const merchantOnboardingService=new MerchantOnboardingService();
