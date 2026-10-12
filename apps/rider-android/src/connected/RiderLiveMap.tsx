import React,{useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Image,Pressable,Text,View} from 'react-native';
import * as Location from 'expo-location';
import {C,S} from '../preview/ui';
import {type MapPoint,type MapZone,mapCenter,tilePoint,validPoint,zoneRings,haversineMeters,heading,bearing} from './rider-map-model';
import {riderTileTemplate,rasterTileUrl} from './rider-tile-provider';

type Route={points:MapPoint[];meters:number;seconds:number;steps:Array<{instruction:string;meters:number}>};
const toText=(meters:number)=>meters>=1000?(meters/1000).toFixed(1)+' km':meters+' m';
type Props={rider?:MapPoint|null;zones?:MapZone[];destination?:MapPoint|null;destinationLabel?:string;route?:boolean;height?:number;loadRoute?:()=>Promise<Route>};
export function RiderLiveMap({rider=null,zones=[],destination=null,destinationLabel='Destination',route=false,height=255,loadRoute}:Props){
 const [gps,setGps]=useState<MapPoint|null>(null),[zoomAdjust,setZoomAdjust]=useState(0);
 const [tileFailed,setTileFailed]=useState(false);
 const [width,setWidth]=useState(330),[road,setRoad]=useState<Route|null>(null);
 const [routingError,setRoutingError]=useState(''),[routing,setRouting]=useState(false);
 const start=gps||rider||null;
 const center=mapCenter(start,zones,destination);
 useEffect(()=>{
  if(!route)return;
  let active=true,subscription:Location.LocationSubscription|null=null;
  void (async()=>{
    const permission=await Location.getForegroundPermissionsAsync();
    if(!active||!permission.granted)return;
    subscription=await Location.watchPositionAsync({accuracy:Location.Accuracy.Balanced,timeInterval:15000,distanceInterval:20},position=>{
     if(active)setGps({latitude:position.coords.latitude,longitude:position.coords.longitude});
    });
  })().catch(()=>{});
  return()=>{active=false;subscription?.remove();};
 },[route]);
 useEffect(()=>{
  if(!route||!validPoint(start)||!validPoint(destination)){setRoad(null);return;}
  if(!loadRoute){setRoad(null);setRoutingError('DeeToo road guidance is unavailable for this delivery');return;}
  let active=true;setRoad(null);setRouting(true);setRoutingError('');
  void loadRoute().then(result=>{if(active)setRoad(result);})
   .catch(e=>{if(active){setRoad(null);setRoutingError(e instanceof Error?e.message:String(e));}})
   .finally(()=>{if(active)setRouting(false);});
  return()=>{active=false;};
 // Only reroute on meaningful GPS movement rather than every heartbeat.
 },[route,destination?.latitude,destination?.longitude,start?.latitude!=null?Math.round(start.latitude*2000):null,start?.longitude!=null?Math.round(start.longitude*2000):null]);
 const frame=useMemo(()=>{
  if(!center)return null;
  let z=13+zoomAdjust;
  if(validPoint(start)&&validPoint(destination)){
   for(let level=15+zoomAdjust;level>=6;level--){
    const a=tilePoint(start,level),d=tilePoint(destination,level);
    if(Math.abs(a.x-d.x)<width-65&&Math.abs(a.y-d.y)<height-65){z=level;break;}
   }
  }
  z=Math.min(17,Math.max(6,z));
  const pixel=tilePoint(center,z);
  const left=pixel.x-width/2,top=pixel.y-height/2;
  const minX=Math.floor(left/256),minY=Math.floor(top/256);
  const tiles=[];
  for(let dx=0;dx<=Math.ceil(width/256)+1;dx++)
   for(let dy=0;dy<=Math.ceil(height/256)+1;dy++){
    const x=minX+dx,y=minY+dy,size=2**z;
    if(y<0||y>=size)continue;
    tiles.push({x,y,z,xpos:x*256-left,ypos:y*256-top,wrappedX:((x%size)+size)%size});
   }
  const project=(p:MapPoint)=>{const q=tilePoint(p,z);return {x:q.x-left,y:q.y-top};};
  return {tiles,project};
 },[center?.latitude,center?.longitude,start?.latitude,destination?.latitude,start?.longitude,destination?.longitude,height,width,zoomAdjust]);
 const boundarySegments=useMemo(()=>zones.filter(z=>z.status!=='DISABLED').flatMap(zoneRings)
   .flatMap(ring=>ring.slice(1).map((point,i)=>[ring[i],point] as [MapPoint,MapPoint])).slice(0,1100),[zones]);
 const segment=(p:MapPoint,q:MapPoint,key:string,color:string,weight:number)=>{
  if(!frame)return null;
  const a=frame.project(p),d=frame.project(q),len=Math.hypot(d.x-a.x,d.y-a.y);
  if(len<1||len>2000)return null;
  const angle=Math.atan2(d.y-a.y,d.x-a.x)*180/Math.PI;
  return <View key={key} pointerEvents="none" style={{position:'absolute',left:(a.x+d.x)/2-len/2,top:(a.y+d.y)/2-weight/2,width:len,height:weight,backgroundColor:color,borderRadius:weight/2,transform:[{rotate:angle+'deg'}]}}/>;
 };
 const pin=(point:MapPoint|null,label:string,color:string)=>{
  if(!frame||!validPoint(point))return null;
  const p=frame.project(point);
  return <View key={label} pointerEvents="none" style={{position:'absolute',left:p.x-10,top:p.y-10,alignItems:'center',justifyContent:'center'}}>
   <View style={{height:20,width:20,borderRadius:12,backgroundColor:color,borderWidth:3,borderColor:'#fff'}}/>
   <Text style={{fontSize:10,fontWeight:'900',paddingHorizontal:5,paddingVertical:3,borderRadius:5,overflow:'hidden',backgroundColor:'#fff',color:C.ink}}>{label}</Text>
  </View>;
 };
 if(!center)return <View style={{padding:22,backgroundColor:C.paleOrange,borderRadius:16,gap:8}}>
   <Text style={S.h2}>Map needs a location</Text><Text style={S.sub}>Turn on location permission, or ask Operations to assign a mapped service zone. No sample location is displayed.</Text>
  </View>;
 return <View style={{gap:10}}>
   <View onLayout={e=>setWidth(Math.max(200,Math.round(e.nativeEvent.layout.width)))} accessibilityLabel="Interactive Rider map with live location and DeeToo service boundaries" style={{height,overflow:'hidden',borderRadius:18,backgroundColor:'#E2EDE5',borderWidth:1,borderColor:C.border}}>
    {riderTileTemplate&&!tileFailed?frame?.tiles.map(t=><Image key={t.x+':'+t.y+':'+t.z} source={{uri:rasterTileUrl(riderTileTemplate,t)}} onError={()=>setTileFailed(true)} resizeMode="stretch" style={{position:'absolute',width:256,height:256,left:t.xpos,top:t.ypos}} />):null}
    {!riderTileTemplate||tileFailed?<View pointerEvents="none" style={{position:'absolute',top:12,left:10,right:62,padding:10,backgroundColor:'#FFF8E9',borderRadius:11,borderWidth:1,borderColor:C.border}}><Text style={{color:C.ink,fontWeight:'800',fontSize:12}}>{tileFailed?'Basemap provider unavailable':'Map tiles need provider setup'}</Text><Text style={{color:C.muted,fontSize:11}}>DeeToo retains the assigned route and GPS, but street tiles require a licensed map provider configured in the Rider build.</Text></View>:null}
    {boundarySegments.map(([a,d],i)=>segment(a,d,'zone-'+i,'rgba(0,126,76,0.76)',3))}
    {road?.points.slice(1).filter((_,i)=>i%Math.max(1,Math.ceil(road.points.length/350))===0).map((q,i,a)=>segment(i===0?road.points[0]:a[i-1],q,'route-'+i,'#1266EA',5))}
    {pin(start,'You','#12A057')}{pin(destination,destinationLabel,'#1768DF')}
    <View style={{position:'absolute',right:7,top:8,gap:6}}>
     <Pressable accessibilityLabel="Zoom in map" onPress={()=>setZoomAdjust(v=>Math.min(3,v+1))} style={{backgroundColor:'white',padding:10,borderRadius:9}}><Text style={S.h2}>+</Text></Pressable>
     <Pressable accessibilityLabel="Zoom out map" onPress={()=>setZoomAdjust(v=>Math.max(-5,v-1))} style={{backgroundColor:'white',padding:10,borderRadius:9}}><Text style={S.h2}>−</Text></Pressable>
    </View>
    {riderTileTemplate&&!tileFailed?<Text style={{position:'absolute',bottom:5,right:7,fontSize:9,backgroundColor:'rgba(255,255,255,0.9)',color:C.ink,padding:4}}>© MapTiler / tile provider · © OpenStreetMap contributors</Text>:null}
   </View>
   {route&&validPoint(destination)&&validPoint(start)?<View style={{gap:7}}>
     {routing?<View style={{flexDirection:'row',gap:8}}><ActivityIndicator color={C.darkGreen}/><Text style={S.sub}>Calculating road route…</Text></View>:null}
     {road?<View style={{padding:12,backgroundColor:C.paleBlue,borderRadius:12,gap:5}}>
       <Text style={[S.text,{fontWeight:'800'}]}>Route: {toText(road.meters)} · about {Math.ceil(road.seconds/60)} min</Text>
       {road.steps.slice(0,5).map((step,i)=><Text style={S.sub} key={i}>{i+1}. {step.instruction} · {toText(step.meters)}</Text>)}
       <Text style={S.meta}>Road routing estimate, not guaranteed traffic-aware guidance. Follow road signs and drive safely.</Text>
     </View>:<Text style={S.meta}>{routingError||'Waiting for road directions.'} · Destination {toText(haversineMeters(start,destination))} {heading(bearing(start,destination))} as the crow flies.</Text>}
   </View>:null}
   {!route?<Text style={S.meta}>{zones.length} assigned service zone(s) · Green boundaries are from DeeToo; location comes from the device/API.</Text>:null}
 </View>;
}
