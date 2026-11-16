import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { YordamchiUlanish } from './yordamchi/ishlov';
import type { KasbIshchi } from '../../api/t2-agent-ish';
const m=vi.hoisted(()=>({ask:vi.fn(),load:vi.fn(),list:vi.fn(),intent:vi.fn(),save:vi.fn(),sync:vi.fn(),append:vi.fn(),mutate:vi.fn()}));
vi.mock('../../api/t2-agent-ish',()=>({niyatLlmOl:m.intent,suhbatRoyxatOl:m.list,suhbatServerga:m.save,suhbatServerdanOl:m.load,kasbSavolOqim:m.ask,tizimYordamSavol:vi.fn()}));
vi.mock('../../api/jarvis-suhbat-sync',()=>({syncJarvisConversation:m.sync,appendJarvisMessages:m.append,mutateJarvisConversation:m.mutate}));
vi.mock('./AiBaho',()=>({AiBaho:()=>null}));vi.mock('./AiHarakatKarta',()=>({AiHarakatKarta:()=>null}));
vi.mock('../../lib/yordamchi/niyat',()=>({niyatAniqla:()=>({tur:'nomalum',yaqin:[]})}));
vi.mock('../../lib/yordamchi/niyat-llm',()=>({niyatLlmGaMosmi:()=>true}));
import {AiChat} from './AiChat';
const helper={sahifalar:[],obyektlar:[],joriyObyekt:null,motor:{holat:'tayyor'}} as unknown as YordamchiUlanish;
const role={rol:'pto',profil:'pto',nom:'PTO',vazifa:'Smeta',kategoriyalar:[],namuna_savollar:[],taqiq_izoh:'',boshqalar:[]} as KasbIshchi;
const view=(uid=7,k=17)=><MemoryRouter><AiChat kompaniyaId={k} foydalanuvchiId={uid} kasb={role} sahifa="/admin" generatsiya={0} yordamchi={helper}/></MemoryRouter>;
const choose=(id:string)=>fireEvent.change(screen.getByLabelText('Suhbatni tanlash'),{target:{value:id}});
beforeEach(()=>{localStorage.clear();sessionStorage.clear();m.ask.mockReset();m.intent.mockReset();m.load.mockReset();m.list.mockReset().mockResolvedValue([]);m.save.mockReset().mockResolvedValue(null);
 m.sync.mockReset().mockResolvedValue(null);
 m.append.mockReset().mockResolvedValue(null);
 m.mutate.mockReset().mockResolvedValue({status:'failed'});
 localStorage.setItem('jarvis-suhbatlar:7:17',JSON.stringify(['a','b'].map(id=>({id,sarlavha:'Chat '+id,yangilandi:Date.now(),xabarlar:[{rol:'user',matn:'Message '+id}]}))));});
afterEach(()=>{vi.useRealTimers();cleanup();});
const send=(text:string)=>{fireEvent.change(screen.getByRole('textbox'),{target:{value:text}});fireEvent.keyDown(screen.getByRole('textbox'),{key:'Enter'});};
const tick=(ms:number)=>act(async()=>{await vi.advanceTimersByTimeAsync(ms);});

function remoteFixture() {
 const row = { id: 'remote', sarlavha: 'Phone chat', yangilandi: new Date().toISOString(), toliq: true };
 m.list.mockResolvedValue([row]);
 m.load.mockResolvedValue({ xabarlar: [{ r: 'ai', m: 'Before phone update' }], qisqartma: null });
 return row;
}

it('retries an unacknowledged append with its original operation and drains newer turns after it', async () => {
 const {row,etag} = await openVersionedChat();
 m.ask.mockResolvedValue({ok:true,javob:'Synthetic answer'});
 m.append.mockResolvedValueOnce(null)
  .mockResolvedValueOnce({etag:'b'.repeat(32)}).mockResolvedValueOnce({etag:'c'.repeat(32)});
 send('First question');await tick(0);await tick(1000);
 expect(m.append.mock.calls[0][4]).toMatch(/^[a-f0-9-]{36}$/);
 expect(screen.getByRole('button',{name:'Qayta urinish'})).toBeTruthy();
 send('Second question');await tick(0);await tick(1000);
 expect(m.append.mock.calls[1]).toEqual(m.append.mock.calls[0]);
 await tick(1000);
 expect(m.append.mock.calls[2].slice(0,4)).toEqual([17,row.id,'b'.repeat(32),[
  {r:'user',m:'Second question'},{r:'ai',m:'Synthetic answer'},
 ]]);
 expect(m.append.mock.calls[2][4]).not.toBe(m.append.mock.calls[0][4]);
 expect(m.append.mock.calls[0][2]).toBe(etag);
});

