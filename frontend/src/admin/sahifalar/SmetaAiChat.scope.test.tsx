import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SmetaAiChat } from './SmetaAiChat';
import { emptyDoc } from '../../lib/smeta-studio/model';
import type { AiKatalog } from '../../lib/smeta-ai/worker';

const api = vi.hoisted(() => ({ chat: vi.fn(), pick: vi.fn() }));
vi.mock('../../api/smeta-ai', () => ({ smetachiSuhbat: api.chat, smetachiTanla: api.pick, smetaXotirasi: async () => ({ yozuvlar: [], superadmin: false }), smetaXotiraYoz: async () => true, smetaTajribaYoz: async () => ({ ok: true, yozildi: 0 }) }));
vi.mock('../../i18n/til', () => ({ t: (s: string) => s }));
vi.mock('../../umumiy/ui/ModelChip', () => ({ ModelChip: () => null }));
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); });

it('separates restored proposals and rejects late replies after a catalogue source switch', async () => {
  const revision = '66bb1a23bd18c63006d447b5';
  const catalog = (rev: string): AiKatalog => ({ manifest:{revision:rev}, search:()=>({rows:[],total:0}),unit:()=>null,load:async()=>{},tableLabel:()=>null,detail:()=>{throw new Error('unused');} });
  localStorage.setItem('smeta-ai:1:same', JSON.stringify({xabarlar:[{rol:'user',matn:'Legacy conversation'}],ishlar:[]}));
  localStorage.setItem(`smeta-ai:1:same:norm-library:${revision}`, JSON.stringify({xabarlar:[{rol:'user',matn:'Library conversation'}],ishlar:[]}));
  let finish!: (v: unknown) => void;
  api.chat.mockImplementation(() => new Promise(resolve=>{finish=resolve;}));
  const props={doc:emptyDoc('same'),kompaniyaId:1,command:vi.fn(),newId:()=> 'id'};
  const {rerender}=render(<SmetaAiChat {...props} katalog={catalog('old')}/>);
  expect(screen.getByText('Legacy conversation')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox',{name:'Smetachiga xabar'}),{target:{value:'fundament'}});
  fireEvent.click(screen.getByRole('button',{name:'Yuborish'}));
  rerender(<SmetaAiChat {...props} katalog={catalog(revision)}/>);
  expect(screen.getByText('Library conversation')).toBeTruthy();
  expect(screen.queryByText('Legacy conversation')).toBeNull();
  await act(async()=>finish({ok:true,tushunildi:true,javob:'OLD SOURCE REPLY',savollar:[],ishlar:[]}));
  expect(screen.queryByText('OLD SOURCE REPLY')).toBeNull();
  expect(localStorage.getItem('smeta-ai:1:same')).toContain('Legacy conversation');
  expect(props.command).not.toHaveBeenCalled();
});

it('late old-company reply cannot enter the new conversation', async () => {
  let resolve!: (v: unknown) => void;
  api.chat.mockImplementation(() => new Promise(r => { resolve = r; }));
  const props = { doc: emptyDoc('same'), katalog: null, command: vi.fn(), newId: () => 'id' };
  const { rerender } = render(<SmetaAiChat {...props} kompaniyaId={1} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Smetachiga xabar' }), { target: { value: 'fundament' } });
  fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
  rerender(<SmetaAiChat {...props} kompaniyaId={2} />);
  await act(async () => resolve({ ok: true, tushunildi: true, javob: 'OLD SECRET', savollar: [], ishlar: [] }));
  expect(screen.queryByText('OLD SECRET')).toBeNull();
  expect(screen.queryByText('fundament')).toBeNull();
  expect(props.command).not.toHaveBeenCalled();
});

it('restored company-scoped conversation survives the initial save effect', () => {
  localStorage.setItem('smeta-ai:1:same', JSON.stringify({ xabarlar: [{ rol: 'user', matn: 'Saved work' }], ishlar: [] }));
  render(<SmetaAiChat doc={emptyDoc('same')} katalog={null} kompaniyaId={1} command={() => true} newId={() => 'id'} />);
  expect(screen.getByText('Saved work')).toBeTruthy();
  expect(localStorage.getItem('smeta-ai:1:same')).toContain('Saved work');
});

it('restored conditional and unprovided material proposals cannot remain ready', () => {
  localStorage.setItem('smeta-ai:1:same', JSON.stringify({ xabarlar: [{ rol: 'user', matn: 'Podbetonka qalinligi 10 sm' }], ishlar: [{
    id: 'w1', bolim: 'Fundament', tavsif: 'Podbetonka', qidiruv: ['Бетонная подготовка'], birlik: 'м3', hajmIfoda: '48*0.6*0.1',
    hajmIzoh: 'agar kengligi fundamentga teng bo‘lsa', material: 'Бетон B7.5', holat: 'TAYYOR', nomzodlar: [],
    tanlangan: { workId: '1', kod: 'E6', nom: 'n', birlik: '100М3', sabab: 'mos' } }] }));
  render(<SmetaAiChat doc={emptyDoc('same')} katalog={null} kompaniyaId={1} command={() => true} newId={() => 'id'} />);
  expect((screen.getByRole('button', { name: 'Tayyorlarini smetaga qo‘shish ({n})' }) as HTMLButtonElement).disabled).toBe(true);
});
