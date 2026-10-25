// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const m = vi.hoisted(() => ({ total: vi.fn(async () => ({ ok:true })), add:vi.fn(), toast:vi.fn() }));
vi.mock('../../src/test02/KompaniyaTanlov', () => ({ useKompaniya: () => ({joriy:{id:1}}) }));
vi.mock('../../src/api/supabase', () => ({
  sbT2ObyektlarOlKomp: async () => ({ok:true,qatorlar:[{id:8,nom:'Synthetic object'}]}),
  sbT2DaraxtOl: async () => ({ok:true,qatorlar:[{id:22,tur:'bl',hajm:100,nom:'Synthetic work',kat:'МАТ',ota_id:null}]}),
  sbT2QatorHolatOl: async () => ({ok:true,qatorlar:[{qator_id:22,smeta_hajm:100,fakt_hajm:120}]}),
  sbT2TreeQur: () => [{id:22,type:'bl',nom:'Synthetic work',kat:'МАТ',smetaHajm:100,fakt:120,children:[]}],
  yangiOperationId: () => '00000000-0000-4000-8000-000000000001',
}));
vi.mock('../../src/api/t2-fakt', () => ({sbFaktYoz:m.add,sbFaktBelgilaV2:m.total}));
vi.mock('../../src/api/t2-price-control', () => ({priceControlOl:async()=>({ok:true,qatorlar:[]})}));
vi.mock('../../src/umumiy/ui/Toast', () => ({toast:m.toast}));
vi.mock('../../src/umumiy/daraxt/SmetaTree', () => ({SmetaTree:()=> <div>Tree fixture</div>}));
vi.mock('../../src/admin/sahifalar/FaktJurnal', () => ({FaktJurnal:()=>null}));
vi.mock('../../src/admin/sahifalar/XotiradanFakt', () => ({XotiradanFakt:()=>null}));
import { FaktNative } from '../../src/admin/sahifalar/FaktNative';

afterEach(()=>{cleanup();vi.clearAllMocks();});
it('OPEN JQA-03: completion must not silently lower measured120 to estimated100', async () => {
  render(<MemoryRouter initialEntries={['/admin/fakt?obyekt=8']}><FaktNative/></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:'Daraxt'}));
  await screen.findByText('Tree fixture');
  const marker=await screen.findByLabelText('Fakt markirovkasi');
  await waitFor(()=>expect(marker.querySelector('option[value="МАТ"]')).not.toBeNull());
  fireEvent.change(marker,{target:{value:'МАТ'}});
  fireEvent.click(screen.getByRole('button',{name:'100% qilish'}));
  // A separate, explicit correction preview could be offered; completion itself must not write a reduction.
  expect(m.total).not.toHaveBeenCalled();
});
