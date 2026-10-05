import { rows,one,insert } from '../../db/adapter';
import { withTransaction } from '../../db/transaction';
import { AppError } from '../../middleware/error-handler';
const selection=`SELECT m.*,u.email AS user_email, COALESCE((SELECT jsonb_agg(branch_id) FROM merchant_membership_branches WHERE membership_id=m.id),'[]'::jsonb) AS branch_ids FROM merchant_memberships m JOIN users u ON u.id=m.user_id`;
async function branches(id:string,ids:string[]) {
  await rows('DELETE FROM merchant_membership_branches WHERE membership_id=$1',[id]);
  for(const branch of new Set(ids))await rows('INSERT INTO merchant_membership_branches(membership_id,branch_id) VALUES($1,$2)',[id,branch]);
}
export const postgresMemberships = {
  getMembershipsForUser:(id:string)=>rows(selection+' WHERE m.user_id=$1',[id]),
  listMembershipsByMerchant:(id:string)=>rows(selection+' WHERE m.merchant_id=$1',[id]),
  findMembershipById:(id:string)=>one(selection+' WHERE m.id=$1',[id]),
  createMembership:(m:any)=>withTransaction(async()=>{
    await insert('merchant_memberships',m,['id','merchant_id','user_id','role_code','status']);
    await branches(m.id,m.branch_ids||[]);
    return postgresMemberships.findMembershipById(m.id);
  }),
  updateMembership:(id:string,m:any)=>withTransaction(async()=>{
    // The tenant and identity of a membership are immutable; change access explicitly.
    if(m.merchant_id||m.user_id)throw new AppError(400,'IMMUTABLE_MEMBERSHIP','Membership ownership cannot be changed');
    const found=await one('SELECT id FROM merchant_memberships WHERE id=$1 FOR UPDATE',[id]);
    if(!found)return null;
    await rows('UPDATE merchant_memberships SET role_code=COALESCE($2,role_code),status=COALESCE($3,status) WHERE id=$1',[id,m.role_code||null,m.status||null]);
    if(m.branch_ids)await branches(id,m.branch_ids);
    return postgresMemberships.findMembershipById(id);
  }),
  createInvitation:(m:any)=>insert('merchant_invitations',{...m,branch_ids:JSON.stringify(m.branch_ids||[])},['id','merchant_id','email','phone_e164','role_code','branch_ids','invitation_token','status','expires_at','invited_by_user_id']),
  findInvitationByToken:(token:string)=>one('SELECT * FROM merchant_invitations WHERE invitation_token=$1',[token]),
  listInvitationsByMerchant:(id:string)=>rows('SELECT * FROM merchant_invitations WHERE merchant_id=$1',[id]),
  updateInvitation:(token:string,m:any)=>one('UPDATE merchant_invitations SET status=COALESCE($2,status) WHERE invitation_token=$1 RETURNING *',[token,m.status||null]),
};
