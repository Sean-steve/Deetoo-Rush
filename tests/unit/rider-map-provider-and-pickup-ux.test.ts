import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {configuredTileTemplate,rasterTileUrl} from '../../apps/rider-android/src/connected/rider-tile-provider';
import {deliveryAreaName} from '../../apps/rider-android/src/connected/rider-map-model';

test('uses only an explicitly configured third-party map provider',()=>{
 assert.equal(configuredTileTemplate(undefined,undefined),null);
 assert.equal(configuredTileTemplate(undefined,'https://tile.openstreetmap.org/{z}/{x}/{y}.png'),null);
 assert.equal(configuredTileTemplate(undefined,'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'),null);
 assert.equal(configuredTileTemplate(undefined,'http://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png'),null);
 assert.equal(configuredTileTemplate(undefined,'https://example.com/{z}/{x}.png'),null);
 const template=configuredTileTemplate('restricted-map-key',undefined);
 assert.equal(template,'https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key=restricted-map-key');
 assert.equal(rasterTileUrl(template!,{z:13,wrappedX:4933,y:4171}),
  'https://api.maptiler.com/maps/streets-v4/256/13/4933/4171.png?key=restricted-map-key');
});
test('dropoff label uses verified locality and does not mistake country for area',()=>{
 assert.equal(deliveryAreaName('Kilimani','60 Ngong Road, Nairobi, Kenya'),'Kilimani');
 assert.equal(deliveryAreaName(undefined,'60 Ngong Road, Kilimani, Nairobi, Kenya'),'Kilimani');
 assert.equal(deliveryAreaName(undefined,'Westlands, Nairobi, Kenya'),'Westlands');
 assert.equal(deliveryAreaName('Home','Sunset Apartments, Karen, Nairobi'),'Karen');
 assert.equal(deliveryAreaName(undefined,'78 Ring Road'),'');
 assert.equal(deliveryAreaName(undefined,undefined),'');
});
test('Rider navigation opens only after server confirms merchant pickup code',()=>{
 const screen=readFileSync('apps/rider-android/src/connected/RiderConnectedApp.tsx','utf8');
 const confirmation=screen.indexOf("const confirmed=await api.confirmPickup(d,form.pickupCode||'')");
 const guarded=screen.indexOf("if(confirmed?.status!=='PICKED_UP')",confirmation);
 const navigate=screen.indexOf("go(11);",guarded);
 assert.ok(confirmation>=0&&guarded>confirmation&&navigate>guarded);
 assert.ok(screen.includes('Start trip to customer'));
 const map=readFileSync('apps/rider-android/src/connected/RiderLiveMap.tsx','utf8');
 assert.ok(!map.includes('tile.openstreetmap.org'));
});
