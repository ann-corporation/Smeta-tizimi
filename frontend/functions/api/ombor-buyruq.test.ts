// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Sess } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';

const ai = vi.hoisted(() => ({ aiHisobli: vi.fn() }));
vi.mock('../_shared/ai-hisobli', () => ({
  aiHisobli: ai.aiHisobli,
  AiByudjetXatosi: class extends Error { constructor(readonly kod: string, readonly xabar: string) { super(kod); } },
}));
import { AiByudjetXatosi } from '../_shared/ai-hisobli';
import { onRequestPost } from './ombor-buyruq';

// Faqat sintetik ma'lumot.
const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic-service', SESSIYA_KALIT: 'k'.repeat(32) };
const mk = (perms: string[], denials: string[] = []): Sess => ({ rol: 'omborchi', exp: Date.now() + 600000, jti: 'synthetic', foydalanuvchi_id: 7,
  kompaniyalar: [{ kompaniya_id: 1, rol: 'omborchi' }], permissionsByCompany: { 1: perms }, explicitDenialsByCompany: { 1: denials } } as unknown as Sess);
const OMBORCHI = mk(['warehouse.write', 'warehouse.read']);
const OQUVCHI = mk(['warehouse.read']);
const post = (body: unknown, sess: Sess | null = OMBORCHI) => onRequestPost({
  request: new Request('https://smeta.example/api/ombor-buyruq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  env, data: sess ? { roleAuthority: structuredClone(sess) } : {},
} as never);

const guruh = (nomi: string, birligi: string, qoldiq: number, ball: number) => ({ kalit: 'k:' + nomi, nomi, birligi, tur: null, qoldiq, kirim: qoldiq, chiqim: 0, variantlar_soni: 1, ball, oxirgi_sana: '2026-11-01' });
type Chaqiruv = { nom: string; body: Record<string, unknown> };
let chaqiruvlar: Chaqiruv[]; let qoldiqJavob: unknown[]; let yozishJavob: Record<string, unknown>;
beforeEach(() => {
  chaqiruvlar = []; qoldiqJavob = []; yozishJavob = { ok: true, takror: false, harakat_id: 55 };
  ai.aiHisobli.mockReset();
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url); const nom = /\/rpc\/([a-z0-9_]+)/.exec(u)?.[1];
    if (nom) {
      const body = JSON.parse(String(init?.body ?? '{}')); chaqiruvlar.push({ nom, body });
      if (nom === 't2_ombor_qoldiq_v2') return Response.json({ ok: true, jami: qoldiqJavob.length, qatorlar: qoldiqJavob });
      if (nom === 't2_audit_yoz') return Response.json(null);
      if (nom === 't2_ombor_harakat_royxat_v1') return Response.json({ ok: true, qatorlar: [{ id: 5, nomi: 'Тест', obyomi: 3 }] });
      return Response.json(yozishJavob);
    }
    return Response.json([]);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vakolatKeshTozala(); });
const yozuvlar = () => chaqiruvlar.filter((c) => /^t2_ombor_(prixod|chiqim|tuzat|alias)/.test(c.nom));

