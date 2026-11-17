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
import { onRequestPost, taklifKeshTozala } from './ombor-buyruq';
import { toshkentBugun } from '../../src/lib/ombor-moslash/davr';

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
let chaqiruvlar: Chaqiruv[]; let qoldiqJavob: unknown[]; let yozishJavob: Record<string, unknown>; let harakatQator: unknown[]; let restChaqiruvlar: string[]; let v2Yoq = false; let narxKeyin: unknown[] = [];
beforeEach(() => {
  chaqiruvlar = []; v2Yoq = false; narxKeyin = []; harakatQator = []; restChaqiruvlar = []; qoldiqJavob = []; yozishJavob = { ok: true, takror: false, harakat_id: 55 };
  ai.aiHisobli.mockReset();
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url); const nom = /\/rpc\/([a-z0-9_]+)/.exec(u)?.[1];
    if (nom) {
      const body = JSON.parse(String(init?.body ?? '{}')); chaqiruvlar.push({ nom, body });
      if (nom === 't2_ombor_qoldiq_v2') return Response.json({ ok: true, jami: qoldiqJavob.length, qatorlar: qoldiqJavob });
      if (nom === 't2_audit_yoz') return Response.json(null);
      if (nom === 't2_ombor_prixod_v2' && v2Yoq) return Response.json({ code: 'PGRST202' }, { status: 404 });
      if (nom === 't2_ombor_harakat_royxat_v1') return Response.json({ ok: true, qatorlar: [{ id: 5, nomi: 'Тест', obyomi: 3 }] });
      return Response.json(yozishJavob);
    }
    restChaqiruvlar.push(u);
    return Response.json(u.includes('/rest/v1/t2_sklad_harakat') ? harakatQator : u.includes('t2_ombor_narx_keyin') ? narxKeyin : []);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vakolatKeshTozala(); taklifKeshTozala(1, 9); });
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
  // byudjet tugasa: bepul tahlil natijasi saqlanadi (raqam so'zi «o'n besh» ham deterministik o'qiladi), sabab ai_xabar da; hech narsa yozilmaydi
  const r = await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: 'o\'n besh tonna sement keldi' });
  expect(await r.json()).toMatchObject({ holat: 'tasdiq_kerak', ai_xabar: 'limit tugadi', preview: { miqdor: 15 } });
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
// ───────────── ideal sikl: takliflar, hisobot, ostatka sanada, Jarvis vositalari ─────────────
const H = (id: number, sana: string, operatsiya: 'prixod' | 'rasxod', nomi: string, birligi: string, obyomi: number, o: Record<string, unknown> = {}) =>
  ({ id, sana, operatsiya, nomi, birligi, obyomi, postavshik: null, qabul_qiluvchi: null, narx: null, manba: operatsiya === 'prixod' ? 'ombor_prixod_v1' : 'ombor_chiqim_v1', c11_hedef_obyekt_id: null, c11_storno_of_id: null, c11_juft_id: null, izoh: null, ...o });
const tarixQatorlar = () => [
  H(1, '2026-10-05', 'prixod', 'Цемент ПЦ-400', 'кг', 1000, { postavshik: 'Альфа-снаб', narx: 1000 }),
  H(2, '2026-10-20', 'prixod', 'Цемент ПЦ-400', 'кг', 2000, { postavshik: 'Альфа-снаб', narx: 1200 }),
  H(3, '2026-10-25', 'rasxod', 'Цемент ПЦ-400', 'кг', 300, { qabul_qiluvchi: 'Бригада Орол' }),
  H(4, '2026-11-02', 'prixod', 'Арматура 12', 'тн', 2, { postavshik: 'Бета' }),
  // tuzatilgan yozuv: asl (5) + storno (6) + yangi (7) — hisobotda faqat 7
  H(5, '2026-11-03', 'prixod', 'Труба ПЭ 25', 'м', 90, { postavshik: 'Бета' }),
  H(6, '2026-11-03', 'rasxod', 'Труба ПЭ 25', 'м', 90, { manba: 'ombor_tuzat_storno_v1', c11_juft_id: 5 }),
  H(7, '2026-11-03', 'prixod', 'Труба ПЭ 25', 'м', 100, { postavshik: 'Бета' }),
];

