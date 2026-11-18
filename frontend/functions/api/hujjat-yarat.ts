/**
 * hujjat-yarat.ts — YAGONA HUJJAT YASASH ENDPOINTI (egasi 2026-11-16).
 *
 * Hujjatni (Ф-2, Форма № 3 …) bitta dvigatel yasaydi — sayt ishlatadigan o'sha modullar (`f2Hujjat`, `forma3SotuvdanXlsx`,
 * `RasmiyVaraq`, hisob yadrosi). Ilovalar (Android, Windows, Telegram, kelajakda sayt) faqat SO'RAYDI va tayyor faylni
 * KO'RSATADI/ULASHADI: ularda shablon ham, chizish ham yo'q.
 *
 *   POST /api/hujjat-yarat  { amal: 'royxat', kompaniya_id, obyekt_id }
 *        → { ok, hujjatlar: [{ kalit, tur, sarlavha, holat, summa, parametrlar, formatlar }] }   (serverdan: nima mavjud)
 *   POST /api/hujjat-yarat  { amal: 'yarat', tur: 'f2'|'forma3', format: 'xlsx'|'pdf', kompaniya_id, obyekt_id, ...parametrlar }
 *        → fayl baytlari (Content-Disposition, X-Hujjat-Sarf, X-Hujjat-Bepul-Takror)
 *
 * Ruxsat/qulf — o'zgarmagan `_middleware` (SCOPED_APIS: 'hujjat-yarat' = document.read; obyekt egaligi `obyekt_id` bo'yicha).
 * Token: mavjud server yo'li (`serverSarfla`, deterministik operation_id) — sayt bilan bir xil kalit (F-2: obyekt+oy+raqam;
 * boshqalar: mazmun xeshi); qayta yuklash BEPUL; PDF va XLSX bir hujjat — ikkinchisi takror hisoblanadi.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { serverQaytar, serverSarfla, sarfRad } from '../_shared/hujjat-sarf';
import { ichkiRejimda } from '../_shared/hujjat-ichki';
import { sbT2AktReestrOl, sbT2KompaniyalarOl, sbT2ObyektlarOlKomp } from '../../src/api/supabase';
import { portfelObyektOl, smetaTarixBilan, type AktQatorXom } from '../../src/api/f2-oylik-paket';
import { bekorQatorlari } from '../../src/lib/f2-bekor-qator';
import { paketAktExcel } from '../../src/lib/f2-oylik-paket/portfel';
import { f2HujjatKaliti, hujjatDizayniniYukla } from '../../src/api/f2-hujjat-kontekst';
import { shartnomaSvodOl } from '../../src/api/t2-nakopitelniy';
import { sotuvF3lar, type SvodShartnoma } from '../../src/lib/nakopitelniy-svod';
import { f3ShaklTozala, forma3SotuvdanXlsx } from '../../src/lib/forma3-export';
import { hujjatKorinishi } from '../../src/lib/hujjat-yozuvchi/korinish';
import { korinishdanPdf } from '../../src/lib/hujjat-pdf/pdf';
import { tekshirBazasi } from '../../src/lib/brend';
import { imzoRpc } from '../_shared/imzo';
import { hujjatMazmunXeshi } from '../../src/lib/imzo/mazmun';
import { tasodifiyToken } from '../../src/lib/imzo/yadro';
import { tizimImzoKodi, tizimImzosiniQoy } from '../../src/lib/hujjat-yozuvchi/tizim-imzo';
import { mazmunXeshi } from '../../src/api/mazmun-xesh';
import { nakopitelniyPaketFayli } from '../../src/lib/oylik-hujjat/nakopitelniy';
import { ostatkaPaketFayli, paketImzosiOl } from '../../src/lib/oylik-hujjat/ostatka-slichitelniy';
import { m29PaketFayli, pudratchiNomiOl } from '../../src/lib/oylik-hujjat/m29';
import { NDS_SUKUT_FOIZ } from '../../src/lib/nakopitelniy-vedomost-export';
import { f2Manba, forma3Manba, obyektHujjatManba, type DiskManba } from '../../src/lib/disk-hujjat';
import { diskArxivla } from '../_shared/disk-arxiv';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string; BREND_URL?: string; R2_CANONICAL?: R2Bucket };
export type HujjatFormat = 'xlsx' | 'pdf';
const FORMATLAR: readonly HujjatFormat[] = ['xlsx', 'pdf'];
const MIME: Record<HujjatFormat, string> = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' };
const musbat = (v: unknown): number | null => (Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

class Rad extends Error { constructor(readonly status: number, readonly code: string, msg: string) { super(msg); } }
const rad = (e: Rad) => Response.json({ ok: false, code: e.code, xato: e.message }, { status: e.status });

type Tayyor = { bytes: Uint8Array; faylNomi: string; turi: string; obyektId: number; davr: string | null; xesh: string; manba: DiskManba; arxivla: boolean };
const OY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Hujjat nashri tokeni (t2_nashr_tayyor_v1: bir xil mazmun — mavjud token). Xatoda null. */
async function nashrTokeni(env: Env, actorId: number, kompaniyaId: number, obyektId: number, t: Tayyor): Promise<string | null> {
  try {
    const j = await imzoRpc(env, 't2_nashr_tayyor_v1', { p_actor_id: actorId, p_kompaniya_id: kompaniyaId, p_obyekt_id: obyektId, p_turi: t.turi, p_atama: t.faylNomi.replace(/\.xlsx$/i, '').slice(0, 160), p_xesh: await hujjatMazmunXeshi(t.bytes), p_token: tasodifiyToken() });
    return j?.ok && typeof j.token === 'string' ? j.token : null;
  } catch { return null; }
}

