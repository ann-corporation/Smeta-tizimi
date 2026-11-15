import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { YordamchiUlanish } from './yordamchi/ishlov';
import type { KasbIshchi } from '../../api/t2-agent-ish';
const m=vi.hoisted(()=>({ask:vi.fn(),load:vi.fn(),list:vi.fn(),intent:vi.fn(),save:vi.fn()}));
vi.mock('../../api/t2-agent-ish',()=>({niyatLlmOl:m.intent,suhbatRoyxatOl:m.list,suhbatServerga:m.save,suhbatServerdanOl:m.load,kasbSavolOqim:m.ask,tizimYordamSavol:vi.fn()}));
vi.mock('./AiBaho',()=>({AiBaho:()=>null}));vi.mock('./AiHarakatKarta',()=>({AiHarakatKarta:()=>null}));
vi.mock('../../lib/yordamchi/niyat',()=>({niyatAniqla:()=>({tur:'nomalum',yaqin:[]})}));
vi.mock('../../lib/yordamchi/niyat-llm',()=>({niyatLlmGaMosmi:()=>true}));
import {AiChat} from './AiChat';
const helper={sahifalar:[],obyektlar:[],joriyObyekt:null,motor:{holat:'tayyor'}} as unknown as YordamchiUlanish;
const role={rol:'pto',profil:'pto',nom:'PTO',vazifa:'Smeta',kategoriyalar:[],namuna_savollar:[],taqiq_izoh:'',boshqalar:[]} as KasbIshchi;
const view=(uid=7,k=17)=><MemoryRouter><AiChat kompaniyaId={k} foydalanuvchiId={uid} kasb={role} sahifa="/admin" generatsiya={0} yordamchi={helper}/></MemoryRouter>;
const choose=(id:string)=>fireEvent.change(screen.getByLabelText('Suhbatni tanlash'),{target:{value:id}});
beforeEach(()=>{localStorage.clear();sessionStorage.clear();m.ask.mockReset();m.intent.mockReset();m.load.mockReset();m.list.mockReset().mockResolvedValue([]);m.save.mockReset().mockResolvedValue(null);
 localStorage.setItem('jarvis-suhbatlar:7:17',JSON.stringify(['a','b'].map(id=>({id,sarlavha:'Chat '+id,yangilandi:Date.now(),xabarlar:[{rol:'user',matn:'Message '+id}]}))));});
afterEach(()=>{vi.useRealTimers();cleanup();});
const send=(text:string)=>{fireEvent.change(screen.getByRole('textbox'),{target:{value:text}});fireEvent.keyDown(screen.getByRole('textbox'),{key:'Enter'});};
const tick=(ms:number)=>act(async()=>{await vi.advanceTimersByTimeAsync(ms);});
it('conversation switch remains visible during a conversation',async()=>{render(view());await act(async()=>{});choose('a');expect(screen.getByText('Message a', {selector:'p'})).toBeTruthy();expect(screen.getByLabelText('Suhbatni tanlash')).toBeTruthy();choose('b');expect(screen.queryByText('Message a', {selector:'p'})).toBeNull();expect(screen.getByText('Message b', {selector:'p'})).toBeTruthy();});
it('new conversation invalidates a late model answer',async()=>{let done!:(v:unknown)=>void;m.ask.mockReturnValue(new Promise(r=>done=r));render(view());
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Tekshir'}});fireEvent.keyDown(screen.getByRole('textbox'),{key:'Enter'});
 await waitFor(()=>expect(m.ask).toHaveBeenCalledTimes(1));fireEvent.click(screen.getByRole('button',{name:'Yangi suhbat'}));
 await act(async()=>done({ok:true,javob:'OLD ANSWER'}));expect(screen.queryByText('OLD ANSWER')).toBeNull();});
it('changing actor cannot copy the previous user history into the new archive',async()=>{const v=render(view());choose('a');v.rerender(view(8));await waitFor(()=>expect(screen.queryByText('Message a', {selector:'p'})).toBeNull());expect(localStorage.getItem('jarvis-suhbatlar:8:17')).toBeNull();expect(sessionStorage.getItem('jarvis-chat:8:17')).not.toContain('Message a');});
it('late server conversation cannot overwrite a newer local selection',async()=>{let done!:(v:unknown)=>void;m.list.mockResolvedValue([{id:'remote',sarlavha:'Remote',yangilandi:new Date().toISOString()}]);m.load.mockReturnValue(new Promise(r=>done=r));render(view());await screen.findByRole('option',{name:'Remote'});choose('remote');choose('b');await act(async()=>done({xabarlar:[{r:'ai',m:'OLD SERVER'}]}));expect(screen.queryByText('OLD SERVER')).toBeNull();expect(screen.getByText('Message b', {selector:'p'})).toBeTruthy();});

