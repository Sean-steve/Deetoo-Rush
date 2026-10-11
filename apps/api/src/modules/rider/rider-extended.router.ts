/**
 * Rider-specific read models and safety intake.
 * Mounted before the legacy Rider router to avoid intercepting its ":id"
 * ownership parameter. No admin incident transitions are exposed here.
 */
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireAuth, requireRole, AuthenticatedRequest } from '../auth/auth.middleware';
import { riderRepository } from './rider.repository';
import { deliveryRepository } from '../order/delivery.repository';
import { ledgerRepository } from '../finance/ledger.repository';
import { operationsRepository } from '../operations/operations.repository';
import { operationalIncidentService } from '../operations/incident.service';
import { mediaService } from '../media/media.service';
import { getDbPool } from '../../db/client';
import { config } from '@deetoo/config';
import { AppError } from '../../middleware/error-handler';
import { riderResponse } from './rider-response';
import { supportService } from '../operations/support.service';

export const riderExtendedRouter = Router();
riderExtendedRouter.use(requireAuth, requireRole('rider'));
riderExtendedRouter.use((_req,res,next)=>{
  const send = res.json.bind(res);
  res.json = value => send(riderResponse(value));
  next();
});
const uuid = z.string().uuid();
const incidentInput = z.object({
  type: z.enum(['ACCIDENT','VEHICLE_BREAKDOWN','UNSAFE_LOCATION','HARASSMENT','OTHER']),
  summary: z.string().trim().min(8).max(300),
  details: z.string().trim().min(15).max(4000),
  location_text: z.string().trim().min(3).max(250),
  occurred_at: z.string().datetime().optional(),
  delivery_id: uuid.optional(),
}).strict();
function queryPagination(req: AuthenticatedRequest) {
  return z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), offset: z.coerce.number().int().min(0).default(0) }).parse(req.query);
}
async function ownRider(req: AuthenticatedRequest) {
  const rider = await riderRepository.findProfileByUserId(req.user!.id);
  if (!rider) throw new AppError(404,'RIDER_NOT_FOUND','Rider profile not found');
  return rider;
}
function safeHistory(delivery:any,earning:any) {
  return {
    delivery_id: delivery.id, order_id: delivery.order_id, order_number: delivery.order_number || null,
    status: delivery.status, created_at: delivery.created_at,
    assigned_at: delivery.assigned_at, picked_up_at: delivery.picked_up_at,
    delivered_at: delivery.delivered_at, failed_at: delivery.failed_at,
    // No customer address, phone, OTP, pickup secret, GPS or proof value after fulfilment.
    currency: earning?.currency || 'KES',
    earning: earning ? {
      base_minor: earning.base_amount_minor, distance_minor: earning.distance_amount_minor,
      waiting_minor: earning.waiting_amount_minor, bonus_minor: earning.bonus_amount_minor,
      adjustments_minor: earning.adjustment_amount_minor, total_minor: earning.total_amount_minor,
      status: earning.status,
    } : null,
  };
}
const terminal = ['DELIVERED','FAILED','CANCELLED'];
riderExtendedRouter.get('/deliveries/history', async(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{
  try {
    const rider=await ownRider(req);
    const {limit,offset}=queryPagination(req);
    const status=req.query.status ? z.enum(['DELIVERED','FAILED','CANCELLED']).parse(req.query.status) : undefined;
    const found=await deliveryRepository.listDeliveries({assigned_rider_id:rider.id,status:status||terminal as any,page:Math.floor(offset/limit)+1,limit});
    const history=await Promise.all(found.deliveries.map(async d=>{
      const earning=await ledgerRepository.findRiderEarningByDeliveryId(d.id);
      return safeHistory(d,earning);
    }));
    res.json({data:{history,total:found.total,limit,offset},requestId:(req as any).requestId});
  } catch(error){next(error);}
});
riderExtendedRouter.get('/deliveries/history/:historyId', async(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{
  try {
    const rider=await ownRider(req);
    const delivery=await deliveryRepository.findById(uuid.parse(req.params.historyId));
    if(!delivery || delivery.assigned_rider_id!==rider.id || !terminal.includes(String(delivery.status)))
      throw new AppError(404,'DELIVERY_HISTORY_NOT_FOUND','Completed delivery record unavailable');
    const earning=await ledgerRepository.findRiderEarningByDeliveryId(delivery.id);
    res.json({data:safeHistory(delivery,earning),requestId:(req as any).requestId});
  } catch(error){next(error);}
});
function safeIncident(incident:any) {
  return {
    id:incident.id,type:incident.type,severity:incident.severity,status:incident.status,
    summary:incident.summary,details:incident.details,reason_code:incident.reason_code,
    delivery_id:incident.delivery_id,order_id:incident.order_id,
    location_text:incident.metadata?.rider_location_text||null,
    occurred_at:incident.metadata?.occurred_at||null,
    created_at:incident.created_at,updated_at:incident.updated_at,
    timeline:(incident.timeline||[]).map((step:any)=>({
      id:step.id,action:step.action,created_at:step.created_at,
      // Do not expose internal staff notes, names, investigation metadata or private IDs.
    })),
  };
}
riderExtendedRouter.get('/incidents', async(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{
  try {
    const rider=await ownRider(req);
    const {limit,offset}=queryPagination(req);
    const found=await operationsRepository.findIncidents({rider_id:rider.id,limit,offset});
    res.json({data:{incidents:found.incidents.map(safeIncident),total:found.total,limit,offset},requestId:(req as any).requestId});
  } catch(error){next(error);}
});
riderExtendedRouter.post('/incidents', async(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{
  try {
    const rider=await ownRider(req);
    const input=incidentInput.parse(req.body);
    let orderId:string|null=null;
    if(input.delivery_id){
      const delivery=await deliveryRepository.findById(input.delivery_id);
      if(!delivery || delivery.assigned_rider_id!==rider.id)
        throw new AppError(403,'RIDER_INCIDENT_DELIVERY_FORBIDDEN','Delivery belongs to another rider');
      orderId=delivery.order_id;
    }
    const incident=await operationalIncidentService.raiseIncident({
      type:'RIDER_'+input.type,severity:input.type==='ACCIDENT'||input.type==='HARASSMENT'?'HIGH':'MEDIUM',
      summary:input.summary,details:input.details,
      rider_id:rider.id,delivery_id:input.delivery_id||null,order_id:orderId,
      reason_code:input.type,actor_id:req.user!.id,actor_name:'Rider report',
      metadata:{source:'RIDER_SELF_REPORT',rider_location_text:input.location_text,occurred_at:input.occurred_at||new Date().toISOString()},
    });
    res.status(201).json({data:safeIncident(incident),requestId:(req as any).requestId});
  }catch(error){next(error);}
});
riderExtendedRouter.get('/incidents/:incidentId', async(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{
  try {
    const rider=await ownRider(req);
    const incident=await operationsRepository.getIncidentById(uuid.parse(req.params.incidentId));
    if(!incident||incident.rider_id!==rider.id)throw new AppError(404,'RIDER_INCIDENT_NOT_FOUND','Incident not found');
    res.json({data:safeIncident(incident),requestId:(req as any).requestId});
  }catch(error){next(error);}
});
riderExtendedRouter.post('/incidents/:incidentId/evidence',async(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{
  try{
    const rider=await ownRider(req);
    const incident=await operationsRepository.getIncidentById(uuid.parse(req.params.incidentId));
    if(!incident||incident.rider_id!==rider.id)throw new AppError(404,'RIDER_INCIDENT_NOT_FOUND','Incident not found');
    if(['RESOLVED','DISMISSED','CLOSED'].includes(String(incident.status)))
      throw new AppError(409,'INCIDENT_FINALIZED','Closed incidents cannot accept new Rider evidence');
    const input=z.object({media_id:uuid,description:z.string().trim().min(5).max(500)}).strict().parse(req.body);
    await mediaService.assertVerifiedOwnedMedia(input.media_id,req.user!.id,'RIDER_INCIDENT',incident.id);
    if(config.storage.mode!=='postgres')throw new AppError(503,'DURABLE_STORAGE_REQUIRED','Incident evidence requires durable storage');
    const result=await getDbPool().query(
      'INSERT INTO rider_incident_evidence(incident_id,media_object_id,added_by,description) VALUES($1,$2,$3,$4) ON CONFLICT(incident_id,media_object_id) DO NOTHING RETURNING id',
      [incident.id,input.media_id,req.user!.id,input.description],
    );
    res.status(result.rowCount?201:200).json({data:{incident_id:incident.id,media_id:input.media_id,recorded:!!result.rowCount},requestId:(req as any).requestId});
  }catch(error){next(error);}
});
riderExtendedRouter.get('/incidents/:incidentId/evidence',async(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{
  try{
    const rider=await ownRider(req);
    const incident=await operationsRepository.getIncidentById(uuid.parse(req.params.incidentId));
    if(!incident||incident.rider_id!==rider.id)throw new AppError(404,'RIDER_INCIDENT_NOT_FOUND','Incident not found');
    if(config.storage.mode!=='postgres')return res.json({data:{evidence:[]},requestId:(req as any).requestId});
    const result=await getDbPool().query('SELECT id,media_object_id,description,created_at FROM rider_incident_evidence WHERE incident_id=$1 ORDER BY created_at DESC',[incident.id]);
    res.json({data:{evidence:result.rows},requestId:(req as any).requestId});
  }catch(error){next(error);}
});

// Profile, verified vehicle and payout-destination changes enter Support governance;
// no direct backend identity or bank destination change is made by a Rider.
riderExtendedRouter.post('/profile/change-requests',async(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{
  try{
    const rider=await ownRider(req);
    const input=z.object({
      category:z.enum(['PERSONAL','VEHICLE','PAYOUT_DESTINATION','ACCOUNT_DEACTIVATION','ACCOUNT_DELETION']),
      description:z.string().trim().min(15).max(1200),
    }).strict().parse(req.body);
    const created=await supportService.createCase({
      rider_id:rider.id,category:'ACCOUNT_UPDATE',priority:'MEDIUM',
      subject:'Rider '+input.category.toLowerCase().replace(/_/g,' ')+' review',
      description:input.description,
      creator:{id:req.user!.id,name:'Rider',role:'rider'},
    });
    res.status(201).json({data:{case_id:created.id,case_number:created.case_number,status:created.status},note:'An authorized administrator must verify and apply this request'});
  }catch(e){next(e);}
});
