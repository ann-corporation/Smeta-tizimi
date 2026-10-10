import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { applyCommand, type StudioCommand } from '../../lib/smeta-studio/commands';
import { calcDoc } from '../../lib/smeta-studio/calc';
import { emptyDoc } from '../../lib/smeta-studio/model';
import { narxKatalogi, type KatalogQatori } from '../../lib/narx-katalog/price-remote';
import { loadHourCatalog } from '../../lib/hour-price-catalog';
import { kompaniyaKuzatuvlari, type KuzatilganNarx } from '../../lib/smeta-studio/company-prices';
import { SmetaNarxlash } from './SmetaStudioNarxlash';
import { narxAgentSora } from '../../api/smeta-narx-agent';
vi.mock('../../lib/narx-katalog/price-remote',()=>({narxKatalogi:vi.fn()}));
vi.mock('../../api/smeta-narx-agent',()=>({narxAgentSora:vi.fn()}));
vi.mock('../../lib/hour-price-catalog',async orig=>({...await orig<typeof import('../../lib/hour-price-catalog')>(),loadHourCatalog:vi.fn()}));
vi.mock('../../lib/smeta-studio/company-prices',async orig=>({...await orig<typeof import('../../lib/smeta-studio/company-prices')>(),kompaniyaKuzatuvlari:vi.fn()}));
const row:KatalogQatori={id:1,manba_id:1,kod:'UNUSED',nom:'ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ',birlik:'м3',narx:120000,hudud:null,ishlab_chiqaruvchi:null,nds_holati:'nds_siz',nds_izoh:null,yil:2026,kvartal:1,narx_varianti:null,guruh:null,hudud_kalit:null,manba_nom:'Material catalogue',manba_tur:'platforma'};
const makeDoc=(name:string,unitCode:string)=>([{type:'ADD_SECTION',sectionId:'s',parentId:null,name:'S'},
 {type:'ADD_OCCURRENCE',occurrenceId:'o',sectionId:'s',quantity:'1',basis:{scale:'1',unitLabel:'м3',evidence:'observed',origin:'OBSERVED'},
 source:{catalogRevision:'r',workId:'w',code:'E',name:'Work',unitCode:'003',tableLabel:null},
 recipe:[{recipeId:'r',status:'EXACT',resource:{id:'x',resourceIdCode:'WRONG-LEGACY-CODE',code:'ALSO-UNUSED',name,unitCode,type:'R'},norm:'1',candidates:[],candidateCount:1,prices:[],priceCount:0}]}] as StudioCommand[]).reduce(applyCommand,emptyDoc('d'));