it('late intent cannot unlock a newer conversation request',async()=>{
 let oldDone!:(v:unknown)=>void,newDone!:(v:unknown)=>void;
 m.intent.mockReturnValueOnce(new Promise(r=>oldDone=r)).mockReturnValueOnce(new Promise(r=>newDone=r));
 m.ask.mockResolvedValue({ok:true,javob:'OK'});
 const active={...helper,sahifalar:[{yol:'/admin',nom:'Admin'}]} as YordamchiUlanish;
 render(<MemoryRouter><AiChat kompaniyaId={17} foydalanuvchiId={7} kasb={role} sahifa="/admin" generatsiya={0} yordamchi={active}/></MemoryRouter>);
 send('Birinchi vazifani tekshir');await waitFor(()=>expect(m.intent).toHaveBeenCalledTimes(1));
 fireEvent.click(screen.getByRole('button',{name:'Yangi suhbat'}));send('Ikkinchi vazifani tekshir');await waitFor(()=>expect(m.intent).toHaveBeenCalledTimes(2));
 await act(async()=>oldDone(null));send('Uchinchi vazifani tekshir');expect(m.intent).toHaveBeenCalledTimes(2);
 await act(async()=>newDone(null));
 await waitFor(()=>expect(m.ask).toHaveBeenCalledTimes(1));
 expect(m.ask.mock.calls[0][1]).toBe('Ikkinchi vazifani tekshir');expect(m.intent).toHaveBeenCalledTimes(2);
});

it('server save failure is visible instead of silently claiming persistence',async()=>{
 vi.useFakeTimers();m.ask.mockResolvedValue({ok:true,javob:'OK'});render(view());await tick(0);
 send('Tekshir');await tick(0);expect(screen.getByText(/Suhbat serverga saqlanmoqda/)).toBeTruthy();
 await tick(1500);expect(m.save).toHaveBeenCalledTimes(1);expect(screen.getByRole('status').textContent).toContain('Serverga saqlanmadi');
});

it('saving status does not stay stale while a streaming answer is in progress',async()=>{
 vi.useFakeTimers();m.ask.mockResolvedValueOnce({ok:true,javob:'OK'}).mockReturnValueOnce(new Promise(()=>{}));render(view());await tick(0);
 send('Birinchi');await tick(0);expect(screen.getByText(/Suhbat serverga saqlanmoqda/)).toBeTruthy();
 send('Ikkinchi');await tick(0);expect(screen.queryByText(/Suhbat serverga saqlanmoqda/)).toBeNull();await tick(3000);expect(m.save).not.toHaveBeenCalled();
});

it('merely opening a local conversation neither re-sends it nor bumps its timestamp',async()=>{
 vi.useFakeTimers();const arch=JSON.parse(localStorage.getItem('jarvis-suhbatlar:7:17')!);const old=Date.now()-86_400_000;arch[0].yangilandi=old;localStorage.setItem('jarvis-suhbatlar:7:17',JSON.stringify(arch));
 render(view());await tick(0);choose('a');await tick(3000);expect(m.save).not.toHaveBeenCalled();
 expect(JSON.parse(localStorage.getItem('jarvis-suhbatlar:7:17')!).find((q:{id:string})=>q.id==='a').yangilandi).toBe(old);
 m.ask.mockResolvedValue({ok:true,javob:'OK'});send('Yana');await tick(0);await tick(1500);expect(m.save).toHaveBeenCalledTimes(1);expect(m.save.mock.calls[0][1]).toBe('a');
});

it('a summary-only server conversation is never uploaded as the original, and a new message forks it',async()=>{
 vi.useFakeTimers();m.list.mockResolvedValue([{id:'remote',sarlavha:'Remote',yangilandi:new Date().toISOString()}]);m.load.mockResolvedValue({qisqartma:'SUMMARY'});
 render(view());await tick(0);choose('remote');await tick(0);expect(screen.getByText(/SUMMARY/,{selector:'p'})).toBeTruthy();
 await tick(3000);expect(m.save).not.toHaveBeenCalled();
 m.ask.mockResolvedValue({ok:true,javob:'OK'});send('Davom');await tick(0);await tick(1500);
 expect(m.save).toHaveBeenCalledTimes(1);expect(m.save.mock.calls[0][1]).not.toBe('remote');
});

it('a failed server load keeps the in-flight answer of the current conversation',async()=>{
 let done!:(v:unknown)=>void;m.ask.mockReturnValue(new Promise(r=>done=r));m.list.mockResolvedValue([{id:'remote',sarlavha:'Remote',yangilandi:new Date().toISOString()}]);m.load.mockResolvedValue(null);
 render(view());await screen.findByRole('option',{name:'Remote'});send('Tekshir');await waitFor(()=>expect(m.ask).toHaveBeenCalledTimes(1));
 choose('remote');await waitFor(()=>expect(m.load).toHaveBeenCalledTimes(1));await act(async()=>{});
 await act(async()=>done({ok:true,javob:'LIVE ANSWER'}));expect(screen.getByText('LIVE ANSWER')).toBeTruthy();
});

