import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {dashboardFixture} from './fixtures.fixture';
const m=vi.hoisted(()=>({docs:vi.fn(),workbook:vi.fn(),rows:vi.fn()}));
vi.mock('../../api/t2-hujjat-canonical',()=>({hujjatYuklabOlishUrl:(id:number)=>'/api/hujjat-ol?id='+id}));
vi.mock('./documents',()=>({readDocuments:m.docs}));
vi.mock('./report',()=>({managementWorkbook:m.workbook,readObjectEvidence:m.rows}));
vi.mock('./CostEvidence',()=>({default:()=>null}));
import Reports from './Reports';
afterEach(()=>{cleanup();vi.restoreAllMocks();m.docs.mockReset();m.rows.mockReset();m.workbook.mockReset();});
function wrapper(data=dashboardFixture()){return <MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Reports key={data.kompaniya.kompaniya_id} data={data}/></QueryClientProvider></MemoryRouter>;}
it('cancels a pending download when company context changes',async()=>{m.docs.mockImplementation(async(p:any)=>({ok:true,kompaniya_id:p.companyId,jami:0,next_before_id:null,documents:[]}));let finish!:(v:Uint8Array)=>void;m.workbook.mockImplementation(()=>new Promise<Uint8Array>(r=>{finish=r;}));const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});const view=render(wrapper());fireEvent.click(screen.getByRole('button',{name:'Boshqaruv hisobotini yuklash'}));await waitFor(()=>expect(m.workbook).toHaveBeenCalledTimes(1));const d=dashboardFixture();d.kompaniya.kompaniya_id=18;view.rerender(wrapper(d));await act(async()=>{finish(new Uint8Array([1]));});expect(click).not.toHaveBeenCalled();});
it('reads unassigned-project documents with an explicit filter',async()=>{const d=dashboardFixture();d.executive!.projects.push({...d.executive!.projects[0],project_id:null,name:'Unassigned'});d.executive!.project_count=2;m.docs.mockImplementation(async(p:any)=>({ok:true,kompaniya_id:p.companyId,loyiha_id:null,obyekt_id:null,jami:0,next_before_id:null,documents:[]}));render(wrapper(d));await waitFor(()=>expect(m.docs).toHaveBeenCalledTimes(1));fireEvent.change(screen.getByRole('combobox',{name:'Hisobot darajasi'}),{target:{value:'project'}});fireEvent.change(screen.getByRole('combobox',{name:'Loyiha'}),{target:{value:'none'}});await waitFor(()=>expect(m.docs).toHaveBeenCalledTimes(2));expect(m.docs.mock.calls[1][0].withoutProject).toBe(true);});
