/**
 * telegram-bot-oqim.ts — @qur_uz_bot 2-bosqich: ko'p qadamli oqimlar (Telegram V2).
 *
 *  1) Tasdiq so'rovi hujjat tafsiloti bilan (tur, raqam, obyekt, sana, jami) + qadam belgisi (eskirgan «Ha» o'tmaydi).
 *  2) Rasm → fakt qatori: Bo'lim → so'z bilan qidiruv (javob xabari) → qator → foto-dalil `yangila` (manba=qator).
 *  3) `/fakt <obyekt#> <matn>`: mavjud AI (smeta-ai f2_niyat → aiHisobli: limit + token yechish) → ko'rib chiqish → «Saqlash»
 *     = FAQAT qoralama (usta_fakt_qoralama_v1, t2_usta_fakt_qoralama); tasdiqlash bu yerda YO'Q.
 *  4) Menyu tugmasi (Mini App) oxirgi obyektda ochiladi.
 *
 * QOIDALAR (1-bosqichdagi kabi): `uid` faqat Telegram↔foydalanuvchi bog'lanishidan; har amal `botChaqiruv` orqali (middleware →
 * mavjud shlyuz → RPC a'zolik/rol). callback_data ≤ 64 bayt, faqat qisqa id (server holati yo'q); id lar hech qachon ishonchli emas —
 * har biri serverda qayta tekshiriladi. Matn/summa/chat_id/token loglanmaydi.
 */
import { type TgEnv, type TgTil, miniAppUrl, miniAppYoliTugma, tgApi, tgRpc, tgT } from './telegram';
import { botChaqiruv } from './telegram-amal';
import {
  FAKT_BEKOR, FAKT_SAQLA, FOTO_BOLIM, FOTO_BOLIMLAR, FOTO_QATOR, TASDIQ_HA, TASDIQ_SO_ROV, TASDIQ_YOQ,
  qadamBelgisi, sonlarOl, zanjirHaOl, zanjirIdOl,
} from './telegram-tugma';
import { type BotJavob, type Callback, callbackIshla, limitOshdi, obyektlarOl } from './telegram-bot';
import { tgChuqurHavola } from '../../src/lib/tg-yol';
import { onRequest as middleware } from '../api/_middleware';
import { onRequestGet as aylanishGet, onRequestPost as aylanishPost } from '../api/hujjat-aylanish';
import { onRequestPost as sbPost } from '../api/sb';
import { onRequestPost as sbYozPost } from '../api/sb-yoz';
import { onRequestPost as fotoDalilPost } from '../api/foto-dalil';
import { onRequestPost as smetaAiPost } from '../api/smeta-ai';

type BotEnv = TgEnv & Record<string, unknown>;
export type CbNatija = { toast: string; xabar?: BotJavob; tugmalarniOlibTashla?: boolean; amal: string };

const musbat = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const bosh = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** `sb` o'qish shlyuzi (tenant filtri serverda). `null` — o'qib bo'lmadi (noma'lum; 0 emas). */
async function sbOqi<T>(env: BotEnv, uid: number, json: Record<string, unknown>): Promise<T[] | null> {
  const r = await botChaqiruv<{ ok?: boolean; qatorlar?: T[] }>(env, uid, { api: 'sb', json }, middleware, sbPost);
  return r.status === 200 && r.body?.ok && Array.isArray(r.body.qatorlar) ? r.body.qatorlar : null;
}

type ObyektKompaniya = { id: number; nom: string; kompaniya_id: number };
/** Bitta obyekt (foydalanuvchiga ochiq bo'lsa). Tenant filtri `sb` da. */
async function obyektOl(env: BotEnv, uid: number, oid: number): Promise<ObyektKompaniya | null> {
  const q = await sbOqi<{ id?: number; nom?: string; kompaniya_id?: number }>(env, uid, { jadval: 't2_obyekt', filtr: `id=eq.${oid}`, ustunlar: 'id,nom,kompaniya_id', limit: 1 });
  const x = q?.find((r) => r.id === oid);
  return x && musbat(x.kompaniya_id) ? { id: oid, nom: bosh(x.nom ?? '—', 80), kompaniya_id: x.kompaniya_id } : null;
}

const XATO_OQISH = 'Ma’lumotni o‘qib bo‘lmadi. Birozdan keyin urinib ko‘ring.';

/* ═════════ 1) Hujjat tasdig'i: tafsilot + qadam belgisi ═════════ */
type Tafsilot = {
  ok?: boolean;
  zanjir?: { id?: number; hujjat_turi?: string; sarlavha?: string; holat?: string; raund?: number; obyekt_id?: number | null; manba_jadval?: string | null; manba_id?: number | null; yaratildi?: string | null };
  qadamlar?: { tartib?: number; rol?: string; holat?: string; men?: boolean }[];
};
export type ZanjirHolati = { kompaniya_id: number; z: NonNullable<Tafsilot['zanjir']>; navbat: boolean; belgi: string | null };

