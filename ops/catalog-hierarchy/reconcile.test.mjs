import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewHierarchy, codeVariant } from './reconcile.mjs';
const key = JSON.stringify(['H','Е20','E20-1']);
const work = ['w1','Е20-1-1','Original name',key];
const nodes = [['t',-1,'',1,key,'MISSING']];
const root = {ID:'1',IDPARENT:'0',NAME:'Ventilation',TIPBOOK:'H',KODA:'E20',KODTAB:null};
const table = {ID:'2',IDPARENT:'1',NAME:'Air ducts',TIPBOOK:'H',KODA:'E20',KODTAB:'E20-1'};
test('unique code variant retains ID/name/source key and evidence path', () => {
  const r = reviewHierarchy([root,table],[work],nodes)[0];
  assert.equal(r.status,'UNIQUE_CODE_VARIANT_REVIEW'); assert.equal(r.name,work[2]); assert.equal(r.sourceKey,key);
  assert.deepEqual(r.destination.path.map(p=>p.id),['1','2']); assert.equal(r.officialClassificationApproved,false);
});
test('different book type never becomes matching table',()=>{
  assert.equal(reviewHierarchy([root,{...table,TIPBOOK:'A'}],[work],nodes)[0].status,'COLLECTION_NAVIGATION_REVIEW');
});
test('duplicate candidates remain explicit review',()=>{
  const r=reviewHierarchy([root,table,{...table,ID:'3'}],[work],nodes)[0];
  assert.equal(r.status,'AMBIGUOUS_BOOK_REVIEW'); assert.equal(r.candidates.length,2);
});
test('missing BOOK produces usable original-code group, not invented official name',()=>{
  assert.equal(reviewHierarchy([],[work],nodes)[0].destination.label,'Е20 / E20-1');
});
test('reorder does not change result or mutate source',()=>{
  const b=[root,table],w=[work,{...work}]; const snapshot=JSON.stringify(b);
  assert.deepEqual(reviewHierarchy(b,[work],nodes),reviewHierarchy([...b].reverse(),[work],nodes));
  assert.equal(JSON.stringify(b),snapshot); assert.equal(w.length,2);
});
test('duplicate stable work ID fails closed',()=>assert.throws(()=>reviewHierarchy([root],[work,work],nodes),/DUPLICATE/));
test('duplicate BOOK ID fails closed',()=>assert.throws(()=>reviewHierarchy([root,root],[work],nodes),/DUPLICATE/));
test('cycle fails closed',()=>assert.throws(()=>reviewHierarchy([{...root,IDPARENT:'2'},table],[work],nodes),/CYCLE/));
test('missing parent fails closed',()=>assert.throws(()=>reviewHierarchy([table],[work],nodes),/PARENT_MISSING/));
test('NULL and empty code stay distinct',()=>{assert.equal(codeVariant(null),null);assert.equal(codeVariant(''),'');});
test('ASCII code unchanged and source case is not silently folded',()=>{assert.equal(codeVariant('E20-1'),'E20-1');assert.equal(codeVariant('е20'),'е20');});
test('resolved works excluded from review',()=>assert.deepEqual(reviewHierarchy([root,table],[work],[]),[]));
