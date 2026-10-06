import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const folder=process.env.CATALOG_SUGGESTION_PACK;
if(!folder)throw new Error('Set CATALOG_SUGGESTION_PACK for actual generated pack acceptance');
const m=JSON.parse(readFileSync(join(folder,'manifest.json'))),data={};
const sha=b=>createHash('sha256').update(b).digest('hex');
test('every generated shard compressed/raw bytes match manifest',()=>{
  for(const [name,spec] of Object.entries(m.files)) {
    const compressed=readFileSync(join(folder,name)),b=gunzipSync(compressed);
    assert.equal(compressed.length,spec.compressedBytes);assert.equal(sha(compressed),spec.compressedSha256);
    assert.equal(b.length,spec.bytes);assert.equal(sha(b),spec.sha256);data[name]=JSON.parse(b);
  }
});
test('all1438source rules retained with original expressions',()=>{
  assert.equal(Object.keys(data['rules.gz']).length,1438);
  assert.equal(m.counts.rules,1438);assert.ok(Object.values(data['rules.gz']).every(r=>Object.hasOwn(r.source,'PRAV')));
});
test('all95704links accounted for in scoped lookup or explicit unresolved file',()=>{
  const ids=new Set(data['unresolved-links.gz'].map(r=>r.link.factReferenceId));
  for(const [name,d] of Object.entries(data)) if(name.startsWith('lookup-')) for(const rows of Object.values(d)) for(const r of rows)ids.add(r.linkId);
  assert.equal(ids.size,95704);assert.equal(m.counts.links,95704);
});
test('every lookup key hashes to its bounded shard and preserves four-part context',()=>{
  for(const [name,d] of Object.entries(data)) if(name.startsWith('lookup-')) for(const [key,rows] of Object.entries(d)) {
    assert.equal(JSON.parse(key).length,4);
    assert.equal(name,`lookup-${(parseInt(sha(key).slice(0,2),16)%16).toString(16)}.gz`);
    assert.ok(rows.every(r=>r.canApply===false && r.status==='SOURCE_RULE_REVIEW_REQUIRED'));
  }
});
test('unknown official edition and unverified DSL cannot become executable',()=>{
  assert.equal(m.canExecuteCoefficients,false);assert.equal(m.officialEditionVerified,false);
  assert.equal(m.alternatives.automatedSubstitutionAllowed,false);
});
