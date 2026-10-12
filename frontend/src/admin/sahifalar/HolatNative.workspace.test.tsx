import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
const m=vi.hoisted(() => ({market:vi.fn()}));
vi.mock('../../test02/KompaniyaTanlov',()=>({useKompaniya:()=>({joriy:{id:17}})}));
vi.mock('../../api/supabase',()=>({sbT2ObyektlarOlKomp:async()=>({ok:true,qatorlar:[{id:127,kompaniya_id:17,nom:'Amfiteatr',loyiha_id:7}]}),yangiOperationId:()=> 'test'}));
vi.mock('../../umumiy/daraxt/useT2Daraxt',()=>({useT2Daraxt:()=>({rows:[],states:[],tree:[{id:1,nom:'Razdel',smeta:100,stFakt:0,stF2:20}],price:[],loading:false,yangilanmoqda:false,error:'',yuklash:vi.fn(),holatniYangila:vi.fn()})}));
vi.mock('../../components/pto-workspace/ObjectTrail',()=>({ObjectTrail:()=> <nav>Loyiha → Shartnoma → Amfiteatr</nav>}));
vi.mock('../../umumiy/daraxt/SmetaTree',()=>({SmetaTree:()=> <div>Smeta daraxti</div>}));
vi.mock('../../components/smeta-studio-pro/MarketPriceComparison',()=>({MarketPriceComparison:()=>{m.market();return <div>Katalog taqqoslash</div>;}}));
vi.mock('../../umumiy/hujjat/HujjatKorinish',()=>({useHujjatKorinish:()=>({oyna:null})}));
vi.mock('../../umumiy/hujjat/HujjatTomonlari',()=>({useHujjatTomonlari:()=>[{},vi.fn()],HujjatTomonlariPanel:()=>null}));
vi.mock('../../umumiy/kontekst/PTOWorkspaceContext',()=>({usePTOWorkspace:()=>({scope:{objectId:127,projectId:7},loading:{hierarchy:false,periods:false},periods:[],sourceDocuments:[],objects:[],refresh:vi.fn()})}));
vi.mock('./OstatkaIstisnoPanel',()=>({useOstatkaIstisnolari:()=>({royxat:[],yangila:vi.fn()}),OstatkaIstisnoPanel:()=>null}));
vi.mock('./NarxNazoratNative',()=>({default:()=> <div>Narx nazorati paneli</div>}));
vi.mock('./ResursVedomostNative',()=>({default:()=> <div>Resurs paneli</div>}));
vi.mock('./SmetaYuklaNative',()=>({default:()=> <div>Yuklash paneli</div>}));
import HolatNative from './HolatNative';
afterEach(()=>{cleanup();m.market.mockReset();});
describe('object workspace navigation',()=>{
  function start(suffix='') {render(<MemoryRouter initialEntries={[`/admin/holat/127${suffix}`]}><Routes><Route path="/admin/holat/:id" element={<HolatNative/>}/></Routes></MemoryRouter>);}
  it('opens the estimate first and only loads pricing when requested',async()=>{
    start();await screen.findByText('Smeta daraxti');expect(m.market).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Narxlar nazorati'}));await screen.findByText('Katalog taqqoslash');
    expect(screen.getByText('Smeta daraxti').closest('[hidden]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Smeta va bajarilish'}));expect(screen.getByText('Smeta daraxti').closest('[hidden]')).toBeNull();
  });
  it('opens object-scoped uploading from its explicit link',async()=>{
    start('?panel=smeta');expect(await screen.findByText('Yuklash paneli')).toBeTruthy();expect(m.market).not.toHaveBeenCalled();
  });
});