async function royxat(kompaniyaId: number, obyektId: number) {
  const r = await sbT2AktReestrOl(obyektId, 'f2');
  if (!r.ok || r.toliq === false) throw new Rad(502, 'REESTR_OQILMADI', 'F-2 reestri o‘qilmadi');
  const aktlar = (r.qatorlar ?? []).filter((a) => a.kompaniya_id === kompaniyaId);
  if (!aktlar.length && (r.qatorlar ?? []).length) throw new Rad(403, 'KOMPANIYA_MOS_EMAS', 'Obyekt shu kompaniyaga tegishli emas');
  const hujjatlar: Array<Record<string, unknown>> = aktlar.filter((a) => a.holat !== 'bekor').map((a) => ({
    kalit: `f2:${a.id}`, tur: 'f2', sarlavha: `Ф-2 № ${a.raqam || '—'} · ${(a.oy || '').slice(0, 7)}`, holat: a.holat, summa: a.hujjat_jami ?? null,
    parametrlar: { akt_id: a.id }, formatlar: FORMATLAR,
  }));
  // Oylik/obyekt hujjatlari (sayt sahifalari bilan bir xil quruvchilar): tasdiqlangan F2 oylari bo'yicha Nakopitelniy va M-29; obyekt bo'yicha Slichitelniy va Ostatka.
  const oylar = [...new Set(aktlar.filter((a) => a.holat === 'tasdiqlangan').map((a) => (a.oy || '').slice(0, 7)).filter((o) => OY.test(o)))].sort().reverse();
  for (const oy of oylar) {
    hujjatlar.push({ kalit: `nakopitelniy:${oy}`, tur: 'nakopitelniy', sarlavha: `Накопительная ведомость · ${oy}`, holat: 'tasdiqlangan', summa: null, parametrlar: { oy_son: Number(oy.replace('-', '')) }, oy, formatlar: FORMATLAR });
    hujjatlar.push({ kalit: `m29:${oy}`, tur: 'm29', sarlavha: `М-29 · ${oy}`, holat: 'tasdiqlangan', summa: null, parametrlar: { oy_son: Number(oy.replace('-', '')) }, oy, formatlar: FORMATLAR });
  }
  hujjatlar.push({ kalit: 'slichitelniy', tur: 'slichitelniy', sarlavha: 'Сличительная ведомость', holat: 'joriy', summa: null, parametrlar: {}, formatlar: FORMATLAR });
  hujjatlar.push({ kalit: 'ostatka', tur: 'ostatka', sarlavha: 'Ведомость остатков', holat: 'joriy', summa: null, parametrlar: {}, formatlar: FORMATLAR });
  const svod = await shartnomaSvodOl(kompaniyaId);
  if (svod.ok) {
    for (const sh of svod.natija.shartnomalar) {
      if (!sh.obyektlar.some((o) => o.id === obyektId)) continue;
      for (const f3 of sotuvF3lar(sh)) {
        hujjatlar.push({ kalit: `forma3:${sh.id}:${f3.id}`, tur: 'forma3', sarlavha: `Форма № 3 № ${f3.raqam ?? f3.id} · ${(f3.sotuv_sana ?? '').slice(0, 10)} · шартнома № ${sh.raqam}`,
          holat: f3.holat, summa: f3.sotuv_summa, parametrlar: { shartnoma_id: sh.id, f3_id: f3.id }, formatlar: FORMATLAR });
      }
    }
  }
  return hujjatlar;
}

