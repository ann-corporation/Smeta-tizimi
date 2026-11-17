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
let chaqiruvlar: Chaqiruv[]; let qoldiqJavob: unknown[]; let yozishJavob: Record<string, unknown>; let harakatQator: unknown[]; let restChaqiruvlar: string[];
beforeEach(() => {
  chaqiruvlar = []; harakatQator = []; restChaqiruvlar = []; qoldiqJavob = []; yozishJavob = { ok: true, takror: false, harakat_id: 55 };
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
    restChaqiruvlar.push(u);
    return Response.json(u.includes('/rest/v1/t2_sklad_harakat') ? harakatQator : []);
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
it('noaniq material: variant tanlash bosqichi YO\'Q — chiqimda eng yaqini olinadi, kirimda yozilgan nom o\'zi qabul qilinadi; nomzodlar taklif sifatida', async () => {
  qoldiqJavob = [guruh('Test truba f25', 'm', 10, 0.7), guruh('Test truba f32', 'm', 10, 0.68)];
  const kirim = await (await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: 'truba 20 m prixod' })).json() as { holat: string; preview: Record<string, unknown>; nomzodlar: unknown[]; token: string };
  expect(kirim.holat).toBe('tasdiq_kerak'); expect(kirim.token).toBeTruthy();
  expect(kirim.preview).toMatchObject({ nomi: 'truba', yangi_material: true }); expect(kirim.nomzodlar.length).toBe(2);
  const chiqim = await (await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: 'truba 5 m berdim' })).json() as { holat: string; preview: Record<string, unknown> };
  expect(chiqim.holat).toBe('tasdiq_kerak'); expect(chiqim.preview).toMatchObject({ nomi: 'Test truba f25', yangi_material: false });
  expect(yozuvlar().length).toBe(0);
});
it('eslatma: shu omborning oldingi yozuvlaridan, lotin/kirill va qisman yozuv, eng yaqin/ko\'p birinchi; faqat o\'z kompaniyasi/ombori filtri', async () => {
  harakatQator = [
    { id: 9, nomi: 'Цемент ПЦ-450', birligi: 'кг', sana: '2026-11-10', operatsiya: 'prixod', postavshik: 'Sintetik A', qabul_qiluvchi: null, narx: 1200 },
    { id: 8, nomi: 'Цемент ПЦ-450', birligi: 'кг', sana: '2026-11-01', operatsiya: 'prixod', postavshik: 'Sintetik B', qabul_qiluvchi: null, narx: null },
    { id: 7, nomi: 'Труба ПЭ 25', birligi: 'м', sana: '2026-11-05', operatsiya: 'rasxod', postavshik: null, qabul_qiluvchi: 'Sintetik brigada', narx: null },
  ];
  const r = await post({ amal: 'eslatma', kompaniya_id: 1, sklad_id: 9, q: 'sem' }, OQUVCHI); // faqat o'qish ruxsati yetarli
  expect(r.status).toBe(200);
  const j = await r.json() as { ok: boolean; takliflar: { nomi: string; birligi: string; soni: number; postavshik: string | null; narx: number | null }[] };
  expect(j.takliflar.map((x) => x.nomi)).toEqual(['Цемент ПЦ-450']);
  expect(j.takliflar[0]).toMatchObject({ birligi: 'кг', soni: 2, postavshik: 'Sintetik A', narx: 1200 });
  const bosh = await (await post({ amal: 'eslatma', kompaniya_id: 1, sklad_id: 9, q: '' })).json() as { takliflar: { nomi: string }[] };
  expect(bosh.takliflar.map((x) => x.nomi)).toEqual(['Цемент ПЦ-450', 'Труба ПЭ 25']);
  const rest = restChaqiruvlar.find((u) => u.includes('t2_sklad_harakat'))!;
  expect(rest).toContain('kompaniya_id=eq.1'); expect(rest).toContain('c11_sklad_id=eq.9'); expect(rest).toContain('holat=eq.faol');
  expect(rest).not.toContain('storno');
  expect(yozuvlar().length).toBe(0);
  expect((await post({ amal: 'eslatma', kompaniya_id: 2, sklad_id: 9, q: 'x' })).status).toBe(403);
});
it('ovoz JSON (audio_b64, Android BFF) — multipart bilan bir xil STT yo\'liga tushadi; noto\'g\'ri mime/base64 rad', async () => {
  const yaroq = await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, til: 'uz', mime: 'audio/mp4', audio_b64: btoa('synthetic-audio') });
  // STT provayderi sozlanmagan (sintetik env) — lekin so'rov base64 dan Blob yasab /api/ombor-ovoz gacha yetib boradi, BODY_INVALID/AUDIO_INVALID emas
  const kod = ((await yaroq.json()) as { code?: string }).code;
  expect(kod).not.toBe('AUDIO_INVALID'); expect(kod).not.toBe('BODY_INVALID'); expect(kod).not.toBe('MATN_YOQ');
  expect((await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, mime: 'application/zip', audio_b64: btoa('x') })).status).toBe(400);
  expect((await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, mime: 'audio/mp4', audio_b64: '***' })).status).toBe(400);
  expect(yozuvlar().length).toBe(0);
});it('tuzatish aniq yozuvsiz taklif qilmaydi — yozuv tanlanadi', async () => {
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
  // byudjet tugasa: bepul tahlil natijasi saqlanadi, sabab ai_xabar da; hech narsa yozilmaydi
  const r = await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: 'o\'n besh tonna sement keldi' });
  expect(await r.json()).toMatchObject({ holat: 'toldirish_kerak', ai_xabar: 'limit tugadi' });
  expect(yozuvlar().length).toBe(0);
  // hech narsa tushunilmasa — 402
  ai.aiHisobli.mockRejectedValueOnce(new AiByudjetXatosi('BYUDJET_TUGADI', 'limit tugadi'));
  const r2 = await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: 'salom qalaysan' });
  expect(r2.status).toBe(402); expect(await r2.json()).toMatchObject({ code: 'BYUDJET_TUGADI' });
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