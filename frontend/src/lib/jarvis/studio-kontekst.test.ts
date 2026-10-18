import { describe, expect, it, vi } from 'vitest';
import { STUDIO_CONTEXT_MAX, studioKontekstOl, studioKontekstScope, studioKontekstTekshir, studioKontekstUla } from './studio-kontekst';
import { studioQoralamaXulosasi } from './useStudioKontekst';
import { emptyDoc } from '../smeta-studio/model';
import { calcDoc } from '../smeta-studio/calc';
const page='/admin/smeta-studio';
const draft={schema:1 as const,companyId:17,draftId:'draft-a',title:'Smeta A',summary:'Hajm: 0; narx noma’lum'};
describe('Studio draft context boundary',()=>{
  it('does not read a draft on registration, other company or other route',()=>{
    const read=vi.fn(()=>draft);const stop=studioKontekstUla({companyId:17,draftId:'draft-a',read});
    expect(read).not.toHaveBeenCalled();expect(studioKontekstOl(39,page)).toBeNull();expect(studioKontekstOl(17,'/admin/f2')).toBeNull();expect(read).not.toHaveBeenCalled();
    expect(studioKontekstOl(17,page)).toEqual(draft);expect(read).toHaveBeenCalledTimes(1);stop();
    expect(studioKontekstScope(17,page)).toBe('');
  });
  it('old cleanup cannot remove a newer mounted draft',()=>{
    const a=studioKontekstUla({companyId:17,draftId:'a',read:()=>draft});
    const b=studioKontekstUla({companyId:17,draftId:'b',read:()=>({...draft,draftId:'b'})});a();
    expect(studioKontekstOl(17,page)?.draftId).toBe('b');b();
  });
  it.each([null,{}, {...draft,companyId:39},{...draft,schema:2},{...draft,draftId:''},{...draft,summary:'x'.repeat(STUDIO_CONTEXT_MAX+1)},{...draft,title:'x'.repeat(241)},{...draft,summary:42}])('rejects invalid or oversized drafts: %j',raw=>{
    expect(studioKontekstTekshir(raw,17,page)).toBeNull();
  });
  it('allows the exact size boundary and drops caller-supplied authority fields',()=>{
    const raw={...draft,summary:'x'.repeat(STUDIO_CONTEXT_MAX),actor_id:1,approved:true};
    expect(studioKontekstTekshir(raw,17,page)).toEqual({...draft,summary:raw.summary});
  });
  it('failed readers and mismatched reader data fail closed',()=>{
    let stop=studioKontekstUla({companyId:17,draftId:'a',read:()=>{throw Error('closed');}});expect(studioKontekstOl(17,page)).toBeNull();stop();
    stop=studioKontekstUla({companyId:17,draftId:'a',read:()=>({...draft,companyId:39})});expect(studioKontekstOl(17,page)).toBeNull();stop();
  });
  it('30,000 synthetic works keep the prompt bounded and report truncation rather than completeness',()=>{
    const doc=emptyDoc('large-synthetic');doc.context.companyId=17;doc.rootOrder=['s'];doc.sections.s={id:'s',name:'Synthetic section',parentId:null,children:[],items:[]};
    for(let i=0;i<30000;i++){const id='o'+i;doc.sections.s.items.push(id);doc.occurrences[id]={id,sectionId:'s',source:{catalogRevision:'synthetic',workId:id,code:'TEST-'+i,name:'Synthetic test work '+i,unitCode:null,tableLabel:null},quantity:null,basis:{scale:null,unitLabel:null,evidence:null,origin:null},recipe:[],overrides:{}};}
    const text=studioQoralamaXulosasi(doc,calcDoc(doc),()=>null);
    expect(text.length).toBeLessThanOrEqual(STUDIO_CONTEXT_MAX);expect(text).toContain('ishlar: 30000');expect(text).toContain('smeta qisqartirildi');expect(text).toContain('to‘liq ro‘yxat emas');
  });
});