it('taklif: material + birlik + odatiy miqdor + narx (QQS siz/bilan) + eng ko\'p yetkazuvchi; yetkazuvchilar ro\'yxati; faqat o\'qish ruxsati yetarli', async () => {
  harakatQator = tarixQatorlar();
  const r = await post({ amal: 'taklif', kompaniya_id: 1, sklad_id: 9, q: 'sem', tur: 'prixod' }, OQUVCHI);
  expect(r.status).toBe(200);
  const j = await r.json() as { takliflar: Record<string, unknown>[]; kontragentlar: { nomi: string; materiallar: { nomi: string }[] }[]; qqs_foiz: number };
  expect(j.takliflar[0]).toMatchObject({ nomi: 'Цемент ПЦ-400', birligi: 'кг', miqdor_median: 1500, miqdor_oxirgi: 2000, narx_oxirgi: 1200, narx_oxirgi_qqs: 1344, kontragent: 'Альфа-снаб' });
  expect(j.qqs_foiz).toBe(12);
  const yet = await (await post({ amal: 'taklif', kompaniya_id: 1, sklad_id: 9, q: 'alfa' })).json() as typeof j;
  expect(yet.kontragentlar[0]).toMatchObject({ nomi: 'Альфа-снаб' }); expect(yet.kontragentlar[0].materiallar[0].nomi).toBe('Цемент ПЦ-400');
  const rest = restChaqiruvlar.find((u) => u.includes('t2_sklad_harakat'))!;
  expect(rest).toContain('kompaniya_id=eq.1'); expect(rest).toContain('c11_sklad_id=eq.9'); expect(rest).toContain('operatsiya=eq.prixod');
  expect((await post({ amal: 'taklif', kompaniya_id: 2, sklad_id: 9, q: '' })).status).toBe(403);
  expect(yozuvlar().length).toBe(0);
});
it('hisobot: davr bo\'yicha jadval va jami; storno va tuzatilgan asl yozuv chiqariladi', async () => {
  harakatQator = tarixQatorlar();
  const r = await post({ amal: 'hisobot', kompaniya_id: 1, sklad_id: 9, filtr: { dan: '2026-10-01', gacha: '2026-11-30' } }, OQUVCHI);
  const j = await r.json() as { ok: boolean; jami: { kirim_soni: number; chiqim_soni: number; kirim_summa: number; kirim_summa_qqs: number; narxsiz_soni: number }; chetlatilgan: number; qatorlar: { id: number }[] };
  expect(j.qatorlar.map((q) => q.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 7]);
  expect(j.chetlatilgan).toBe(2);
  expect(j.jami).toMatchObject({ kirim_soni: 4, chiqim_soni: 1, kirim_summa: 3_400_000, kirim_summa_qqs: 3_808_000, narxsiz_soni: 2 }); // 1000*1000 + 2000*1200
  const rest = restChaqiruvlar.filter((u) => u.includes('t2_sklad_harakat'));
  expect(rest[0]).toContain('sana=gte.2026-10-01'); expect(rest[0]).toContain('sana=lte.2026-11-30'); expect(rest[0]).toContain('c11_sklad_id=eq.9');
  expect(rest.some((u) => u.includes('ombor_tuzat_storno_v1') && !u.includes('sana='))).toBe(true); // storno yozuvlari davrdan tashqarida ham o'qiladi
  const f = await (await post({ amal: 'hisobot', kompaniya_id: 1, sklad_id: 9, filtr: { davr: 'hammasi', yetkazuvchi: 'бета', operatsiya: 'kirim' } })).json() as { qatorlar: { id: number }[] };
  expect(f.qatorlar.map((q) => q.id).sort((a, b) => a - b)).toEqual([4, 7]);
  expect((await post({ amal: 'hisobot', kompaniya_id: 1, sklad_id: 9, filtr: { dan: 'noto\'g\'ri' } })).status).toBe(400);
  expect((await post({ amal: 'hisobot', kompaniya_id: 2, sklad_id: 9, filtr: {} })).status).toBe(403);
});
it('qoldiq sana bilan: o\'sha sana oxirigacha hisoblanadi (RPC ostatkasi emas); kelajak sana rad', async () => {
  harakatQator = tarixQatorlar();
  const j = await (await post({ amal: 'qoldiq', kompaniya_id: 1, sklad_id: 9, sana: '2026-10-31' }, OQUVCHI)).json() as { ok: boolean; sana: string; qatorlar: { nomi: string; qoldiq: number; kirim: number; chiqim: number }[] };
  expect(j.sana).toBe('2026-10-31'); expect(j.qatorlar).toHaveLength(1);
  expect(j.qatorlar[0]).toMatchObject({ nomi: 'Цемент ПЦ-400', kirim: 3000, chiqim: 300, qoldiq: 2700 });
  const keyin = await (await post({ amal: 'qoldiq', kompaniya_id: 1, sklad_id: 9, sana: toshkentBugun() })).json() as typeof j;
  expect(keyin.qatorlar.find((x) => x.nomi.startsWith('Труба'))!.qoldiq).toBe(100); // asl 90 + storno -90 + yangi 100
  expect(chaqiruvlar.some((c) => c.nom === 't2_ombor_qoldiq_v2')).toBe(false);
  expect((await post({ amal: 'qoldiq', kompaniya_id: 1, sklad_id: 9, sana: '2999-01-01' })).status).toBe(400);
});
it('tahlil: gap savollari LLM siz — hisobot va «bugungi qoldiq»', async () => {
  harakatQator = tarixQatorlar();
  const j = await (await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: 'sentabrda sement qancha keldi' })).json() as { holat: string; llm: boolean; hisobot: { jami: unknown; davr: { dan: string } } };
  expect(j.holat).toBe('hisobot'); expect(j.llm).toBe(false); expect(ai.aiHisobli).not.toHaveBeenCalled();
  qoldiqJavob = [guruh('Тест A', 'шт', 4, 1)];
  const q = await (await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: 'bugungi qoldiq' })).json() as { holat: string; nomzodlar: { nomi: string }[] };
  expect(q.holat).toBe('javob'); expect(q.nomzodlar[0].nomi).toBe('Тест A'); expect(ai.aiHisobli).not.toHaveBeenCalled();
  expect(yozuvlar().length).toBe(0);
});
it('vosita: ombor_kirim faqat QORALAMA (token) beradi, yozmaydi; yozish faqat ombor_tasdiq + tasdiqlayman:true bilan', async () => {
  qoldiqJavob = [guruh('Тест миx', 'кг', 120, 0.97)];
  const d = await (await post({ amal: 'vosita', nom: 'ombor_kirim', kompaniya_id: 1, sklad_id: 9, args: { nomi: 'mix', miqdor: 50, birlik: 'кг', narx: 1500, narx_rejim: 'siz', yetkazuvchi: 'Альфа-снаб' } })).json() as { holat: string; token: string; preview: Record<string, unknown> };
  expect(d.holat).toBe('tasdiq_kerak'); expect(d.preview).toMatchObject({ tur: 'prixod', miqdor: 50, narx: 1500, kontragent: 'Альфа-снаб' });
  expect(yozuvlar().length).toBe(0);
  // tasdiqlayman:true siz — rad, hech narsa yozilmaydi
  expect((await post({ amal: 'vosita', nom: 'ombor_tasdiq', kompaniya_id: 1, sklad_id: 9, args: { token: d.token } })).status).toBe(400);
  expect(yozuvlar().length).toBe(0);
  const ok = await post({ amal: 'vosita', nom: 'ombor_tasdiq', kompaniya_id: 1, sklad_id: 9, args: { token: d.token, tasdiqlayman: true } });
  expect(ok.status).toBe(200);
  const y = yozuvlar(); expect(y).toHaveLength(1); expect(y[0].nom).toBe('t2_ombor_prixod_v2');
  expect(y[0].body).toMatchObject({ p_actor_id: 7, p_nomi: 'Тест миx', p_miqdor: '50', p_narx: 1500, p_postavshik: 'Альфа-снаб' });
});
it('vosita: faqat o\'qish ruxsatli foydalanuvchi qoralama oladi, lekin tasdiq (yozish) 403; begona kompaniya 403; noma\'lum vosita 400', async () => {
  qoldiqJavob = [guruh('Тест миx', 'кг', 120, 0.97)];
  const d = await (await post({ amal: 'vosita', nom: 'ombor_kirim', kompaniya_id: 1, sklad_id: 9, args: { nomi: 'mix', miqdor: 5 } }, OQUVCHI)).json() as { token: string };
  expect(d.token).toBeTruthy();
  expect((await post({ amal: 'vosita', nom: 'ombor_tasdiq', kompaniya_id: 1, sklad_id: 9, args: { token: d.token, tasdiqlayman: true } }, OQUVCHI)).status).toBe(403);
  expect((await post({ amal: 'vosita', nom: 'ombor_hisobot', kompaniya_id: 2, sklad_id: 9, args: {} })).status).toBe(403);
  expect((await post({ amal: 'vosita', nom: 'yoq', kompaniya_id: 1, sklad_id: 9, args: {} })).status).toBe(400);
  expect(yozuvlar().length).toBe(0);
});
it('vosita: hisobot, qoldiq(sana), taklif va eksport tavsifi (fayl bermaydi, token yechmaydi)', async () => {
  harakatQator = tarixQatorlar();
  const h = await (await post({ amal: 'vosita', nom: 'ombor_hisobot', kompaniya_id: 1, sklad_id: 9, args: { davr: 'hammasi', q: 'sement' } }, OQUVCHI)).json() as { jami: { kirim_soni: number } };
  expect(h.jami.kirim_soni).toBe(2);
  const q = await (await post({ amal: 'vosita', nom: 'ombor_qoldiq', kompaniya_id: 1, sklad_id: 9, args: { sana: '2026-10-31' } }, OQUVCHI)).json() as { qatorlar: unknown[] };
  expect(q.qatorlar).toHaveLength(1);
  const t = await (await post({ amal: 'vosita', nom: 'ombor_kirim_taklif', kompaniya_id: 1, sklad_id: 9, args: { q: 'цем' } }, OQUVCHI)).json() as { takliflar: { nomi: string }[] };
  expect(t.takliflar[0].nomi).toBe('Цемент ПЦ-400');
  const e = await post({ amal: 'vosita', nom: 'ombor_eksport', kompaniya_id: 1, sklad_id: 9, args: { tur: 'hisobot', davr: 'hammasi' } }, OQUVCHI);
  expect(e.headers.get('Content-Type')).toContain('json');
  expect(await e.json()).toMatchObject({ holat: 'eksport_tayyor', tur: 'hisobot', yuklash: { amal: 'eksport', tur: 'hisobot' } });
  expect(chaqiruvlar.some((c) => c.nom === 't2_token_sarfla_v1')).toBe(false);
});
it('eksport hisobot: .xlsx fayl, token serverSarfla orqali (turi ombor_hisobot)', async () => {
  harakatQator = tarixQatorlar();
  const r = await post({ amal: 'eksport', tur: 'hisobot', kompaniya_id: 1, sklad_id: 9, filtr: { davr: 'hammasi' } }, OQUVCHI);
  expect(r.status).toBe(200); expect(r.headers.get('Content-Type')).toContain('spreadsheetml');
  expect(r.headers.get('Content-Disposition')).toContain('kirim-chiqim-');
  const bayt = new Uint8Array(await r.arrayBuffer()); expect(bayt[0]).toBe(0x50);
  expect(chaqiruvlar.some((c) => c.nom === 't2_token_sarfla_v1' && c.body.p_actor_id === 7)).toBe(true);
});
it('yoz: narx bilan t2_ombor_prixod_v2; migratsiya qo\'llanmagan bo\'lsa (404) narxsiz v1 ga tushadi va narx_saqlanmadi bayrog\'i', async () => {
  const op = crypto.randomUUID();
  const j = await (await post({ amal: 'yoz', kompaniya_id: 1, sklad_id: 9, operatsiya: 'prixod', nomi: 'Тест', birligi: 'шт', miqdor: '3', narx: '1 500,5', kontragent: 'Бета', operation_id: op })).json() as Record<string, unknown>;
  expect(j.ok).toBe(true); expect(yozuvlar()[0]).toMatchObject({ nom: 't2_ombor_prixod_v2', body: { p_narx: 1500.5, p_postavshik: 'Бета' } });
  chaqiruvlar = []; v2Yoq = true;
  const j2 = await (await post({ amal: 'yoz', kompaniya_id: 1, sklad_id: 9, operatsiya: 'prixod', nomi: 'Тест', birligi: 'шт', miqdor: '3', narx: 100, operation_id: op })).json() as Record<string, unknown>;
  expect(j2).toMatchObject({ ok: true, narx_saqlanmadi: true });
  expect(yozuvlar().map((c) => c.nom)).toEqual(['t2_ombor_prixod_v2', 't2_ombor_prixod_v1']);
  chaqiruvlar = [];
  expect((await post({ amal: 'yoz', kompaniya_id: 1, sklad_id: 9, operatsiya: 'prixod', nomi: 'Тест', birligi: 'шт', miqdor: '3', narx: -1, operation_id: op })).status).toBe(400);
  expect(yozuvlar()).toHaveLength(0);
  // narxsiz yozuv eski yo'l (v1)
  await post({ amal: 'yoz', kompaniya_id: 1, sklad_id: 9, operatsiya: 'prixod', nomi: 'Тест', birligi: 'шт', miqdor: '3', operation_id: crypto.randomUUID() });
  expect(yozuvlar().map((c) => c.nom)).toEqual(['t2_ombor_prixod_v1']);
});
it('narx ixtiyoriy: yozilmagan kirimda bir marta yumshoq so\'raladi (narx_sorov), saqlashni to\'smaydi; narx berilsa so\'ralmaydi; chiqimda so\'ralmaydi', async () => {
  qoldiqJavob = [guruh('Тест миx', 'кг', 120, 0.97)];
  const a = await (await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: '50 kg mix keldi' })).json() as { holat: string; token: string; preview: { narx_sorov: boolean; ogohlantirish: string[] } };
  expect(a.holat).toBe('tasdiq_kerak'); expect(a.preview.narx_sorov).toBe(true); expect(a.preview.ogohlantirish.join(' ')).toContain('Narxi ma’lummi');
  expect((await post({ amal: 'tasdiq', kompaniya_id: 1, sklad_id: 9, token: a.token })).status).toBe(200); // narxsiz saqlanadi
  expect(yozuvlar()[0].nom).toBe('t2_ombor_prixod_v1');
  const b = await (await post({ amal: 'vosita', nom: 'ombor_kirim', kompaniya_id: 1, sklad_id: 9, args: { nomi: 'mix', miqdor: 5, narx: 100, narx_rejim: 'siz' } })).json() as { preview: { narx_sorov: boolean } };
  expect(b.preview.narx_sorov).toBe(false);
  const c = await (await post({ amal: 'vosita', nom: 'ombor_chiqim', kompaniya_id: 1, sklad_id: 9, args: { nomi: 'mix', miqdor: 5 } })).json() as { preview: { narx_sorov: boolean } };
  expect(c.preview.narx_sorov).toBe(false);
  const d = await (await post({ amal: 'vosita', nom: 'ombor_kirim', kompaniya_id: 1, sklad_id: 9, args: { nomi: 'mix', miqdor: 5 } })).json() as { preview: { narx_sorov: boolean } };
  expect(d.preview.narx_sorov).toBe(true); // Jarvis ham xuddi shunday so'raydi
});
it('narx_qoy: narxsiz kirimga keyin narx (RPC), faqat yozish ruxsati bilan; keyin qo\'yilgan narx hisobotda hisobga olinadi', async () => {
  expect((await post({ amal: 'narx_qoy', kompaniya_id: 1, sklad_id: 9, harakat_id: 4, narx: '1 500,5' }, OQUVCHI)).status).toBe(403);
  expect((await post({ amal: 'narx_qoy', kompaniya_id: 1, sklad_id: 9, harakat_id: 4, narx: -1 })).status).toBe(400);
  expect((await post({ amal: 'narx_qoy', kompaniya_id: 1, sklad_id: 9, harakat_id: 4, narx: '1 500,5' })).status).toBe(200);
  expect(chaqiruvlar.find((x) => x.nom === 't2_ombor_narx_qoy_v1')!.body).toMatchObject({ p_actor_id: 7, p_harakat_id: 4, p_narx: 1500.5 });
  harakatQator = tarixQatorlar(); narxKeyin = [{ harakat_id: 4, narx: 1000000 }];
  const j = await (await post({ amal: 'hisobot', kompaniya_id: 1, sklad_id: 9, filtr: { davr: 'hammasi' } })).json() as { jami: { narxsiz_soni: number; kirim_summa: number } };
  expect(j.jami.narxsiz_soni).toBe(1); // faqat труба; арматура narxi keyin qo'yilgan: 2 * 1_000_000
  expect(j.jami.kirim_summa).toBe(5_400_000);
});
it('narx QQS bilan/siz: sukut «bilan» (bir marta so\'raladi), kanonik QQS siz = bilan/1,12; aniq rejim so\'ralmaydi; yozishda ikkalasi ham to\'g\'ri', async () => {
  qoldiqJavob = [guruh('Тест миx', 'кг', 120, 0.97)];
  type P = { preview: { narx: number; narx_bilan: number; narx_kiritilgan: number; narx_rejim: string; narx_rejim_sorov: boolean; ogohlantirish: string[] } };
  const a = await (await post({ amal: 'vosita', nom: 'ombor_kirim', kompaniya_id: 1, sklad_id: 9, args: { nomi: 'mix', miqdor: 5, narx: 1120 } })).json() as P;
  expect(a.preview).toMatchObject({ narx: 1000, narx_bilan: 1120, narx_kiritilgan: 1120, narx_rejim: 'bilan', narx_rejim_sorov: true });
  expect(a.preview.ogohlantirish.join(' ')).toContain('QQS bilan deb olindi');
  const b = await (await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: '50 kg mix keldi narxi 50 ming QQS bilan' })).json() as P;
  expect(b.preview).toMatchObject({ narx: 44642.86, narx_rejim: 'bilan', narx_rejim_sorov: false });
  const c = await (await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: '50 kg mix keldi ndssiz 45 ming' })).json() as P;
  expect(c.preview).toMatchObject({ narx: 45000, narx_rejim: 'siz', narx_rejim_sorov: false });
  const d = await (await post({ amal: 'tahlil', kompaniya_id: 1, sklad_id: 9, matn: '50 kg mix keldi narxi 1000', narx_rejim: 'siz' })).json() as P; // mijoz eslab qolgan tanlov
  expect(d.preview).toMatchObject({ narx: 1000, narx_rejim: 'siz', narx_rejim_sorov: false });
  const op = crypto.randomUUID();
  await post({ amal: 'yoz', kompaniya_id: 1, sklad_id: 9, operatsiya: 'prixod', nomi: 'Тест', birligi: 'шт', miqdor: '3', narx: '1 120', narx_rejim: 'bilan', operation_id: op });
  expect(yozuvlar().at(-1)!.body.p_narx).toBe(1000);
});