async function openVersionedChat() {
 vi.useFakeTimers();
 const row = remoteFixture();
 const etag = 'a'.repeat(32);
 m.sync.mockResolvedValueOnce({royxat:[row],suhbat:{
  id:row.id,holat:'changed',etag,sarlavha:row.sarlavha,
  xabarlar:[{r:'ai',m:'Before phone update'}],qisqartma:null,
 }});
 render(view()); await tick(0); choose(row.id); await tick(0); await tick(3000);
 return {row,etag};
}

it('renames on the server, then deletes only after explicit confirmation with the new version', async () => {
 const {row,etag} = await openVersionedChat();
 const next = 'b'.repeat(32);
 m.mutate.mockResolvedValueOnce({status:'saved',etag:next}).mockResolvedValueOnce({status:'deleted'});
 fireEvent.click(screen.getByRole('button',{name:'Suhbat nomini o‘zgartirish'}));
 fireEvent.change(screen.getByLabelText('Suhbat nomi'),{target:{value:'Weekly plan'}});
 fireEvent.click(screen.getByRole('button',{name:'Saqlash'}));
 await tick(0);
 expect(m.mutate).toHaveBeenCalledWith(17,row.id,etag,{harakat:'rename',sarlavha:'Weekly plan'});
 expect(screen.getAllByRole('option',{name:'Weekly plan'}).length).toBeGreaterThan(0);
 fireEvent.click(screen.getByRole('button',{name:'Suhbatni o‘chirish'}));
 expect(m.mutate).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'O‘chirishni tasdiqlash'}));
 await tick(0);
 expect(m.mutate).toHaveBeenLastCalledWith(17,row.id,next,{harakat:'delete'});
 expect(screen.queryByText('Before phone update')).toBeNull();
 expect(screen.queryByRole('option',{name:'Weekly plan'})).toBeNull();
 expect(screen.getByRole('option',{name:'Chat a'})).toBeTruthy();
});

it('keeps the current history when the server rejects an outdated deletion', async () => {
 const {row,etag} = await openVersionedChat();
 m.mutate.mockResolvedValueOnce({status:'stale'});
 fireEvent.click(screen.getByRole('button',{name:'Suhbatni o‘chirish'}));
 fireEvent.click(screen.getByRole('button',{name:'O‘chirishni tasdiqlash'}));
 await tick(0);
 expect(m.mutate).toHaveBeenCalledWith(17,row.id,etag,{harakat:'delete'});
 expect(screen.getByText('Before phone update')).toBeTruthy();
 expect(m.save).not.toHaveBeenCalled();
});

it('does not clear a different conversation after a pending deletion finishes', async () => {
 await openVersionedChat();
 let finish!: (answer: unknown) => void;
 m.mutate.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
 fireEvent.click(screen.getByRole('button',{name:'Suhbatni o‘chirish'}));
 fireEvent.click(screen.getByRole('button',{name:'O‘chirishni tasdiqlash'}));
 choose('a');
 await act(async () => finish({status:'deleted'}));
 expect(screen.getByText('Message a')).toBeTruthy();
});

it('appends only new turns to a server conversation and advances the expected version on success', async () => {
 vi.useFakeTimers();
 const row = remoteFixture();
 const tag = 'a'.repeat(32);
 const nextTag = 'b'.repeat(32);
 m.sync.mockResolvedValue({ royxat: [row], suhbat: {
  id: row.id, holat: 'changed', etag: tag, sarlavha: row.sarlavha,
  xabarlar: [{ r: 'ai', m: 'Before phone update' }], qisqartma: null,
 } });
 m.append.mockResolvedValueOnce({ etag: nextTag }).mockResolvedValueOnce({ etag: 'c'.repeat(32) });
 m.ask.mockResolvedValue({ ok: true, javob: 'Protected answer' });
 render(view()); await tick(0); choose(row.id); await tick(0);
 send('Yangi savol'); await tick(0); await tick(1000);
 expect(m.append.mock.calls[0].slice(0,4)).toEqual([17, row.id, tag, [
  { r: 'user', m: 'Yangi savol' }, { r: 'ai', m: 'Protected answer' },
 ]]);
 send('Yana savol'); await tick(0); await tick(1000);
 expect(m.append.mock.calls[1].slice(0,4)).toEqual([17, row.id, nextTag, [
  { r: 'user', m: 'Yana savol' }, { r: 'ai', m: 'Protected answer' },
 ]]);
 expect(m.save).not.toHaveBeenCalled();
 expect(sessionStorage.getItem('jarvis-chat:7:17')).toBeNull();
});

