import { expect, it, vi } from 'vitest';
import { updateIshla } from '../../api/telegram/webhook';
const boundary = vi.hoisted(() => ({ reply: vi.fn(), general: vi.fn(), send: vi.fn() }));
vi.mock('../telegram-jarvis', () => ({ telegramJarvisReply: boundary.reply, telegramJarvisSelect: vi.fn(), telegramJarvisMenu: vi.fn() }));
vi.mock('../telegram-ombor', () => ({ omborBuyruq: boundary.general, omborCallback: vi.fn(), omborSavolCallback: vi.fn(), kartaMatni: vi.fn(), javobYasa: vi.fn() }));
vi.mock('../telegram', async load => ({ ...await load<typeof import('../telegram')>(), xabarYubor: boundary.send,
  tgRpc: async () => ({ ok: true, yangi: true, ulangan: true, foydalanuvchi_id: 7 }) }));
it('routes a bound clarification through Jarvis before trying a default warehouse', async () => {
  boundary.reply.mockResolvedValue({ matn: 'Scoped answer' });
  boundary.send.mockResolvedValue(true);
  expect(await updateIshla({}, { update_id: 1, message: { chat: { id: 11, type: 'private' }, from: { id: 11 }, text: 'kg',
    reply_to_message: { from: { is_bot: true }, text: 'Signed clarification' } } })).toBe('jarvis_reply');
  expect(boundary.reply.mock.calls[0][1]).toBe(7);
  expect(boundary.general).not.toHaveBeenCalled();
  expect(boundary.send).toHaveBeenCalledWith({}, 11, 'Scoped answer', undefined);
});
