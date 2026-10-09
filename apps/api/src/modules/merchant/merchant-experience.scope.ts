/** Security and scope helpers shared by new Merchant phase-two endpoints. */
import { z } from 'zod';
import { config } from '@deetoo/config';
import { AppError } from '../../middleware/error-handler';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { merchantRoles, merchantScope, branchScope } from '../auth/scope';
import { merchantRepository } from './merchant.repository';
import { getDbPool } from '../../db/client';

export function durable() {
  if(config.storage.mode !== 'postgres') throw new AppError(503,'DURABLE_STORAGE_REQUIRED','PostgreSQL storage is required for this operation');
  return getDbPool();
}
export async function ownMerchant(req:AuthenticatedRequest,manage=false) {
  if(!req.user?.roles.some(role=>merchantRoles.includes(String(role))))
    throw new AppError(403,'MERCHANT_ACCOUNT_REQUIRED','Merchant role required');
  const requested=z.string().uuid().optional().parse(req.query.merchant_id);
  const memberships=(await merchantRepository.getMembershipsForUser(req.user.id)).filter(m=>m.status==='ACTIVE');
  const id=requested||memberships[0]?.merchant_id;
  if(!id)throw new AppError(403,'MERCHANT_SCOPE_REQUIRED','Active merchant membership required');
  await merchantScope(req.user,id,manage,manage,false);
  return id;
}
export async function ownBranch(req:AuthenticatedRequest,manage=false){
  await ownMerchant(req,false);
  const id=z.string().uuid().parse(req.params.branchId||req.query.branch_id);
  await branchScope(req.user!,id);
  const branch=await merchantRepository.findBranchById(id);
  if(!branch)throw new AppError(404,'BRANCH_NOT_FOUND','Branch not found');
  if(manage)await merchantScope(req.user!,branch.merchant_id,true,true,false);
  return {id,merchantId:branch.merchant_id};
}
export const pageSchema=z.object({
  limit:z.coerce.number().int().min(1).max(100).default(50),
  offset:z.coerce.number().int().min(0).max(100000).default(0)
});
export const datesSchema=z.object({
  from:z.string().datetime({offset:true}).optional(),
  to:z.string().datetime({offset:true}).optional()
});
