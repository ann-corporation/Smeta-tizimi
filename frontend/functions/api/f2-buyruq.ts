/**
 * /api/f2-buyruq — Jarvis uchun F2 / FAKT vositalarining YAGONA server nuqtasi (web, Android BFF, Telegram, Windows ilova).
 * Naqsh: ombor-buyruq.ts (preview + HMAC tasdiq tokeni). Smeta MCP (mcp/smeta-mcp) ning o'qish va yozish toollari, FAQAT joriy foydalanuvchi huquqi bilan.
 *
 * Amallar (hammasi POST JSON; `kompaniya_id` majburiy, aktor — sessiyadan, tanadagi actor_id e'tiborsiz/rad):
 *   vosita    — {nom, args}: o'qish vositasi → natija; yozuvchi vosita (fakt_yoz, f2_qoralama_tahrir, zamena_qosh, bajarilmadi, narx_tuzat) →
 *               SERVER dry_run (RPC t2_jarvis_dry_run_v1: nomli RPC sub-tranzaksiyada + ROLLBACK) → PREVIEW (qator oldin→keyin, jami QQS bilan /
 *               ustamali / ustamasiz) + tasdiq tokeni. HECH NARSA YOZILMAYDI.
 *   tasdiq    — {token, tasdiqlayman:true}: token aktor+kompaniya+obyektga bog'langan (15 daqiqa), reja xeshi bilan: preview dan keyin ma'lumot
 *               o'zgargan bo'lsa 409. Keyin token yechiladi (t2_token_sarfla_v1), NOMLI RPC lar o'sha operation_id lardan hosil bo'lgan kalitlar bilan
 *               chaqiriladi (qayta bosish takror yozmaydi). Yozuv xato bersa token qaytariladi.
 *
 * Ruxsat: a'zolik + vosita capability (write-command-policy dagi amal ruxsati bilan bir xil) + yopiq modul; yozuvchi RPC lar p_actor_id bilan o'z
 * ruxsatini (t2_require_permission_v2) yana tekshiradi. Servis kaliti FAQAT tarmoq darvozasi; aktor har RPC ga sessiyadan MAJBURAN qo'yiladi.
 * dry_run RPC si bazada bo'lmasa (migratsiya 20270110000000 qo'llanmagan) — yozuvchi vositalar FAIL-CLOSED: 501 DRY_RUN_YOQ.
 */
import { tekshir, type Sess } from '../_shared/auth';
import { cachedAuthority, yopiqModul } from '../_shared/permission-policy';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../_shared/role-authority';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { serverQaytar } from '../_shared/hujjat-sarf';
import { F2_VOSITALAR, YOZISH_NOMLARI, vositaSorov, type Normal, type OqishNomi, type Vosita, type YozishNomi } from '../_shared/f2-vositalar';
import { previewQur, rejaQur, rejaXeshi, tokenTekshir, tokenYarat, uchlik, uuidHosila, type AktMalumot, type AktQatorMalumot, type Chaqiruv, type Kontekst, type QatorMalumot, type Reja } from '../_shared/f2-buyruq-yadro';
import { WRITE_COMMAND_POLICY } from '../_shared/write-command-policy';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };
type Context = Parameters<PagesFunction<Env>>[0];
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (code: string, status: number, extra: Record<string, unknown> = {}) => json({ ok: false, code, ...extra }, status);
const butun = (v: unknown): number | null => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const bugunToshkent = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
/** Token amali: mavjud narx qatori (migratsiyasiz). Birlik — hujjat katakchalari (qator × 3), shuning uchun kichik yozuv ≈ minimal token. */
const SARF_AMALI = 'f2_qoralama';

async function aktor(ctx: Context): Promise<Sess | Response> {
  const cached = cachedAuthority(ctx);
  if (cached) return cached;
  if (!ctx.env.SESSIYA_KALIT) return fail('CONFIG_UNAVAILABLE', 503);
  let signed: Sess | null;
  try { signed = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT); } catch { return fail('AUTHORITY_UNAVAILABLE', 503); }
  if (!signed) return fail('AUTH_REQUIRED', 401);
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return fail('AUTHORITY_UNAVAILABLE', 503);
  const current = await roleAuthority(signed, ctx.env);
  if (!current && sessiyaYaroqsizmi(signed)) return yaroqsizSessiyaJavob();
  return current ?? fail('AUTHORITY_UNAVAILABLE', 503);
}