/** A'zo kompaniyalar bo'yicha zanjirni o'qiydi (mavjud `zanjir` tafsiloti: a'zolik BAZADA). Navbat foydalanuvchi kompaniyasida bo'lsa — o'sha. */
export async function zanjirHolatiOl(env: BotEnv, uid: number, zanjirId: number): Promise<ZanjirHolati | 'xato' | null> {
  const men = await menAzolik(env, uid);
  if (!men) return 'xato';
  let topilgan: ZanjirHolati | null = null; let xato = false;
  for (const kid of men) {
    const r = await botChaqiruv<Tafsilot>(env, uid, { api: 'hujjat-aylanish', method: 'GET', query: { bolim: 'zanjir', kompaniya_id: kid, zanjir_id: zanjirId } }, middleware, aylanishGet);
    if (r.status === 200 && r.body?.ok && r.body.zanjir && r.body.zanjir.id === zanjirId) {
      const q = (r.body.qadamlar ?? []).find((s) => s.holat === 'navbat' && s.men === true);
      const navbat = r.body.zanjir.holat === 'jarayonda' && !!q;
      const h: ZanjirHolati = { kompaniya_id: kid, z: r.body.zanjir, navbat, belgi: navbat ? qadamBelgisi(r.body.zanjir.raund, q?.tartib) : null };
      if (navbat) return h;
      topilgan ??= h;
    } else if (r.status >= 500 || r.status === 0) xato = true;
  }
  return topilgan ?? (xato ? 'xato' : null);
}

async function menAzolik(env: BotEnv, uid: number): Promise<number[] | null> {
  const m = await tgRpc<{ ok?: boolean; azoliklar?: { kompaniya_id?: number; faol?: boolean }[] }>(env, 't2_men_v1', { p_actor_id: uid });
  if (!m?.ok) return null;
  return (m.azoliklar ?? []).filter((a) => a.faol !== false && musbat(a.kompaniya_id)).slice(0, 10).map((a) => a.kompaniya_id as number);
}

const TUR_NOMI: Record<string, string> = {
  f2: 'F-2 (bajarilgan ishlar akti)', fakt: 'Fakt akti', aosr: 'AOSR (yashirin ishlar dalolatnomasi)', forma3: 'Forma № 3 (schyot-faktura)',
};
const turNomi = (t: string | undefined, til: TgTil) => (t && TUR_NOMI[t] ? tgT(TUR_NOMI[t], til) : (t || '—'));

/** 12 345,67 ko'rinishida (guruhlangan). `null` — «—» (0 emas). */
export function pulMatni(n: unknown): string {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return '—';
  const v = Number(n); const [a, b] = Math.abs(v).toFixed(2).split('.');
  return (v < 0 ? '-' : '') + a.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (b === '00' ? '' : ',' + b);
}

type AktQisqa = { id?: number; raqam?: string | null; oy?: string | null; hujjat_jami?: number | string | null; obyekt_id?: number | null; tur?: string | null };
/** Tasdiq so'rovi matni uchun hujjat tafsilotlari (hammasi mavjud o'qish yo'llaridan; topilmasa «—»). */
async function hujjatTafsiloti(env: BotEnv, uid: number, til: TgTil, h: ZanjirHolati) {
  const z = h.z;
  let akt: AktQisqa | null = null;
  if (z.manba_jadval === 't2_akt' && musbat(z.manba_id)) {
    const q = await sbOqi<AktQisqa>(env, uid, { jadval: 't2_akt', filtr: `id=eq.${z.manba_id}`, ustunlar: 'id,raqam,oy,tur,hujjat_jami,obyekt_id', limit: 1 });
    akt = q?.find((r) => r.id === z.manba_id) ?? null;
  }
  const oid = musbat(z.obyekt_id) ? z.obyekt_id : musbat(akt?.obyekt_id) ? akt!.obyekt_id as number : null;
  const ob = oid ? await obyektOl(env, uid, oid) : null;
  const sana = bosh(akt?.oy || String(z.yaratildi ?? '').slice(0, 10), 20) || '—';
  return {
    tur: turNomi(akt?.tur === 'f2' ? 'f2' : z.hujjat_turi, til), raqam: bosh(akt?.raqam, 40) || '—', obyekt: ob?.nom ?? '—', sana,
    jami: akt ? pulMatni(akt.hujjat_jami) : '—', sarlavha: bosh(z.sarlavha, 120) || '—',
  };
}

