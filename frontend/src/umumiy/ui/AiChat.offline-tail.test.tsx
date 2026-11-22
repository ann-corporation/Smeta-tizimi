import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { webcrypto } from 'node:crypto';
import type { KasbIshchi } from '../../api/t2-agent-ish';
import type { YordamchiUlanish } from './yordamchi/ishlov';
const state = vi.hoisted(() => ({ disk: new Map<string, unknown>(), create: vi.fn(), append: vi.fn(), list: vi.fn(), load: vi.fn(), sync: vi.fn() }));
vi.mock('idb-keyval', () => ({ createStore: () => ({}), get: async (key: string) => state.disk.get(key),
  update: async (key: string, change: (current: unknown) => unknown) => { state.disk.set(key, change(state.disk.get(key))); } }));
vi.mock('../../api/t2-agent-ish', () => ({ niyatLlmOl: vi.fn(), suhbatRoyxatOl: state.list,
  suhbatServerdanOl: state.load, suhbatServerga: vi.fn(), tizimYordamSavol: vi.fn(),
  kasbSavolOqim: async (_company: number, question: string) => ({ ok: true, javob: 'Answer ' + question }) }));
vi.mock('../../api/jarvis-suhbat-sync', () => ({ syncJarvisConversation: state.sync,
  mutateJarvisConversation: state.create, appendJarvisMessages: state.append, jarvisConversationPage: async () => null }));
