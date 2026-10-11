import { Router } from 'express';
import { z } from 'zod';
import { requireAuth,requireRole,AuthenticatedRequest } from '../auth/auth.middleware';
import { riderRepository } from './rider.repository';
import { ledgerRepository } from '../finance/ledger.repository';
import { getDbPool } from '../../db/client';
import { config } from '@deetoo/config';
import { riderResponse } from './rider-response';
import { AppError } from '../../middleware/error-handler';

/** Read-only financial/ratings aggregates and non-critical Rider preferences. */
export const riderInsightsRouter=Router();
riderInsightsRouter.use(requireAuth,requireRole('rider'));
riderInsightsRouter.use((_req,res,next)=>{const original=res.json.bind(res);res.json=data=>original(riderResponse(data));next();});
const period=z.object({days:z.coerce.number().int().min(1).max(366).default(30)}).parse;
async function own(req:AuthenticatedRequest) {
  const rider=await riderRepository.findProfileByUserId(req.user!.id);
  if(!rider)throw new AppError(404,'RIDER_NOT_FOUND','Rider profile not found');
  return rider;
}
const defaults={payouts:true,support:true,promotions:false,updates:true,sounds:true,vibration:true,language:'English',map_style:'Standard'};
const pref=z.object({
  payouts:z.boolean(),support:z.boolean(),promotions:z.boolean(),updates:z.boolean(),
  sounds:z.boolean(),vibration:z.boolean(),language:z.enum(['English','Kiswahili']),map_style:z.enum(['Standard','Satellite']),
}).strict();
riderInsightsRouter.get('/earnings/trends',async(req:AuthenticatedRequest,res,next)=>{
  try{
    const rider=await own(req),{days}=period(req.query);
    const all=await ledgerRepository.findRiderEarningsByRiderId(rider.id);
    const since=new Date(Date.now()-(days-1)*86400000).toISOString().slice(0,10);
    const byDay=new Map<string,{date:string,total_minor:number,bonus_minor:number,adjustments_minor:number,deliveries:number}>();
    for(const item of all){
      const date=String(item.created_at).slice(0,10);
      if(date<since)continue;
      const row=byDay.get(date)||{date,total_minor:0,bonus_minor:0,adjustments_minor:0,deliveries:0};
      row.deliveries++;
      row.total_minor+=Number(item.total_amount_minor||0);
      row.bonus_minor+=Number(item.bonus_amount_minor||0);
      row.adjustments_minor+=Number(item.adjustment_amount_minor||0);
      byDay.set(date,row);
    }
    const series=Array.from(byDay.values()).sort((a,b)=>a.date.localeCompare(b.date));
    res.json({data:{days,currency:'KES',series,total_minor:series.reduce((n,x)=>n+x.total_minor,0),deliveries:series.reduce((n,x)=>n+x.deliveries,0)}});
  }catch(e){next(e);}
});
riderInsightsRouter.get('/performance/feedback',async(req:AuthenticatedRequest,res,next)=>{
  try{
    const rider=await own(req),{days}=period(req.query);
    if(config.storage.mode!=='postgres')return res.json({data:{feedback:[],days}});
    const found=await getDbPool().query(
      "SELECT rating,comment,created_at FROM delivery_ratings WHERE rider_id=$1 AND created_at >= now()-($2::int * interval '1 day') ORDER BY created_at DESC LIMIT 100",
      [rider.id,days]);
    res.json({data:{feedback:found.rows.map(v=>({rating:v.rating,comment:v.comment,created_at:v.created_at})),days}});
  }catch(e){next(e);}
});
riderInsightsRouter.get('/preferences',async(req:AuthenticatedRequest,res,next)=>{
  try{
    const rider=await own(req);
    if(config.storage.mode!=='postgres')return res.json({data:{...defaults,critical:{delivery:true,account:true,safety:true}}});
    const found=await getDbPool().query('SELECT preferences FROM rider_ui_preferences WHERE rider_id=$1',[rider.id]);
    res.json({data:{...defaults,...(found.rows[0]?.preferences||{}),critical:{delivery:true,account:true,safety:true}}});
  }catch(e){next(e);}
});
riderInsightsRouter.put('/preferences',async(req:AuthenticatedRequest,res,next)=>{
  try{
    if(config.storage.mode!=='postgres')throw new AppError(503,'DURABLE_STORAGE_REQUIRED','Preferences require durable storage');
    const rider=await own(req),input=pref.parse(req.body);
    const saved=await getDbPool().query(
      'INSERT INTO rider_ui_preferences(rider_id,preferences) VALUES($1,$2::jsonb) ON CONFLICT(rider_id) DO UPDATE SET preferences=EXCLUDED.preferences,updated_at=now() RETURNING preferences',
      [rider.id,JSON.stringify(input)]);
    res.json({data:{...saved.rows[0].preferences,critical:{delivery:true,account:true,safety:true}}});
  }catch(e){next(e);}
});
