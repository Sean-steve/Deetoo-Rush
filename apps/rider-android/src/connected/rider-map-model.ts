/** Pure Web Mercator utilities for DeeToo's in-app Rider map. */
export type MapPoint={latitude:number;longitude:number};
export type MapZone={id?:string;name?:string;boundary?:unknown;status?:string};
export const validPoint=(point:unknown):point is MapPoint=>{
 const p=point as MapPoint|null;
 return !!p&&typeof p.latitude==='number'&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=85&&
 typeof p.longitude==='number'&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180;
};
export function geoPoint(value:unknown):MapPoint|null{
 const v=value as Record<string,unknown>|null;
 if(!v||typeof v!=='object')return null;
 const loc=(v.location&&typeof v.location==='object'?v.location:v) as Record<string,unknown>;
 const latitude=Number(loc.latitude??loc.lat),longitude=Number(loc.longitude??loc.lng);
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||loc.latitude==null&&loc.lat==null||loc.longitude==null&&loc.lng==null)return null;
 return validPoint({latitude,longitude})?{latitude,longitude}:null;
}
export function zoneRings(zone:MapZone):MapPoint[][]{
 const raw=(zone.boundary||null) as any;
 const geometry=raw?.geometry||raw;
 const coordinates=geometry?.coordinates;
 if(!coordinates||!Array.isArray(coordinates))return [];
 const polygons=geometry.type==='Polygon'?[coordinates]:geometry.type==='MultiPolygon'?coordinates:[];
 return polygons.flatMap((polygon:any)=>Array.isArray(polygon)?polygon.map((ring:any)=>
   Array.isArray(ring)?ring.map((pair:any)=>Array.isArray(pair)&&pair.length>=2?geoPoint({longitude:pair[0],latitude:pair[1]}):null).filter(validPoint):[]):[]);
}
export function tilePoint(point:MapPoint,zoom:number){
 const n=2**zoom;
 const lat=Math.max(-85.0511,Math.min(85.0511,point.latitude))*Math.PI/180;
 return {x:(point.longitude+180)/360*n*256,y:(1-Math.asinh(Math.tan(lat))/Math.PI)/2*n*256};
}
export function mapCenter(rider:MapPoint|null,zones:MapZone[],target?:MapPoint|null):MapPoint|null{
 if(rider)return rider;
 const first=zones.flatMap(zoneRings).flat()[0];
 return first||target||null;
}
export function shortReference(value:unknown,display?:unknown,kind='DT'):string{
 const named=String(display||'').trim();if(named)return named;
 const raw=String(value||'').trim();if(!raw)return 'Not assigned';
 return /^[\da-f]{8}-[\da-f-]{27}$/i.test(raw)?kind+'-'+raw.slice(0,8).toUpperCase():raw;
}
export function haversineMeters(a:MapPoint,b:MapPoint){
 const rad=Math.PI/180,p1=a.latitude*rad,p2=b.latitude*rad,dLat=(b.latitude-a.latitude)*rad,dLng=(b.longitude-a.longitude)*rad;
 return Math.round(6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dLat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dLng/2)**2))));
}
export const heading=(degrees:number)=>['N','NE','E','SE','S','SW','W','NW'][Math.round(((degrees%360+360)%360)/45)%8];
export function bearing(a:MapPoint,b:MapPoint){
 const rad=Math.PI/180,dy=Math.sin((b.longitude-a.longitude)*rad)*Math.cos(b.latitude*rad),
 dx=Math.cos(a.latitude*rad)*Math.sin(b.latitude*rad)-Math.sin(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.cos((b.longitude-a.longitude)*rad);
 return (Math.atan2(dy,dx)*180/Math.PI+360)%360;
}

/** Prefer the assigned order's verified area rather than generic "Customer". */
export function deliveryAreaName(area:unknown,address:unknown):string{
 const clean=(x:unknown)=>typeof x==='string'?x.trim().replace(/\s+/g,' '):'';
 const selected=clean(area);
 if(selected&&!/^(home|work|other|customer drop.?off|delivery address)$/i.test(selected))return selected;
 const parts=clean(address).split(',').map(x=>x.trim()).filter(Boolean)
   .filter((part,i,all)=>i!==all.length-1||!/^(kenya|ke)$/i.test(part));
 if(parts.length>=3)return parts[parts.length-2];
 if(parts.length===2)return parts[0];
 if(parts.length===1&&!/\d|\b(road|street|avenue|plot|house|building)\b/i.test(parts[0]))return parts[0];
 // A single unstructured address cannot reliably establish a neighborhood.
 return '';
}
