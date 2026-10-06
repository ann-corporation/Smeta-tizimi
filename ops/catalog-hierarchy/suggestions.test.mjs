import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coefficientCandidates, alternativeCandidates, workAlternativeCandidates } from './suggestions.mjs';
const work={code:'E1-1',tableCode:'E1',bookType:'H',collection:'E01'};
const scopes=[{archiveOccurrenceId:1,codeRaw:'E1-1',tableRaw:'E1',bookTypeRaw:'H',collectionRaw:'E01'}];
const links=[{factReferenceId:10,source:{KODE:'E1-1',KODTAB:'E1'},workArchiveOccurrenceIds:[1],coefficientFactReferenceIds:[2]}];
const rules=[{factReferenceId:2,source:{NAME:'Условие',PRAV:'opaque source formula',KODP:'Ш-1'}}];
test('exact rule linkage remains visible but not executable',()=>{
  const c=coefficientCandidates(work,links,scopes,rules)[0];assert.equal(c.ruleId,2);assert.equal(c.canApply,false);assert.equal(c.rawExpression,rules[0].source.PRAV);
});
test('book type, collection, work and table are all boundaries',()=>{
  for(const p of [{bookType:'A'},{collection:'E02'},{code:'E1-2'},{tableCode:'E2'}]) assert.deepEqual(coefficientCandidates({...work,...p},links,scopes,rules),[]);
});
test('missing rule and missing source scope are not invented',()=>{
  assert.deepEqual(coefficientCandidates(work,links,[],rules),[]);assert.deepEqual(coefficientCandidates(work,links,scopes,[]),[]);
});
const source={id:'10',name:'Автомобили бортовые 10 т',type:'MACHINE',unitCode:'маш-ч'};
const other={...source,id:'25',name:'Автомобили бортовые 25 т'};
test('10t to25t is suggestion with normative warning, never an invented multiplier',()=>{
  const r=alternativeCandidates(source,[source,other])[0];assert.equal(r.id,'25');assert.equal(r.canApply,false);
  assert.ok(r.warnings.includes('NORM_AND_COEFFICIENT_REVIEW_REQUIRED'));assert.equal(r.coefficient,undefined);
});
test('unit/category mismatches and unknown units are excluded',()=>{
  assert.deepEqual(alternativeCandidates(source,[{...other,type:'MATERIAL'},{...other,unitCode:'т'}]),[]);
  assert.deepEqual(alternativeCandidates({...source,unitCode:null},[other]),[]);
});
test('bounded results and reorder-independent tie ordering',()=>{
  const rows=Array.from({length:10000},(_,i)=>({...other,id:String(i).padStart(5,'0')}));
  assert.equal(alternativeCandidates(source,rows,{limit:5}).length,5);
  assert.deepEqual(alternativeCandidates(source,rows,{limit:5}),alternativeCandidates(source,rows.reverse(),{limit:5}));
});
test('invalid limit is rejected',()=>assert.throws(()=>alternativeCandidates(source,[other],{limit:1000}),/LIMIT_INVALID/));
test('work alternative is blocked without basis/revision and never crosses edition context',()=>{
  const s={...source,bookType:'H',collection:'E01',confirmedBasisScale:'100',catalogRevision:'rev1'};
  assert.deepEqual(workAlternativeCandidates({...s,confirmedBasisScale:null},[other]),[]);
  const c={...s,id:'other'};
  assert.equal(workAlternativeCandidates(s,[c]).length,1);
  for(const p of [{bookType:'A'},{collection:'E02'},{confirmedBasisScale:'1'},{catalogRevision:'rev2'}])
    assert.deepEqual(workAlternativeCandidates(s,[{...c,...p}]),[]);
});
