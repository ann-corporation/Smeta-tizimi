import { beforeEach, expect, it, vi } from 'vitest';
import { updateIshla } from '../../api/telegram/webhook';
const transport = vi.hoisted(() => ({ send: vi.fn(), api: vi.fn(), select: vi.fn(), rpc: vi.fn() }));
vi.mock('../telegram', async load => ({ ...await load<typeof import('../telegram')>(),
  xabarYubor: transport.send, tgApi: transport.api, tgRpc: transport.rpc }));
vi.mock('../telegram-jarvis', () => ({ telegramJarvisSelect: transport.select, telegramJarvisMenu: vi.fn(), telegramJarvisReply: vi.fn() }));
const callback = (data: string) => ({ update_id: 1, callback_query: {
  id: 'synthetic', data, from: { id: 11 }, message: { message_id: 13, text: 'Signed preview', chat: { id: 11, type: 'private' } },
} });
beforeEach(() => {
  vi.clearAllMocks();
  transport.rpc.mockResolvedValue({ ok: true, yangi: true, ulangan: true, foydalanuvchi_id: 7 });
  transport.api.mockResolvedValue({ ok: true });
  transport.send.mockResolvedValue(true);
});
it('withholds confirmation if any preview part could not be delivered', async () => {
  transport.select.mockResolvedValue({ transcript: ['Preview part A', 'Preview part B'], matn: 'Confirmation', options: { reply_markup: { inline_keyboard: [] } } });
  transport.send.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await updateIshla({}, callback('j:o:17:chat'));
  expect(transport.send.mock.calls.map(call => call[2])).toEqual(['Preview part A', 'Preview part B']);
});
it.each(['j:f:y', 'j:f:n'])('removes the original keyboard after decision %s', async data => {
  transport.select.mockResolvedValue({ matn: 'Decision' });
  await updateIshla({}, callback(data));
  expect(transport.api).toHaveBeenCalledWith({}, 'editMessageReplyMarkup', {
    chat_id: 11, message_id: 13, reply_markup: { inline_keyboard: [] },
  });
});
