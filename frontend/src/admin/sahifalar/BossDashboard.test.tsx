import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {dashboardFixture} from '../../components/boss-decision/fixtures.fixture';
const m=vi.hoisted(()=>({company:17,data:null as any,error:false,loading:false,docs:vi.fn(),rows:vi.fn()}));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst',()=>({useKompaniya:()=>({joriy:{id:m.company,nom:'DEMO'}})}));
vi.mock('../../api/t2-boss',()=>({useBossDashboard:()=>({data:m.data,isError:m.error,isLoading:m.loading,isFetching:false,refetch:vi.fn()})}));
vi.mock('../../api/t2-hujjat-canonical',()=>({hujjatYuklabOlishUrl:(id:number)=>'/api/hujjat-ol?id='+id}));
vi.mock('../../components/boss-decision/documents',()=>({readDocuments:m.docs}));
vi.mock('../../api/supabase',()=>({sbT2DaraxtOl:m.rows,sbT2QatorHolatOl:m.rows}));
import BossDashboard from './BossDashboard';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
function start(){return render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><BossDashboard/></QueryClientProvider></MemoryRouter>);}
afterEach(()=>{cleanup();m.company=17;m.data=null;m.error=false;m.loading=false;m.rows.mockReset();m.docs.mockReset();});
describe('executive product flow',()=>{
 it('prioritizes portfolio and evidence without fake profit or raw module noise',()=>{m.data=dashboardFixture();start();expect(screen.getByText('Tasdiqlangan F2 hujjatlari summasi')).toBeTruthy();expect(screen.queryByText('Sof natija')).toBeNull();expect(screen.queryByText('INTERNAL_DEBUG')).toBeNull();expect(document.body.textContent).not.toContain('999999');expect(m.rows).not.toHaveBeenCalled();expect(m.docs).not.toHaveBeenCalled();});
 it('hides stale data from previous company immediately',()=>{m.data=dashboardFixture();m.company=18;start();expect(screen.queryByText('Amfiteatr DEMO')).toBeNull();});
 it('legacy model never presents mixed F2 amounts as approved',()=>{m.data=dashboardFixture();delete m.data.executive;start();expect(screen.getByRole('status').textContent).toContain('Eski umumiy akt');expect(document.body.textContent).not.toContain('999999');});
 it('opens documents inline and downloads through authenticated canonical route',async()=>{m.data=dashboardFixture();m.docs.mockResolvedValue({ok:true,kompaniya_id:17,loyiha_id:null,obyekt_id:null,without_project:false,next_before_id:null,jami:1,documents:[{id:'19',filename:'Approved-F2.xlsx',revision:2,canonicalStatus:'READY'}]});start();fireEvent.click(screen.getByRole('button',{name:'Hujjatlar va hisobot'}));const link=await screen.findByRole('link',{name:'Yuklab olish'});expect(link.getAttribute('href')).toBe('/api/hujjat-ol?id=19');expect(screen.getByRole('button',{name:'Boshqaruv hisobotini yuklash'}).hasAttribute('disabled')).toBe(false);expect(m.rows).not.toHaveBeenCalled();});
 it('shows a retry state without stale financial content on error',()=>{m.data=dashboardFixture();m.error=true;start();expect(screen.getByRole('alert')).toBeTruthy();expect(screen.queryByText('Amfiteatr DEMO')).toBeNull();});
});
