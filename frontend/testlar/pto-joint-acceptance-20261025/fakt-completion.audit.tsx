// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const m = vi.hoisted(() => ({ total: vi.fn(async () => ({ ok:true })), add:vi.fn(), toast:vi.fn(), scenario:7000, under:true }));
vi.mock('../../src/test02/KompaniyaTanlov', () => ({ useKompaniya: () => ({joriy:{id:m.scenario}}) }));
vi.mock('../../src/api/supabase', () => ({
  sbT2ObyektlarOlKomp: async () => ({ok:true,qatorlar:[{id:8,nom:'Synthetic object'}]}),
  sbT2DaraxtOl: async () => ({ok:true,qatorlar:[
    {id:11,tur:'rz',nom:'Synthetic section',ota_id:null,tartib:1},
    {id:22,tur:'bl',hajm:100,nom:'Synthetic over',kat:'МАТ',ota_id:11,tartib:2},
    {id:23,tur:'bl',hajm:100,nom:'Synthetic under',kat:'МАТ',ota_id:11,tartib:3},
    {id:24,tur:'bl',hajm:50,nom:'Other marker',kat:'ЧЕЛ',ota_id:11,tartib:4},
  ]}),
  sbT2QatorHolatOl: async () => ({ok:true,qatorlar:[
    {qator_id:22,smeta_hajm:100,fakt_hajm:120,qoldiq_hajm:-20},
    {qator_id:23,smeta_hajm:100,fakt_hajm:m.under?20:100,qoldiq_hajm:m.under?80:0},
    {qator_id:24,smeta_hajm:50,fakt_hajm:5,qoldiq_hajm:45},
  ]}),
  sbT2TreeQur: () => [{id:11,type:'rz',nom:'Synthetic section',children:[
    {id:22,type:'bl',nom:'Synthetic over',kat:'МАТ',smetaHajm:100,fakt:120,children:[]},
    {id:23,type:'bl',nom:'Synthetic under',kat:'МАТ',smetaHajm:100,fakt:m.under?20:100,children:[]},
    {id:24,type:'bl',nom:'Other marker',kat:'ЧЕЛ',smetaHajm:50,fakt:5,children:[]},
  ]}],
  yangiOperationId: () => '00000000-0000-4000-8000-000000000001',
  sbT2AktBekor: async () => ({ok:true}),
}));
vi.mock('../../src/api/t2-bajarilmadi', () => ({bajarilmadiRoyxatOl:async()=>({ok:true,qatorlar:[]})}));
vi.mock('../../src/api/t2-fakt', () => ({sbFaktYoz:m.add,sbFaktBelgilaV2:m.total}));
vi.mock('../../src/api/t2-price-control', () => ({priceControlOl:async()=>({ok:true,qatorlar:[]})}));
vi.mock('../../src/umumiy/ui/Toast', () => ({toast:m.toast}));
vi.mock('../../src/umumiy/daraxt/SmetaTree', () => ({SmetaTree:()=> <div>Tree fixture</div>}));
vi.mock('../../src/admin/sahifalar/FaktJurnal', () => ({FaktJurnal:()=>null}));
vi.mock('../../src/admin/sahifalar/XotiradanFakt', () => ({XotiradanFakt:()=>null}));
vi.mock('../../src/umumiy/ui/SummaJuft', () => ({SummaJuft:()=> <span>Amount fixture</span>}));
vi.mock('../../src/lib/hotkeys/useHotkeys', () => ({useHotkeys:vi.fn()}));
import { FaktNative } from '../../src/admin/sahifalar/FaktNative';

afterEach(()=>{cleanup();vi.clearAllMocks();});
beforeEach(()=>{m.scenario++;m.under=true;m.add.mockResolvedValue({ok:true,akt_id:501});});
async function openMarker() {
  render(<MemoryRouter initialEntries={['/admin/fakt?obyekt=8']}><FaktNative/></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:'Daraxt'}));
  await screen.findByText('Tree fixture');
  const marker=await screen.findByLabelText('Fakt markirovkasi');
  await waitFor(()=>expect(marker.querySelector('option[value="МАТ"]')).not.toBeNull());
  fireEvent.change(marker,{target:{value:'МАТ'}});
  fireEvent.click(screen.getByRole('button',{name:'100% qilish'}));
}
it('JQA-03: section mixed scope previews then adds only80, preserving measured120 and other marker', async () => {
  await openMarker();
  const save=await screen.findByRole('button',{name:/^Faktga yozish \(1\)/});
  expect(save.hasAttribute('disabled')).toBe(false);
  expect(screen.getByTestId('tuzatish-och')).toBeTruthy();
  expect(m.total).not.toHaveBeenCalled();
  expect(m.add).not.toHaveBeenCalled();
  fireEvent.click(save);
  await waitFor(()=>expect(m.add).toHaveBeenCalledTimes(1));
  expect(m.add.mock.calls[0][0].qatorlar).toEqual([{qator_id:23,hajm:80}]);
  expect(m.total).not.toHaveBeenCalled();
});
it('JQA-03 CONTROL: all-complete scope has no default write, reduction requires separate correction preview', async () => {
  m.under=false;
  await openMarker();
  const save=await screen.findByRole('button',{name:/^Faktga yozish \(0\)/});
  expect(save.hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByTestId('tuzatish-och'));
  expect(m.add).not.toHaveBeenCalled();
  expect(m.total).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('tuzatish-yoz'));
  await waitFor(()=>expect(m.add).toHaveBeenCalledTimes(1));
  expect(m.add.mock.calls[0][0].qatorlar).toEqual([{qator_id:22,hajm:-20}]);
});