async function f2Yasa(kompaniyaId: number, obyektId: number, aktId: number): Promise<Tayyor> {
  const reestr = await sbT2AktReestrOl(obyektId, 'f2');
  if (!reestr.ok || reestr.toliq === false) throw new Rad(502, 'REESTR_OQILMADI', 'F-2 reestri o‘qilmadi');
  const akt = (reestr.qatorlar ?? []).find((a) => a.id === aktId);
  if (!akt || akt.kompaniya_id !== kompaniyaId) throw new Rad(404, 'AKT_TOPILMADI', 'F-2 topilmadi');
  let m;
  try {
    m = await portfelObyektOl(kompaniyaId, obyektId, [aktId], aktId);
    if (akt.holat === 'bekor') {
      // Bekor akt: 	2_f2_tafsilot uni ko'rsatmaydi — sayt (F2 tarixi) kabi 	2_akt_qator + smeta (tarix bilan) dan qatorlar.
      const lines = bekorQatorlari(akt, (m.aktQatorlar.get(aktId) ?? []) as AktQatorXom[], new Map(m.smeta.map((r) => [r.id, r] as const)));
      m = { ...m, tafsilot: lines, smeta: await smetaTarixBilan(obyektId, m.smeta, lines.map((l) => l.qator_id)) };
    }
  } catch (e) { throw new Rad(502, 'MALUMOT_OQILMADI', e instanceof Error ? e.message.slice(0, 160) : 'Ma‘lumot o‘qilmadi'); }
  const raqamlar = new Map((reestr.qatorlar ?? []).map((a) => [a.id, a.raqam ?? null] as const));
  let h;
  try { h = paketAktExcel(m, akt, akt.obyekt || '', raqamlar); }
  catch (e) { throw new Rad(409, 'F2_QATOR_TOPILMADI', e instanceof Error ? e.message.slice(0, 160) : 'F-2 qatori topilmadi'); }
  if (!h) throw new Rad(409, 'QATOR_YOQ', 'Bu hujjatda chiqariladigan qator yo‘q');
  if (h.topilmagan) throw new Rad(409, 'F2_QATOR_TOPILMADI', `${h.topilmagan} ta qator smetada topilmadi`);
  const xesh = f2HujjatKaliti(obyektId, akt.oy || '', akt.raqam) ?? `akt:${akt.id}:${await mazmunXeshi(h.bytes)}`;
  return { bytes: h.bytes, faylNomi: h.faylNomi, turi: 'f2_hujjat', obyektId, davr: akt.oy || null, xesh, arxivla: akt.holat === 'tasdiqlangan', manba: f2Manba({ aktId: akt.id, raqam: akt.raqam ?? null, obyekt: akt.obyekt || null, oy: akt.oy || null }) };
}

async function f3Yasa(kompaniyaId: number, obyektId: number, shartnomaId: number, f3Id: number, shakl: unknown): Promise<Tayyor> {
  const [svod, komp] = await Promise.all([shartnomaSvodOl(kompaniyaId), sbT2KompaniyalarOl()]);
  if (!svod.ok) throw new Rad(502, 'SVOD_OQILMADI', 'Shartnoma svodi o‘qilmadi');
  const sh: SvodShartnoma | undefined = svod.natija.shartnomalar.find((x) => x.id === shartnomaId);
  if (!sh || !sh.obyektlar.some((o) => o.id === obyektId)) throw new Rad(404, 'SHARTNOMA_TOPILMADI', 'Shartnoma topilmadi');
  const tashkilot = (komp.qatorlar ?? []).find((k) => k.id === kompaniyaId)?.nom ?? null;
  const h = forma3SotuvdanXlsx(sh, f3Id, { tashkilot, shakl: f3ShaklTozala(shakl) });
  if (!h) throw new Rad(409, 'F3_HISOBLANMADI', 'Форма № 3 hisoblanmadi (sana/summa yo‘q)');
  const f3q = sotuvF3lar(sh).find((x) => x.id === f3Id);
  return { bytes: h.bytes, faylNomi: h.faylNomi, turi: 'f3', obyektId, davr: null, xesh: await mazmunXeshi(h.bytes), arxivla: true,
    manba: forma3Manba({ obyektId, shartnomaId: sh.id, f3Id, raqam: f3q?.raqam ?? null, obyekt: sh.obyektlar.find((o) => o.id === obyektId)?.nom ?? null, davr: (f3q?.sotuv_sana ?? '').slice(0, 7) || null, shartnomaRaqam: sh.raqam ?? null }) };
}

