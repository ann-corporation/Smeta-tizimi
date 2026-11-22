import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { webcrypto } from 'node:crypto';
import type { KasbIshchi } from '../../api/t2-agent-ish';
import type { YordamchiUlanish } from './yordamchi/ishlov';
const state = vi.hoisted(() => ({ disk: new Map<string, unknown>(), create: vi.fn(), append: vi.fn() }));
vi.mock('idb-keyval', () => ({ createStore: () => ({}), get: async (key: string) => state.disk.get(key),
  update: async (key: string, change: (current: unknown) => unknown) => { state.disk.set(key, change(state.disk.get(key))); } }));
vi.mock('../../api/t2-agent-ish', () => ({ niyatLlmOl: vi.fn(), suhbatRoyxatOl: async () => [],
  suhbatServerdanOl: async () => null, suhbatServerga: vi.fn(), tizimYordamSavol: vi.fn(),
  kasbSavolOqim: async (_company: number, question: string) => ({ ok: true, javob: 'Answer ' + question }) }));
vi.mock('../../api/jarvis-suhbat-sync', () => ({ syncJarvisConversation: async () => null,
  mutateJarvisConversation: state.create, appendJarvisMessages: state.append, jarvisConversationPage: async () => null }));
vi.mock('./AiBaho', () => ({ AiBaho: () => null }));
vi.mock('./AiHarakatKarta', () => ({ AiHarakatKarta: () => null }));
vi.mock('../../lib/yordamchi/niyat', () => ({ niyatAniqla: () => ({ tur: 'nomalum', yaqin: [] }) }));
vi.mock('../../lib/yordamchi/niyat-llm', () => ({ niyatLlmGaMosmi: () => false }));
import { AiChat } from './AiChat';
import { jarvisOutboxRead } from '../../lib/jarvis/conversation-outbox';
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
