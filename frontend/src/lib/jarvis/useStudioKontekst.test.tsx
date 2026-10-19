import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { emptyDoc } from '../smeta-studio/model';
import { calcDoc } from '../smeta-studio/calc';
import { studioKontekstOl } from './studio-kontekst';
import { studioQoralamaXulosasi, useStudioKontekst } from './useStudioKontekst';
const m=vi.hoisted(()=>({summary:vi.fn((doc:{edits:number})=>'snapshot '+doc.edits)}));
vi.mock('../smeta-studio/ai-kontekst',()=>({smetaXulosasi:m.summary}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const page='/admin/smeta-studio';const unit=()=>null;
function doc(){const d=emptyDoc('a');d.context.companyId=17;return d;}
it('reads latest draft lazily, not on every editor change; reuses supplied calculation',()=>{
  const d=doc(), calc=calcDoc(d);const view=renderHook(p=>useStudioKontekst(p.d,calc,unit,17),{initialProps:{d}});
  for(let i=1;i<=30;i++)view.rerender({d:{...d,edits:i}});
  expect(m.summary).not.toHaveBeenCalled();expect(studioKontekstOl(17,page)?.summary).toContain('snapshot 30');
  expect(m.summary).toHaveBeenCalledWith(expect.objectContaining({edits:30}),undefined,unit,4200);
  view.unmount();expect(studioKontekstOl(17,page)).toBeNull();
});
it('unassigned or another company draft is never silently attributed to active company',()=>{
  const d=emptyDoc('unknown');const view=renderHook(p=>useStudioKontekst(p.d,calcDoc(p.d),unit,p.company),{initialProps:{d,company:17}});
  expect(studioKontekstOl(17,page)).toBeNull();
  const assigned={...d,context:{...d.context,companyId:17}};view.rerender({d:assigned,company:17});expect(studioKontekstOl(17,page)).not.toBeNull();
  view.rerender({d:assigned,company:39});expect(studioKontekstOl(39,page)).toBeNull();expect(studioKontekstOl(17,page)).toBeNull();
});
it('draft replacement never returns the previous document',()=>{
  const d=doc();const view=renderHook(p=>useStudioKontekst(p,calcDoc(p),unit,17),{initialProps:d});
  view.rerender({...d,draftId:'b',edits:4});expect(studioKontekstOl(17,page)?.draftId).toBe('b');expect(studioKontekstOl(17,page)?.summary).toContain('snapshot 4');
});
it('preserves null, explicit zero and exact decimal strings from the existing calculation',()=>{
  const d=doc(),calc=calcDoc(d);calc.total={amount:null,knownAmount:'1234.49',unresolved:1};
  calc.occurrences.x={id:'x',amount:null,knownAmount:'0.00',unresolved:1,issues:[],lines:[{recipeId:'r',resource:null,original:null,substituted:false,norm:null,normOverridden:false,quantity:null,price:'0',priceBasis:null,amount:null,issues:[]}]};
  const text=studioQoralamaXulosasi(d,calc,unit);expect(text).toContain('nakrutkasiz): noma’lum');expect(text).toContain('1234.49');expect(text).toContain('hajm ? | narx 0 | summa ?');
});
