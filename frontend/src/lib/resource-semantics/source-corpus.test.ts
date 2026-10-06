// @vitest-environment node
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resourceFacts } from './index';
const root=process.env.CATALOG_SHARD_DIR;
it.skipIf(!root)('actual source resources: every proven hourly unit classified independently of Tip',()=>{
 const manifest=JSON.parse(readFileSync(join(root!,'manifest.json'),'utf8'));
 const resources=new Map<string,[string|null,string|null,string|null,string|null,string|null]>();
 for(const spec of Object.values(manifest.files.shards) as {path:string;sha256:string}[]){
  const bytes=gunzipSync(readFileSync(join(root!,'gz',spec.path+'.gz')));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(spec.sha256);
  const shard=JSON.parse(bytes.toString());
  for(const [id,row] of Object.entries(shard.resources)) resources.set(id,row as never);
 }
 let machines=0,labour=0,unknown=0,rMachines=0;
 for(const [id,row] of resources){
  const facts=resourceFacts({name:row[2],unitCode:row[3],type:row[4]});
  if(['010','011','619'].includes(row[3]??'')){
   expect(facts.kind,`resource ${id}`).toBe('MACHINE');
   expect(facts.unit).toBe('маш-ч');machines++;
   if(row[4]==='R') rMachines++;
  }
  if(row[3]==='001'){expect(facts.kind).toBe('LABOUR');expect(facts.unit).toBe('чел-ч');labour++;}
  if(facts.kind==='UNRESOLVED')unknown++;
 }
 expect(resources.size).toBe(7916);expect(rMachines).toBeGreaterThan(0);
 console.log(JSON.stringify({revision:manifest.revision,resources:resources.size,machines,labour,unknown,rMachines}));
});