it('preserves the local dialog when a guarded append is rejected and never retries with the old writer', async () => {
 vi.useFakeTimers();
 const row = remoteFixture();
 m.sync.mockResolvedValue({ royxat: [row], suhbat: {
  id: row.id, holat: 'changed', etag: 'd'.repeat(32), sarlavha: row.sarlavha,
  xabarlar: [{ r: 'ai', m: 'Before phone update' }], qisqartma: null,
 } });
 m.append.mockResolvedValue(null);
 m.ask.mockResolvedValue({ ok: true, javob: 'Keep this answer' });
 render(view()); await tick(0); choose(row.id); await tick(0);
 send('Yangi savol'); await tick(0); await tick(1000);
 expect(screen.getByText('Keep this answer')).toBeTruthy();
 expect(screen.getByText(/Serverga saqlanmadi/)).toBeTruthy();
 expect(m.append).toHaveBeenCalledTimes(1);
 expect(m.save).not.toHaveBeenCalled();
});

it('does not write if the first sync snapshot supersedes the legacy-opened history', async () => {
 vi.useFakeTimers();
 const row = remoteFixture();
 m.sync.mockResolvedValue({ royxat: [row], suhbat: {
  id: row.id, holat: 'changed', etag: 'e'.repeat(32), sarlavha: row.sarlavha,
  xabarlar: [{ r: 'ai', m: 'Newer answer from another device' }], qisqartma: null,
 } });
 m.ask.mockResolvedValue({ ok: true, javob: 'Locally composed answer' });
 render(view()); await tick(0); choose(row.id); await tick(0);
 send('Yangi savol'); await tick(0); await tick(1000);
 expect(screen.getByText('Locally composed answer')).toBeTruthy();
 expect(screen.getByText(/Serverga saqlanmadi/)).toBeTruthy();
 expect(m.append).not.toHaveBeenCalled();
 expect(m.save).not.toHaveBeenCalled();
});

it('updates an open remote conversation and its title, then clears it after remote deletion', async () => {
 vi.useFakeTimers();
 const row = remoteFixture();
 const renamed = { ...row, sarlavha: 'Renamed on phone' };
 m.sync.mockResolvedValueOnce({ royxat: [renamed], suhbat: {
  id: row.id, holat: 'changed', etag: 'a'.repeat(32), sarlavha: renamed.sarlavha,
  xabarlar: [{ r: 'ai', m: 'After phone update' }], qisqartma: null,
 } }).mockResolvedValueOnce({ royxat: [], suhbat: { id: row.id, holat: 'missing' } });
 render(view()); await tick(0); choose(row.id); await tick(0);
 expect(screen.getByText('Before phone update')).toBeTruthy();
 await tick(3000);
 expect(screen.getByText('After phone update')).toBeTruthy();
 expect(screen.getAllByRole('option', { name: 'Renamed on phone' }).length).toBeGreaterThan(0);
 expect(m.save).not.toHaveBeenCalled();
 await tick(3000);
 expect(screen.queryByText('After phone update')).toBeNull();
 expect(m.sync.mock.calls[1][1]).toEqual({ id: row.id, etag: 'a'.repeat(32) });
 expect(m.save).not.toHaveBeenCalled();
});

it('a late poll cannot replace a different conversation selected during the request', async () => {
 vi.useFakeTimers();
 const row = remoteFixture();
 let finish!: (snapshot: unknown) => void;
 m.sync.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
 render(view()); await tick(0); choose(row.id); await tick(0); await tick(3000);
 choose('a');
 await act(async () => finish({ royxat: [row], suhbat: { id: row.id, holat: 'missing' } }));
 expect(screen.getByText('Message a', { selector: 'p' })).toBeTruthy();
 expect(m.save).not.toHaveBeenCalled();
});

it('a missing remote chat does not wipe the message being typed', async () => {
 vi.useFakeTimers();
 const row = remoteFixture();
 let finish!: (snapshot: unknown) => void;
 m.sync.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
 render(view()); await tick(0); choose(row.id); await tick(0); await tick(3000);
 fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unsaved draft' } });
 await act(async () => finish({ royxat: [], suhbat: { id: row.id, holat: 'missing' } }));
 expect(screen.getByDisplayValue('Unsaved draft')).toBeTruthy();
 expect(screen.getByText('Before phone update')).toBeTruthy();
 expect(m.save).not.toHaveBeenCalled();
});
it('conversation switch remains visible during a conversation',async()=>{render(view());await act(async()=>{});choose('a');expect(screen.getByText('Message a', {selector:'p'})).toBeTruthy();expect(screen.getByLabelText('Suhbatni tanlash')).toBeTruthy();choose('b');expect(screen.queryByText('Message a', {selector:'p'})).toBeNull();expect(screen.getByText('Message b', {selector:'p'})).toBeTruthy();});
it('new conversation invalidates a late model answer',async()=>{let done!:(v:unknown)=>void;m.ask.mockReturnValue(new Promise(r=>done=r));render(view());
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Tekshir'}});fireEvent.keyDown(screen.getByRole('textbox'),{key:'Enter'});
 await waitFor(()=>expect(m.ask).toHaveBeenCalledTimes(1));fireEvent.click(screen.getByRole('button',{name:'Yangi suhbat'}));
 await act(async()=>done({ok:true,javob:'OLD ANSWER'}));expect(screen.queryByText('OLD ANSWER')).toBeNull();});
