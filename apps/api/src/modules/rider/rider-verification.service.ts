import { getDbPool } from '../../db/client';
import { config } from '@deetoo/config';
import { AppError } from '../../middleware/error-handler';
import { riderRepository } from './rider.repository';

/** Verified document and equipment review cannot be self-approved by a Rider. */
export const riderDocumentTypes = ['NATIONAL_ID_FRONT','NATIONAL_ID_BACK','SELFIE','DRIVING_LICENCE','VEHICLE_INSURANCE','VEHICLE_LOGBOOK'] as const;
export type RiderDocumentType = typeof riderDocumentTypes[number];
export function requiredRiderDocuments(vehicleType?:string|null): RiderDocumentType[] {
  return vehicleType === 'BICYCLE'
    ? ['NATIONAL_ID_FRONT','NATIONAL_ID_BACK','SELFIE']
    : ['NATIONAL_ID_FRONT','NATIONAL_ID_BACK','SELFIE','DRIVING_LICENCE','VEHICLE_INSURANCE'];
}
export const riderVerificationService = {
  async checklist(riderId:string,vehicleType?:string|null) {
    if(config.storage.mode!=='postgres')return {required:false,documents:[],equipment:null,missing:[],ready:true};
    const pool=getDbPool();
    const rider=await pool.query('SELECT verification_required FROM rider_profiles WHERE id=$1',[riderId]);
    if(!rider.rows[0])throw new AppError(404,'RIDER_NOT_FOUND','Rider profile not found');
    const docs=await pool.query(
      'SELECT id,document_type,status,expires_on,rejection_reason,created_at,reviewed_at FROM rider_verification_documents WHERE rider_id=$1 ORDER BY created_at DESC',
      [riderId]);
    const equipment=await pool.query(
      'SELECT delivery_bag,reflective_vest,helmet,status,rejection_reason,reviewed_at FROM rider_equipment_reviews WHERE rider_id=$1',[riderId]);
    const required=Boolean(rider.rows[0].verification_required);
    const needed=requiredRiderDocuments(vehicleType);
    const missing=needed.filter(type=>{
      const latest=docs.rows.find(row=>row.document_type===type);
      return !latest || latest.status!=='APPROVED' || (latest.expires_on && new Date(latest.expires_on)<=new Date());
    });
    const eq=equipment.rows[0];
    if(!eq||eq.status!=='APPROVED'||!eq.delivery_bag||!eq.reflective_vest||(vehicleType!=='BICYCLE'&&!eq.helmet))missing.push('EQUIPMENT' as RiderDocumentType);
    return {required,documents:docs.rows,equipment:eq||null,missing:required?missing:[],ready:!required||missing.length===0};
  },
  async assertChecklistReady(riderId:string,vehicleType?:string|null) {
    const result=await this.checklist(riderId,vehicleType);
    if(!result.ready)throw new AppError(409,'RIDER_VERIFICATION_INCOMPLETE',
      'Approved verification documents and reviewed equipment are required before Rider onboarding proceeds',
      {missing:result.missing});
  }
};
