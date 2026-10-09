/** Expire payment-pending stock holds without touching paid or prepared orders.
 * Runs in the existing supervised automation worker; SKIP LOCKED is safe across replicas.
 * Provider captures arriving after expiry observe a CANCELLED order and follow the
 * existing verified-capture cancellation/refund coordinator.
 */
import { getDbPool } from "../../db/client";
import { config } from "@deetoo/config";

export async function expireCheckoutStockHolds(limit=100):Promise<{expired:number;released_units:number}> {
  if(config.storage.mode!=="postgres")return {expired:0,released_units:0};
  const db=getDbPool(),client=await db.connect();
  try {
    await client.query("BEGIN");
    const expired=await client.query(
      `SELECT o.id
       FROM orders o
       WHERE o.status='PENDING_PAYMENT'
         AND EXISTS (SELECT 1 FROM merchant_stock_reservations r WHERE r.order_id=o.id
                     AND r.state='HELD' AND r.expires_at<NOW())
         AND NOT EXISTS (SELECT 1 FROM payment_capture_evidence e WHERE e.order_id=o.id)
       ORDER BY o.id FOR UPDATE OF o SKIP LOCKED LIMIT $1`,[limit]);
    let units=0;
    for (const row of expired.rows) {
      const status=await client.query(
        `UPDATE orders SET status='CANCELLED',cancelled_at=NOW(),
          cancellation_reason='STOCK_HOLD_EXPIRED',cancelled_by_type='SYSTEM',
          updated_at=NOW(),version=version+1
         WHERE id=$1 AND status='PENDING_PAYMENT' RETURNING id`,[row.id]);
      if (!status.rowCount)continue;
      await client.query(
        `INSERT INTO order_timeline(id,order_id,from_status,to_status,actor_type,reason_code,note,metadata,created_at)
         VALUES(gen_random_uuid(),$1,'PENDING_PAYMENT','CANCELLED','SYSTEM','STOCK_HOLD_EXPIRED',
                'Unpaid checkout stock hold expired','{}'::jsonb,NOW())`,[row.id]);
      const held=await client.query(
        `UPDATE merchant_stock_reservations SET state='RELEASED',released_at=NOW()
         WHERE order_id=$1 AND state='HELD' RETURNING branch_id,item_id,quantity`,[row.id]);
      for(const stock of held.rows){
        const r=await client.query(
          `UPDATE merchant_item_inventory SET quantity=quantity+$3,updated_at=NOW()
           WHERE branch_id=$1 AND item_id=$2`,[stock.branch_id,stock.item_id,stock.quantity]);
        if(r.rowCount)units+=stock.quantity;
      }
    }
    await client.query("COMMIT");
    return {expired:expired.rows.length,released_units:units};
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