/** Oylik/obyekt hujjatlari: sayt sahifalari va oylik paket ishlatadigan AYNAN o'sha `*PaketFayli` quruvchilari (paket.test: sahifa yo'li bilan bayt-bayt teng). */
async function obyektHujjati(tur: 'nakopitelniy' | 'm29' | 'slichitelniy' | 'ostatka', kompaniyaId: number, obyektId: number, oySon: number | null, ndsFoiz: number | null): Promise<Tayyor> {
  const [obyektlar, imzo] = await Promise.all([sbT2ObyektlarOlKomp(kompaniyaId), paketImzosiOl(kompaniyaId, obyektId)]);
  const ob = (obyektlar.qatorlar ?? []).find((o) => o.id === obyektId);
  if (!ob) throw new Rad(404, 'OBYEKT_TOPILMADI', 'Obyekt topilmadi');
  const oy = oySon ? `${String(oySon).slice(0, 4)}-${String(oySon).slice(4, 6)}` : null;
  if ((tur === 'nakopitelniy' || tur === 'm29') && (!oy || !OY.test(oy))) throw new Rad(400, 'PARAMETR_YOQ', 'oy_son (YYYYMM) kerak');
  const r = tur === 'nakopitelniy' ? await nakopitelniyPaketFayli({ kompaniyaId, obyektId, obyektNom: ob.nom, oy: oy!, imzo, ndsFoiz })
    : tur === 'm29' ? await m29PaketFayli({ kompaniyaId, obyektId, obyektNom: ob.nom, oy: oy!, imzo, pudratchi: await pudratchiNomiOl(kompaniyaId).catch(() => null) })
      : await ostatkaPaketFayli({ kompaniyaId, obyektId, obyektNom: ob.nom, imzo, tur });
  if (!r.ok) throw new Rad(409, r.bosh ? 'HUJJAT_BOSH' : 'HUJJAT_TUZILMADI', r.xato.slice(0, 200));
  return { bytes: r.bytes, faylNomi: r.nom, turi: tur, obyektId, davr: oy, xesh: await mazmunXeshi(r.bytes), arxivla: true, manba: obyektHujjatManba({ tur, obyektId, obyekt: ob.nom ?? null, oy }) };
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
    const actorId = sess ? Number((sess as { foydalanuvchi_id?: unknown }).foydalanuvchi_id) : NaN;
    if (!sess || !Number.isFinite(actorId)) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
    const b = await ctx.request.json().catch(() => null) as Record<string, unknown> | null;
    const kompaniyaId = musbat(b?.kompaniya_id), obyektId = musbat(b?.obyekt_id);
    if (!b || !kompaniyaId || !obyektId) return Response.json({ ok: false, code: 'PARAMETR_YOQ', xato: 'kompaniya_id va obyekt_id kerak' }, { status: 400 });

    if (b.amal === 'royxat') {
      const hujjatlar = await ichkiRejimda(ctx, () => royxat(kompaniyaId, obyektId));
      return Response.json({ ok: true, hujjatlar }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (b.amal !== 'yarat') return Response.json({ ok: false, code: 'AMAL_NOMA_LUM' }, { status: 400 });
    const format = b.format as HujjatFormat;
    if (!FORMATLAR.includes(format)) return Response.json({ ok: false, code: 'FORMAT_NOMA_LUM', xato: 'format: xlsx yoki pdf' }, { status: 400 });

    const tayyor = await ichkiRejimda(ctx, async () => {
      // YAGONA dizayn manbai: kompaniya «Hujjat dizayni» (hujjat.dizayn._uslub) HAR hujjat turi uchun shu yerda qo'llanadi
      // (ilgari faqat kontekst o'qiydigan turlarga tegardi; Worker da localStorage yo'q edi — sukut chiqardi).
      await hujjatDizayniniYukla(kompaniyaId);
      if (b.tur === 'f2') {
        const aktId = musbat(b.akt_id);
        if (!aktId) throw new Rad(400, 'PARAMETR_YOQ', 'akt_id kerak');
        return f2Yasa(kompaniyaId, obyektId, aktId);
      }
      if (b.tur === 'forma3') {
        const sh = musbat(b.shartnoma_id), f3 = musbat(b.f3_id);
        if (!sh || !f3) throw new Rad(400, 'PARAMETR_YOQ', 'shartnoma_id va f3_id kerak');
        return f3Yasa(kompaniyaId, obyektId, sh, f3, b.shakl);
      }
      if (b.tur === 'nakopitelniy' || b.tur === 'm29' || b.tur === 'slichitelniy' || b.tur === 'ostatka') {
        const nds = b.nds_foiz == null ? NDS_SUKUT_FOIZ : Number(b.nds_foiz);
        return obyektHujjati(b.tur, kompaniyaId, obyektId, musbat(b.oy_son), Number.isFinite(nds) && nds >= 0 ? nds : NDS_SUKUT_FOIZ);
      }
      throw new Rad(400, 'TUR_NOMA_LUM', 'tur: f2, forma3, nakopitelniy, m29, slichitelniy yoki ostatka');
    });

    // Token: hujjat yaratildi — endi yechiladi (qayta yuklash bepul). PDF/XLSX bir hujjat: ikkinchisi takror.
    const s = await serverSarfla(ctx.env, { actorId, kompaniyaId, turi: tayyor.turi, obyektId, davr: tayyor.davr, xesh: tayyor.xesh, bytes: tayyor.bytes });
    if (!s.ok) return sarfRad(s);
    // Disk: hujjat avtomatik saqlanadi (Shartnoma -> Obyekt -> tur -> oy); qayta yasalsa - o'sha hujjatning yangi versiyasi. Xato hujjat berishni to'xtatmaydi.
    const arxiv = !tayyor.arxivla ? Promise.resolve(null) : diskArxivla(ctx.env, { actorId, kompaniyaId, obyektId, turi: tayyor.turi === 'f2_hujjat' ? 'f2' : tayyor.turi === 'f3' ? 'forma3' : tayyor.turi, faylNomi: tayyor.faylNomi, bytes: tayyor.bytes, davr: tayyor.davr, xesh: tayyor.xesh, manba: tayyor.manba });
    if (typeof ctx.waitUntil === 'function') ctx.waitUntil(arxiv); else await arxiv;
    let chiqish: Uint8Array = tayyor.bytes;
    let faylNomi = tayyor.faylNomi;
    if (format === 'pdf') {
      try {
        // QR: hujjat nashri tokeni (mavjud /t/<token> ochiq tekshiruv sahifasi); baza — BREND_URL yoki joriy sayt. Xato bo'lsa QR siz beriladi.
        const token = await nashrTokeni(ctx.env, actorId, kompaniyaId, obyektId, tayyor);
        const baza = tekshirBazasi(ctx.env, ctx.request.url);
        chiqish = await korinishdanPdf(hujjatKorinishi(tayyor.bytes), { faylNomi: tayyor.faylNomi, kod: tizimImzoKodi(tayyor.bytes), ...(token ? { tekshirHavola: `${baza}/t/${token}` } : {}) });
        faylNomi = tayyor.faylNomi.replace(/\.xlsx$/i, '') + '.pdf';
      } catch (e) {
        if (s.operationId) await serverQaytar(ctx.env, { actorId, kompaniyaId, sarfOperationId: s.operationId }).catch(() => false);
        throw new Rad(500, 'PDF_YASALMADI', e instanceof Error ? e.message.slice(0, 160) : 'PDF yasalmadi');
      }
    }
    // QURAI imzosi (kolontitul + xususiyatlar) — veb ham, ilovalar ham bir xil faylni oladi; shablon tanasi o'zgarmaydi.
    if (format === 'xlsx') chiqish = tizimImzosiniQoy(chiqish, { hujjat: faylNomi });
    const headers = new Headers({
      'Content-Type': MIME[format],
      'Content-Disposition': 'attachment; filename*=UTF-8\'\'' + encodeURIComponent(faylNomi),
      'Content-Length': String(chiqish.byteLength),
      'X-Hujjat-Sarf': String(s.sarflandi), 'X-Hujjat-Bepul-Takror': s.bepulTakror ? '1' : '0',
      'Cache-Control': 'private, no-store',
    });
    return new Response(chiqish, { headers });
  } catch (e) {
    if (e instanceof Rad) return rad(e);
    return Response.json({ ok: false, code: 'HUJJAT_YASALMADI', xato: e instanceof Error ? e.message.slice(0, 200) : 'Hujjat yasalmadi' }, { status: 500 });
  }
};