vi.mock('./AiBaho', () => ({ AiBaho: () => null }));
vi.mock('./AiHarakatKarta', () => ({ AiHarakatKarta: () => null }));
vi.mock('../../lib/yordamchi/niyat', () => ({ niyatAniqla: () => ({ tur: 'nomalum', yaqin: [] }) }));
vi.mock('../../lib/yordamchi/niyat-llm', () => ({ niyatLlmGaMosmi: () => false }));
import { AiChat } from './AiChat';
import { jarvisOutboxAcknowledge, jarvisOutboxRead, jarvisOutboxStore } from '../../lib/jarvis/conversation-outbox';
const helper = { sahifalar: [], obyektlar: [], joriyObyekt: null, motor: { holat: 'tayyor' } } as unknown as YordamchiUlanish;
const role = { rol: 'pto', profil: 'pto', nom: 'Synthetic', vazifa: 'Synthetic', kategoriyalar: [], namuna_savollar: [], taqiq_izoh: '', boshqalar: [] } as KasbIshchi;
const view = () => <MemoryRouter><AiChat kompaniyaId={17} foydalanuvchiId={7} kasb={role} sahifa="/admin" generatsiya={0} yordamchi={helper} /></MemoryRouter>;
const send = async (text: string) => {
  await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).readOnly).toBe(false));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } }); fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  await screen.findByText('Answer ' + text, { selector: 'p' });
};
beforeEach(() => {
  state.disk.clear(); state.create.mockReset().mockResolvedValue({ status: 'failed' });
  state.append.mockReset().mockResolvedValue({ etag: 'b'.repeat(32) });
  state.list.mockReset().mockResolvedValue([]); state.load.mockReset().mockResolvedValue(null); state.sync.mockReset().mockResolvedValue(null);
  vi.stubGlobal('indexedDB', {}); vi.stubGlobal('crypto', webcrypto);
  sessionStorage.clear(); localStorage.clear(); Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('recovers later accepted turns after offline create, reload, first acknowledgement and ordered append', async () => {
  render(view()); await send('First synthetic turn');
  await waitFor(() => expect(state.create).toHaveBeenCalledTimes(1));
  const original = structuredClone(state.create.mock.calls[0]);
  expect(await jarvisOutboxRead({ actor: 7, company: 17 })).not.toBeNull();
  await send('Later synthetic turn');
  await waitFor(() => expect(state.create.mock.calls.length).toBeGreaterThan(1));
  expect(state.create.mock.calls[1]).toEqual(original);
  cleanup(); state.create.mockResolvedValue({ status: 'saved', etag: 'a'.repeat(32) });
  render(view());
  await screen.findByText('Answer Later synthetic turn', { selector: 'p' });
  await waitFor(() => expect(state.append).toHaveBeenCalledTimes(1));
  expect(state.append.mock.calls[0].slice(0, 4)).toEqual([17, original[1], 'a'.repeat(32),
    [{ r: 'user', m: 'Later synthetic turn' }, { r: 'ai', m: 'Answer Later synthetic turn' }]]);
  await act(async () => {});
}, 15000);

it('does not count already saved long history against the pending recovery capacity', async () => {
  const row = { id: 'long-synthetic', sarlavha: 'Long synthetic history', yangilandi: new Date().toISOString(), toliq: true };
  const history = Array.from({ length: 210 }, (_, i) => ({ r: 'ai' as const, m: `Saved synthetic ${i}` }));
  state.list.mockResolvedValue([row]); state.load.mockResolvedValue({ xabarlar: history, qisqartma: null });
  state.sync.mockResolvedValue({ royxat: [row], suhbat: { id: row.id, holat: 'changed', etag: 'a'.repeat(32), sarlavha: row.sarlavha, xabarlar: history, qisqartma: null } });
  render(view()); await screen.findByRole('option', { name: row.sarlavha });
  fireEvent.change(screen.getByLabelText('Suhbatni tanlash'), { target: { value: row.id } });
  await screen.findByText('Saved synthetic 209', { selector: 'p' });
  await send('New after long history');
  await waitFor(() => expect(state.append).toHaveBeenCalledOnce());
  expect(state.append.mock.calls[0][3].map((x: { m: string }) => x.m)).toEqual(['New after long history', 'Answer New after long history']);
  await screen.findByText('Suhbat serverga saqlandi');
  expect(await jarvisOutboxRead({ actor: 7, company: 17 })).toBeNull();
}, 15000);

it('recovers later turns while the first RPC remains in flight, without changing its payload', async () => {
  state.create.mockImplementationOnce(() => new Promise(() => {}));
  render(view()); await send('Inflight first');
  await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
  const original = structuredClone(state.create.mock.calls[0]);
  await send('Inflight later');
  await waitFor(async () => expect((await jarvisOutboxRead({ actor: 7, company: 17 }))?.preview.at(-1)?.m)
    .toBe('Answer Inflight later'));
  cleanup(); state.create.mockResolvedValue({ status: 'saved', etag: 'a'.repeat(32) });
  render(view()); await screen.findByText('Answer Inflight later', { selector: 'p' });
  await waitFor(() => expect(state.append).toHaveBeenCalledOnce());
  expect(state.create.mock.calls[1]).toEqual(original);
  expect(state.append.mock.calls[0][3].map((x: { m: string }) => x.m)).toEqual(['Inflight later', 'Answer Inflight later']);
}, 15000);

it('recovers an append head and its later tail, replays the same operation then drains the tail', async () => {
  state.create.mockResolvedValue({ status: 'saved', etag: 'a'.repeat(32) });
  render(view()); await send('Saved first');
  await screen.findByText('Suhbat serverga saqlandi');
  state.append.mockResolvedValue(null);
  await send('Pending append'); await waitFor(() => expect(state.append).toHaveBeenCalledOnce());
  const original = structuredClone(state.append.mock.calls[0]);
  await send('Append tail');
  await waitFor(async () => expect((await jarvisOutboxRead({ actor: 7, company: 17 }))?.preview.at(-1)?.m).toBe('Answer Append tail'));
  cleanup(); state.append.mockResolvedValue({ etag: 'b'.repeat(32) });
  const calls = state.append.mock.calls.length;
  render(view()); await screen.findByText('Answer Append tail', { selector: 'p' });
  await waitFor(() => expect(state.append.mock.calls.length).toBe(calls + 2));
  expect(state.append.mock.calls[calls]).toEqual(original);
  expect(state.append.mock.calls[calls + 1][2]).toBe('b'.repeat(32));
  expect(state.append.mock.calls[calls + 1][3].map((x: { m: string }) => x.m)).toEqual(['Append tail', 'Answer Append tail']);
  expect(state.append.mock.calls[calls + 1][4]).not.toBe(original[4]);
}, 15000);

it('reloads the acknowledged checkpoint before successor reservation and drains more than twelve turns without truncation', async () => {
  const preview = Array.from({ length: 20 }, (_, i) => ({ r: i % 2 ? 'ai' as const : 'user' as const, m: `Recovery synthetic ${i}` }));
  const scope = { actor: 7, company: 17 };
  expect(await jarvisOutboxStore(scope, { kind: 'create', id: 'checkpoint', operation: 'checkpoint', title: 'Synthetic',
    turns: preview.slice(0, 2), headCount: 2, preview })).toBe(true);
  expect(await jarvisOutboxAcknowledge(scope, 'checkpoint', 'a'.repeat(32))).toBe(true);
  render(view()); await screen.findByText('Recovery synthetic 19', { selector: 'p' });
  await waitFor(() => expect(state.append).toHaveBeenCalledTimes(2));
  expect(state.create).not.toHaveBeenCalled();
  expect(state.append.mock.calls.map(c => c[3].length)).toEqual([12, 6]);
  expect(state.append.mock.calls.flatMap(c => c[3])).toEqual(preview.slice(2));
  await screen.findByText('Suhbat serverga saqlandi');
  expect(await jarvisOutboxRead(scope)).toBeNull();
}, 15000);