it('a late model answer is dropped after switching through the conversation selector',async()=>{
 let done!:(v:unknown)=>void;m.ask.mockReturnValue(new Promise(r=>done=r));render(view());send('Tekshir');await waitFor(()=>expect(m.ask).toHaveBeenCalledTimes(1));
 choose('b');await act(async()=>done({ok:true,javob:'OLD ANSWER'}));expect(screen.queryByText('OLD ANSWER')).toBeNull();expect(screen.getByText('Message b',{selector:'p'})).toBeTruthy();
});

it('changing the company cannot copy the previous company history into the new archive',async()=>{
 const v=render(view());choose('a');v.rerender(view(7,18));await waitFor(()=>expect(screen.queryByText('Message a',{selector:'p'})).toBeNull());
 expect(localStorage.getItem('jarvis-suhbatlar:7:18')).toBeNull();expect(sessionStorage.getItem('jarvis-chat:7:18')??'').not.toContain('Message a');
});
it('reopening preserves the selected conversation identity without duplicate archives',async()=>{const v=render(view());choose('a');v.unmount();render(view());await act(async()=>{});const archive=JSON.parse(localStorage.getItem('jarvis-suhbatlar:7:17')!);expect(archive.map((q:{id:string})=>q.id).sort()).toEqual(['a','b']);expect(screen.getByText('Message a',{selector:'p'})).toBeTruthy();});

it('remote loading is visible and cancellation preserves the current conversation',async()=>{
 let done!:(v:unknown)=>void;m.list.mockResolvedValue([{id:'remote',sarlavha:'Remote',yangilandi:new Date().toISOString()}]);m.load.mockReturnValue(new Promise(r=>done=r));
 render(view());await screen.findByRole('option',{name:'Remote'});choose('a');choose('remote');
 expect(screen.getByTestId('jarvis-conversation-loading').textContent).toContain('Remote');expect(screen.getByText('Message a',{selector:'p'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Suhbat yuklashni bekor qilish'}));expect(screen.queryByTestId('jarvis-conversation-loading')).toBeNull();
 await act(async()=>done({xabarlar:[{r:'ai',m:'CANCELLED REMOTE'}]}));expect(screen.queryByText('CANCELLED REMOTE')).toBeNull();expect(screen.getByText('Message a',{selector:'p'})).toBeTruthy();
});
it('failed load clears the indicator and keeps the current messages',async()=>{
 m.list.mockResolvedValue([{id:'remote',sarlavha:'Remote',yangilandi:new Date().toISOString()}]);m.load.mockRejectedValue(new Error('offline'));
 render(view());await screen.findByRole('option',{name:'Remote'});choose('a');choose('remote');await act(async()=>{});
 expect(screen.queryByTestId('jarvis-conversation-loading')).toBeNull();expect(screen.getByText('Message a',{selector:'p'})).toBeTruthy();
});
it('late previous load does not clear the current loading indicator',async()=>{
 let first!:(v:unknown)=>void,second!:(v:unknown)=>void;
 m.list.mockResolvedValue(['r1','r2'].map(id=>({id,sarlavha:id,yangilandi:new Date().toISOString()})));
 m.load.mockReturnValueOnce(new Promise(r=>first=r)).mockReturnValueOnce(new Promise(r=>second=r));
 render(view());await screen.findByRole('option',{name:'r1'});choose('r1');choose('r2');await act(async()=>first(null));
 expect(screen.getByTestId('jarvis-conversation-loading').textContent).toContain('r2');
 await act(async()=>second({xabarlar:[{r:'ai',m:'SECOND'}]}));expect(screen.queryByTestId('jarvis-conversation-loading')).toBeNull();expect(screen.getByText('SECOND')).toBeTruthy();
});

it('the model receives the initial goal and complete long constraints after many turns',async()=>{
 const goal='Maqsad: '+ 'x'.repeat(1500)+' oxirgi muhim talab';
 sessionStorage.setItem('jarvis-chat:7:17',JSON.stringify(Array.from({length:24},(_,i)=>({id:'old-'+i,rol:i%2?'ai':'user',matn:i?'Turn '+i:goal}))));
 m.ask.mockResolvedValue({ok:true,javob:'OK'});render(view());send('Davom et');await waitFor(()=>expect(m.ask).toHaveBeenCalledTimes(1));
 const history=m.ask.mock.calls[0][2].tarix;expect(history[0].matn).toBe(goal);expect(history).toHaveLength(16);expect(history.at(-1).matn).toBe('Turn 23');
});
it('a repeated question does not erase an earlier identical user message',async()=>{
 sessionStorage.setItem('jarvis-chat:7:17',JSON.stringify([{id:'old',rol:'user',matn:'Takror tekshir'},{id:'reply',rol:'ai',matn:'Old result'}]));
 m.ask.mockResolvedValue({ok:true,javob:'OK'});render(view());send('Takror tekshir');await waitFor(()=>expect(m.ask).toHaveBeenCalledTimes(1));
 expect(m.ask.mock.calls[0][2].tarix).toEqual([{rol:'user',matn:'Takror tekshir'},{rol:'assistant',matn:'Old result'}]);
});
