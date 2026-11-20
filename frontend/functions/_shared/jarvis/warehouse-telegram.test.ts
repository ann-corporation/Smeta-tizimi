import { beforeEach, expect, it, vi } from 'vitest';
import { warehouseBotFollowup, warehouseBotReply, warehouseBotSelect } from './warehouse-telegram';
import { tokenYarat } from '../ombor-buyruq-yadro';
const call = vi.hoisted(() => vi.fn());
vi.mock('../telegram-amal', () => ({ botChaqiruv: call }));
const env = { SESSIYA_KALIT: 'synthetic-warehouse-secret-32-chars' };
const stores = Array.from({ length: 45 }, (_, index) => ({ id: index + 1, kompaniya_id: 17, nomi: `Ombor ${index + 1}`, yozish: true }));
const snapshot = { company: 17, question: '10 qop sement kirim qil', warehouseId: null, warehouses: stores, result: null };
beforeEach(() => call.mockReset());
it('paginates all warehouses and rechecks company access after the signed selection', async () => {
  const first = await warehouseBotReply(env, 7, 'uz', snapshot);
  expect(JSON.stringify(first.options)).toContain('j:w:p:40');
  call.mockResolvedValue({ status: 200, body: { ok: true, omborlar: stores } });
  const next = await warehouseBotSelect(env, 7, 'uz', 'j:w:p:40', first.matn);
  expect(JSON.stringify(next.options)).toContain('j:w:45');
  call.mockResolvedValueOnce({ status: 200, body: { ok: true, omborlar: stores } })
    .mockResolvedValueOnce({ status: 200, body: { ok: true, holat: 'tasdiq_kerak', token: 'signed.preview', preview: { tur: 'prixod', nomi: 'sement', miqdor: 10, birligi: 'qop' } } });
  const preview = await warehouseBotSelect(env, 7, 'uz', 'j:w:45', next.matn);
  expect(preview.matn).toContain('#OB:signed.preview');
  expect(call.mock.calls.at(-1)?.[2].json).toEqual({ amal: 'tahlil', kompaniya_id: 17, sklad_id: 45, matn: snapshot.question });
});
it('never lets a different actor or an expired token resume the command', async () => {
  const first = await warehouseBotReply(env, 7, 'uz', snapshot);
  await warehouseBotSelect(env, 8, 'uz', 'j:w:3', first.matn);
  const old = await tokenYarat(env.SESSIYA_KALIT, { a: 7, k: 17, s: 3, op: 'jarvis-warehouse-question', p: { question: snapshot.question } }, -1);
  await warehouseBotFollowup(env, 7, 'uz', '#WQ:' + old, 'kg');
  expect(call).not.toHaveBeenCalled();
});
it('resumes missing facts in the original company and warehouse without confirming', async () => {
  const pending = await warehouseBotReply(env, 7, 'uz', { ...snapshot, warehouseId: 3, result: { ok: true, holat: 'savol', savol: 'Qaysi birlik?' } });
  call.mockResolvedValueOnce({ status: 200, body: { ok: true, omborlar: stores } })
    .mockResolvedValueOnce({ status: 200, body: { ok: true, holat: 'savol', savol: 'Kimdan?' } });
  await warehouseBotFollowup(env, 7, 'uz', pending.matn, 'kg');
  expect(call.mock.calls.at(-1)?.[2].json).toEqual({ amal: 'tahlil', kompaniya_id: 17, sklad_id: 3, matn: snapshot.question + '\nkg' });
  call.mockClear(); await warehouseBotFollowup(env, 7, 'uz', '#OB:signed.preview', 'tasdiqlayman');
  expect(call).not.toHaveBeenCalled();
});
it('requires choosing the price VAT mode before offering confirmation', async () => {
  const card = await warehouseBotReply(env, 7, 'uz', { ...snapshot, warehouseId: 3, result: {
    ok: true, holat: 'tasdiq_kerak', token: 'signed.preview', preview: { tur: 'prixod', narx_rejim_sorov: true },
  } });
  expect(JSON.stringify(card.options)).not.toContain('ob:y');
  expect(JSON.stringify(card.options)).toContain('os:r:s');
});
