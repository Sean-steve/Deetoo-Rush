/** Owner-managed merchant restrictions: never grant beyond platform RBAC.
 * Every protected mutation calls this check on the server after branch/merchant scoping.
 */
import { AppError } from '../../middleware/error-handler';
import { getDbPool } from '../../db/client';
import { config } from '@deetoo/config';
import { merchantRepository } from './merchant.repository';

export const roleCapabilities=[
 'ORDERS_WRITE','MENU_WRITE','INVENTORY_WRITE','BRANCH_WRITE','DOCUMENTS_WRITE','FINANCE_READ','TEAM_INVITE'
] as const;
export type MerchantCapability=(typeof roleCapabilities)[number];
export type ScopedRole='merchant_owner'|'merchant_manager'|'merchant_staff';
const baseline:Record<ScopedRole,ReadonlySet<MerchantCapability>>={
 merchant_owner:new Set(roleCapabilities),
 merchant_manager:new Set(['ORDERS_WRITE','MENU_WRITE','INVENTORY_WRITE','BRANCH_WRITE','DOCUMENTS_WRITE','FINANCE_READ','TEAM_INVITE']),
 merchant_staff:new Set(['ORDERS_WRITE'])
};
export function platformRoleCan(role:ScopedRole,cap:MerchantCapability):boolean {
 return baseline[role].has(cap);
}
export async function effectiveMerchantCapabilities(merchantId:string){
 if(config.storage.mode!=='postgres')throw new AppError(503,'DURABLE_STORAGE_REQUIRED','Role control requires PostgreSQL');
 const res=await getDbPool().query('SELECT role_code,capability,allowed FROM merchant_role_capability_controls WHERE merchant_id=$1',[merchantId]);
 return Object.fromEntries((['merchant_owner','merchant_manager','merchant_staff'] as ScopedRole[]).map(role=>[
  role,Object.fromEntries(roleCapabilities.map(cap=>[
   cap,{platform_allowed:platformRoleCan(role,cap),
        allowed:platformRoleCan(role,cap)&&res.rows.find(x=>x.role_code===role&&x.capability===cap)?.allowed!==false,
        editable:role!=='merchant_owner'&&platformRoleCan(role,cap)}
  ]))]));
}
export async function requireMerchantCapability(userId:string,merchantId:string,cap:MerchantCapability):Promise<void>{
 const memberships=await merchantRepository.getMembershipsForUser(userId);
 const membership=memberships.find(m=>m.merchant_id===merchantId&&m.status==='ACTIVE');
 if(!membership)throw new AppError(403,'MERCHANT_SCOPE_REQUIRED','Active merchant membership required');
 const role=membership.role_code as ScopedRole;
 if(!baseline[role]||!platformRoleCan(role,cap))
   throw new AppError(403,'CAPABILITY_NOT_GRANTED','This role does not have the required capability');
 if(role==='merchant_owner')return;
 if(config.storage.mode!=='postgres')return; // Existing simulation RBAC remains deterministic.
 const res=await getDbPool().query(
  'SELECT allowed FROM merchant_role_capability_controls WHERE merchant_id=$1 AND role_code=$2 AND capability=$3',
  [merchantId,role,cap]);
 if(res.rows[0]?.allowed===false)
   throw new AppError(403,'MERCHANT_CAPABILITY_DISABLED','Merchant owner disabled this capability for your role');
}
