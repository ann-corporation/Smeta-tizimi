/** Explicit local acceptance against the real, immutable source; no production writes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { reviewHierarchy } from './reconcile.mjs';
const input = process.env.CATALOG_SHARD_DIR;
const packetPath = process.env.CATALOG_BOOK_PACKET;
if (!input || !packetPath) throw new Error('Set CATALOG_SHARD_DIR and CATALOG_BOOK_PACKET for actual source acceptance');
const manifest = JSON.parse(readFileSync(join(input,'manifest.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const packet = readFileSync(packetPath);
const raw = name => gunzipSync(readFileSync(join(input,'gz',name+'.json.gz')));
const worksBytes=raw('works'),treeBytes=raw('tree');
const works=JSON.parse(worksBytes).works,nodes=JSON.parse(treeBytes).nodes;
const book=JSON.parse(packet).tables.find(t=>t.name==='BOOK').rows;
const report=reviewHierarchy(book,works,nodes);
test('actual BOOK and index bytes match captured manifest hashes',()=>{
  assert.equal(hash(packet),manifest.source.bookPacketSha256);
  for(const [name,bytes] of [['works',worksBytes],['tree',treeBytes]]) {
    const spec=Object.values(manifest.files).find(f=>f.path===name+'.json');
    assert.equal(hash(bytes),spec.sha256);assert.equal(bytes.length,spec.bytes);
  }
});
test('8053/8053 unresolved records accounted for once',()=>{
  assert.equal(report.length,nodes.find(n=>n[0]==='u')[3]);
  assert.equal(report.length,8053);assert.equal(new Set(report.map(r=>r.workId)).size,8053);
});
test('all original names and source keys preserved exactly',()=>{
  const byId=new Map(works.map(w=>[w[0],w]));
  for(const r of report) {const w=byId.get(r.workId);assert.equal(r.name,w[2]);assert.equal(r.code,w[1]);assert.equal(r.sourceKey,w[3]);}
  assert.equal(report.filter(r=>!r.name?.trim()).length,0);
});
test('every row has an understandable path or fallback code group',()=>{
  for(const r of report) {assert.ok(r.reason);assert.ok(r.destination.path?.length || r.destination.label);assert.equal(r.officialClassificationApproved,false);}
});
test('actual full source reorder is deterministic',()=>{
  assert.deepEqual(reviewHierarchy([...book].reverse(),[...works].reverse(),[...nodes].reverse()),report);
});
test('ambiguous entries are never given a selected BOOK destination',()=>{
  for(const r of report.filter(r=>r.status==='AMBIGUOUS_BOOK_REVIEW')) {
    assert.ok(r.candidates.length>1);assert.equal(r.destination.kind,'SOURCE_NAVIGATION');
  }
});
