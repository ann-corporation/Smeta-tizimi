import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const root=process.env.HOUR_PRICE_PACK;
test('actual hourly source pack hash and counts',()=>{
 assert.ok(root,'HOUR_PRICE_PACK actual source artifact required');
 const manifest=JSON.parse(fs.readFileSync(root+'/manifest.json'));
 const bytes=fs.readFileSync(root+'/catalog.json');
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.files['catalog.json'].sha256);
 const catalog=JSON.parse(bytes);
 assert.equal(catalog.machineCoverage,'PARTIAL_VERIFIED_SUBSET');
 assert.equal(catalog.machines.length,30);assert.equal(catalog.labour.length,30);
 assert.equal(catalog.unavailableLabour.length,30);
 assert.equal(new Set(catalog.machines.map(r=>r.machineKey)).size,30);
 assert.equal(catalog.sourceEvidence.machines.length,60);
 assert.ok(catalog.labour.every(r=>r.unit==='чел-ч' && Number(r.price)>0 && r.quarter<=2));
 assert.ok(catalog.unavailableLabour.every(r=>r.quarter>=3));
 for(const row of catalog.machines){
  const observations=catalog.sourceEvidence.machines.filter(r=>r.name===row.name);
  assert.equal(observations.length,2);
  assert.equal(Number(row.price),Math.max(...observations.map(r=>Number(r.price))));
  assert.equal(row.unit,'маш-ч'); assert.equal(row.vat,'EXCLUDED');
 }
 assert.equal(catalog.machines.find(r=>r.name.includes('Автопогрузчики 5')).price,'148613');
 assert.equal(catalog.machines.find(r=>r.name.endsWith('0,65 м3')).price,'247550');
});
