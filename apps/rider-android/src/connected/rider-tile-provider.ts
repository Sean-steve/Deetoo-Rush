/**
 * Authorized basemap provider configuration for Android.
 * Never send native image requests directly to OSMF's volunteer tile servers.
 * The MapTiler key is a client-visible, restricted *public* tile key.
 */
export type RasterTile={z:number;wrappedX:number;y:number};
const osmFoundationHosts=new Set(['tile.openstreetmap.org','a.tile.openstreetmap.org','b.tile.openstreetmap.org','c.tile.openstreetmap.org','vector.openstreetmap.org']);
export function configuredTileTemplate(key:string|undefined,customTemplate:string|undefined):string|null{
 const template=String(customTemplate||'').trim()||(key? 'https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key='+encodeURIComponent(key):'');
 if(!template)return null;
 try{
  const url=new URL(template);
  if(url.protocol!=='https:'||osmFoundationHosts.has(url.hostname.toLowerCase()))return null;
  if(!['{z}','{x}','{y}'].every(v=>template.includes(v)))return null;
  return template;
 }catch{return null;}
}
export function rasterTileUrl(template:string,tile:RasterTile):string{
 return template.replace(/\{z\}/g,String(tile.z)).replace(/\{x\}/g,String(tile.wrappedX)).replace(/\{y\}/g,String(tile.y));
}
export const riderTileTemplate=configuredTileTemplate(process.env.EXPO_PUBLIC_RIDER_MAPTILER_KEY,process.env.EXPO_PUBLIC_RIDER_TILE_TEMPLATE);
