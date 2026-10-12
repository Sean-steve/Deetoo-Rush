import {config} from '@deetoo/config';
import {AppError} from '../../middleware/error-handler';
import {dispatchService} from '../order/dispatch.service';
import {riderRepository} from '../rider/rider.repository';
import {riderLocationStore} from '../../db/redis';

type Point={latitude:number;longitude:number};
const finite=(p:Point)=>Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=85&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180;
function point(v:any):Point{
 const p={latitude:Number(v?.latitude??v?.lat),longitude:Number(v?.longitude??v?.lng)};
 if(!v||!finite(p))throw new AppError(422,'RIDER_MAP_COORDINATES_MISSING','A verified pickup or drop-off coordinate is missing');
 return p;
}
function decodePolyline(encoded:string):Point[]{
 const output:Point[]=[];let index=0,lat=0,lng=0;
 while(index<encoded.length&&output.length<2500){
  const next=()=>{
   let shift=0,result=0,b=0;
   do{if(index>=encoded.length)throw new Error('Invalid route polyline');b=encoded.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5;}while(b>=32);
   return (result&1)?~(result>>1):result>>1;
  };
  lat+=next();lng+=next();output.push({latitude:lat/1e5,longitude:lng/1e5});
 }
 return output;
}
export async function riderRouteForDelivery(deliveryId:string,userId:string,stop:'pickup'|'dropoff'){
 // Ownership and active-fulfilment checks are performed on the authorized
 // dispatch detail, NOT on user-supplied destination coordinates.
 const detail=await dispatchService.getRiderDeliveryDetail(deliveryId,userId);
 const rider=await riderRepository.findProfileByUserId(userId);
 if(!rider)throw new AppError(404,'RIDER_NOT_FOUND','Rider profile not found');
 const latest=await riderLocationStore.getLiveLocation(rider.id);
 const recorded=latest&&Date.parse(latest.receivedAt||latest.recordedAt);
 if(!latest||!recorded||Date.now()-recorded>config.rider.locationStaleSeconds*1000)
  throw new AppError(409,'RIDER_LOCATION_STALE','Share a fresh Rider GPS location before calculating a road route');
 const origin=point(latest);
 const destination=point(stop==='pickup'?detail.pickup.location:detail.dropoff.location);
 const key=process.env.GOOGLE_ROUTES_API_KEY;
 const localRoute=(!config.isProduction&&config.localWorkflow)?process.env.DEETOO_RIDER_LOCAL_ROUTING_URL:undefined;
 if(!key&&!localRoute)
  throw new AppError(503,'RIDER_ROUTING_UNCONFIGURED','In-app route guidance requires GOOGLE_ROUTES_API_KEY or an explicitly configured local routing service');
 try{
  if(!key&&localRoute){
   const url=new URL(localRoute);
   // Strictly local developer test server, never disclose delivery positions to a
   // public third-party "demo" endpoint without explicit provider authorization.
   if(!['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname)||url.protocol!=='http:')
    throw new AppError(503,'RIDER_ROUTING_UNCONFIGURED','Local routing service must use a loopback HTTP address');
   const path='/route/v1/driving/'+origin.longitude+','+origin.latitude+';'+destination.longitude+','+destination.latitude+'?overview=full&geometries=geojson&steps=true';
   const response=await fetch(url.origin+path,{signal:AbortSignal.timeout(8500)});
   if(!response.ok)throw new Error('Local route provider HTTP '+response.status);
   const result=(await response.json()).routes?.[0];
   if(!result?.geometry?.coordinates)throw new Error('Road route unavailable');
   return {provider:'LOCAL_OSRM',meters:Math.round(result.distance),seconds:Math.round(result.duration),
     points:result.geometry.coordinates.slice(0,2000).map((p:number[])=>({latitude:p[1],longitude:p[0]})).filter(finite),
     steps:(result.legs||[]).flatMap((l:any)=>l.steps||[]).slice(0,30).map((s:any)=>({
      instruction:[s.maneuver?.type,s.maneuver?.modifier,s.name?'onto '+s.name:''].filter(Boolean).join(' '),
      meters:Math.round(s.distance),
     })),
   };
  }
  const response=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{
   method:'POST',headers:{'content-type':'application/json','X-Goog-Api-Key':key!,
     'X-Goog-FieldMask':'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction.instructions'},
   body:JSON.stringify({
     origin:{location:{latLng:origin}},destination:{location:{latLng:destination}},
     travelMode:'DRIVE',routingPreference:'TRAFFIC_AWARE',computeAlternativeRoutes:false,
   }),signal:AbortSignal.timeout(9000),
  });
  if(!response.ok)throw new Error('Google Routes HTTP '+response.status);
  const result=(await response.json()).routes?.[0];
  if(!result?.polyline?.encodedPolyline)throw new Error('No road route returned');
  return {provider:'GOOGLE_ROUTES',meters:Number(result.distanceMeters)||0,seconds:Number(String(result.duration||'0').replace(/s$/,''))||0,
    points:decodePolyline(result.polyline.encodedPolyline),
    steps:(result.legs||[]).flatMap((l:any)=>l.steps||[]).slice(0,30).map((s:any)=>({
     instruction:String(s.navigationInstruction?.instructions||'Continue along the marked road'),
     meters:Number(s.distanceMeters)||0,
    })),
  };
 }catch(error){
  if(error instanceof AppError)throw error;
  throw new AppError(503,'RIDER_ROUTE_UNAVAILABLE','Unable to calculate a verified road route right now. Your map and delivery details remain available.');
 }
}