it('changing actor cannot copy the previous user history into the new archive',async()=>{const v=render(view());choose('a');v.rerender(view(8));await waitFor(()=>expect(screen.queryByText('Message a', {selector:'p'})).toBeNull());expect(localStorage.getItem('jarvis-suhbatlar:8:17')).toBeNull();expect(sessionStorage.getItem('jarvis-chat:8:17')).toBeNull();});
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
 await tick(1500);expect(m.mutate).toHaveBeenCalledTimes(1);expect(m.save).not.toHaveBeenCalled();expect(screen.getByRole('status').textContent).toContain('Serverga saqlanmadi');
});

it('retries creation with the same id and first messages then appends new turns using the returned version',async()=>{
 vi.useFakeTimers();
 m.ask.mockResolvedValue({ok:true,javob:'Verified answer'});
 const tag = 'e'.repeat(32);
 m.mutate.mockResolvedValueOnce({status:'failed'}).mockResolvedValueOnce({status:'saved',etag:tag});
 m.append.mockResolvedValueOnce({etag:'f'.repeat(32)});
 render(view());await tick(0);
 send('First synthetic request');await tick(0);await tick(1000);
 const [company,id,etag,payload] = m.mutate.mock.calls[0];
 expect([company,etag,payload]).toEqual([17,null,{
  harakat:'create',sarlavha:'First synthetic request',
  xabarlar:[{r:'user',m:'First synthetic request'},{r:'ai',m:'Verified answer'}],
 }]);
 fireEvent.click(screen.getByRole('button',{name:'Qayta urinish'}));await tick(1000);
 expect(m.mutate.mock.calls[1]).toEqual(m.mutate.mock.calls[0]);
 send('Second synthetic request');await tick(0);await tick(1000);
 expect(m.append.mock.calls[0].slice(0,4)).toEqual([17,id,tag,[{r:'user',m:'Second synthetic request'},{r:'ai',m:'Verified answer'}]]);
 expect(m.save).not.toHaveBeenCalled();
 expect(sessionStorage.getItem('jarvis-chat:7:17')).toBeNull();
 expect(localStorage.getItem('jarvis-suhbatlar:7:17')).not.toContain('First synthetic request');
});

it('keeps a second turn queued while the first create request is in flight',async()=>{
 vi.useFakeTimers();
 m.ask.mockResolvedValue({ok:true,javob:'Synthetic answer'});
 let finish!: (answer: unknown) => void;
 m.mutate.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
 m.append.mockResolvedValue({etag:'f'.repeat(32)});
 render(view());await tick(0);
 send('First request');await tick(0);await tick(1000);
 send('Second request');await tick(0);await tick(1000);
 expect(m.mutate).toHaveBeenCalledTimes(1);
 expect(m.append).not.toHaveBeenCalled();
 const tag = 'e'.repeat(32);
 await act(async () => finish({status:'saved',etag:tag}));await tick(1000);
 expect(m.append.mock.calls[0].slice(0,4)).toEqual([17,m.mutate.mock.calls[0][1],tag,[
  {r:'user',m:'Second request'},{r:'ai',m:'Synthetic answer'},
 ]]);
});

it('serializes overlapping appends and uses the first committed version for the next turn',async()=>{
 const {row,etag} = await openVersionedChat();
 m.ask.mockResolvedValue({ok:true,javob:'Synthetic answer'});
 let finish!: (answer: unknown) => void;
 m.append.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({etag:'c'.repeat(32)});
 send('First request');await tick(0);await tick(1000);
 send('Second request');await tick(0);await tick(1000);
 expect(m.append).toHaveBeenCalledTimes(1);
 expect(m.append.mock.calls[0].slice(0,3)).toEqual([17,row.id,etag]);
 const updated = 'b'.repeat(32);
 await act(async () => finish({etag:updated}));await tick(1000);
 expect(m.append.mock.calls[1].slice(0,4)).toEqual([17,row.id,updated,[
  {r:'user',m:'Second request'},{r:'ai',m:'Synthetic answer'},
 ]]);
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
 expect(m.save).not.toHaveBeenCalled();
 expect(m.mutate.mock.calls[0][1]).not.toBe('remote');
 expect(m.mutate.mock.calls[0][3].xabarlar).toEqual([{r:'user',m:'Davom'},{r:'ai',m:'OK'}]);
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
