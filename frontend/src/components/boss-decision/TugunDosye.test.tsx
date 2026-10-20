import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {MindmapGraf} from '../../api/t2-mindmap';
import {dashboardFixture} from './fixtures.fixture';
import type {BossDashboard} from '../../api/t2-boss';
const mocks=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('../../api/t2-boss',async original=>({...await original<typeof import('../../api/t2-boss')>(),bossDashboardOl:mocks.read}));
import TugunDosye from './TugunDosye';

function graph():MindmapGraf {
 return {tugunlar:[{id:'kompaniya:17',tur:'kompaniya',nom:'Demo',meta:null,x:null,y:null},
  {id:'obyekt:127',tur:'obyekt',nom:'Object A',meta:{smeta:999999999999999,f2:888888888888888},x:null,y:null},
  {id:'shartnoma:9',tur:'shartnoma',nom:'Shared contract',meta:{summa:777777777777777},x:null,y:null}],
  bogichlar:[{manba:'shartnoma:9',maqsad:'obyekt:127',tur:'shartnoma_obyekt',uzsa_boladi:false}]};
}
function mount({data=dashboardFixture() as BossDashboard|undefined,key='obyekt:127',graf=graph(),client=new QueryClient({defaultOptions:{queries:{retry:false}}})}={}) {
 const onReports=vi.fn();
 const view=render(<MemoryRouter><QueryClientProvider client={client}><TugunDosye tugun={graf.tugunlar.find(n=>n.id===key)!} graf={graf} kompaniyaId={17} data={data} onReports={onReports}/></QueryClientProvider></MemoryRouter>);
 return {...view,onReports};
}
afterEach(()=>{cleanup();mocks.read.mockReset();});
describe('shared node dossier',()=>{
 it('preserves a zero estimate instead of falling back to graph money',()=>{
   const d=dashboardFixture();d.executive!.objects[0].estimate_known=0;
   mount({data:d});expect(screen.getByRole('button',{name:'Smeta, nakrutkasiz 0 UZS'})).toBeTruthy();
 });
 it('never presents company payment totals as an object payment amount',()=>{
   const d=dashboardFixture();d.executive!.payment_count=1;d.moliya.jami_tolangan=87654321;
   mount({data:d});expect(screen.queryByRole('button',{name:/Qayd etilgan to‘lovlar/})).toBeNull();
   expect(document.body.textContent).not.toContain('87,7');
 });
 it('refuses a foreign company graph and makes no financial request',()=>{
   const graf=graph();graf.tugunlar[0].id='kompaniya:99';
   mount({graf});expect(screen.getByRole('alert')).toBeTruthy();expect(mocks.read).not.toHaveBeenCalled();
 });
 it('shows compact real source amounts and exact formula only on demand, never graph money',()=>{
   const d=dashboardFixture();d.executive!.objects[0].estimate_known=1250000.25;
   mount({data:d});expect(mocks.read).not.toHaveBeenCalled();
   expect(screen.getByRole('button',{name:/Smeta, nakrutkasiz.*1,3 mln/})).toBeTruthy();
   expect(screen.queryByText('1 250 000,25 UZS')).toBeNull();
   fireEvent.click(screen.getByRole('button',{name:/Smeta, nakrutkasiz/}));
   const basis=screen.getByRole('region',{name:'Summaning asosini ko‘rish'});
   expect(basis.textContent).toContain('250');expect(basis.textContent).toContain(',25 UZS');
   expect(basis.textContent).toContain('t2_obyekt_jami');
   expect(document.body.textContent).not.toContain('999999');
 });
 it('hides a financial ratio when estimate prices are missing',()=>{
   mount();expect(screen.queryByText(/F2 \/ smeta, pul bo‘yicha/)).toBeNull();
 });
 it('keeps a ratio over 100 explicitly financial when the source is complete',()=>{
   const d=dashboardFixture();Object.assign(d.executive!.objects[0],{unpriced_rows:0,approved_known:300});
   mount({data:d});expect(screen.getByText(/F2 \/ smeta, pul bo‘yicha.*300%/)).toBeTruthy();
 });
 it('does not display zero payments or receivables for an empty payment register',()=>{
   mount({key:'kompaniya:17'});
   expect(screen.getByText('To‘lovlar tizimga kiritilmagan. Qarz tasdiqlanmagan.')).toBeTruthy();
   expect(screen.queryByRole('button',{name:/Qayd etilgan to‘lovlar/})).toBeNull();
 });
 it('does preserve an explicitly recorded zero payment',()=>{
   const d=dashboardFixture();d.executive!.payment_count=1;
   mount({data:d,key:'kompaniya:17'});
   expect(screen.getByRole('button',{name:'Qayd etilgan to‘lovlar 0 UZS'})).toBeTruthy();
 });
 it('rejects a wrong company response without leaking its amounts',()=>{
   const d=dashboardFixture();d.kompaniya.kompaniya_id=99;d.executive!.objects[0].estimate_known=1234567;
   mount({data:d});expect(screen.getByRole('alert')).toBeTruthy();expect(screen.queryByRole('button')).toBeNull();
 });
 it('does not use cached amounts after a failed refresh',async()=>{
   const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
   client.setQueryData(['bossDashboard',17],dashboardFixture(),{updatedAt:0});
   mocks.read.mockRejectedValue(Error('network'));
   // Explicitly construct without a data prop; mount defaults are for pure presentation tests.
   const graf=graph();render(<MemoryRouter><QueryClientProvider client={client}><TugunDosye tugun={graf.tugunlar[1]} graf={graf} kompaniyaId={17}/></QueryClientProvider></MemoryRouter>);
   await screen.findByRole('alert',undefined,{timeout:3000});expect(screen.queryByRole('button',{name:/Smeta, nakrutkasiz/})).toBeNull();
 });
 it('does not replace absent financial sources with graph aggregates',()=>{
   const d=dashboardFixture();delete d.executive;
   mount({data:d});expect(screen.queryByRole('button',{name:/Smeta, nakrutkasiz/})).toBeNull();
   expect(screen.getByText('Summalar hali yuklanmagan. Asl hujjatlarni ochish mumkin.')).toBeTruthy();
 });
 it('keeps shared contracts whole and preserves the selected report action',()=>{
   const result=mount({key:'shartnoma:9'});
   expect(screen.getByText(/Umumiy shartnoma obyektlarga avtomatik taqsimlanmaydi/)).toBeTruthy();
   expect(document.body.textContent).not.toContain('777777');
   fireEvent.click(screen.getByRole('button',{name:'Hujjat va hisob asoslari'}));expect(result.onReports).toHaveBeenCalledOnce();
 });
});