const props=(name:string,unitCode:string,company=17)=>{const doc=makeDoc(name,unitCode);return {doc,hisob:calcDoc(doc),katalog:null,command:vi.fn((_c:StudioCommand)=>true),kompaniyaId:company,hudud:'',setHudud:vi.fn()};};
const observation=(price:number):KuzatilganNarx=>({id:5,nom:'АВТОПОГРУЗЧИКИ 5 Т',birlik:'маш-ч',narx:price,obyektId:7,manbaId:3,obyekt:'A',smeta:'smeta.xlsx',sana:'2026-01-01'});
beforeEach(()=>{
 localStorage.clear();vi.clearAllMocks();
 const view={size:1,name:()=>row.nom,unit:()=>row.birlik,region:()=>null,price:()=>row.narx,row:()=>row};
 vi.mocked(narxKatalogi).mockResolvedValue({rows:[row],dict:{hudud:[],hududKalit:[]},matchView:()=>view} as unknown as Awaited<ReturnType<typeof narxKatalogi>>);
 vi.mocked(loadHourCatalog).mockResolvedValue({schema:'hour-price-catalog-v1',machineCoverage:'PARTIAL_VERIFIED_SUBSET',machines:[],labour:[]});
 vi.mocked(kompaniyaKuzatuvlari).mockResolvedValue([]);
});
afterEach(cleanup);
it('does not report applied prices when the draft rejects the batch',async()=>{
 const p=props(row.nom,'003');p.command.mockReturnValue(false);
 render(<SmetaNarxlash {...p}/>);
 await screen.findByText('Narxlar qo‘llanmadi. Qoralama holatini tekshirib, qayta urinib ko‘ring.');
 expect(screen.queryByText(/resursga katalogdan narx qo‘yildi/)).toBeNull();
});
it('catalogue prices independently of a pending secondary company lookup; no code lookup',async()=>{
 vi.mocked(kompaniyaKuzatuvlari).mockReturnValue(new Promise(()=>{}));
 const p=props(row.nom,'003');render(<SmetaNarxlash {...p}/>);
 await waitFor(()=>expect(p.command).toHaveBeenCalled());
 expect(p.command.mock.calls[0][0]).toMatchObject({type:'BATCH',label:'Avto-narx (katalog)',commands:[{type:'SET_PRICE',price:{value:'120000'}}]});
 await waitFor(()=>expect(kompaniyaKuzatuvlari).toHaveBeenCalledWith(17,[row.nom]));
});
it('choosing a region retries labour previously unavailable without a region',async()=>{
 vi.mocked(loadHourCatalog).mockResolvedValue({schema:'hour-price-catalog-v1',machineCoverage:'PARTIAL_VERIFIED_SUBSET',machines:[],labour:[{id:'l',name:'Workers',region:'Город Ташкент',aggregate:false,year:2026,quarter:1,unit:'чел-ч',price:'25000',socialInsurance:'EXCLUDED',sourceSha256:'sha',sheet:'Q1',baseCell:'C1'}]});
 const p=props('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ','001');const v=render(<SmetaNarxlash {...p}/>);
 await screen.findByText('Mehnat stavkasi uchun hududni tanlang.');
 await waitFor(()=>expect(kompaniyaKuzatuvlari).toHaveBeenCalled());expect(p.command).not.toHaveBeenCalled();
 v.rerender(<SmetaNarxlash {...p} hudud="toshkent_sh"/>);
 await waitFor(()=>expect(p.command).toHaveBeenCalledWith(expect.objectContaining({commands:[expect.objectContaining({price:expect.objectContaining({value:'25000'})})]})));
});
it('manual retry repeats failed name lookup and automatically prices an exact hour observation',async()=>{
 vi.mocked(kompaniyaKuzatuvlari).mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue([observation(148613)]);
 const p=props('АВТОПОГРУЗЧИКИ 5 Т','011');render(<SmetaNarxlash {...p}/>);
 await screen.findByText(/Kompaniya narxlarini olishda xato/);
 fireEvent.click(screen.getByRole('button',{name:'Kompaniya smetalaridan takliflar'}));
 await waitFor(()=>expect(kompaniyaKuzatuvlari).toHaveBeenCalledTimes(2));
 await waitFor(()=>expect(p.command).toHaveBeenCalledWith(expect.objectContaining({commands:[expect.objectContaining({price:expect.objectContaining({value:'148613',basis:'CONTRACT_DRAFT'})})]})));
});
it('ignores a delayed response from the previous company',async()=>{
 let resolveOld!:(rows:KuzatilganNarx[])=>void;
 vi.mocked(kompaniyaKuzatuvlari).mockReturnValueOnce(new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValue([]);
 const p=props('АВТОПОГРУЗЧИКИ 5 Т','011');const v=render(<SmetaNarxlash {...p}/>);
 await waitFor(()=>expect(kompaniyaKuzatuvlari).toHaveBeenCalledTimes(1));
 v.rerender(<SmetaNarxlash {...p} kompaniyaId={39}/>);
 await waitFor(()=>expect(kompaniyaKuzatuvlari).toHaveBeenCalledTimes(2));
 resolveOld([observation(999999)]);
 await waitFor(()=>expect((screen.getByRole('button',{name:'Kompaniya smetalaridan takliflar'}) as HTMLButtonElement).disabled).toBe(false));
 expect(p.command).not.toHaveBeenCalled();
});

it('queues lookup for a changed resource while an earlier request is pending',async()=>{
 let done!:(rows:KuzatilganNarx[])=>void;
 vi.mocked(kompaniyaKuzatuvlari).mockReturnValueOnce(new Promise(r=>{done=r;})).mockResolvedValue([]);
 const p=props('АВТОПОГРУЗЧИКИ 5 Т','011');const v=render(<SmetaNarxlash {...p}/>);
 await waitFor(()=>expect(kompaniyaKuzatuvlari).toHaveBeenCalledTimes(1));
 v.rerender(<SmetaNarxlash {...props('КРАНЫ 10 Т','011')} command={p.command}/>);
 done([observation(148613)]);
 await waitFor(()=>expect(kompaniyaKuzatuvlari).toHaveBeenCalledWith(17,['КРАНЫ 10 Т']));
 expect(p.command).not.toHaveBeenCalled();
});
it('unknown-unit company observations cannot be applied',async()=>{
 vi.mocked(kompaniyaKuzatuvlari).mockResolvedValue([{...observation(148613),birlik:null}]);
 const p=props('АВТОПОГРУЗЧИКИ 5 Т','011');render(<SmetaNarxlash {...p}/>);
 const offer=await screen.findByRole('button',{name:/АВТОПОГРУЗЧИКИ 5 Т.*148/});
 expect((offer as HTMLButtonElement).disabled).toBe(true);expect(p.command).not.toHaveBeenCalled();
});
it('records price-only conversion evidence and preserves the resource quantity',async()=>{
 const kg={...row,nom:'ГВОЗДИ СТРОИТЕЛЬНЫЕ 100 ММ',birlik:'кг',narx:15.5,manba_nom:'Observed source.xlsx '.repeat(50)};
 const view={size:1,name:()=>kg.nom,unit:()=>kg.birlik,region:()=>null,price:()=>kg.narx,row:()=>kg};
 vi.mocked(narxKatalogi).mockResolvedValue({rows:[kg],dict:{hudud:[],hududKalit:[]},matchView:()=>view} as unknown as Awaited<ReturnType<typeof narxKatalogi>>);
 const p=props(kg.nom,'006');render(<SmetaNarxlash {...p}/>);
 await waitFor(()=>expect(p.command).toHaveBeenCalled());
 const c=p.command.mock.calls[0][0];
 expect(c).toMatchObject({commands:[{price:{value:'15500',evidence:expect.stringContaining('× 1000')}}]});
 if(c.type==='BATCH' && c.commands[0].type==='SET_PRICE') expect(c.commands[0].price!.evidence.length).toBeLessThanOrEqual(300);
 const next=applyCommand(p.doc,c);
 expect(calcDoc(next).occurrences.o.lines[0].quantity).toBe(calcDoc(p.doc).occurrences.o.lines[0].quantity);
});

it('uses valid AI transport keys and keeps long reasons within the draft evidence contract',async()=>{
 const generic={...row,nom:'АРМАТУРА',birlik:'т',narx:8300000,manba_nom:'Source.xlsx '.repeat(60)};
 const view={size:1,name:()=>generic.nom,unit:()=>generic.birlik,region:()=>null,price:()=>generic.narx,row:()=>generic};
 vi.mocked(narxKatalogi).mockResolvedValue({rows:[generic],dict:{hudud:[],hududKalit:[]},matchView:()=>view} as unknown as Awaited<ReturnType<typeof narxKatalogi>>);
 vi.mocked(narxAgentSora).mockResolvedValue({ok:true,model:null,items:[{key:'p_0',tanlov:{...generic,narx:String(generic.narx),revision:'test',manba_sana:null},ishonch:'yuqori',sabab:'reason '.repeat(50)}]});
 const p=props(generic.nom,'006');render(<SmetaNarxlash {...p}/>);
 fireEvent.click(await screen.findByRole('button',{name:/Ko‘rib chiqish kerak/}));
 const b=await screen.findByRole('button',{name:'AI agentga yuborish'});fireEvent.click(b);
 await waitFor(()=>expect(narxAgentSora).toHaveBeenCalled());
 const items=vi.mocked(narxAgentSora).mock.calls[0][2];expect(items[0].key).toMatch(/^[A-Za-z0-9_:-]{1,140}$/);
 const accept=await screen.findByRole('button',{name:'Agent takliflarini qabul qilish'});fireEvent.click(accept);
 await waitFor(()=>expect(p.command).toHaveBeenCalled());
 expect(()=>applyCommand(p.doc,p.command.mock.calls[0][0])).not.toThrow();
});