/** «Tasdiqlash» bosildi: tafsilotli so'rov. Navbat sizniki bo'lmasa — «Ha» tugmasi chiqmaydi. */
export async function tasdiqSorovi(env: BotEnv, uid: number, til: TgTil, zanjirId: number): Promise<CbNatija> {
  const h = await zanjirHolatiOl(env, uid, zanjirId);
  if (h === 'xato') return { toast: tgT('Bajarilmadi', til), amal: 'tasdiq_sorov_xato', xabar: { matn: tgT(XATO_OQISH, til) } };
  if (!h) return { toast: tgT('Bajarilmadi', til), amal: 'tasdiq_sorov_topilmadi', xabar: { matn: tgT('Hujjat topilmadi yoki unga ruxsatingiz yo‘q.', til) } };
  if (!h.navbat || !h.belgi) {
    return { toast: tgT('Bajarilmadi', til), amal: 'tasdiq_sorov_navbat_emas', xabar: { matn: tgT('Hozir sizning qaroringiz kutilmayapti yoki ruxsatingiz yo‘q.', til),
      markup: { inline_keyboard: [[miniAppYoliTugma(env, til, `/admin/hujjat-aylanish?zanjir=${zanjirId}`, 'Ko‘rish')]] } } };
  }
  const t = await hujjatTafsiloti(env, uid, til, h);
  return { toast: tgT('Tasdiqni tasdiqlang', til), amal: 'tasdiq_sorov', xabar: {
    matn: [tgT('Hujjat № {id} ni tasdiqlaysizmi?', til, { id: zanjirId }),
      tgT('Turi: {v}', til, { v: t.tur }), tgT('Raqami: {v}', til, { v: t.raqam }), tgT('Obyekt: {v}', til, { v: t.obyekt }),
      tgT('Sana: {v}', til, { v: t.sana }), tgT('Jami: {v}', til, { v: t.jami === '—' ? '—' : t.jami + ' ' + tgT('soʻm', til) }),
      tgT('Sarlavha: {v}', til, { v: t.sarlavha }), tgT('Bu qaror qaytarilmaydi.', til)].join('\n'),
    markup: { inline_keyboard: [[{ text: tgT('Ha, tasdiqlayman', til), callback_data: `${TASDIQ_HA}${zanjirId}:${h.belgi}` }, { text: tgT('Bekor', til), callback_data: TASDIQ_YOQ + zanjirId }],
      [miniAppYoliTugma(env, til, `/admin/hujjat-aylanish?zanjir=${zanjirId}`, 'Ko‘rish')]] } } };
}

/** «Ha»: zanjir QAYTA o'qiladi; qadam belgisi o'zgargan (yoki navbat sizniki emas) bo'lsa — hech narsa tasdiqlanmaydi. */
export async function tasdiqBajar(env: BotEnv, uid: number, til: TgTil, zanjirId: number, belgi: string): Promise<CbNatija> {
  const rad = (amal: string, toast: string, matn: string): CbNatija => ({ toast: tgT(toast, til), xabar: { matn: tgT(matn, til) }, tugmalarniOlibTashla: true, amal });
  const h = await zanjirHolatiOl(env, uid, zanjirId);
  if (h === 'xato') return rad('tasdiq_xato', 'Bajarilmadi', 'Server xatosi. Mini App da urinib ko‘ring.');
  if (!h || !h.navbat) return rad('tasdiq_navbat_emas', 'Bajarilmadi', 'Hozir sizning qaroringiz kutilmayapti yoki ruxsatingiz yo‘q.');
  if (h.belgi !== belgi) return rad('tasdiq_eskirgan', 'Eskirgan tugma', 'Hujjat holati soʻrovdan keyin oʻzgargan. Hech narsa tasdiqlanmadi — yangi «Tasdiqlash» tugmasini bosing yoki Mini App da oching.');
  const r = await botChaqiruv<{ ok?: boolean; code?: string }>(env, uid,
    { api: 'hujjat-aylanish', json: { amal: 'zanjir_qaror', kompaniya_id: h.kompaniya_id, zanjir_id: zanjirId, qaror: 'tasdiqlash' } }, middleware, aylanishPost);
  if (r.status === 200 && r.body?.ok) return rad('tasdiq_ok', 'Tasdiqlandi', 'Hujjat tasdiqlandi.');
  if ((r.status === 200 && r.body?.code === 'NAVBAT_EMAS') || [401, 403].includes(r.status)) return rad('tasdiq_navbat_emas', 'Bajarilmadi', 'Hozir sizning qaroringiz kutilmayapti yoki ruxsatingiz yo‘q.');
  return rad('tasdiq_xato', 'Bajarilmadi', 'Server xatosi. Mini App da urinib ko‘ring.');
}

/* ═════════ qator qidiruvi (foto → qator va /fakt uchun umumiy) ═════════ */
export type QatorNomzod = { id: number; kod: string; nom: string; birlik: string; ota_id: number | null };
type XomQator = { id?: number; ota_id?: number | null; kod?: string | null; nom?: string | null; birlik?: string | null };

