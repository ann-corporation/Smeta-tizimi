import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QuantityWorkbench } from './QuantityWorkbench';
import { WorkSheet } from './WorkSheet';
import { CloudDrafts } from './CloudDrafts';
import { PriceResearchQueue } from './PriceResearchQueue';
import { retainResearch } from './price-research-store';
import { emptyDoc } from '../../lib/smeta-studio/model';
import { applyCommand, dispatch, historyOf, undo } from '../../lib/smeta-studio/commands';
import { calcDoc } from '../../lib/smeta-studio/calc';
vi.mock('../../i18n/til',()=>({t:(s:string,p?:Record<string,string|number>)=>p?s.replace(/\{(\w+)\}/g,(_,k:string)=>String(p[k])):s}));
const researchStore=vi.hoisted(()=>new Map());
vi.mock('idb-keyval',()=>({get:async(k:string)=>researchStore.get(k),update:async(k:string,fn:(old:unknown)=>unknown)=>{researchStore.set(k,fn(researchStore.get(k)));}}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();researchStore.clear();});
function fixture(){let doc=emptyDoc('draft');doc=applyCommand(doc,{type:'ADD_SECTION',sectionId:'s',parentId:null,name:'Foundation'});return applyCommand(doc,{type:'ADD_OCCURRENCE',occurrenceId:'w',sectionId:'s',source:{catalogRevision:'r',workId:'a',code:'E06-01',name:'Concrete',unitCode:'M3',tableLabel:null},recipe:[],basis:{scale:'100',unitLabel:'м3',origin:'OBSERVED',evidence:'norm'},quantity:null});}
it('calculates physical quantity exactly without dividing by normative scale, requires evidence and confirmation',()=>{
 const doc=fixture(),command=vi.fn(()=>true);render(<QuantityWorkbench doc={doc} command={command} onWork={()=>{}}/>);
 for(const [label,value] of [['Uzunlik, m','0.1'],['Kenglik, m','0.2'],['Balandlik yoki chuqurlik, m','3'],['Soni','10']])fireEvent.change(screen.getByLabelText(label),{target:{value}});
 const apply=screen.getByRole('button',{name:'Hajmni ishga qo‘llash'});expect((apply as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('O‘lcham manbasi'),{target:{value:'Drawing KJ-4'}});fireEvent.change(screen.getByLabelText('Natija qo‘llanadigan ish'),{target:{value:'w'}});fireEvent.click(screen.getByRole('checkbox'));
 fireEvent.click(apply);expect(command).toHaveBeenCalledWith({type:'SET_QUANTITY',occurrenceId:'w',quantity:'0.6'});
 fireEvent.change(screen.getByLabelText('Uzunlik, m'),{target:{value:'1/0'}});expect((apply as HTMLButtonElement).disabled).toBe(true);
});
it('worksheet formula uses the same quantity command and bulk removal is one undoable batch',()=>{
 const doc=fixture();let history=historyOf(doc);const command=vi.fn(c=>{history=dispatch(history,c);return true;});
 render(<WorkSheet doc={doc} calculation={calcDoc(doc)} command={command} onWork={()=>{}} renderDetails={()=>null}/>);
 const quantity=screen.getByLabelText('Hajm: E06-01');fireEvent.change(quantity,{target:{value:'0.1 + 0.2'}});fireEvent.blur(quantity);expect(history.present.occurrences.w.quantity).toBe('0.3');
 fireEvent.click(screen.getByLabelText('Tanlash: E06-01'));fireEvent.click(screen.getByRole('button',{name:'Tanlangan ishlarni olib tashlash'}));expect(history.present.occurrences.w).toBeUndefined();expect(undo(history).present.occurrences.w.quantity).toBe('0.3');
});
it('cloud library uses named reads and opens the actual server version',async()=>{
 const doc=fixture();const onOpen=vi.fn(async()=>{});const fetcher=vi.fn(async(_u:string,init:RequestInit)=>{const data=JSON.parse(String(init.body));return Response.json(data.amal==='royxat'?{ok:true,qoralamalar:[{draft_uid:'draft',nom:'Server estimate',obyekt:null,versiya:7,ish_soni:1,yangilandi:'2026-10-22T00:00:00Z'}]}:{ok:true,versiya:7,hujjat:doc});});vi.stubGlobal('fetch',fetcher);
 render(<CloudDrafts company={1} onOpen={onOpen} onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'Server estimate'}));await vi.waitFor(()=>expect(onOpen).toHaveBeenCalledWith(doc,7));expect(fetcher.mock.calls.map(c=>JSON.parse(String(c[1].body)).amal)).toEqual(['royxat','ol']);
});
it('cloud library rejects a document belonging to another company',async()=>{
 const doc=fixture();doc.context.companyId=2;const onOpen=vi.fn(async()=>{});vi.stubGlobal('fetch',vi.fn(async(_u:string,init:RequestInit)=>Response.json(JSON.parse(String(init.body)).amal==='royxat'?{ok:true,qoralamalar:[{draft_uid:'draft',nom:'Foreign',versiya:1,ish_soni:1,yangilandi:'2026-10-22'}]}:{ok:true,versiya:1,hujjat:doc})));
 render(<CloudDrafts company={1} onOpen={onOpen} onClose={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'Foreign'}));expect(await screen.findByRole('alert')).toBeTruthy();expect(onOpen).not.toHaveBeenCalled();expect(within(screen.getByRole('region')).getByRole('button',{name:'Qayta urinish'})).toBeTruthy();
});
it('retains price observations and applies one verified source only after the estimator confirms terms',async()=>{
 const unknown={url:'https://supplier.example/item',nom:'Concrete',narx:112,birlik:'m3',nds:'nomalum' as const,sotuvchi:'Unknown VAT',domen:'supplier.example',tekshirildi:true,smetaNarx:100,koef:1,sabab:null};
 const known={...unknown,url:'https://supplier.example/known',sotuvchi:'Known VAT',nds:'siz' as const,narx:110,smetaNarx:110};
 await retainResearch('scope',{key:'g',name:'Concrete',result:{id:'r0',narx:105,manbalar:[unknown,known],izoh:'Compare'}});
 const apply=vi.fn(()=>true);render(<PriceResearchQueue scope="scope" revision={1} onApply={apply}/>);
 const radios=await screen.findAllByRole('radio');fireEvent.click(radios[0]);expect(screen.queryByRole('button',{name:'Tanlangan manba narxini qo‘llash'})).toBeNull();
 fireEvent.click(radios[1]);const button=screen.getByRole('button',{name:'Tanlangan manba narxini qo‘llash'});expect((button as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button);
 expect(apply).toHaveBeenCalledWith('g',expect.objectContaining({narx:110,manbalar:[known]}));await vi.waitFor(()=>expect(researchStore.get('scope')).toEqual({}));
});
