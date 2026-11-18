// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Sess } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { onRequestPost } from './f2-buyruq';

// Faqat sintetik ma'lumot: haqiqiy summa, nom, INN yo'q.
const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic-service', SESSIYA_KALIT: 'k'.repeat(32) };
const mk = (perms: string[], denials: string[] = []): Sess => ({ rol: 'pto', exp: Date.now() + 600000, jti: 'synthetic', foydalanuvchi_id: 7,
  kompaniyalar: [{ kompaniya_id: 1, rol: 'pto' }], permissionsByCompany: { 1: perms }, explicitDenialsByCompany: { 1: denials } } as unknown as Sess);
const TOLIQ = mk(['fakt.write', 'fakt.read', 'f2.read', 'f2.prepare', 'smeta.read', 'smeta.write', 'narx.write', 'narx.read']);
const FAQAT_OQISH = mk(['fakt.read', 'f2.read', 'smeta.read']);
const post = (body: unknown, sess: Sess | null = TOLIQ) => onRequestPost({
  request: new Request('https://smeta.example/api/f2-buyruq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kompaniya_id: 1, ...(body as object) }) }),
  env, data: sess ? { roleAuthority: structuredClone(sess) } : {},
} as never);

const paket = (qqs: number, ust: number, siz: number) => ({ qqs_bilan: qqs, ustamali: ust, ustamasiz: siz, qqs: qqs - ust, narxsiz_soni: 0, qator_soni: 3 });
type Chaqiruv = { nom: string; body: Record<string, any> };
let ch: Chaqiruv[]; let restYollar: string[]; let dryJavob: { status: number; body: unknown }; let yozJavob: Record<string, unknown>; let sarfJavob: Record<string, unknown>; let yozHolati: number;
const dryOk = (natija: Record<string, unknown> = { ok: true }) => ({ status: 200, body: { ok: true, dry_run: true,
  oldin: { paket: paket(1120, 1000, 800), qatorlar: [{ qator_id: 11, fakt_hajm: 2 }], akt_qatorlar: [] }, keyin: { paket: paket(1344, 1200, 960), qatorlar: [{ qator_id: 11, fakt_hajm: 7 }], akt_qatorlar: [] },
  natijalar: [{ rpc: 't2_fakt_yoz_v2', natija }] } });
const QATOR = { id: 11, ota_id: null, tur: 'mat', kod: 'K11', nom: 'Qator 11', birlik: 'm3', versiya: 3, versiya_holat: 'faol', qoshimcha: false, zamena: false, replaces_line_id: null };
let qatorQator = [QATOR];

beforeEach(() => {
  ch = []; restYollar = []; dryJavob = dryOk(); yozJavob = { ok: true, akt_id: 99 }; sarfJavob = { ok: true, sarflandi: 1 }; yozHolati = 200; qatorQator = [QATOR];
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url); const nom = /\/rpc\/([a-z0-9_]+)/.exec(u)?.[1];
    if (nom) {
      const body = JSON.parse(String(init?.body ?? '{}')); ch.push({ nom, body });
      if (nom === 't2_jarvis_dry_run_v1') return Response.json(dryJavob.body, { status: dryJavob.status });
      if (nom === 't2_token_sarfla_v1') return Response.json(sarfJavob);
      if (nom === 't2_token_qaytar_v1') return Response.json({ ok: true });
      if (nom === 't2_audit_yoz') return Response.json(null);
      if (nom === '_t2_summa_paket_v1') return Response.json([{ obyekt_id: 5, paket: paket(100, 90, 80) }]);
      if (nom === 't2_nakopitelniy_v2') return Response.json({ ok: true, davr: '2026-11', jami: { smeta: 1 }, davrlar: [] });
      return Response.json(yozJavob, { status: yozHolati });
    }
    restYollar.push(u);
    if (u.includes('/rest/v1/t2_obyekt?')) return Response.json(u.includes('kompaniya_id=eq.1') && u.includes('id=eq.5') ? [{ id: 5, nom: 'Sintetik obyekt' }] : []);
    if (u.includes('/rest/v1/t2_qator?')) return Response.json(qatorQator);
    if (u.includes('/rest/v1/t2_qator_holat?')) return Response.json([{ qator_id: 11, smeta_hajm: 10, fakt_hajm: 2 }]);
    return Response.json([]);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vakolatKeshTozala(); });