/** So'zlar: harf/raqam, ≥ 2 belgi, ko'pi bilan 3 ta (eng uzunlari). `ilike` uchun xavfsiz alifbo. */
export function qidiruvSozlari(matn: string, maks = 3): string[] {
  const s = [...new Set(matn.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 2))];
  return s.sort((a, b) => b.length - a.length).slice(0, maks);
}

/** Obyekt qatorlari (ish/material/mashina) nom bo'yicha; `bolimId` berilsa — faqat shu bo'lim ostidagilar (ota zanjiri `sb` orqali). */
export async function qatorQidir(env: BotEnv, uid: number, oid: number, sozlar: string[], bolimId: number | null, limit = 8): Promise<QatorNomzod[] | null> {
  if (!sozlar.length) return [];
  const filtr = `obyekt_id=eq.${oid}&tur=in.(bl,mat,ob)` + sozlar.map((s) => `&nom=ilike.*${s}*`).join('');
  const q = await sbOqi<XomQator>(env, uid, { jadval: 't2_qator', filtr, ustunlar: 'id,ota_id,kod,nom,birlik', tartib: 'id.asc', limit: bolimId ? 300 : 40 });
  if (!q) return null;
  let rows = q.filter((r) => musbat(r.id)).map((r) => ({ id: r.id as number, kod: bosh(r.kod, 24), nom: bosh(r.nom, 120), birlik: bosh(r.birlik, 12), ota_id: musbat(r.ota_id) ? r.ota_id : null }));
  if (bolimId) {
    // Ota zanjiri: har bosqichda ma'lum bo'lmagan otalar bitta `id=in.(...)` so'rovi bilan olinadi (≤ 6 daraja).
    const ota = new Map<number, number | null>(rows.map((r) => [r.id, r.ota_id]));
    for (let d = 0; d < 6; d++) {
      const kerak = [...new Set([...ota.values()].filter((v): v is number => v != null && v !== bolimId && !ota.has(v)))].slice(0, 200);
      if (!kerak.length) break;
      const o = await sbOqi<XomQator>(env, uid, { jadval: 't2_qator', filtr: `obyekt_id=eq.${oid}&id=in.(${kerak.join(',')})`, ustunlar: 'id,ota_id', limit: 300 });
      if (!o) return null;
      for (const x of o) if (musbat(x.id)) ota.set(x.id, musbat(x.ota_id) ? x.ota_id : null);
      for (const k of kerak) if (!ota.has(k)) ota.set(k, null);
    }
    const ichida = (id: number) => { let c: number | null = id; for (let i = 0; i < 8 && c != null; i++) { if (c === bolimId) return true; c = ota.get(c) ?? null; } return false; };
    rows = rows.filter((r) => ichida(r.id));
  }
  return rows.slice(0, limit);
}
const qatorMatni = (q: Pick<QatorNomzod, 'kod' | 'nom' | 'birlik'>) => [q.kod, q.nom].filter(Boolean).join(' ') + (q.birlik ? ` (${q.birlik})` : '');

/* ═════════ 2) Rasm → fakt qatori ═════════ */
const SAHIFA = 8;

/** «Faktga biriktirish» (yoki sahifalash): obyekt + bo'limlar ro'yxati. */
export async function fotoBolimlar(env: BotEnv, uid: number, til: TgTil, fid: number, oid: number, sahifa: number): Promise<BotJavob> {
  const ob = await obyektOl(env, uid, oid);
  if (!ob) return { matn: tgT('Bu obyekt sizga ochiq emas.', til) };
  const b = await sbOqi<{ id?: number; kod?: string | null; nom?: string | null }>(env, uid, { jadval: 't2_qator', filtr: `obyekt_id=eq.${oid}&tur=eq.rz`, ustunlar: 'id,kod,nom', tartib: 'tartib.asc,id.asc', limit: 200 });
  if (!b) return { matn: tgT(XATO_OQISH, til) };
  const ro = b.filter((x) => musbat(x.id));
  if (!ro.length) return { matn: tgT('Bu obyektda bo‘limlar topilmadi.', til), markup: { inline_keyboard: [[miniAppYoliTugma(env, til, '/admin/foto', 'Foto-dalil')]] } };
  const p = Math.min(Math.max(0, sahifa), Math.floor((ro.length - 1) / SAHIFA));
  const qism = ro.slice(p * SAHIFA, p * SAHIFA + SAHIFA);
  const nav: Record<string, unknown>[] = [];
  if (p > 0) nav.push({ text: '‹', callback_data: `${FOTO_BOLIMLAR}${fid}:${oid}:${p - 1}` });
  if ((p + 1) * SAHIFA < ro.length) nav.push({ text: '›', callback_data: `${FOTO_BOLIMLAR}${fid}:${oid}:${p + 1}` });
  return {
    matn: tgT('Obyekt: {obyekt}. Rasm qaysi bo‘limga tegishli? ({a}–{b} / {n})', til, { obyekt: ob.nom, a: p * SAHIFA + 1, b: p * SAHIFA + qism.length, n: ro.length }),
    markup: { inline_keyboard: [...qism.map((x) => [{ text: [bosh(x.kod, 12), bosh(x.nom, 40)].filter(Boolean).join(' ').slice(0, 60) || '#' + x.id, callback_data: `${FOTO_BOLIM}${fid}:${oid}:${x.id}` }]), ...(nav.length ? [nav] : [])] },
  };
}

