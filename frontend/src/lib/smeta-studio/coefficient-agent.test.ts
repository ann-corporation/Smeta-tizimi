import { expect, it } from 'vitest';
import { emptyDoc, type Occurrence } from './model';
import { applyCommand, dispatch, historyOf, undo } from './commands';
import { coefficientApplyCommand, coefficientCandidateSummary } from './coefficient-agent';
import { coefficientWorkCode } from './koef-notation';
import { calcDoc } from './calc';
import type { KoefKatalog } from './koef-katalog';
const catalog: KoefKatalog = { schema:'koef-katalog-v1',manba:'TEST ONLY',jadval:{'1-1-1':['К-8','parameter']},koef:{
 'К-8':{a:'TEST ТЧ 3.1',t:'TEST',s:'TEST CONDITION',q:'',k:{ЧЕЛ:1.2,МАШ:1.2},op:'MUL'},
 parameter:{a:'TEST',t:'TEST',s:'TEST',q:'',k:{ЧЕЛ:0.05},op:'SHART'} } };
function fixture() {
 const doc = emptyDoc('test'); doc.rootOrder=['s']; doc.sections.s={id:'s',name:'TEST',parentId:null,children:[],items:['o','other']};
 const o: Occurrence={id:'o',sectionId:'s',source:{catalogRevision:'TEST',workId:'norm',code:'E1-1-1-1',name:'TEST WORK',unitCode:'m3',tableLabel:null},quantity:'10',basis:{scale:'1',unitLabel:'m3',evidence:'TEST',origin:'OBSERVED'},recipe:[{recipeId:'r',status:'EXACT',resource:{id:'r',name:'ЗАТРАТЫ ТРУДА РАБОЧИХ',code:'R',unitCode:'001',type:'R'},norm:'2',candidates:[],candidateCount:1,prices:[],priceCount:0}],overrides:{}};
 doc.occurrences={o,other:{...structuredClone(o),id:'other',source:{...o.source,code:'E2-1-1-1'}}};return doc;
}
it('AI selected real rule: applies exact catalog factors, keeps normative notation, preserves source and undo',()=>{
 const d=fixture();const cmd=coefficientApplyCommand(d,catalog,'[i1]','К-8','TEST USER CONDITION');const h=dispatch(historyOf(d),cmd),n=h.present;
 expect(n.occurrences.o.source.code).toBe('E1-1-1-1');expect(coefficientWorkCode(n.occurrences.o)).toBe('E1-1-1-1\nК-8 Кзтр/Кэм=1,2');
 const c=calcDoc(n);expect(c.occurrences.o.lines[0].quantity).toBe('24.000000');expect(c.total.amount).toBeNull();

 expect(undo(h).present.occurrences.o.coefficients).toBeUndefined();expect(n.occurrences.other.coefficients).toBeUndefined();
 expect(applyCommand(n,coefficientApplyCommand(n,catalog,'i1','К-8','TEST')).occurrences.o.coefficients).toHaveLength(1);
});
it.each([['i2','К-8','condition'],['i1','fake','condition'],['i1','parameter','condition'],['i1','1.2','condition'],['i1','К-8',''],['missing','К-8','condition']])('rejects invalid AI target/rule/condition %s %s',(ref,code,condition)=>{
 expect(()=>coefficientApplyCommand(fixture(),catalog,ref,code,condition)).toThrow();
});
it('AI sees bounded per-work candidate codes and real conditions without source software branding',()=>{
 const s=coefficientCandidateSummary(fixture(),catalog);expect(s).toContain('[i1] К-8');expect(s).not.toContain('[i2] К-8');expect(s).not.toContain('parameter');expect(s).not.toContain('TEST ONLY');
});

it('does not expose unfiltered external provenance in AI context', () => {
 const dirty=structuredClone(catalog); dirty.koef['К-8'].s='Construct ABC АВС TNQ ТНҚ PTO-UZ';
 expect(coefficientCandidateSummary(fixture(),dirty)).not.toMatch(/ABC|АВС|\bTN|ТНҚ|Construct|PTO-UZ/);
});
