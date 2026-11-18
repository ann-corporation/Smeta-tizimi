import { beforeEach, expect, it, vi } from 'vitest';
import { limitTozala } from './telegram-bot';
import { tokenYarat } from './f2-buyruq-yadro';
import { telegramJarvisReply, telegramJarvisSelect, type JarvisBotReply, type JarvisReplyTo } from './telegram-jarvis';

const request = vi.hoisted(() => vi.fn());
vi.mock('./telegram-amal', () => ({ botChaqiruv: request }));
const env = { SESSIYA_KALIT: 'synthetic-secret-for-jarvis-routing', TELEGRAM_SAYT_URL: 'https://studio.test' };
const tag = 'a'.repeat(32);
const list = [{ id: 'chat-1', sarlavha: 'Synthetic plan' }];
const history = [{ r: 'user', m: 'First question' }, { r: 'ai', m: 'First answer' }];
const changed = { id: 'chat-1', holat: 'changed', etag: tag, xabarlar: history };
const success = (body: object) => ({ status: 200, body: { ok: true, ...body } });
const replyTo = (reply: JarvisBotReply): JarvisReplyTo => ({
  from: { is_bot: true }, entities: reply.options?.entities as JarvisReplyTo['entities'],
});
const payloads = () => request.mock.calls.map(([, , payload]) => payload.json);

it('confirms a signed F2 preview only after an explicit callback', async () => {
  const token = await tokenYarat(env.SESSIYA_KALIT, { a: 7, k: 17, o: 3, op: 'synthetic-op', rh: 'hash', v: 'f2_qoralama_tahrir', args: {} });
  request.mockResolvedValueOnce(success({}));
  const result = await telegramJarvisSelect(env, 7, 11, 'uz', 'j:f:y', { text: 'Sinov\n#JF:' + token });
  expect(result.matn).toContain('Yozildi');
  expect(request.mock.calls[0][2]).toEqual({ api: 'f2-buyruq', json: { amal: 'tasdiq', kompaniya_id: 17, token, tasdiqlayman: true } });
});
it('rejects expired or foreign tokens and cancellation without calling the writer', async () => {
  for (const [actor, ttl] of [[8, 60000], [7, -1000]]) {
    const token = await tokenYarat(env.SESSIYA_KALIT, { a: actor, k: 17, o: 3, op: 'synthetic', rh: 'hash', v: 'fakt_yoz', args: {} }, ttl);
    await telegramJarvisSelect(env, 7, 11, 'uz', 'j:f:y', { text: '\n#JF:' + token });
  }
  await telegramJarvisSelect(env, 7, 11, 'uz', 'j:f:n');
  expect(request).not.toHaveBeenCalled();
});

it('shows all preview evidence separately and keeps the signed token out of callback data', async () => {
  request.mockResolvedValueOnce(success({ royxat: list, suhbat: changed }))
    .mockResolvedValueOnce(success({ royxat: list, suhbat: changed }))
    .mockResolvedValueOnce(success({ javob: 'Qator: 1 → 2\n'.repeat(400), f2_preview: { holat: 'tasdiq_kerak', token: 'signed.preview' } }))
    .mockResolvedValueOnce(success({ id: 'chat-1', etag: 'b'.repeat(32) }));
  const opened = await telegramJarvisSelect(env, 7, 11, 'uz', 'j:o:17:chat-1');
  const result = await telegramJarvisReply(env, 7, 11, 'uz', replyTo(opened), '41 F-2 da 53 hajmini 2 qil');
  expect(result?.transcript?.join('')).toBe('Qator: 1 → 2\n'.repeat(400));
  expect(result?.matn).toContain('#JF:signed.preview');
  expect(result?.options?.reply_markup).toEqual({ inline_keyboard: [[
    { text: 'Tasdiqlash', callback_data: 'j:f:y' }, { text: 'Bekor qilish', callback_data: 'j:f:n' },
  ]] });
  expect(payloads().some(payload => payload?.amal === 'tasdiq')).toBe(false);
});

beforeEach(() => { request.mockReset(); limitTozala(); });