/** Bo'lim tanlandi → qidiruv so'zi so'raladi (force_reply; kontekst marker qatorida — foydalanuvchi shu xabarga javob yozadi). */
export async function fotoBolimTanlandi(env: BotEnv, uid: number, til: TgTil, fid: number, oid: number, bid: number): Promise<BotJavob> {
  const q = await sbOqi<{ id?: number; kod?: string | null; nom?: string | null }>(env, uid, { jadval: 't2_qator', filtr: `id=eq.${bid}&obyekt_id=eq.${oid}`, ustunlar: 'id,kod,nom', limit: 1 });
  const b = q?.find((x) => x.id === bid);
  if (!b) return { matn: tgT(q ? 'Bo‘lim topilmadi.' : XATO_OQISH, til) };
  return {
    matn: [tgT('Bo‘lim: {nom}', til, { nom: [bosh(b.kod, 12), bosh(b.nom, 80)].filter(Boolean).join(' ') }),
      tgT('Qator nomidan so‘z yozing — shu xabarga javob bering (masalan: beton, armatura).', til), `[fq:${fid}:${oid}:${bid}]`].join('\n'),
    markup: { force_reply: true, input_field_placeholder: tgT('so‘z yozing…', til), selective: true },
  };
}

const QIDIRUV_BELGISI = /\[fq:(\d{1,15}):(\d{1,15}):(\d{1,15})\]/;
/** Javob (reply) xabari bot so'rovigami? `[fq:foto:obyekt:bo'lim]` belgisi bot xabarining o'zida; qiymatlar baribir serverda tekshiriladi. */
export function qidiruvKonteksti(reply: { from?: { is_bot?: boolean }; text?: string } | undefined): { fid: number; oid: number; bid: number } | null {
  if (!reply?.from?.is_bot || typeof reply.text !== 'string') return null;
  const m = QIDIRUV_BELGISI.exec(reply.text);
  if (!m) return null;
  const n = [m[1], m[2], m[3]].map(Number);
  return n.every((x) => Number.isSafeInteger(x) && x > 0) ? { fid: n[0], oid: n[1], bid: n[2] } : null;
}

export async function fotoQidiruv(env: BotEnv, uid: number, til: TgTil, k: { fid: number; oid: number; bid: number }, matn: string): Promise<BotJavob> {
  if (limitOshdi('fotoq:' + uid, 15)) return { matn: tgT('Juda ko‘p so‘rov. Bir daqiqadan keyin urinib ko‘ring.', til) };
  const sozlar = qidiruvSozlari(matn);
  if (!sozlar.length) return { matn: tgT('Kamida bitta so‘z (2 ta harfdan) yozing.', til) };
  const r = await qatorQidir(env, uid, k.oid, sozlar, k.bid, SAHIFA);
  if (!r) return { matn: tgT(XATO_OQISH, til) };
  if (!r.length) return { matn: tgT('Bu bo‘limda mos qator topilmadi. Boshqa so‘z bilan shu xabarga qayta javob bering.', til) };
  return {
    matn: [tgT('Qatorni tanlang — rasm shu qatorga dalil bo‘lib biriktiriladi (fakt hajmi o‘zgarmaydi):', til), ...r.map((q, i) => `${i + 1}. ${qatorMatni(q)}`)].join('\n'),
    markup: { inline_keyboard: r.map((q, i) => [{ text: `${i + 1}. ${qatorMatni(q)}`.slice(0, 60), callback_data: `${FOTO_QATOR}${k.fid}:${k.oid}:${q.id}` }]) },
  };
}

