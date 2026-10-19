import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { studioKontekstUla } from '../../lib/jarvis/studio-kontekst';
const m=vi.hoisted(()=>({savol:vi.fn(),katalog:vi.fn()}));
vi.mock('../../api/t2-agent-ish',()=>({kasbSavolOqim:m.savol,tizimYordamSavol:vi.fn()}));
vi.mock('../../lib/jarvis/katalog-kontekst',()=>({narxSavolimi:(s:string)=>s.includes('narx'),katalogKonteksti:m.katalog,vaqtBilan:(p:Promise<unknown>)=>p}));
vi.mock('./AiBaho',()=>({AiBaho:()=>null}));vi.mock('./AiHarakatKarta',()=>({AiHarakatKarta:()=>null}));
import { AiChat } from './AiChat';
import type { KasbIshchi } from '../../api/t2-agent-ish';
const page='/admin/smeta-studio';const dto={schema:1 as const,companyId:17,draftId:'a',title:'Draft A',summary:'Qoralama: 4 m3'};
let stop=()=>{};
const kasb:KasbIshchi={rol:'pto',profil:'pto',nom:'PTO',vazifa:'Smeta',kategoriyalar:['smeta_pul'],namuna_savollar:[],taqiq_izoh:'',boshqalar:[]};
const view=(k=17,path=page)=><MemoryRouter><AiChat kompaniyaId={k} kasb={kasb} sahifa={path} generatsiya={0}/></MemoryRouter>;
const send=(s:string)=>{fireEvent.change(screen.getByRole('textbox'),{target:{value:s}});fireEvent.keyDown(screen.getByRole('textbox'),{key:'Enter'});};
beforeEach(()=>{m.savol.mockReset().mockResolvedValue({ok:true,model:'local',javob:'Natija'});m.katalog.mockReset().mockResolvedValue([]);});
afterEach(()=>{cleanup();stop();});
it('explicit question carries the latest current-company draft, without automatic model calls',async()=>{
  stop=studioKontekstUla({companyId:17,draftId:'a',read:()=>dto});render(view());expect(m.savol).not.toHaveBeenCalled();send('Qoralamada nima bor?');
  await waitFor(()=>expect(m.savol).toHaveBeenCalledTimes(1));expect(m.savol.mock.calls[0][2].studio).toEqual(dto);
});
it('a still-loading role label does not lose an explicitly shared draft; server remains the authority',async()=>{
  stop=studioKontekstUla({companyId:17,draftId:'a',read:()=>dto});
  render(<MemoryRouter><AiChat kompaniyaId={17} kasb={null} sahifa={page} generatsiya={0}/></MemoryRouter>);send('Shu qoralamada nima bor?');
  await waitFor(()=>expect(m.savol).toHaveBeenCalledTimes(1));expect(m.savol.mock.calls[0][2].studio).toEqual(dto);
});
it('switching company while the price catalogue is loading prevents the old paid request',async()=>{
  let done!:(r:unknown[])=>void;m.katalog.mockReturnValue(new Promise(r=>{done=r;}));
  stop=studioKontekstUla({companyId:17,draftId:'a',read:()=>dto});const v=render(view());send('Beton narxi?');
  v.rerender(view(39));await act(async()=>done([]));expect(m.savol).not.toHaveBeenCalled();expect(screen.queryByText('Beton narxi?')).toBeNull();
});
it('stop during catalogue lookup prevents a subsequent provider call',async()=>{
  let done!:(r:unknown[])=>void;m.katalog.mockReturnValue(new Promise(r=>{done=r;}));render(view());send('Beton narxi?');
  fireEvent.click(screen.getByLabelText('To‘xtatish'));await act(async()=>done([]));expect(m.savol).not.toHaveBeenCalled();
});
it('rapid repeated submits share one inflight request',async()=>{
  let done!:(r:unknown)=>void;m.savol.mockReturnValue(new Promise(r=>{done=r;}));render(view());
  send('Tekshir');send('Yana tekshir');await waitFor(()=>expect(m.savol).toHaveBeenCalledTimes(1));
  await act(async()=>done({ok:true,javob:'Natija'}));
});
it('late answer is discarded after leaving Studio and inflight request is aborted',async()=>{
  let done!:(r:unknown)=>void;m.savol.mockReturnValue(new Promise(r=>{done=r;}));const v=render(view());send('Qoralamani tekshir');
  await waitFor(()=>expect(m.savol).toHaveBeenCalledTimes(1));const signal=m.savol.mock.calls[0][2].signal;
  v.rerender(view(17,'/admin/f2'));expect(signal.aborted).toBe(true);await act(async()=>done({ok:true,javob:'OLD SECRET'}));expect(screen.queryByText('OLD SECRET')).toBeNull();
});