it('reads a shared transcript and appends the question and answer using the current version', async () => {
  request.mockResolvedValueOnce(success({ royxat: list, suhbat: changed }))
    .mockResolvedValueOnce(success({ royxat: list, suhbat: changed }))
    .mockResolvedValueOnce(success({ javob: 'Synthetic answer', sahifalar: [
      { yol: '/admin/obyektlar' }, { yol: 'https://external.test' }, { yol: '/admin/../other' },
    ] }))
    .mockResolvedValueOnce(success({ id: 'chat-1', etag: 'b'.repeat(32) }));
  const opened = await telegramJarvisSelect(env, 7, 11, 'en', 'j:o:17:chat-1');
  expect(opened.transcript?.join(' ')).toContain('First answer');
  expect(opened.options?.reply_markup).toEqual({ force_reply: true });
  const answer = await telegramJarvisReply(env, 7, 11, 'en', replyTo(opened), 'Next question');
  expect(answer?.matn).toContain('Synthetic answer');
  expect(answer?.matn).toContain('https://studio.test/admin/obyektlar');
  expect(answer?.matn).not.toContain('external.test');
  expect(answer?.matn).not.toContain('/other');
  expect(answer?.options?.reply_markup).toEqual({ force_reply: true });
  expect(payloads()).toEqual([
    { amal: 'suhbat_sync', kompaniya_id: 17, klient_id: 'chat-1', full_history: true },
    { amal: 'suhbat_sync', kompaniya_id: 17, klient_id: 'chat-1', full_history: true },
    { amal: 'kasb_savol', kompaniya_id: 17, savol: 'Next question', sahifa: '/telegram/jarvis', tarix: [
      { rol: 'user', matn: 'First question' }, { rol: 'assistant', matn: 'First answer' },
    ] },
    { amal: 'suhbat_mutate', kompaniya_id: 17, klient_id: 'chat-1', harakat: 'append', etag: tag, xabarlar: [
      { r: 'user', m: 'Next question' }, { r: 'ai', m: 'Synthetic answer' },
    ] },
  ]);
  expect(request.mock.calls.every(([, actor]) => actor === 7)).toBe(true);
});

it('opens a long archived reply in bounded pages and checks actor scope on every page', async () => {
  const long = { ...changed, arxivlangan: true, xabarlar: [{ r: 'ai', m: '🧱'.repeat(1900) + 'end of reply' }] };
  request.mockResolvedValue(success({ royxat: list, suhbat: long }));
  const first = await telegramJarvisSelect(env, 7, 11, 'en', 'j:o:17:chat-1');
  expect(first.transcript).toHaveLength(1);
  expect(first.transcript?.[0].length).toBeLessThan(4096);
  const markup = first.transcriptOptions?.reply_markup as { inline_keyboard: Array<Array<{ callback_data: string }>> };
  const button = markup.inline_keyboard[0][0];
  expect(button.callback_data.length).toBeLessThanOrEqual(64);
  const second = await telegramJarvisSelect(env, 7, 11, 'en', button.callback_data);
  expect(second.matn).toContain('end of reply');
  expect(request.mock.calls[1][1]).toBe(7);
  expect(payloads()[1]).toMatchObject({ kompaniya_id: 17, klient_id: 'chat-1', full_history: true });
});

it('rejects copied, tampered and expired prompts before checking any chat or spending tokens', async () => {
  request.mockResolvedValueOnce(success({ royxat: list, suhbat: changed }));
  const message = replyTo(await telegramJarvisSelect(env, 7, 11, 'en', 'j:o:17:chat-1'));
  const tampered = { ...message, entities: message.entities?.map(e => ({ ...e, url: e.url?.replace('17:chat', '18:chat') })) };
  expect((await telegramJarvisReply(env, 8, 11, 'en', message, 'Question'))?.matn).toContain('Could not open');
  expect((await telegramJarvisReply(env, 7, 12, 'en', message, 'Question'))?.matn).toContain('Could not open');
  expect((await telegramJarvisReply(env, 7, 11, 'en', tampered, 'Question'))?.matn).toContain('Could not open');
  const later = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 62 * 60_000);
  try { expect((await telegramJarvisReply(env, 7, 11, 'en', message, 'Question'))?.matn).toContain('Could not open'); }
  finally { later.mockRestore(); }
  expect(request).toHaveBeenCalledTimes(1);
});

it('creates a selected new chat and reports a conflict without retrying a blind write', async () => {
  request.mockResolvedValueOnce(success({ royxat: [], suhbat: null }))
    .mockImplementationOnce(async (_, __, p) => success({ royxat: [], suhbat: { id: p.json.klient_id, holat: 'missing' } }))
    .mockResolvedValueOnce(success({ javob: 'Unsaved answer' }))
    .mockResolvedValueOnce({ status: 409, body: { ok: false } });
  const opened = await telegramJarvisSelect(env, 7, 11, 'en', 'j:n:17');
  const answer = await telegramJarvisReply(env, 7, 11, 'en', replyTo(opened), 'New chat title');
  expect(answer?.matn).toContain('The message was not saved');
  expect(answer?.matn).toContain('Unsaved answer');
  expect(payloads()[3]).toMatchObject({
    amal: 'suhbat_mutate', kompaniya_id: 17, klient_id: payloads()[1].klient_id, harakat: 'create', sarlavha: 'New chat title',
  });
  expect(request).toHaveBeenCalledTimes(4);
});