/** Qator tanlandi → mavjud `foto-dalil` `yangila` (manba=qator; manba obyektga tegishliligi RPC da tekshiriladi). */
export async function fotoBiriktir(env: BotEnv, uid: number, til: TgTil, fid: number, oid: number, qid: number): Promise<{ matn: string; amal: string; oid?: number }> {
  const ob = await obyektOl(env, uid, oid);
  if (!ob) return { matn: tgT('Bu obyekt sizga ochiq emas.', til), amal: 'foto_obyekt' };
  const q = await sbOqi<XomQator>(env, uid, { jadval: 't2_qator', filtr: `id=eq.${qid}&obyekt_id=eq.${oid}`, ustunlar: 'id,kod,nom,birlik', limit: 1 });
  const x = q?.find((r) => r.id === qid);
  if (!x) return { matn: tgT(q ? 'Qator topilmadi.' : XATO_OQISH, til), amal: 'foto_qator_yoq' };
  const r = await botChaqiruv<{ ok?: boolean; code?: string }>(env, uid,
    { api: 'foto-dalil', json: { amal: 'yangila', kompaniya_id: ob.kompaniya_id, id: fid, manba_ozgar: true, manba_turi: 'qator', manba_id: qid } }, middleware, fotoDalilPost);
  if (r.status === 200 && r.body?.ok) {
    return { matn: tgT('Rasm «{qator}» qatoriga dalil sifatida biriktirildi. Fakt hajmi o‘zgarmadi.', til, { qator: qatorMatni({ kod: bosh(x.kod, 24), nom: bosh(x.nom, 100), birlik: '' }) }), amal: 'foto_biriktirildi', oid };
  }
  return { matn: tgT(r.body?.code === 'TOPILMADI' ? 'Rasm topilmadi (olib tashlangan bo‘lishi mumkin).' : 'Biriktirib bo‘lmadi (ruxsat yo‘q yoki server xatosi). Mini App da urinib ko‘ring.', til), amal: 'foto_biriktirish_xato' };
}

/* ═════════ 3) /fakt <obyekt#> <matn> — qoralama taklifi ═════════ */
const FAKT_MAX_MATN = 500;
/** Hajm — faqat oddiy son (vergul yoki nuqta); ifoda/matn rad. Natija 3 xonagacha. */
export function hajmSon(v: string | null | undefined): number | null {
  const s = String(v ?? '').replace(/\s+/g, '').replace(',', '.');
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 1000) / 1000;
  return n > 0 && n < 1e9 ? n : null;
}

/** `/fakt 79 beton 12,5 m3` → { oid: 79, matn }. `#79` ham mumkin. */
export function faktArgument(arg: string): { oid: number; matn: string } | null {
  const m = /^#?(\d{1,12})\s+([\s\S]+)$/.exec(arg.trim());
  return m && Number(m[1]) > 0 ? { oid: Number(m[1]), matn: m[2].trim() } : null;
}

type Niyat = { tavsif: string; birlik: string | null; hajm: string | null };

export async function faktTaklif(env: BotEnv, uid: number, til: TgTil, arg: string): Promise<BotJavob> {
  const p = faktArgument(arg);
  if (!p) return { matn: tgT('Format: /fakt <obyekt#> <nima va qancha>. Masalan: /fakt 79 beton quyildi 12,5 m3', til) };
  if (p.matn.length > FAKT_MAX_MATN) return { matn: tgT('Matn juda uzun (500 belgigacha).', til) };
  if (limitOshdi('fakt:' + uid, 5)) return { matn: tgT('Juda ko‘p so‘rov. Bir daqiqadan keyin urinib ko‘ring.', til) };
  const ob = await obyektOl(env, uid, p.oid);
  if (!ob) return { matn: tgT('Bu raqamli obyekt sizga ochiq emas.', til) };
  // AI: mavjud smeta-ai `f2_niyat` (fast tier; matnni ishga/hajmga ajratadi). aiHisobli: limit, hamyon, token yechish — shu yerda; model faqat matnni ajratadi,
  // qatorni topish va hajm tekshiruvi KOD bilan.
  const a = await botChaqiruv<{ ok?: boolean; niyatlar?: Niyat[]; code?: string; message?: string }>(env, uid,
    { api: 'smeta-ai', json: { amal: 'f2_niyat', kompaniya_id: ob.kompaniya_id, matn: p.matn } }, middleware, smetaAiPost);
  if (a.status === 402) return { matn: bosh(a.body?.message, 300) || tgT('AI limiti tugagan yoki belgilanmagan.', til) };
  if ([401, 403].includes(a.status)) return { matn: tgT('Bu amal uchun ruxsatingiz yo‘q.', til) };
  if (a.status !== 200 || !a.body?.ok) return { matn: tgT('AI hozir javob bera olmadi. Birozdan keyin urinib ko‘ring.', til) };
  const niyat = (a.body.niyatlar ?? [])[0];
  if (!niyat) return { matn: tgT('Matndan ish va hajm ajratib bo‘lmadi. Aniqroq yozing: /fakt <obyekt#> <nima va qancha>', til) };
  const hajm = hajmSon(niyat.hajm);
  if (hajm == null) return { matn: tgT('Hajm aniqlanmadi (oddiy son kerak). Masalan: /fakt {oid} {tavsif} 12,5', til, { oid: p.oid, tavsif: bosh(niyat.tavsif, 60) }) };
  let sozlar = qidiruvSozlari(niyat.tavsif);
  let n = await qatorQidir(env, uid, p.oid, sozlar, null, 4);
  if (n && !n.length && sozlar.length > 1) { sozlar = sozlar.slice(0, 1); n = await qatorQidir(env, uid, p.oid, sozlar, null, 4); }
  if (!n) return { matn: tgT(XATO_OQISH, til) };
  if (!n.length) return { matn: tgT('Obyektda mos smeta qatori topilmadi: «{tavsif}». Boshqacha yozib ko‘ring yoki Mini App da kiriting.', til, { tavsif: bosh(niyat.tavsif, 80) }), markup: { inline_keyboard: [[miniAppYoliTugma(env, til, `/admin/fakt?obyekt=${p.oid}`, 'Fakt')]] } };
  const milli = Math.round(hajm * 1000);
  const birlik = bosh(niyat.birlik, 12);
  return {
    matn: [tgT('Fakt QORALAMASI (tasdiqlanmagan) — ko‘rib chiqing:', til), tgT('Obyekt: {v}', til, { v: ob.nom }),
      tgT('Ish: {v}', til, { v: bosh(niyat.tavsif, 100) }), tgT('Hajm: {v}', til, { v: String(hajm).replace('.', ',') + (birlik ? ' ' + birlik : '') }),
      tgT('Smeta qatori (tanlang):', til), ...n.map((q, i) => `${i + 1}. ${qatorMatni(q)}`),
      tgT('«Saqlash» faqat qoralama yozadi; PTO/prorab tasdiqlaydi.', til)].join('\n'),
    markup: { inline_keyboard: [
      ...n.map((q, i) => [{ text: `${tgT('Saqlash', til)} · ${i + 1}. ${qatorMatni(q)}`.slice(0, 60), callback_data: `${FAKT_SAQLA}${p.oid}:${q.id}:${milli}` }]),
      [{ text: tgT('Bekor', til), callback_data: FAKT_BEKOR }],
    ] },
  };
}

