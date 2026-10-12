import {test} from 'node:test';
import assert from 'node:assert/strict';
import {geoPoint,zoneRings,mapCenter,tilePoint,haversineMeters,heading,bearing,shortReference} from '../../apps/rider-android/src/connected/rider-map-model';

test('operational summary uses server public order number, otherwise short stable UUID',()=>{
 const id='e6b7c58c-2064-4178-9b8a-3adc96d1e686';
 assert.equal(shortReference(id,'DT-2026-004'),'DT-2026-004');
 assert.equal(shortReference(id),'DT-E6B7C58C');
 assert.equal(shortReference(id,null,'DLV'),'DLV-E6B7C58C');
 assert.equal(shortReference(null),'Not assigned');
});

test('service zone map uses actual DeeToo GeoJSON coordinates, not sample Nairobi geometry',()=>{
 const zone={id:'zone1',status:'ACTIVE',boundary:{type:'MultiPolygon',coordinates:[
  [[ [36.81,-1.29],[36.83,-1.29],[36.83,-1.27],[36.81,-1.29] ]]
 ]}};
 const rings=zoneRings(zone);
 assert.equal(rings.length,1);
 assert.deepEqual(rings[0][0],{latitude:-1.29,longitude:36.81});
 assert.deepEqual(mapCenter(null,[zone]),rings[0][0]);
 assert.equal(zoneRings({id:'none'}).length,0);
 assert.equal(mapCenter(null,[]),null);
});
test('map bounds, map projection and bearings are finite and position-consistent',()=>{
 const west=geoPoint({location:{lat:-1.27,lng:36.80}});
 const east=geoPoint({latitude:-1.27,longitude:36.83});
 assert.ok(west&&east);
 assert.equal(geoPoint({latitude:null,longitude:null}),null);
 assert.ok(tilePoint(west,12).x<tilePoint(east,12).x);
 assert.ok(haversineMeters(west,east)>2000);
 assert.equal(heading(bearing(west,east)),'E');
});