const yozuvRpc = () => ch.filter((c) => c.nom === 't2_fakt_yoz_v2');
const FAKT = { amal: 'vosita', nom: 'fakt_yoz', args: { obyekt_id: 5, qatorlar: [{ qator_id: 11, hajm: 5 }] } };
const previewOl = async () => { const r = await post(FAKT); return { r, j: await r.json() as Record<string, any> }; };

it('anonim so\'rov hech qanday chaqiruvsiz 401', async () => {
  expect((await post(FAKT, null)).status).toBe(401);
  expect(ch.length).toBe(0);
});
it('begona kompaniya 403; tanadagi actor_id rad etiladi', async () => {
  const r = await onRequestPost({ request: new Request('https://smeta.example/api/f2-buyruq', { method: 'POST', body: JSON.stringify({ ...FAKT, kompaniya_id: 2 }) }), env, data: { roleAuthority: structuredClone(TOLIQ) } } as never);
  expect(r.status).toBe(403);
  const r2 = await post({ ...FAKT, args: { ...FAKT.args, actor_id: 999 } });
  expect(r2.status).toBe(400); expect((await r2.json() as { code: string }).code).toBe('ARGUMENT_TAQIQLANGAN');
  expect(ch.length).toBe(0);
});

it('RUXSAT RAD YO\'LI: faqat-o\'qish foydalanuvchi yozuvchi vositani preview ham qila olmaydi (dry_run ham chaqirilmaydi)', async () => {
  for (const [nom, args] of [['fakt_yoz', FAKT.args], ['narx_tuzat', { obyekt_id: 5, narxlar: [{ qator_id: 11, narx: 1 }], sabab: 'tuzatish' }], ['zamena_qosh', { obyekt_id: 5, almashtirilayotgan_qator_id: 11, sabab: 'sabab bor', resurslar: [{ nom: 'a', birlik: 'kg', norma: 1 }] }]] as const) {
    const r = await post({ amal: 'vosita', nom, args }, FAQAT_OQISH);
    expect(r.status, nom).toBe(403); expect((await r.json() as { code: string }).code).toBe('PERMISSION_DENIED');
  }
  expect(ch.filter((c) => c.nom === 't2_jarvis_dry_run_v1').length).toBe(0);
  expect(yozuvRpc().length).toBe(0);
  // aniq rad etilgan ruxsat umumiy ruxsatdan ustun
  const r = await post(FAKT, mk(['fakt.write'], ['fakt.write']));
  expect(r.status).toBe(403);
  // narx_tuzat: smeta.write bor, narx.write yo'q — rad
  const r2 = await post({ amal: 'vosita', nom: 'narx_tuzat', args: { obyekt_id: 5, narxlar: [{ qator_id: 11, narx: 1 }], sabab: 'tuzatish' } }, mk(['smeta.write']));
  expect(r2.status).toBe(403);
});
it('o\'qish ruxsati bor foydalanuvchi o\'qiy oladi; begona obyekt 404 (mavjudligi oshkor bo\'lmaydi)', async () => {
  const r = await post({ amal: 'vosita', nom: 'obyekt_holat', args: { obyekt_id: 5 } }, FAQAT_OQISH);
  expect(r.status).toBe(200);
  const j = await r.json() as { smeta: { qqs_bilan: number; ustamali: number; ustamasiz: number }; obyekt: { id: number } };
  expect(j.smeta).toMatchObject({ qqs_bilan: 100, ustamali: 90, ustamasiz: 80 }); expect(j.obyekt.id).toBe(5);
  expect((await post({ amal: 'vosita', nom: 'obyekt_holat', args: { obyekt_id: 6 } })).status).toBe(404);
  // f2_royxat faqat f2.read bilan; fakt_jurnal — fakt.read
  expect((await post({ amal: 'vosita', nom: 'f2_royxat', args: { obyekt_id: 5 } }, mk(['smeta.read']))).status).toBe(403);
});
it('o\'qish vositalari aktorni sessiyadan oladi (nakopitelniy) va faol versiya filtrini qo\'yadi (qator_qidir)', async () => {
  await post({ amal: 'vosita', nom: 'nakopitelniy', args: { obyekt_id: 5, davr: '2026-11' } });
  expect(ch.find((c) => c.nom === 't2_nakopitelniy_v2')!.body).toMatchObject({ p_actor_id: 7, p_obyekt_id: 5, p_davr: '2026-11-01' });
  const r = await post({ amal: 'vosita', nom: 'qator_qidir', args: { obyekt_id: 5, matn: 'beton' } });
  expect(r.status).toBe(200);
  expect(restYollar.some((u) => u.includes('t2_qator?') && u.includes('versiya_holat=eq.faol') && u.includes('obyekt_id=eq.5'))).toBe(true);
});