/** Bugun (Toshkent, UTC+5) YYYY-MM-DD. */
export const bugunToshkent = (hozir = Date.now()) => new Date(hozir + 5 * 3600_000).toISOString().slice(0, 10);

/** Deterministik UUID (v5 shakli): bir xabardagi takroriy bosish ikkinchi qoralama yaratmasin. */
async function opId(manba: string): Promise<string> {
  const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(manba)))].slice(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** «Saqlash»: mavjud web yo'li (`sb-yoz` usta_fakt_qoralama_v1) — FAQAT qoralama. Tasdiqlash/jurnalga o'tkazish yo'q. */
export async function faktSaqla(env: BotEnv, uid: number, til: TgTil, cb: Callback, oid: number, qid: number, milli: number): Promise<{ matn: string; amal: string; oid?: number }> {
  if (!(milli > 0) || milli >= 1e12) return { matn: tgT('Tugma eskirgan.', til), amal: 'fakt_notogri' };
  const ob = await obyektOl(env, uid, oid);
  if (!ob) return { matn: tgT('Bu obyekt sizga ochiq emas.', til), amal: 'fakt_obyekt' };
  const q = await sbOqi<XomQator>(env, uid, { jadval: 't2_qator', filtr: `id=eq.${qid}&obyekt_id=eq.${oid}`, ustunlar: 'id,kod,nom,birlik', limit: 1 });
  const x = q?.find((r) => r.id === qid);
  if (!x) return { matn: tgT(q ? 'Qator topilmadi.' : XATO_OQISH, til), amal: 'fakt_qator_yoq' };
  const hajm = milli / 1000;
  const r = await botChaqiruv<{ ok?: boolean; code?: string; qator_soni?: number }>(env, uid, { api: 'sb-yoz', json: {
    amal: 'usta_fakt_qoralama_v1', kompaniya_id: ob.kompaniya_id, obyekt_id: oid, sana: bugunToshkent(), qatorlar: [{ qator_id: qid, hajm }],
    izoh: 'Telegram /fakt', operation_id: await opId(`tgfakt:${uid}:${cb.message?.message_id ?? 0}:${oid}:${qid}:${milli}`) } }, middleware, sbYozPost);
  if (r.status === 200 && r.body?.ok) {
    return { matn: tgT('Fakt qoralamasi saqlandi: {qator} — {hajm}. Tasdiqlanmagan; PTO/prorab Mini App da tasdiqlaydi.', til,
      { qator: qatorMatni({ kod: bosh(x.kod, 24), nom: bosh(x.nom, 100), birlik: bosh(x.birlik, 12) }), hajm: String(hajm).replace('.', ',') }), amal: 'fakt_saqlandi', oid };
  }
  const SANA = r.body?.code === 'SANA_NOTOGRI';
  return { matn: tgT(SANA ? 'Sana yaroqsiz (qoralama faqat oxirgi 31 kun uchun).' : 'Qoralama saqlanmadi (ruxsat yo‘q yoki server xatosi). Mini App da kiriting.', til), amal: 'fakt_xato' };
}

/* ═════════ 4) Menyu tugmasi: oxirgi obyektda ochiladi ═════════ */
/** Mini App menyu tugmasi (shu chat uchun) `/admin/fakt?obyekt=<id>` ga o'rnatiladi. `oid` berilmasa — joriy tugma obyektli bo'lsa tegilmaydi,
 *  aks holda foydalanuvchining eng so'nggi yangilangan faol obyekti olinadi (alohida holat saqlanmaydi: Telegram tugmani chat bo'yicha o'zi saqlaydi). */
export async function menyuTugmasi(env: BotEnv, uid: number, til: TgTil, chatId: number, oid?: number): Promise<boolean> {
  try {
    let id = oid;
    if (!id) {
      const joriy = await tgApi<{ type?: string; web_app?: { url?: string } }>(env, 'getChatMenuButton', { chat_id: chatId });
      if (joriy.ok && /[?&]to=[^&]*obyekt%3D\d+/.test(joriy.result?.web_app?.url ?? '')) return false;
      id = (await obyektlarOl(env, uid, 1))?.[0]?.id;
    }
    if (!id) return false;
    const r = await tgApi(env, 'setChatMenuButton', { chat_id: chatId, menu_button: { type: 'web_app', text: tgT('Tizim', til), web_app: { url: tgChuqurHavola(miniAppUrl(env), `/admin/fakt?obyekt=${id}`) } } });
    return r.ok;
  } catch { return false; }
}

/* ═════════ callback yo'naltirgich ═════════ */
export async function callbackIshlaV2(env: BotEnv, uid: number, til: TgTil, cb: Callback, chatId?: number): Promise<CbNatija> {
  const d = String(cb.data ?? '').slice(0, 64);
  const so = zanjirIdOl(d, TASDIQ_SO_ROV);
  if (so) return tasdiqSorovi(env, uid, til, so);
  if (zanjirIdOl(d, TASDIQ_YOQ)) return { toast: tgT('Bekor qilindi', til), amal: 'tasdiq_bekor', tugmalarniOlibTashla: true };
  if (d.startsWith(TASDIQ_HA)) {
    const ha = zanjirHaOl(d);
    // Qadam belgisiz (eski) «Ha» — tasdiqlanmaydi: yangi so'rov kerak.
    if (!ha) return { toast: tgT('Eskirgan tugma', til), amal: 'tasdiq_eskirgan', tugmalarniOlibTashla: true,
      xabar: { matn: tgT('Bu tugma eskirgan. Hech narsa tasdiqlanmadi — yangi «Tasdiqlash» tugmasini bosing.', til) } };
    return tasdiqBajar(env, uid, til, ha.id, ha.belgi);
  }
  const fb = sonlarOl(d, FOTO_BOLIMLAR, 2, 3);
  if (fb) return { toast: '', amal: 'foto_bolimlar', xabar: await fotoBolimlar(env, uid, til, fb[0], fb[1], fb[2] ?? 0) };
  const fd = sonlarOl(d, FOTO_BOLIM, 3, 3);
  if (fd) return { toast: '', amal: 'foto_bolim', xabar: await fotoBolimTanlandi(env, uid, til, fd[0], fd[1], fd[2]) };
  const fq = sonlarOl(d, FOTO_QATOR, 3, 3);
  if (fq) {
    const r = await fotoBiriktir(env, uid, til, fq[0], fq[1], fq[2]);
    if (r.oid && chatId) await menyuTugmasi(env, uid, til, chatId, r.oid);
    return { toast: tgT(r.amal === 'foto_biriktirildi' ? 'Biriktirildi' : 'Bajarilmadi', til), amal: r.amal, tugmalarniOlibTashla: true,
      xabar: { matn: r.matn, ...(r.amal === 'foto_biriktirildi' ? { markup: { inline_keyboard: [[miniAppYoliTugma(env, til, '/admin/foto', 'Foto-dalil')]] } } : {}) } };
  }
  const fs = sonlarOl(d, FAKT_SAQLA, 3, 3);
  if (fs) {
    const r = await faktSaqla(env, uid, til, cb, fs[0], fs[1], fs[2]);
    if (r.oid && chatId) await menyuTugmasi(env, uid, til, chatId, r.oid);
    return { toast: tgT(r.amal === 'fakt_saqlandi' ? 'Qoralama saqlandi' : 'Bajarilmadi', til), amal: r.amal, tugmalarniOlibTashla: true,
      xabar: { matn: r.matn, ...(r.amal === 'fakt_saqlandi' ? { markup: { inline_keyboard: [[miniAppYoliTugma(env, til, `/admin/fakt?obyekt=${r.oid}`, 'Fakt')]] } } : {}) } };
  }
  if (d === FAKT_BEKOR) return { toast: tgT('Bekor qilindi', til), amal: 'fakt_bekor', tugmalarniOlibTashla: true };
  return callbackIshla(env, uid, til, cb);
}
