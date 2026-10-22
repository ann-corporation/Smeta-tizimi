import { beforeEach, expect, it, vi } from 'vitest';
import { emptyDoc } from './model';
const state=vi.hoisted(()=>({ values:new Map<string,unknown>(), failIndex:false }));
vi.mock('idb-keyval',()=>({get:async (key:string)=>state.values.get(key),update:async (key:string,fn:(old:unknown)=>unknown)=>{
  if(state.failIndex && key==='smeta-studio:library:v1') throw new Error('quota');
  state.values.set(key,structuredClone(fn(state.values.get(key))));
}}));
import { writeLibraryDraft, readLibraryDraft, listLibraryDrafts } from './draft-library';
beforeEach(()=>{state.values.clear();state.failIndex=false;});
it('retains multiple estimates and their real canonical version, with tenant-separated listing',async()=>{
  const a=emptyDoc('a'),b=emptyDoc('b');a.context.companyId=17;b.context.companyId=18;
  await writeLibraryDraft(17,a,7,0);await writeLibraryDraft(18,b,3,0);
  expect((await listLibraryDrafts(17)).map(x=>x.draftId)).toEqual(['a']);
  expect((await readLibraryDraft(17,'a'))?.serverVersion).toBe(7);
  expect(await readLibraryDraft(18,'a')).toBeNull();
  await expect(writeLibraryDraft(18,a,7,0)).rejects.toThrow('DRAFT_COMPANY_MISMATCH');
});
it('rejects a stale second tab rather than replacing the first tab’s edit',async()=>{
  const a=emptyDoc('a');await writeLibraryDraft(null,a,0,0);
  const changed={...a,edits:1,context:{...a.context,title:'saved in first tab'}};
  await writeLibraryDraft(null,changed,0,1);
  await expect(writeLibraryDraft(null,a,0,1)).rejects.toThrow('LOCAL_VERSION_CONFLICT');
  expect((await readLibraryDraft(null,'a'))?.doc.context.title).toBe('saved in first tab');
});
it('index failure is reported while the recoverable document and next revision survive',async()=>{
  state.failIndex=true;const a=emptyDoc('a');const saved=await writeLibraryDraft(null,a,0,0);
  expect(saved.indexed).toBe(false);expect((await readLibraryDraft(null,'a'))?.revision).toBe(1);
  state.failIndex=false;await writeLibraryDraft(null,a,0,1);
  expect(await listLibraryDrafts(null)).toHaveLength(1);
});