it('PREVIEW → CONFIRM: preview hech narsa yozmaydi (faqat dry_run RPC), token va oldin→keyin + jami beradi', async () => {
  const { r, j } = await previewOl();
  expect(r.status).toBe(200);
  expect(j.holat).toBe('tasdiq_kerak'); expect(typeof j.token).toBe('string'); expect(j.server_tekshiruv).toBe(true);
  expect(j.preview.qatorlar[0]).toMatchObject({ qator_id: 11, ozgarish: [{ maydon: 'fakt_hajm', oldin: 2, keyin: 7 }] });
  expect(j.preview.jami.keyin).toMatchObject({ qqs_bilan: 1344, ustamali: 1200, ustamasiz: 960 });
  expect(j.preview.jami.farq).toMatchObject({ qqs_bilan: 224, ustamali: 200, ustamasiz: 160 });
  expect(yozuvRpc().length).toBe(0);                                     // HAQIQIY yozuv RPC si chaqirilmadi
  expect(ch.some((c) => c.nom === 't2_token_sarfla_v1')).toBe(false);    // token ham yechilmadi
  const dry = ch.find((c) => c.nom === 't2_jarvis_dry_run_v1')!.body;
  expect(dry).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 1, p_obyekt_id: 5, p_olchov: 'fakt' });
  expect(dry.p_chaqiruvlar[0]).toMatchObject({ rpc: 't2_fakt_yoz_v2', args: { p_actor_id: 7, p_obyekt_id: 5 } });

  const dryOp = dry.p_chaqiruvlar[0].args.p_operation_id;
  const t = await post({ amal: 'tasdiq', token: j.token, tasdiqlayman: true });
  const tj = await t.json() as Record<string, any>;
  expect(t.status).toBe(200); expect(tj).toMatchObject({ ok: true, holat: 'yozildi', yozildi: 1, sarflandi: 1 });
  expect(yozuvRpc()).toHaveLength(1);
  const y = yozuvRpc()[0].body;
  expect(y.p_actor_id).toBe(7);                                          // aktor sessiyadan
  expect(y.p_operation_id).not.toBe(dryOp);                              // dry_run operation_id si haqiqiyidan farq qiladi
  expect(ch.find((c) => c.nom === 't2_token_sarfla_v1')!.body).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 1, p_amal: 'f2_qoralama', p_birlik_soni: 3 });
  // token yechish yozuvdan OLDIN
  expect(ch.findIndex((c) => c.nom === 't2_token_sarfla_v1')).toBeLessThan(ch.findIndex((c) => c.nom === 't2_fakt_yoz_v2'));
});
it('TASDIQSIZ YOZUV YO\'Q: f2_tasdiq tasdiqlayman:true siz, tokensiz, soxta/begona aktor tokeni bilan rad', async () => {
  const { j } = await previewOl();
  expect((await post({ amal: 'tasdiq', token: j.token })).status).toBe(400);
  expect((await post({ amal: 'tasdiq', tasdiqlayman: true })).status).toBe(400);
  expect((await post({ amal: 'tasdiq', token: j.token + 'x', tasdiqlayman: true })).status).toBe(403);
  const boshqa = mk(['fakt.write', 'fakt.read']); (boshqa as { foydalanuvchi_id: number }).foydalanuvchi_id = 8;
  expect((await post({ amal: 'tasdiq', token: j.token, tasdiqlayman: true }, boshqa)).status).toBe(403);
  // token faqat huquqi bor kishida ishlaydi: preview dan keyin rol kamaytirilgan bo'lsa tasdiq rad
  expect((await post({ amal: 'tasdiq', token: j.token, tasdiqlayman: true }, FAQAT_OQISH)).status).toBe(403);
  expect(yozuvRpc().length).toBe(0); expect(ch.some((c) => c.nom === 't2_token_sarfla_v1')).toBe(false);
});
it('preview dan keyin ma\'lumot o\'zgarsa (versiya) tasdiq 409 — yozilmaydi va token yechilmaydi', async () => {
  const { j } = await previewOl();
  qatorQator = [{ ...QATOR, versiya_holat: 'almashtirilgan' }];          // qator faol versiyadan chiqdi → reja qurilmaydi (422)
  const t = await post({ amal: 'tasdiq', token: j.token, tasdiqlayman: true });
  expect([409, 422]).toContain(t.status);
  expect(yozuvRpc().length).toBe(0); expect(ch.some((c) => c.nom === 't2_token_sarfla_v1')).toBe(false);
});
it('reja xeshi mos kelmasa (preview va tasdiq orasida kirish o\'zgardi) — 409 MALUMOT_OZGARGAN, yozuv va token yechish YO\'Q', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date('2026-11-18T18:59:00Z'));
    const { j } = await previewOl();                                       // sana berilmagan: bugun (Toshkent) rejaga kiradi
    vi.setSystemTime(new Date('2026-11-18T19:01:00Z'));                    // Toshkent yarim kechasidan o'tdi (token hali amal qiladi), sana boshqa: reja boshqa
    const t = await post({ amal: 'tasdiq', token: j.token, tasdiqlayman: true });
    expect(t.status).toBe(409); expect((await t.json() as { code: string }).code).toBe('MALUMOT_OZGARGAN');
    expect(yozuvRpc().length).toBe(0); expect(ch.some((c) => c.nom === 't2_token_sarfla_v1')).toBe(false);
  } finally { vi.useRealTimers(); }
});
it('token yetmasa 402 va yozuv YO\'Q', async () => {
  const { j } = await previewOl();
  sarfJavob = { ok: false, code: 'TOKEN_YETMAYDI', kerak: 3, balans: 1 };
  const t = await post({ amal: 'tasdiq', token: j.token, tasdiqlayman: true });
  expect(t.status).toBe(402); expect((await t.json() as { code: string }).code).toBe('TOKEN_YETMAYDI');
  expect(yozuvRpc().length).toBe(0);
});
it('yozuv RPC rad etsa token qaytariladi; server ruxsat bermasa (42501) ham yozilmaydi', async () => {
  const { j } = await previewOl();
  yozJavob = { ok: false, code: 'WRITE_ROLE_REQUIRED', xabar: 'Ruxsat yo\'q' }; yozHolati = 200;
  const t = await post({ amal: 'tasdiq', token: j.token, tasdiqlayman: true });
  const tj = await t.json() as Record<string, any>;
  expect(t.status).toBe(409); expect(tj).toMatchObject({ ok: false, code: 'YOZUV_RAD', yozildi: 0, token_qaytarildi: true });
  expect(ch.some((c) => c.nom === 't2_token_qaytar_v1')).toBe(true);
});
it('qayta bosish (takror): bir xil operation_id — ikkinchi marta token yechilmaydi', async () => {
  const { j } = await previewOl();
  await post({ amal: 'tasdiq', token: j.token, tasdiqlayman: true });
  sarfJavob = { ok: true, takror: true, sarflandi: 0 }; yozJavob = { ok: true, takror: true };
  const t2 = await post({ amal: 'tasdiq', token: j.token, tasdiqlayman: true });
  const tj = await t2.json() as Record<string, any>;
  expect(tj).toMatchObject({ ok: true, bepul_takror: true, sarflandi: 0 });
  const [a, b] = yozuvRpc();
  expect(a.body.p_operation_id).toBe(b.body.p_operation_id);
  const [s1, s2] = ch.filter((c) => c.nom === 't2_token_sarfla_v1');
  expect(s1.body.p_operation_id).toBe(s2.body.p_operation_id);
});
it('server dry_run rad etsa ({ok:false}) — token berilmaydi; dry_run RPC si yo\'q bo\'lsa fail-closed 501', async () => {
  dryJavob = dryOk({ ok: false, code: 'FAKT_RAD', xabar: 'Qator bloklangan' });
  const j = await (await post(FAKT)).json() as Record<string, any>;
  expect(j).toMatchObject({ ok: true, holat: 'rad', xabar: 'Qator bloklangan' }); expect(j.token).toBeUndefined();
  dryJavob = { status: 404, body: { code: 'PGRST202' } };
  const r = await post(FAKT);
  expect(r.status).toBe(501); expect((await r.json() as { code: string }).code).toBe('DRY_RUN_YOQ');
  expect(yozuvRpc().length).toBe(0);
});
it('begona obyekt / yo\'q qator bilan yozuv preview ham yo\'q', async () => {
  expect((await post({ ...FAKT, args: { ...FAKT.args, obyekt_id: 6 } })).status).toBe(404);
  qatorQator = [];
  expect((await post(FAKT)).status).toBe(422);
  expect(ch.filter((c) => c.nom === 't2_jarvis_dry_run_v1').length).toBe(0);
});