/** Hamma capability shart (aniq rad etilgani ustun) + a'zolik + yopiq modul. */
function ruxsat(s: Sess, kid: number, kerak: readonly string[]): Response | null {
  if (!s.foydalanuvchi_id || !s.permissionsByCompany) return fail('AUTHORITY_UNAVAILABLE', 503);
  if (!s.kompaniyalar?.some((c) => c.kompaniya_id === kid)) return fail('PERMISSION_DENIED', 403);
  const bor = s.permissionsByCompany[kid] ?? []; const rad = s.explicitDenialsByCompany?.[kid] ?? [];
  for (const p of kerak) {
    if (!bor.includes(p) || rad.includes(p)) return fail('PERMISSION_DENIED', 403, { kerak: p });
    if (yopiqModul(p, [kid], s.modullarOffByCompany)) return fail('MODULE_DISABLED', 403);
  }
  return null;
}

async function rpc<T = Record<string, unknown>>(env: Env, nom: string, yuk: Record<string, unknown>): Promise<{ status: number; data: T | null }> {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(yuk),
  }).catch(() => null);
  if (!r) return { status: 503, data: null };
  return { status: r.status, data: await r.json().catch(() => null) as T | null };
}
async function rest<T>(env: Env, yol: string): Promise<T[] | null> {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/' + yol, { headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY } }).catch(() => null);
  return r && r.ok ? await r.json().catch(() => null) as T[] | null : null;
}
const ilikeQiymat = (s: string) => encodeURIComponent('*' + s.replace(/[*%,()"\\]/g, ' ').trim() + '*');
const idRoyxat = (ids: readonly number[]) => ids.join(',');

/** Obyekt shu kompaniyaniki ekanini tekshiradi (tenant chegarasi). Begona/yo'q obyekt — bir xil 404 (mavjudligi oshkor bo'lmaydi). */
async function obyektOl(env: Env, kid: number, obyektId: number): Promise<{ id: number; nom: string } | null> {
  const q = await rest<{ id: number; nom: string }>(env, `t2_obyekt?id=eq.${obyektId}&kompaniya_id=eq.${kid}&select=id,nom&limit=1`);
  return q?.[0] ?? null;
}
async function paketOl(env: Env, obyektId: number, olchov: string, aktId?: number) {
  const r = await rpc<Array<{ paket: unknown }>>(env, '_t2_summa_paket_v1', { p_obyekt_ids: [obyektId], p_olchov: olchov, p_akt_ids: aktId ? [aktId] : null, p_dan: null, p_gacha: null });
  return r.status < 400 && Array.isArray(r.data) && r.data[0] ? uchlik(r.data[0].paket) : null;
}
const FAOL = 'versiya_holat=eq.faol'; // smeta asosi — faqat faol versiya (AGENTS.md §2c); tarix kerak bo'lsa aniq so'raladi

/* ───────────────────────── O'QISH vositalari ───────────────────────── */
async function oqish(env: Env, s: Sess, kid: number, nom: OqishNomi, a: Normal): Promise<Response> {
  const aid = s.foydalanuvchi_id as number;
  let obyektId = a.obyekt_id as number | undefined; let akt: AktMalumot | null = null;
  if (nom === 'f2') {
    const q = await rest<AktMalumot & { shartnoma_id?: number | null; hujjat_jami?: number | null }>(env, `t2_akt?id=eq.${a.akt_id}&select=id,obyekt_id,tur,holat,lifecycle_status,versiya,raqam,oy,hujjat_jami&limit=1`);
    akt = q?.[0] ?? null; obyektId = akt?.obyekt_id;
  }
  if (!obyektId) return fail('TOPILMADI', 404);
  const ob = await obyektOl(env, kid, obyektId);
  if (!ob) return fail('TOPILMADI', 404);
  const IZOH = 'so\'m; birlik narxi QQS siz; jami: QQS bilan → ustamali (QQS siz) → ustamasiz. null — noma\'lum (0 emas).';

  switch (nom) {
    case 'f2_royxat': {
      const holat = a.holat ? `&holat=eq.${encodeURIComponent(String(a.holat))}` : '';
      const q = await rest(env, `t2_akt?obyekt_id=eq.${obyektId}&tur=eq.${a.tur}${holat}&select=id,raqam,oy,sana,holat,lifecycle_status,hujjat_jami,versiya,shartnoma_id&order=oy.desc.nullslast,id.desc&limit=${a.limit}`);
      return q ? json({ ok: true, obyekt: ob, soni: q.length, aktlar: q, izoh: IZOH }) : fail('SERVER_XATO', 502);
    }
    case 'f2': {
      const qatorlar = await rest<Record<string, unknown>>(env, `t2_akt_qator?akt_id=eq.${akt!.id}&select=id,qator_id,hajm,narx,summa,certified_quantity,certified_unit_price,certified_amount,izoh&order=id&limit=${a.limit}&offset=${a.offset}`);
      if (!qatorlar) return fail('SERVER_XATO', 502);
      const ids = [...new Set(qatorlar.map((x) => Number(x.qator_id)).filter((x) => x > 0))];
      const meta = ids.length ? await rest<{ id: number; kod: string | null; nom: string | null; birlik: string | null; kat: string | null }>(env, `t2_qator?id=in.(${idRoyxat(ids)})&obyekt_id=eq.${obyektId}&select=id,kod,nom,birlik,kat`) : [];
      const mm = new Map((meta ?? []).map((x) => [Number(x.id), x]));
      return json({ ok: true, obyekt: ob, akt, summa: await paketOl(env, obyektId, 'aktlar', akt!.id),
        qatorlar: qatorlar.map((x) => ({ ...x, ...(mm.get(Number(x.qator_id)) ? { kod: mm.get(Number(x.qator_id))!.kod, nom: mm.get(Number(x.qator_id))!.nom, birlik: mm.get(Number(x.qator_id))!.birlik } : {}) })),
        keyingi_offset: qatorlar.length === a.limit ? Number(a.offset) + Number(a.limit) : null, izoh: IZOH });
    }
    case 'fakt_jurnal': {
      const sanaF = (a.sana_dan ? `&sana=gte.${a.sana_dan}` : '') + (a.sana_gacha ? `&sana=lte.${a.sana_gacha}` : '');
      const aktlar = await rest<{ id: number; raqam: string | null; sana: string | null; holat: string }>(env, `t2_akt?obyekt_id=eq.${obyektId}&tur=eq.fakt&holat=neq.bekor${sanaF}&select=id,raqam,sana,holat&order=id.desc&limit=500`);
      if (!aktlar) return fail('SERVER_XATO', 502);
      if (!aktlar.length) return json({ ok: true, obyekt: ob, yozuvlar: [], qator_boyicha: [], izoh: IZOH });
      const am = new Map(aktlar.map((x) => [Number(x.id), x]));
      const qf = a.qator_idlar ? `&qator_id=in.(${idRoyxat(a.qator_idlar as number[])})` : '';
      const yoz = await rest<{ id: number; akt_id: number; qator_id: number; hajm: number | null; summa: number | null; izoh: string | null; yaratildi: string }>(env,
        `t2_akt_qator?akt_id=in.(${idRoyxat(aktlar.map((x) => Number(x.id)))})${qf}&select=id,akt_id,qator_id,hajm,summa,izoh,yaratildi&order=yaratildi.desc,id.desc&limit=${a.limit}`);
      if (!yoz) return fail('SERVER_XATO', 502);
      const sof = new Map<number, { qator_id: number; net_hajm: number; yozuv: number }>();
      for (const y of yoz) { const g = sof.get(Number(y.qator_id)) ?? { qator_id: Number(y.qator_id), net_hajm: 0, yozuv: 0 }; g.net_hajm = Math.round((g.net_hajm + Number(y.hajm ?? 0)) * 1e6) / 1e6; g.yozuv++; sof.set(g.qator_id, g); }
      return json({ ok: true, obyekt: ob, yozuvlar: yoz.map((y) => ({ ...y, akt_raqam: am.get(Number(y.akt_id))?.raqam ?? null, sana: am.get(Number(y.akt_id))?.sana ?? null })), qator_boyicha: [...sof.values()].sort((p, q) => p.qator_id - q.qator_id),
        ...(yoz.length === a.limit ? { yana_bor: true } : {}), izoh: IZOH });
    }
    case 'obyekt_holat': {
      const [smeta, fakt, f2, f2q] = await Promise.all(['smeta', 'fakt', 'f2', 'f2_qoralama'].map((o) => paketOl(env, obyektId!, o)));
      return json({ ok: true, obyekt: ob, smeta, fakt, f2, f2_qoralama: f2q, izoh: IZOH });
    }
    case 'qator_qidir': {
      const f = [FAOL, ...(a.sozlar as string[]).map((x) => `nom=ilike.${ilikeQiymat(x)}`), ...(a.kod ? [`kod=ilike.${ilikeQiymat(String(a.kod))}`] : []), ...(a.tur ? [`tur=eq.${a.tur}`] : [])].join('&');
      const q = await rest<{ id: number }>(env, `t2_qator?obyekt_id=eq.${obyektId}&${f}&select=id,ota_id,tur,kod,nom,birlik,hajm,narx,summa,versiya&order=tartib.nullslast,id&limit=${a.limit}`);
      if (!q) return fail('SERVER_XATO', 502);
      const h = q.length ? await rest<Record<string, unknown>>(env, `t2_qator_holat?obyekt_id=eq.${obyektId}&qator_id=in.(${idRoyxat(q.map((x) => Number(x.id)))})&select=qator_id,smeta_hajm,fakt_hajm,f2_hajm,almashtirilgan_hajm,qoldiq_hajm,smeta_narx`) : [];
      const hm = new Map((h ?? []).map((x) => [Number(x.qator_id), x]));
      return json({ ok: true, obyekt: ob, soni: q.length, qatorlar: q.map((x) => ({ ...x, holat: hm.get(Number(x.id)) ?? null })), izoh: IZOH });
    }
    case 'nakopitelniy': {
      const r = await rpc<Record<string, unknown>>(env, 't2_nakopitelniy_v2', { p_obyekt_id: obyektId, p_actor_id: aid, p_davr: a.davr ? `${a.davr}-01` : null, p_limit: 1, p_faqat_faol: true, p_offset: 0 });
      if (r.status === 403 || (r.data as { code?: string } | null)?.code === '42501') return fail('PERMISSION_DENIED', 403);
      if (!r.data || r.status >= 400 || r.data.ok === false) return fail(String((r.data as { code?: string } | null)?.code ?? 'SERVER_XATO'), r.status >= 500 ? 502 : 400);
      return json({ ok: true, obyekt: ob, davr: r.data.davr ?? a.davr ?? null, jami: r.data.jami ?? null, davrlar: (Array.isArray(r.data.davrlar) ? r.data.davrlar : []).slice(0, 24), izoh: IZOH });
    }
    case 'ostatka': {
      const faol = await rest<{ id: number }>(env, `t2_qator?obyekt_id=eq.${obyektId}&${FAOL}&tur=in.(rs,mat,ob)&select=id&limit=5000`);
      if (!faol) return fail('SERVER_XATO', 502);
      const bor = new Set(faol.map((x) => Number(x.id)));
      const filtr = a.qator_idlar ? `&qator_id=in.(${idRoyxat(a.qator_idlar as number[])})` : '';
      const h = await rest<Record<string, unknown>>(env, `t2_qator_holat?obyekt_id=eq.${obyektId}${filtr}&select=qator_id,kod,nom,birlik,smeta_hajm,f2_hajm,fakt_hajm,almashtirilgan_hajm,qoldiq_hajm,qoldiq_summa,smeta_narx&limit=5000`);
      if (!h) return fail('SERVER_XATO', 502);
      const n = (v: unknown) => (v == null ? null : Number(v));
      const tanla = h.filter((r) => bor.has(Number(r.qator_id))).filter((r) => {
        const sm = n(r.smeta_hajm), q = n(r.qoldiq_hajm);
        if (a.faqat === 'qoldiq') return q != null && Math.abs(q) > 1e-6 && (sm == null || sm === 0 || Math.sign(q) === Math.sign(sm));
        if (a.faqat === 'ortiqcha') return q != null && sm != null && sm !== 0 && Math.sign(q) === -Math.sign(sm) && Math.abs(q) > 1e-6;
        if (a.faqat === 'almashtirilgan') return (n(r.almashtirilgan_hajm) ?? 0) > 1e-6;
        return true;
      });
      return json({ ok: true, obyekt: ob, filtr: a.faqat ?? null, soni: tanla.length, qatorlar: tanla.slice(0, Number(a.limit)), ...(tanla.length > Number(a.limit) ? { yana: tanla.length - Number(a.limit) } : {}),
        izoh: 'qoldiq = smeta − F2 tasdiqlangan − almashtirilgan; ' + IZOH });
    }
  }
}

/* ───────────────────────── YOZUV: kontekst, dry_run, tasdiq ───────────────────────── */
type RejaNatija = { reja: Reja; meta: (id: number) => { kod: string | null; nom: string | null; birlik: string | null }; xesh: string } | Response;

/** Tozalangan kirishdan yangi (joriy) kontekstni REST bilan o'qib, rejani quradi. Preview ham, tasdiq ham AYNAN shu yo'ldan o'tadi. */
async function rejaTayyorla(env: Env, s: Sess, kid: number, nom: YozishNomi, a: Normal): Promise<RejaNatija> {
  const aid = s.foydalanuvchi_id as number;
  let obyektId = butun(a.obyekt_id); let akt: AktMalumot | null = null; let aktQ: AktQatorMalumot[] = [];
  if (nom === 'f2_qoralama_tahrir') {
    akt = (await rest<AktMalumot>(env, `t2_akt?id=eq.${a.akt_id}&select=id,obyekt_id,tur,holat,lifecycle_status,versiya,raqam&limit=1`))?.[0] ?? null;
    obyektId = akt ? Number(akt.obyekt_id) : null;
  }
  if (!obyektId || !(await obyektOl(env, kid, obyektId))) return fail('TOPILMADI', 404);
  if (akt) {
    const q = await rest<AktQatorMalumot>(env, `t2_akt_qator?akt_id=eq.${akt.id}&select=qator_id,hajm,certified_quantity,certified_unit_price,certified_amount,provenance_status,certified_source_hash,raw_snapshot,izoh&order=id&limit=5000`);
    if (!q) return fail('SERVER_XATO', 502);
    aktQ = q.map((x) => ({ ...x, qator_id: Number(x.qator_id) }));
  }
  const ids = new Set<number>();
  const qo = (v: unknown) => { for (const x of Array.isArray(v) ? v : []) { const id = butun(typeof x === 'object' && x ? (x as Normal).qator_id : x); if (id) ids.add(id); } };
  qo(a.qatorlar); qo(a.narxlar); qo(a.ozgartir); qo(a.olib_tashla);
  if (a.almashtirilayotgan_qator_id) ids.add(Number(a.almashtirilayotgan_qator_id));
  let qatorlar = ids.size ? await rest<QatorMalumot>(env, `t2_qator?obyekt_id=eq.${obyektId}&id=in.(${idRoyxat([...ids])})&select=id,ota_id,tur,kod,nom,birlik,versiya,versiya_holat,qoshimcha,zamena,replaces_line_id`) : [];
  if (!qatorlar) return fail('SERVER_XATO', 502);
  const otalar = [...new Set(qatorlar.map((q) => q.ota_id).filter((x): x is number => x != null))].filter((x) => !ids.has(x));
  if (nom === 'zamena_qosh' && otalar.length) qatorlar = [...qatorlar, ...((await rest<QatorMalumot>(env, `t2_qator?obyekt_id=eq.${obyektId}&id=in.(${idRoyxat(otalar)})&select=id,ota_id,tur,kod,nom,birlik,versiya,versiya_holat,qoshimcha,zamena,replaces_line_id`)) ?? [])];
  const qm = new Map(qatorlar.map((q) => [Number(q.id), { ...q, id: Number(q.id), ota_id: q.ota_id == null ? null : Number(q.ota_id), versiya: Number(q.versiya) }]));
  const k: Kontekst = { aid, kid, bugun: bugunToshkent(), qatorlar: qm, akt, aktQatorlar: aktQ };
  const r = rejaQur(nom, { ...a, obyekt_id: obyektId }, k);
  if ('xato' in r) return fail(r.xato, 422, r.tafsilot ? { xabar: r.tafsilot } : {});
  // Har nomli RPC uchun yozish reyestridagi (sb-yoz bilan bir xil) ruxsat: reyestrda yo'q amal — fail-closed.
  for (const ch of r.chaqiruvlar) {
    const p = WRITE_COMMAND_POLICY[ch.amal];
    if (!p) return fail('PERMISSION_DENIED', 403, { kerak: 'command.unregistered' });
    const bor = s.permissionsByCompany?.[kid] ?? [];
    const alt = p.split('|');
    const rd = ruxsat(s, kid, [alt.find((x) => bor.includes(x)) ?? alt[0]]);
    if (rd) return rd;
  }
  return { reja: r, xesh: await rejaXeshi(r), meta: (id) => { const q = qm.get(id); return { kod: q?.kod ?? null, nom: q?.nom ?? null, birlik: q?.birlik ?? null }; } };
}

/** RPC yuki: yuk + sessiyadagi aktor (MAJBURAN) + operation_id (asosdan deterministik). */
async function chaqiruvYuki(ch: Chaqiruv, aid: number, opAsos: string): Promise<Record<string, unknown>> {
  return { ...ch.yuk, ...(ch.aktorBor ? { p_actor_id: aid } : {}), ...(ch.opKalit ? { p_operation_id: await uuidHosila(opAsos, ch.opKalit) } : {}) };
}

async function taklif(env: Env, s: Sess, kid: number, v: Vosita, a: Normal): Promise<Response> {
  const aid = s.foydalanuvchi_id as number;
  const t = await rejaTayyorla(env, s, kid, v.nom as YozishNomi, a);
  if (t instanceof Response) return t;
  const op = crypto.randomUUID();
  const dry = await rpc<Record<string, unknown>>(env, 't2_jarvis_dry_run_v1', {
    p_actor_id: aid, p_kompaniya_id: kid, p_obyekt_id: t.reja.obyekt_id, p_olchov: t.reja.olchov, p_akt_id: t.reja.akt_id, p_qator_idlar: t.reja.qator_idlar,
    p_chaqiruvlar: await Promise.all(t.reja.chaqiruvlar.map(async (ch) => ({ rpc: ch.rpc, args: await chaqiruvYuki(ch, aid, 'dry:' + op) }))),
  });
  const kod = String((dry.data as { code?: string } | null)?.code ?? '');
  if (dry.status === 404 || kod === 'PGRST202' || kod === '42883') return fail('DRY_RUN_YOQ', 501, { xabar: 'Server dry_run hali yoqilmagan (migratsiya kutilmoqda) — yozuv bajarilmaydi' });
  if (dry.status === 403 || kod === '42501') return fail('PERMISSION_DENIED', 403);
  if (!dry.data || dry.status >= 400 || dry.data.ok === false) return fail(kod || 'DRY_RUN_XATO', dry.status >= 500 ? 502 : 422, { xabar: String((dry.data as { message?: string } | null)?.message ?? 'Server tekshiruvi rad etdi') });
  const preview = previewQur(t.reja, dry.data as never, t.meta);
  const rad = preview.natijalar.find((n) => !n.ok);
  const asos = { vosita: v.nom, obyekt_id: t.reja.obyekt_id, tavsif: t.reja.tavsif, ogohlantirish: t.reja.ogohlantirish, birlik_soni: t.reja.birlik_soni };
  if (rad) return json({ ok: true, holat: 'rad', ...asos, preview, xabar: rad.xabar ?? 'Server rad etdi' }, 200);
  const token = await tokenYarat(env.SESSIYA_KALIT, { a: aid, k: kid, o: t.reja.obyekt_id, op, rh: t.xesh, v: v.nom as YozishNomi, args: a });
  await audit(env, kid, t.reja.obyekt_id, 'f2_buyruq_preview', aid, `vosita=${v.nom}; chaqiruv=${t.reja.chaqiruvlar.length}; qator=${preview.qatorlar.length}`);
  return json({ ok: true, holat: 'tasdiq_kerak', ...asos, preview, token, server_tekshiruv: true });
}

async function audit(env: Env, kid: number, obyektId: number, amal: string, aid: number, tafsilot: string) {
  await rpc(env, 't2_audit_yoz', { p_kompaniya_id: kid, p_amal_turi: amal, p_modul: 'jarvis', p_obyekt_id: obyektId, p_tafsilot: tafsilot.slice(0, 500), p_kim: 'actor:' + aid, p_ip: null }).catch(() => null);
}

async function tasdiq(env: Env, s: Sess, kid: number, tokenMatn: string): Promise<Response> {
  const aid = s.foydalanuvchi_id as number;
  const y = await tokenTekshir(env.SESSIYA_KALIT, tokenMatn);
  if (y === 'muddati') return fail('TOKEN_MUDDATI_OTGAN', 410);
  if (!y || y.a !== aid || y.k !== kid || !YOZISH_NOMLARI.includes(y.v)) return fail('TOKEN_YAROQSIZ', 403);
  const v = F2_VOSITALAR.find((x) => x.nom === y.v)!;
  const rad = ruxsat(s, kid, v.ruxsat); // huquq tasdiq paytida ham tekshiriladi (rol preview dan keyin o'zgargan bo'lishi mumkin)
  if (rad) return rad;
  const q = vositaSorov(y.v, y.args);
  if ('xato' in q) return fail('TOKEN_YAROQSIZ', 403);
  const t = await rejaTayyorla(env, s, kid, y.v, q.a);
  if (t instanceof Response) return t;
  if (t.xesh !== y.rh || t.reja.obyekt_id !== y.o) return fail('MALUMOT_OZGARGAN', 409, { xabar: 'Preview dan keyin ma\'lumot o\'zgargan — qayta preview oling' });

  // Token (pul) AVVAL yechiladi; yozuv xato bersa qaytariladi. operation_id aniq shu tokendan — qayta bosish ikkinchi marta yechmaydi.
  const sarfOp = await uuidHosila(y.op, 'sarf');
  const sr = await rpc<Record<string, unknown>>(env, 't2_token_sarfla_v1', { p_actor_id: aid, p_kompaniya_id: kid, p_amal: SARF_AMALI, p_birlik_soni: t.reja.birlik_soni, p_operation_id: sarfOp,
    p_meta: { manba: 'jarvis_f2', vosita: y.v, obyekt: t.reja.obyekt_id, server: 1 } });
  if (!sr.data || sr.status >= 400) return fail('TOKEN_SARF_XATO', 502, { xabar: 'Token yechib bo\'lmadi. Birozdan so\'ng qayta urinib ko\'ring.' });
  if (sr.data.ok !== true) {
    const c = String(sr.data.code ?? 'TOKEN_SARF_XATO');
    return fail(c, c === 'TOKEN_YETMAYDI' ? 402 : 502, c === 'TOKEN_YETMAYDI' ? { kerak: Number(sr.data.kerak), balans: Number(sr.data.balans), xabar: 'Tokenlar yetarli emas — hisobni to\'ldiring' } : { xabar: 'Token yechib bo\'lmadi' });
  }
  const yechildi = Number(sr.data.sarflandi) > 0 && sr.data.takror !== true;

  const natijalar: Array<Record<string, unknown>> = []; let yozildi = 0; let xatoXabar: string | null = null;
  for (const ch of t.reja.chaqiruvlar) {
    const r = await rpc<Record<string, unknown>>(env, ch.rpc, await chaqiruvYuki(ch, aid, y.op));
    const kod = String((r.data as { code?: string } | null)?.code ?? '');
    const ok = !!r.data && r.status < 400 && r.data.ok !== false;
    natijalar.push({ rpc: ch.rpc, ok, ...(ok ? { takror: r.data?.takror === true || undefined, id: r.data?.akt_id ?? r.data?.qator_id ?? r.data?.id ?? undefined } : { kod: kod || String(r.data?.code ?? 'RPC_XATO'), xabar: String(r.data?.xabar ?? r.data?.error ?? 'Server rad etdi') }) });
    if (!ok) { xatoXabar = String(r.data?.xabar ?? r.data?.error ?? (r.status === 403 || kod === '42501' ? 'Bu amalga ruxsat yo\'q' : 'Server rad etdi')); break; }
    yozildi++;
  }
  let qaytarildi = false;
  if (xatoXabar && yozildi === 0 && yechildi) qaytarildi = await serverQaytar(env, { actorId: aid, kompaniyaId: kid, sarfOperationId: sarfOp });
  await audit(env, kid, t.reja.obyekt_id, 'f2_buyruq_tasdiq', aid, `vosita=${y.v}; yozildi=${yozildi}/${t.reja.chaqiruvlar.length}; ok=${!xatoXabar}; operation_id=${y.op}`);
  if (xatoXabar) return json({ ok: false, code: yozildi ? 'QISMAN_YOZILDI' : 'YOZUV_RAD', xabar: xatoXabar, yozildi, jami: t.reja.chaqiruvlar.length, natijalar, token_qaytarildi: qaytarildi }, yozildi ? 207 : 409);
  return json({ ok: true, holat: 'yozildi', vosita: y.v, obyekt_id: t.reja.obyekt_id, yozildi, natijalar, sarflandi: yechildi ? Number(sr.data.sarflandi) : 0, bepul_takror: !yechildi });
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const origin = ctx.request.headers.get('Origin');
  if (ctx.request.headers.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== new URL(ctx.request.url).origin)) return fail('ORIGIN_INVALID', 403);
  const s = await aktor(ctx); if (s instanceof Response) return s;
  let b: Record<string, unknown>;
  try { const j = await ctx.request.json(); if (!j || typeof j !== 'object' || Array.isArray(j)) return fail('BODY_INVALID', 400); b = j as Record<string, unknown>; } catch { return fail('BODY_INVALID', 400); }
  const kid = butun(b.kompaniya_id);
  if (!kid) return fail('COMPANY_REQUIRED', 400);
  let nom: unknown = b.nom; let args: unknown = b.args;
  if (b.amal === 'tasdiq') { nom = 'f2_tasdiq'; args = { token: b.token, tasdiqlayman: b.tasdiqlayman }; }
  else if (b.amal !== 'vosita') return fail('AMAL_NOMALUM', 400);
  const q = vositaSorov(nom, args);
  if ('xato' in q) return fail(q.xato, 400, q.tafsilot ? { xabar: q.tafsilot } : {});
  // tasdiq: huquq token ichidagi vosita bo'yicha tasdiq() da (rolga qarab) — bu yerda faqat a'zolik
  const rad = q.amal === 'tasdiq' ? ruxsat(s, kid, []) : ruxsat(s, kid, q.vosita.ruxsat);
  if (rad) return rad;
  if (q.amal === 'oqish') return oqish(ctx.env, s, kid, q.vosita.nom as OqishNomi, q.a);
  if (q.amal === 'taklif') return taklif(ctx.env, s, kid, q.vosita, q.a);
  return tasdiq(ctx.env, s, kid, String(q.a.token));
};