it('anonim so\'rov hech qanday chaqiruvsiz 401', async () => {
  expect((await post({ amal: 'qoldiq', kompaniya_id: 1, sklad_id: 9 }, null)).status).toBe(401);
  expect(chaqiruvlar.length).toBe(0);
});
it('begona kompaniya va faqat-o\'qish foydalanuvchi yoza olmaydi', async () => {
  expect((await post({ amal: 'qoldiq', kompaniya_id: 2, sklad_id: 9 })).status).toBe(403);
  expect((await post({ amal: 'yoz', kompaniya_id: 1, sklad_id: 9, operatsiya: 'prixod', nomi: 'x', birligi: 'шт', miqdor: '1', operation_id: crypto.randomUUID() }, OQUVCHI)).status).toBe(403);
  expect((await post({ amal: 'qoldiq', kompaniya_id: 1, sklad_id: 9 }, OQUVCHI)).status).toBe(200);
  expect(yozuvlar().length).toBe(0);
});
it('aktor faqat sessiyadan olinadi (tanadagi actor_id e\'tiborsiz)', async () => {
  await post({ amal: 'qoldiq', kompaniya_id: 1, sklad_id: 9, p_actor_id: 999, actor_id: 999, filtr: { qidir: 'труба' } });
  const c = chaqiruvlar.find((x) => x.nom === 't2_ombor_qoldiq_v2')!;
  expect(c.body.p_actor_id).toBe(7);
  expect(c.body.p_filtr).toEqual({ qidir: 'труба' });
});
it('tahlil: aniq matn LLM siz preview + token beradi va HECH NARSA yozmaydi', async () => {
  qoldiqJavob = [guruh('Тест миx', 'кг', 120, 0.97)];
  const r = await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: '50 kg mix keldi' });
  const j = await r.json() as { holat: string; token: string; preview: Record<string, unknown>; llm: boolean };
  expect(j.holat).toBe('tasdiq_kerak'); expect(j.llm).toBe(false);
  expect(j.preview).toMatchObject({ tur: 'prixod', nomi: 'Тест миx', miqdor: 50, qoldiq_hozir: 120, qoldiq_keyin: 170 });
  expect(ai.aiHisobli).not.toHaveBeenCalled();
  expect(yozuvlar().length).toBe(0);
  expect(chaqiruvlar.some((c) => c.nom === 't2_audit_yoz' && String(c.body.p_amal_turi) === 'ombor_buyruq_tahlil')).toBe(true);
});
it('tasdiq: token bilan yoziladi, operation_id token ichida; boshqa aktor/soxta token rad', async () => {
  qoldiqJavob = [guruh('Тест миx', 'кг', 120, 0.97)];
  const { token } = await (await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: '50 kg mix keldi' })).json() as { token: string };
  const ok = await post({ amal: 'tasdiq', kompaniya_id: 1, sklad_id: 9, token });
  expect(ok.status).toBe(200);
  const y = yozuvlar();
  expect(y.length).toBe(1); expect(y[0].nom).toBe('t2_ombor_prixod_v1');
  expect(y[0].body).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 1, p_sklad_id: 9, p_nomi: 'Тест миx', p_miqdor: '50' });
  const op1 = y[0].body.p_operation_id;
  await post({ amal: 'tasdiq', kompaniya_id: 1, sklad_id: 9, token });
  expect(yozuvlar()[1].body.p_operation_id).toBe(op1); // qayta bosish — bir xil operation_id (RPC takror yaratmaydi)
  const boshqa = mk(['warehouse.write'], []); boshqa.foydalanuvchi_id = 8;
  expect((await post({ amal: 'tasdiq', kompaniya_id: 1, sklad_id: 9, token }, boshqa)).status).toBe(403);
  expect((await post({ amal: 'tasdiq', kompaniya_id: 1, sklad_id: 9, token: token.slice(0, -2) + 'AA' })).status).toBe(403);
  expect((await post({ amal: 'tasdiq', kompaniya_id: 1, sklad_id: 10, token })).status).toBe(403);
  expect(yozuvlar().length).toBe(2);
});
it('chiqim: qoldiq yetmasa token berilmaydi', async () => {
  qoldiqJavob = [guruh('Тест песок', 'м3', 5, 0.98)];
  const j = await (await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: 'песок 9 м3 выдал' })).json() as { holat: string; token?: string };
  expect(j.holat).toBe('qoldiq_yetmaydi'); expect(j.token).toBeUndefined();
});
it('noaniq material: nomzodlar so\'raladi, taxmin bilan yozilmaydi', async () => {
  qoldiqJavob = [guruh('Тест труба ф25', 'м', 10, 0.7), guruh('Тест труба ф32', 'м', 10, 0.68)];
  const j = await (await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: 'труба 20 м приход' })).json() as { holat: string; nomzodlar: unknown[] };
  expect(j.holat).toBe('material_tanlang'); expect(j.nomzodlar.length).toBe(2);
});
it('tuzatish aniq yozuvsiz taklif qilmaydi — yozuv tanlanadi', async () => {
  const j = await (await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, buyruq: { amal: 'tuzat', nomi: 'Тест', miqdor: 5 } })).json() as { holat: string; nomzodlar_yozuv: unknown[] };
  expect(j.holat).toBe('yozuv_tanlang'); expect(j.nomzodlar_yozuv.length).toBe(1);
  expect(yozuvlar().length).toBe(0);
});
it('past ishonchli matn LLM ga (aiHisobli) o\'tadi; byudjet tugasa 402', async () => {
  qoldiqJavob = [guruh('Тест цемент', 'тн', 3, 0.95)];
  ai.aiHisobli.mockResolvedValueOnce({ text: '{"amal":"prixod","nomi":"цемент","miqdor":15,"birlik":"тн"}' });
  const j = await (await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: 'o\'n besh tonna sement keldi' })).json() as { holat: string; llm: boolean };
  expect(ai.aiHisobli).toHaveBeenCalledTimes(1); expect(ai.aiHisobli.mock.calls[0][1]).toBe(7);
  expect(j.llm).toBe(true); expect(j.holat).toBe('tasdiq_kerak');
  ai.aiHisobli.mockRejectedValueOnce(new AiByudjetXatosi('BYUDJET_TUGADI', 'limit tugadi'));
  // byudjet tugasa: bepul tahlil natijasi saqlanadi, sabab ai_xabar da; hech narsa yozilmaydi\n  const r = await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: 'o\'n besh tonna sement keldi' });\n  expect(await r.json()).toMatchObject({ holat: 'toldirish_kerak', ai_xabar: 'limit tugadi' });\n  expect(yozuvlar().length).toBe(0);\n  // hech narsa tushunilmasa — 402\n  ai.aiHisobli.mockRejectedValueOnce(new AiByudjetXatosi('BYUDJET_TUGADI', 'limit tugadi'));\n  const r2 = await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: 'salom qalaysan' });\n  expect(r2.status).toBe(402); expect(await r2.json()).toMatchObject({ code: 'BYUDJET_TUGADI' });
});
it('eksport: .xlsx fayl, token serverSarfla orqali, faqat o\'qish ruxsati yetarli', async () => {
  qoldiqJavob = [guruh('Тест A', 'шт', 4, 1), guruh('Тест B', 'кг', 2, 1)];
  const r = await post({ amal: 'eksport', kompaniya_id: 1, sklad_id: 9, filtr: { tur: 'Тест' } }, OQUVCHI);
  expect(r.status).toBe(200);
  expect(r.headers.get('Content-Type')).toContain('spreadsheetml');
  const bayt = new Uint8Array(await r.arrayBuffer());
  expect(bayt[0]).toBe(0x50); expect(bayt[1]).toBe(0x4b); // zip (xlsx) imzosi
  expect(chaqiruvlar.some((c) => c.nom === 't2_token_sarfla_v1' && c.body.p_actor_id === 7)).toBe(true);
  expect(yozuvlar().length).toBe(0);
});