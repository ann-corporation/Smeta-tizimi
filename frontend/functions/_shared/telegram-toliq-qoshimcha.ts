/**
 * telegram-toliq-qoshimcha.ts — @qur_uz_bot «to'liq bot» PR 2 (docs/ops/TELEGRAM_BOT_QAMROV.md §2b): fakt jurnali, F-2 lifecycle amallari,
 * bildirishnoma «o'qildi», token balansi, xat/murojaat, topshiriqlar.
 *
 * YANGI YOZISH YO'LI YO'Q: hammasi mavjud shlyuzlar (`botChaqiruv` → middleware → shlyuz; veb bilan bir xil ruxsat/hisob/step-up):
 *   fakt jurnali — `/api/f2-buyruq` (`fakt_jurnal`, o'qish) · lifecycle — `/api/sb-yoz` `akt_lifecycle_transition_v1` · o'qildi/xat — `/api/hujjat-aylanish`
 *   · token — `/api/sb` `token_holat_v1` · topshiriq — `/api/topshiriq`.
 * Har yozish: 1) so'rov ekrani (hech narsa yozilmaydi) 2) tasdiq tugmasi (versiya callback da; server holatni qayta o'qiydi, eskirgan bo'lsa yozilmaydi).
 * Erkin matn (rad sababi, xat javobi) callback_data ga sig'maydi → bot xabari oxiridagi belgi (`#SB:` / `#TX:`); xabarni faqat bot yozadi.
 * Takroriy bosish: operation_id xabar+amalga deterministik → server idempotent. Matn/summa/chat_id loglanmaydi.
 */
import { type TgTil, miniAppYoliTugma, tgT } from './telegram';
import { botChaqiruv } from './telegram-amal';
import { type BotJavob, type Callback, limitOshdi } from './telegram-bot';
import { obyektOl, opId, pulMatni, sbOqi } from './telegram-bot-oqim';
import { type BotEnv, type CbNatija, XATO_OQISH, bosh, musbat, navQatori, orqaQatori, rolOl, sahifala, soraydi, xatoMatni, yol } from './telegram-toliq-yadro';
import { bildirishnomalarRoyxati } from './telegram-toliq-hujjat';
import { f2KeyingiQadam, f2LifecycleError } from '../../src/lib/f2-lifecycle-workflow';
import type { PtoLifecycleStatus } from '../../src/api/t2-akt-lifecycle';
import { onRequest as middleware } from '../api/_middleware';
import { onRequestGet as aylanishGet, onRequestPost as aylanishPost } from '../api/hujjat-aylanish';
import { onRequestPost as f2Post } from '../api/f2-buyruq';
import { onRequestPost as sbPost } from '../api/sb';
import { onRequestPost as sbYozPost } from '../api/sb-yoz';
import { onRequestGet as topGet, onRequestPost as topPost } from '../api/topshiriq';

/* ───────── umumiy ───────── */
export const oyKaliti = (ym: number) => `${Math.floor(ym / 100)}-${String(ym % 100).padStart(2, '0')}`;
export const oyNav = (ym: number, d: number) => { const y = Math.floor(ym / 100), m = (ym % 100) - 1 + d; return (y + Math.floor(m / 12)) * 100 + (((m % 12) + 12) % 12) + 1; };
const sonMatni = (n: unknown) => (n == null || !Number.isFinite(Number(n)) ? '—' : String(Math.round(Number(n) * 1e6) / 1e6).replace('.', ','));
/** Shlyuz javobi `{ok, ...}` yoki `{ok, natija}` bo'lishi mumkin (hujjat-aylanish) — ikkalasini ham bir xil o'qiydi. */
const ichki = <T>(b: unknown): T | null => { const o = b as { natija?: unknown } | null; return (o && typeof o === 'object' ? (o.natija ?? o) : null) as T | null; };
const rad = (til: TgTil, amal: string, matn: string, markup?: BotJavob['markup']): CbNatija => ({ toast: tgT('Bajarilmadi', til), amal, tugmalarniOlibTashla: true, xabar: { matn, markup } });
const bekorTugma = (til: TgTil) => ({ text: tgT('Bekor', til), callback_data: 'g:no' });
/** Bot xabari oxiridagi erkin matn belgisi (`#SB:` sabab, `#TX:` xat matni). */
const belgidanOl = (cb: Callback, b: 'SB' | 'TX') => new RegExp(`\\n#${b}:([^\\n]{3,1500})$`).exec(cb.message?.text ?? '')?.[1] ?? null;
async function kompaniyalar(env: BotEnv, uid: number) { return (await rolOl(env, uid))?.kompaniyalar.slice(0, 10) ?? null; }

/* ═════════ 1) FAKT JURNALI: obyekt → oy → sahifa → yozuv tafsiloti (o'qish) ═════════ */
type Yozuv = { id?: number; qator_id?: number; hajm?: number | null; summa?: number | null; izoh?: string | null; yaratildi?: string; akt_raqam?: string | null; sana?: string | null };
async function jurnalOl(env: BotEnv, uid: number, kid: number, oid: number, ym: number) {
  const oy = oyKaliti(ym), oxirgi = new Date(Date.UTC(Math.floor(ym / 100), ym % 100, 0)).getUTCDate();
  const r = await botChaqiruv<{ ok?: boolean; yozuvlar?: Yozuv[]; yana_bor?: boolean }>(env, uid, { api: 'f2-buyruq', json: { amal: 'vosita', kompaniya_id: kid, nom: 'fakt_jurnal',
    args: { obyekt_id: oid, sana_dan: `${oy}-01`, sana_gacha: `${oy}-${String(oxirgi).padStart(2, '0')}`, limit: 200 } } }, middleware, f2Post);
  return r.status === 200 && r.body?.ok && Array.isArray(r.body.yozuvlar) ? { yozuvlar: r.body.yozuvlar.filter((y) => musbat(y.id)), kop: !!r.body.yana_bor } : r.status;
}
const joriyOy = () => Number(new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7).replace('-', ''));
const oyToga = (ym: number | null) => (ym && ym > 200001 && ym < 999912 ? ym : joriyOy());

export async function faktJurnali(env: BotEnv, uid: number, til: TgTil, oid: number, ymKirish: number | null, p: number): Promise<BotJavob> {
  const ob = await obyektOl(env, uid, oid);
  if (!ob) return { matn: tgT('Bu obyekt sizga ochiq emas.', til) };
  const ym = oyToga(ymKirish), orqa = orqaQatori(til, `g:k:${oid}`);
  const j = await jurnalOl(env, uid, ob.kompaniya_id, oid, ym);
  if (typeof j === 'number') return { matn: xatoMatni(til, j), markup: { inline_keyboard: [orqa] } };
  const { qism, sah, jami } = sahifala(j.yozuvlar, p, 5);
  const oyQatori = [{ text: '‹ ' + oyKaliti(oyNav(ym, -1)), callback_data: `g:j:${oid}:${oyNav(ym, -1)}:0` }, { text: oyKaliti(ym), callback_data: `g:j:${oid}:${ym}:0` }, { text: oyKaliti(oyNav(ym, 1)) + ' ›', callback_data: `g:j:${oid}:${oyNav(ym, 1)}:0` }];
  return {
    matn: [yol(til, tgT('Obyektlar', til), `#${oid} ${ob.nom}`, tgT('Fakt jurnali', til), oyKaliti(ym)),
      ...(qism.length ? [tgT('Yozuvlar: {n}{ko}', til, { n: j.yozuvlar.length, ko: j.kop ? '+' : '' }), ...qism.map((y) => `• ${bosh(y.sana, 10) || '—'} · № ${bosh(y.akt_raqam, 16) || '—'} · ${sonMatni(y.hajm)}`)] : [tgT('Bu oyda fakt yozuvi yo‘q.', til)])].join('\n'),
    markup: { inline_keyboard: [...qism.map((y) => [{ text: `${bosh(y.sana, 10)} · ${sonMatni(y.hajm)}`.slice(0, 40), callback_data: `g:jd:${oid}:${y.id}:${ym}:${sah}` }]), ...navQatori(sah, jami, (n) => `g:j:${oid}:${ym}:${n}`), oyQatori, orqa] },
  };
}

export async function faktYozuvi(env: BotEnv, uid: number, til: TgTil, oid: number, yid: number, ym: number, p: number): Promise<BotJavob> {
  const ob = await obyektOl(env, uid, oid);
  if (!ob) return { matn: tgT('Bu obyekt sizga ochiq emas.', til) };
  const orqa = { inline_keyboard: [orqaQatori(til, `g:j:${oid}:${ym}:${p}`)] };
  const j = await jurnalOl(env, uid, ob.kompaniya_id, oid, oyToga(ym));
  if (typeof j === 'number') return { matn: xatoMatni(til, j), markup: orqa };
  const y = j.yozuvlar.find((x) => x.id === yid);
  if (!y) return { matn: tgT('Yozuv topilmadi.', til), markup: orqa };
  const q = musbat(y.qator_id) ? await sbOqi<{ id?: number; kod?: string | null; nom?: string | null; birlik?: string | null }>(env, uid, { jadval: 't2_qator', filtr: `id=eq.${y.qator_id}&obyekt_id=eq.${oid}`, ustunlar: 'id,kod,nom,birlik', limit: 1 }) : null;
  const x = q?.[0];
  return {
    matn: [yol(til, tgT('Obyektlar', til), `#${oid} ${ob.nom}`, tgT('Fakt jurnali', til), `#${yid}`),
      `${tgT('Qator', til)}: ${bosh(`${x?.kod ?? ''} ${x?.nom ?? '#' + y.qator_id}`, 120)}`,
      `${tgT('Sana', til)}: ${bosh(y.sana, 10) || '—'} · № ${bosh(y.akt_raqam, 20) || '—'}`,
      `${tgT('Hajm (delta)', til)}: ${sonMatni(y.hajm)} ${bosh(x?.birlik, 10)}`,
      `${tgT('Summa (QQS siz)', til)}: ${pulMatni(y.summa ?? null)}`,
      ...(y.izoh ? [`${tgT('Izoh', til)}: ${bosh(y.izoh, 160)}`] : [])].join('\n'),
    markup: orqa,
  };
}

/* ═════════ 2) F-2 LIFECYCLE: tasdiqqa yuborish / tekshirildi / tasdiqlash / rad (sabab bilan) ═════════ */
const LC = { 1: 'submitted', 2: 'checked', 3: 'approved', 4: 'rejected' } as const;
const LC_NOM = { 1: 'Tekshiruvga yuborish', 2: 'Tekshirildi', 3: 'Tasdiqlash', 4: 'Rad etish' } as const;
type LcKod = keyof typeof LC;
const lcKod = (n: number): LcKod | null => (n === 1 || n === 2 || n === 3 || n === 4 ? n : null);
/** Holatdan keyingi mumkin bo'lgan bitta qadam (+ «tekshirilgan» da rad). Haqiqiy ruxsat/SoD — bazada. */
const lcMumkin = (holat: string): LcKod[] => {
  const q = f2KeyingiQadam(holat as PtoLifecycleStatus);
  return [...(q ? [({ submitted: 1, checked: 2, approved: 3 } as const)[q]] : []), ...(holat === 'checked' ? [4 as const] : [])];
};
/** F-2 xulosa ekraniga: holatga mos lifecycle tugmalari (bitta qator). */
export function lifecycleTugmalari(til: TgTil, oid: number, aktId: number, holat: string | null | undefined): Record<string, unknown>[][] {
  const q = lcMumkin(String(holat ?? '')).map((k) => ({ text: tgT(LC_NOM[k], til), callback_data: `g:lq:${oid}:${aktId}:${k}` }));
  return q.length ? [q] : [];
}

type AktHolat = { id?: number; obyekt_id?: number; raqam?: string | null; lifecycle_status?: string | null; versiya?: number | null };
async function aktHolatiOl(env: BotEnv, uid: number, kid: number, oid: number, aktId: number): Promise<AktHolat | number> {
  const r = await botChaqiruv<{ ok?: boolean; akt?: AktHolat }>(env, uid, { api: 'f2-buyruq', json: { amal: 'vosita', kompaniya_id: kid, nom: 'f2', args: { akt_id: aktId, limit: 1 } } }, middleware, f2Post);
  return r.status === 200 && r.body?.ok && r.body.akt?.id === aktId && r.body.akt.obyekt_id === oid ? r.body.akt : r.status === 200 ? 404 : r.status;
}
const lcTasdiqEkrani = (til: TgTil, oid: number, a: AktHolat, k: LcKod, sabab: string | null): BotJavob => ({
  matn: [yol(til, tgT('Obyektlar', til), `#${oid}`, `F-2 № ${bosh(a.raqam, 20) || a.id}`, tgT(LC_NOM[k], til)),
    tgT('F-2 holati: {a} → {b}', til, { a: bosh(a.lifecycle_status, 20), b: LC[k] }), ...(sabab ? [tgT('Sabab: {v}', til, { v: sabab })] : []),
    tgT('Bu amal hujjat holatini o‘zgartiradi (rol/ketma-ketlik qoidalari serverda tekshiriladi). Davom etasizmi?', til)].join('\n') + (sabab ? '\n#SB:' + sabab : ''),
  markup: { inline_keyboard: [[{ text: tgT(LC_NOM[k], til), callback_data: `g:lo:${oid}:${a.id}:${k}:${a.versiya ?? 0}` }, bekorTugma(til)]] },
});

/** «Tekshiruvga yuborish / Tekshirildi / Tasdiqlash / Rad» bosildi → holatni o'qib, tasdiq ekrani (yoki rad sababi so'rovi). Hech narsa yozilmaydi. */
export async function lifecycleSorovi(env: BotEnv, uid: number, til: TgTil, oid: number, aktId: number, kodRaw: number): Promise<BotJavob> {
  const k = lcKod(kodRaw);
  const ob = await obyektOl(env, uid, oid);
  if (!k || !ob) return { matn: tgT(k ? 'Bu obyekt sizga ochiq emas.' : 'Tugma eskirgan.', til) };
  const a = await aktHolatiOl(env, uid, ob.kompaniya_id, oid, aktId);
  const orqa = { inline_keyboard: [orqaQatori(til, `g:a:${oid}:${aktId}`)] };
  if (typeof a === 'number') return { matn: xatoMatni(til, a), markup: orqa };
  if (!lcMumkin(String(a.lifecycle_status ?? '')).includes(k)) return { matn: f2LifecycleError('INVALID_LIFECYCLE_TRANSITION'), markup: orqa };
  return k === 4 ? soraydi(til, tgT('Rad etish sababini yozing — shu xabarga javob bering.', til), `[gz:${oid}:${aktId}]`, 'sabab…') : lcTasdiqEkrani(til, oid, a, k, null);
}

/** Rad sababi yozildi (force_reply) → tasdiq ekrani (sabab xabar oxirida). */
export async function lifecycleRadPreview(env: BotEnv, uid: number, til: TgTil, oid: number, aktId: number, matn: string): Promise<BotJavob> {
  const sabab = bosh(matn, 300);
  if (sabab.length < 3) return { matn: tgT('Sabab kamida 3 belgi bo‘lsin. Qaytadan urinib ko‘ring.', til) };
  const ob = await obyektOl(env, uid, oid);
  if (!ob) return { matn: tgT('Bu obyekt sizga ochiq emas.', til) };
  const a = await aktHolatiOl(env, uid, ob.kompaniya_id, oid, aktId);
  if (typeof a === 'number') return { matn: xatoMatni(til, a) };
  return lcMumkin(String(a.lifecycle_status ?? '')).includes(4) ? lcTasdiqEkrani(til, oid, a, 4, sabab) : { matn: f2LifecycleError('INVALID_LIFECYCLE_TRANSITION') };
}

/** Tasdiq tugmasi (`g:lo`): versiya callback dan (eskirgan bo'lsa server 409 STALE_VERSION); operation_id deterministik. */
export async function lifecycleBajar(env: BotEnv, uid: number, til: TgTil, cb: Callback, oid: number, aktId: number, kodRaw: number, ver: number): Promise<CbNatija> {
  const k = lcKod(kodRaw);
  if (!k) return rad(til, 'lc_notogri', tgT('Tugma eskirgan.', til));
  const sabab = k === 4 ? belgidanOl(cb, 'SB') : null;
  if (k === 4 && !sabab) return rad(til, 'lc_sabab_yoq', tgT('Tasdiq tugmasi eskirgan. Qaytadan boshlang.', til));
  if (limitOshdi('glc:' + uid, 6)) return rad(til, 'lc_limit', xatoMatni(til, 429));
  const ob = await obyektOl(env, uid, oid);
  if (!ob) return rad(til, 'lc_obyekt', tgT('Bu obyekt sizga ochiq emas.', til));
  const a = await aktHolatiOl(env, uid, ob.kompaniya_id, oid, aktId);   // akt shu obyektniki ekani (tenant) + holat qayta o'qiladi
  if (typeof a === 'number') return rad(til, 'lc_akt', xatoMatni(til, a));
  const r = await botChaqiruv<{ ok?: boolean; code?: string }>(env, uid, { api: 'sb-yoz', json: {
    amal: 'akt_lifecycle_transition_v1', kompaniya_id: ob.kompaniya_id, akt_id: aktId, to_status: LC[k], kutilgan_versiya: ver, sabab,
    operation_id: await opId(`tglc:${uid}:${cb.message?.message_id ?? 0}:${aktId}:${k}:${ver}`) } }, middleware, sbYozPost);
  if (r.status === 200 && r.body?.ok) {
    return { toast: tgT('Bajarildi', til), amal: 'lc_ok', tugmalarniOlibTashla: true, xabar: { matn: tgT('F-2 holati yangilandi: {v}', til, { v: LC[k] }), markup: { inline_keyboard: [orqaQatori(til, `g:a:${oid}:${aktId}`)] } } };
  }
  if (r.body?.code === 'STEP_UP_KERAK') {
    return rad(til, 'lc_step_up', tgT('Bu amal PIN yoki biometrik talab qiladi. Hech narsa o‘zgarmadi — Mini App da bajaring.', til), { inline_keyboard: [[miniAppYoliTugma(env, til, `/admin/f2-tarix?obyekt=${oid}`, 'Mini App da ochish')]] });
  }
  return rad(til, 'lc_xato', r.body?.code ? f2LifecycleError(r.body.code) : xatoMatni(til, r.status), { inline_keyboard: [orqaQatori(til, `g:a:${oid}:${aktId}`)] });
}

/* ═════════ 3) BILDIRISHNOMA «O'QILDI» ═════════ */
/** `id` = bitta bildirishnoma; null = hamma o'qilmaganlar. Keyin ro'yxat yangilanadi. */
export async function bildirishnomaOqildi(env: BotEnv, uid: number, til: TgTil, id: number | null, p: number): Promise<CbNatija> {
  let idlar: number[] = id ? [id] : [];
  if (!id) {
    const l = await botChaqiruv<{ ok?: boolean; qatorlar?: { id?: number }[] }>(env, uid, { api: 'hujjat-aylanish', method: 'GET', query: { bolim: 'bildirishnomalar', oqilmagan: 1, limit: 200 } }, middleware, aylanishGet);
    if (l.status !== 200 || !Array.isArray(l.body?.qatorlar)) return rad(til, 'bild_oqish_xato', xatoMatni(til, l.status));
    idlar = l.body.qatorlar.map((x) => x.id).filter(musbat);
  }
  if (idlar.length) {
    const r = await botChaqiruv<{ ok?: boolean }>(env, uid, { api: 'hujjat-aylanish', json: { amal: 'bildirishnoma_oqildi', idlar } }, middleware, aylanishPost);
    if (r.status !== 200 || !r.body?.ok) return rad(til, 'bild_xato', xatoMatni(til, r.status === 200 ? 500 : r.status));
  }
  return { toast: tgT('O‘qildi deb belgilandi', til), amal: 'bild_oqildi', tugmalarniOlibTashla: true, xabar: await bildirishnomalarRoyxati(env, uid, til, p) };
}

/* ═════════ 4) TOKEN BALANSI VA OXIRGI SARFLAR ═════════ */
type TokenHolat = { balans?: number; obuna?: { nom?: string; tugaydi?: string | null } | null; harakatlar?: { miqdor?: number; tur?: string; amal?: string | null; izoh?: string | null; yaratildi?: string }[] };
export async function tokenBalansi(env: BotEnv, uid: number, til: TgTil, kid: number | null): Promise<BotJavob> {
  const ks = await kompaniyalar(env, uid);
  const orqa = orqaQatori(til, 'g:m');
  if (!ks) return { matn: tgT(XATO_OQISH, til) };
  if (!ks.length) return { matn: tgT('Hali hech qaysi ish joyiga a’zo emassiz.', til), markup: { inline_keyboard: [orqa] } };
  if (!kid && ks.length > 1) return { matn: [yol(til, tgT('Tokenlar', til)), tgT('Ish joyini tanlang:', til)].join('\n'), markup: { inline_keyboard: [...ks.map((k) => [{ text: bosh(k.nom, 40), callback_data: `g:tk:${k.id}` }]), orqa] } };
  const k = kid ? ks.find((x) => x.id === kid) : ks[0];
  if (!k) return { matn: xatoMatni(til, 404), markup: { inline_keyboard: [orqa] } };
  const r = await botChaqiruv<{ ok?: boolean; natija?: TokenHolat }>(env, uid, { api: 'sb', json: { soro: 'token_holat_v1', kompaniya_id: k.id } }, middleware, sbPost);
  const h = r.status === 200 && r.body?.ok ? r.body.natija : null;
  if (!h) return { matn: xatoMatni(til, r.status === 200 ? 500 : r.status), markup: { inline_keyboard: [orqa] } };
  const sarf = (h.harakatlar ?? []).filter((x) => x.tur === 'sarf').slice(0, 5);
  return {
    matn: [yol(til, tgT('Tokenlar', til), bosh(k.nom, 40)), `${tgT('Balans', til)}: ${typeof h.balans === 'number' ? sonMatni(h.balans) : '—'}`,
      ...(h.obuna ? [`${tgT('Obuna', til)}: ${bosh(h.obuna.nom, 40)}${h.obuna.tugaydi ? ' · ' + bosh(h.obuna.tugaydi, 10) : ''}`] : []),
      ...(sarf.length ? [tgT('So‘nggi sarflar:', til), ...sarf.map((x) => `• ${bosh(x.yaratildi, 10)} — ${sonMatni(Math.abs(Number(x.miqdor)))} · ${bosh(x.amal ?? x.izoh, 40) || '—'}`)] : [tgT('Sarflar hali yo‘q.', til)])].join('\n'),
    markup: { inline_keyboard: [[miniAppYoliTugma(env, til, '/admin/tokenlar', 'Tokenlarni to‘ldirish')], ...(ks.length > 1 ? [[{ text: tgT('Ish joyini almashtirish', til), callback_data: 'g:tk' }]] : []), orqa] },
  };
}

/* ═════════ 5) XAT / MUROJAAT (kiruvchi quti: ro'yxat, ochish, qabul, javob) ═════════ */
type XatQ = { id?: number; turi?: string; mavzu?: string; holat?: string; sana?: string; raqam?: string; qarshi_nom?: string | null; kechikkan?: boolean };
type Murojaat = { id?: number; sarlavha?: string };
type XatT = { id?: number; turi?: string; mavzu?: string; holat?: string; sana?: string; matn?: string | null; kiruvchi?: boolean; qarshi_kompaniya_id?: number; yuboruvchi_nom?: string | null; chiquvchi_raqam?: string; kiruvchi_raqam?: string | null };

export async function xatlarRoyxati(env: BotEnv, uid: number, til: TgTil, p: number): Promise<BotJavob> {
  const ks = await kompaniyalar(env, uid);
  if (!ks) return { matn: tgT(XATO_OQISH, til) };
  const jav = await Promise.all(ks.map((k) => botChaqiruv<unknown>(env, uid, { api: 'hujjat-aylanish', method: 'GET', query: { bolim: 'kiruvchi', kompaniya_id: k.id } }, middleware, aylanishGet)));
  if (!jav.length || jav.every((j) => j.status !== 200)) return { matn: xatoMatni(til, jav[0]?.status ?? 404), markup: { inline_keyboard: [orqaQatori(til, 'g:m')] } };
  const xatlar = jav.flatMap((j, i) => (j.status === 200 ? ichki<{ xatlar?: XatQ[] }>(j.body)?.xatlar ?? [] : []).filter((x) => musbat(x.id)).map((x) => ({ ...x, kid: ks[i].id })));
  const murojaatSoni = jav.reduce((s, j) => s + (j.status === 200 ? (ichki<{ murojaatlar?: Murojaat[] }>(j.body)?.murojaatlar ?? []).length : 0), 0);
  const { qism, sah, jami } = sahifala(xatlar, p, 5);
  return {
    matn: [yol(til, tgT('Xatlar', til)), tgT('Kiruvchi xatlar: {n}', til, { n: xatlar.length }), ...(murojaatSoni ? [tgT('Murojaatlar: {n} (Mini App da ko‘rib javob bering)', til, { n: murojaatSoni })] : []),
      ...(qism.length ? qism.map((x) => `• № ${bosh(x.raqam, 16) || x.id} · ${bosh(x.holat, 14)} — ${bosh(x.mavzu, 60)}${x.kechikkan ? ' · ' + tgT('muddati o‘tgan', til) : ''}`) : [tgT('Kiruvchi xat yo‘q.', til)])].join('\n'),
    markup: { inline_keyboard: [...qism.map((x) => [{ text: `№ ${bosh(x.raqam, 12) || x.id} · ${bosh(x.mavzu, 36)}`.slice(0, 60), callback_data: `g:qo:${x.kid}:${x.id}` }]),
      ...(murojaatSoni ? [[miniAppYoliTugma(env, til, '/admin/murojaatlar', 'Murojaatlar')]] : []), ...navQatori(sah, jami, (n) => `g:q:${n}`), orqaQatori(til, 'g:m')] },
  };
}

async function xatOl(env: BotEnv, uid: number, kid: number, id: number): Promise<XatT | number> {
  const r = await botChaqiruv<unknown>(env, uid, { api: 'hujjat-aylanish', method: 'GET', query: { bolim: 'xat', kompaniya_id: kid, xat_id: id } }, middleware, aylanishGet);
  const x = r.status === 200 ? ichki<{ xat?: XatT }>(r.body)?.xat : null;
  return x && x.id === id ? x : r.status === 200 ? 404 : r.status;
}

export async function xatOchish(env: BotEnv, uid: number, til: TgTil, kid: number, id: number): Promise<BotJavob> {
  const x = await xatOl(env, uid, kid, id);
  const orqa = orqaQatori(til, 'g:q:0');
  if (typeof x === 'number') return { matn: xatoMatni(til, x), markup: { inline_keyboard: [orqa] } };
  const kiruvchi = !!x.kiruvchi;
  return {
    matn: [yol(til, tgT('Xatlar', til), `№ ${bosh(kiruvchi ? x.kiruvchi_raqam ?? x.chiquvchi_raqam : x.chiquvchi_raqam, 20) || id}`), bosh(x.mavzu, 160),
      `${tgT('Holat', til)}: ${bosh(x.holat, 20)} · ${bosh(x.sana, 10)}${x.yuboruvchi_nom ? ' · ' + bosh(x.yuboruvchi_nom, 40) : ''}`, bosh(x.matn, 1200) || tgT('Matn yo‘q.', til)].join('\n'),
    markup: { inline_keyboard: [...(kiruvchi ? [[...(x.holat === 'yuborilgan' ? [{ text: tgT('Qabul qildim', til), callback_data: `g:qa:${kid}:${id}` }] : []), { text: tgT('Javob yozish', til), callback_data: `g:qj:${kid}:${id}` }]] : []), orqa] },
  };
}

export const xatQabulSorovi = (til: TgTil, kid: number, id: number): BotJavob => ({
  matn: tgT('Xat № {id} ni qabul qilganingizni belgilaysizmi? (Jo‘natuvchi xabardor bo‘ladi.)', til, { id }),
  markup: { inline_keyboard: [[{ text: tgT('Qabul qildim', til), callback_data: `g:qk:${kid}:${id}` }, bekorTugma(til)]] },
});
export async function xatQabulBajar(env: BotEnv, uid: number, til: TgTil, kid: number, id: number): Promise<CbNatija> {
  if (limitOshdi('gxat:' + uid, 8)) return rad(til, 'xat_limit', xatoMatni(til, 429));
  const r = await botChaqiruv<{ ok?: boolean }>(env, uid, { api: 'hujjat-aylanish', json: { amal: 'xat_qabul', kompaniya_id: kid, xat_id: id } }, middleware, aylanishPost);
  return r.status === 200 && r.body?.ok
    ? { toast: tgT('Qabul qilindi', til), amal: 'xat_qabul_ok', tugmalarniOlibTashla: true, xabar: { matn: tgT('Xat qabul qilingan deb belgilandi.', til), markup: { inline_keyboard: [orqaQatori(til, 'g:q:0')] } } }
    : rad(til, 'xat_qabul_xato', xatoMatni(til, r.status === 200 ? 500 : r.status));
}

export const xatJavobSorovi = (til: TgTil, kid: number, id: number): BotJavob =>
  soraydi(til, tgT('Javob matnini yozing — shu xabarga javob bering. Yuborishdan oldin ko‘rsatiladi.', til), `[gy:${kid}:${id}]`, 'javob matni…');

export async function xatJavobPreview(env: BotEnv, uid: number, til: TgTil, kid: number, id: number, matn: string): Promise<BotJavob> {
  const t = bosh(matn, 1500);
  if (t.length < 3) return { matn: tgT('Javob kamida 3 belgi bo‘lsin. Qaytadan urinib ko‘ring.', til) };
  const x = await xatOl(env, uid, kid, id);
  if (typeof x === 'number') return { matn: xatoMatni(til, x) };
  return { matn: [tgT('Javob xati № {id} ga yuboriladi: {m}', til, { id, m: bosh(x.mavzu, 80) }), t, tgT('Yuborilgach qaytarib bo‘lmaydi. Davom etasizmi?', til)].join('\n') + '\n#TX:' + t,
    markup: { inline_keyboard: [[{ text: tgT('Yuborish', til), callback_data: `g:qy:${kid}:${id}` }, bekorTugma(til)]] } };
}
export async function xatJavobYubor(env: BotEnv, uid: number, til: TgTil, cb: Callback, kid: number, id: number): Promise<CbNatija> {
  const t = belgidanOl(cb, 'TX');
  if (!t) return rad(til, 'xat_tx_yoq', tgT('Tasdiq tugmasi eskirgan. Qaytadan boshlang.', til));
  if (limitOshdi('gxat:' + uid, 8)) return rad(til, 'xat_limit', xatoMatni(til, 429));
  const x = await xatOl(env, uid, kid, id);   // qarshi kompaniya serverdan (callback ga ishonilmaydi)
  if (typeof x === 'number') return rad(til, 'xat_ol_xato', xatoMatni(til, x));
  if (!x.kiruvchi || !musbat(x.qarshi_kompaniya_id)) return rad(til, 'xat_javob_mumkin_emas', tgT('Bu xatga botdan javob yozib bo‘lmaydi.', til));
  const r = await botChaqiruv<{ ok?: boolean }>(env, uid, { api: 'hujjat-aylanish', json: { amal: 'xat_yubor', kompaniya_id: kid, qabul_kompaniya_id: x.qarshi_kompaniya_id, turi: 'javob_xati',
    mavzu: bosh('Javob: ' + (x.mavzu ?? ''), 200), matn: t, ota_xat_id: id, operation_id: await opId(`tgxat:${uid}:${cb.message?.message_id ?? 0}:${id}`) } }, middleware, aylanishPost);
  return r.status === 200 && r.body?.ok
    ? { toast: tgT('Yuborildi', til), amal: 'xat_javob_ok', tugmalarniOlibTashla: true, xabar: { matn: tgT('Javob xati yuborildi.', til), markup: { inline_keyboard: [orqaQatori(til, 'g:q:0')] } } }
    : rad(til, 'xat_javob_xato', xatoMatni(til, r.status === 200 ? 500 : r.status));
}

/* ═════════ 6) TOPSHIRIQLAR (menga / mendan; holat o'zgartirish tasdiq bilan) ═════════ */
const HOLATLAR = ['berildi', 'qabul_qilindi', 'rad', 'bajarilmoqda', 'bajarildi', 'tasdiqlandi', 'qaytarildi', 'bekor'] as const;
const HOLAT_NOM: Record<string, string> = { berildi: 'Berildi', qabul_qilindi: 'Qabul qilindi', rad: 'Rad etildi', bajarilmoqda: 'Bajarilmoqda', bajarildi: 'Bajarildi (tasdiq kutilmoqda)', tasdiqlandi: 'Tasdiqlandi', qaytarildi: 'Qaytarildi', bekor: 'Bekor qilindi' };
const AMAL_NOM: Record<string, string> = { qabul_qilindi: 'Qabul qilish', rad: 'Rad etish', bajarilmoqda: 'Boshlash', bajarildi: 'Bajarildi', tasdiqlandi: 'Tasdiqlash', qaytarildi: 'Qaytarish', bekor: 'Bekor qilish' };
/** Tomon bo'yicha mumkin harakatlar — `src/api/t2-topshiriq.ts` `harakatlar` bilan bir xil (test shuni tekshiradi); haqiqiy ruxsat bazada. */
export function topshiriqHarakatlari(holat: string, y: 0 | 1): { holat: string; izohKerak?: boolean }[] {
  if (y === 0) {
    if (holat === 'berildi') return [{ holat: 'qabul_qilindi' }, { holat: 'rad', izohKerak: true }];
    if (holat === 'qabul_qilindi' || holat === 'qaytarildi') return [{ holat: 'bajarilmoqda' }];
    return holat === 'bajarilmoqda' ? [{ holat: 'bajarildi' }] : [];
  }
  if (holat === 'bajarildi') return [{ holat: 'tasdiqlandi' }, { holat: 'qaytarildi' }];
  return ['berildi', 'qabul_qilindi', 'bajarilmoqda', 'qaytarildi'].includes(holat) ? [{ holat: 'bekor' }] : [];
}
type Top = { id?: number; sarlavha?: string; holat?: string; muddat?: string | null; obyekt_nom?: string | null; beruvchi_nom?: string; oxirgi_izoh?: string | null; versiya?: number };
const yonStr = (y: 0 | 1) => (y === 0 ? 'menga' : 'mendan');
async function topshiriqlarOl(env: BotEnv, uid: number, kid: number, y: 0 | 1) {
  const r = await botChaqiruv<{ ok?: boolean; qatorlar?: Top[] }>(env, uid, { api: 'topshiriq', method: 'GET', query: { kompaniya_id: kid, yonalish: yonStr(y), limit: 100 } }, middleware, topGet);
  return r.status === 200 && r.body?.ok && Array.isArray(r.body.qatorlar) ? r.body.qatorlar.filter((t) => musbat(t.id)) : r.status === 200 ? 500 : r.status;
}

export async function topshiriqlarRoyxati(env: BotEnv, uid: number, til: TgTil, yRaw: number, p: number): Promise<BotJavob> {
  const y: 0 | 1 = yRaw === 1 ? 1 : 0;
  const ks = await kompaniyalar(env, uid);
  if (!ks) return { matn: tgT(XATO_OQISH, til) };
  const jav = await Promise.all(ks.map((k) => topshiriqlarOl(env, uid, k.id, y)));
  if (!jav.length || jav.every((j) => typeof j === 'number')) return { matn: xatoMatni(til, (jav[0] as number | undefined) ?? 404), markup: { inline_keyboard: [orqaQatori(til, 'g:m')] } };
  const ro = jav.flatMap((j, i) => (Array.isArray(j) ? j.map((t) => ({ ...t, kid: ks[i].id })) : [])).sort((a, b) => (b.id as number) - (a.id as number));
  const { qism, sah, jami } = sahifala(ro, p, 5);
  const tab = [{ text: (y === 0 ? '• ' : '') + tgT('Menga berilgan', til), callback_data: 'g:z:0:0' }, { text: (y === 1 ? '• ' : '') + tgT('Men bergan', til), callback_data: 'g:z:1:0' }];
  return {
    matn: [yol(til, tgT('Topshiriqlar', til), tgT(y === 0 ? 'Menga berilgan' : 'Men bergan', til)),
      ...(qism.length ? qism.map((t) => `• #${t.id} ${bosh(t.sarlavha, 60)} — ${tgT(HOLAT_NOM[t.holat ?? ''] ?? bosh(t.holat, 20), til)}${t.muddat ? ' · ' + bosh(t.muddat, 10) : ''}`) : [tgT('Topshiriq yo‘q.', til)])].join('\n'),
    markup: { inline_keyboard: [tab, ...qism.map((t) => [{ text: `#${t.id} ${bosh(t.sarlavha, 40)}`.slice(0, 60), callback_data: `g:zo:${t.kid}:${t.id}:${y}` }]), ...navQatori(sah, jami, (n) => `g:z:${y}:${n}`), orqaQatori(til, 'g:m')] },
  };
}

async function topshiriqOl(env: BotEnv, uid: number, kid: number, id: number, y: 0 | 1): Promise<Top | number> {
  const l = await topshiriqlarOl(env, uid, kid, y);
  return typeof l === 'number' ? l : l.find((t) => t.id === id) ?? 404;
}

export async function topshiriqOchish(env: BotEnv, uid: number, til: TgTil, kid: number, id: number, yRaw: number): Promise<BotJavob> {
  const y: 0 | 1 = yRaw === 1 ? 1 : 0;
  const t = await topshiriqOl(env, uid, kid, id, y);
  const orqa = orqaQatori(til, `g:z:${y}:0`);
  if (typeof t === 'number') return { matn: xatoMatni(til, t), markup: { inline_keyboard: [orqa] } };
  const amallar = topshiriqHarakatlari(String(t.holat), y);
  return {
    matn: [yol(til, tgT('Topshiriqlar', til), `#${id}`), bosh(t.sarlavha, 160), `${tgT('Holat', til)}: ${tgT(HOLAT_NOM[t.holat ?? ''] ?? bosh(t.holat, 20), til)}`,
      [t.obyekt_nom, t.beruvchi_nom, t.muddat].filter(Boolean).map((v) => bosh(v, 40)).join(' · '), ...(t.oxirgi_izoh ? [bosh(t.oxirgi_izoh, 200)] : [])].filter(Boolean).join('\n'),
    markup: { inline_keyboard: [...amallar.map((a) => [{ text: tgT(AMAL_NOM[a.holat], til), callback_data: `g:zs:${kid}:${id}:${y}:${HOLATLAR.indexOf(a.holat as (typeof HOLATLAR)[number])}` }]), orqa] },
  };
}

const topTasdiq = (til: TgTil, kid: number, id: number, y: 0 | 1, h: number, t: Top, sabab: string | null): BotJavob => ({
  matn: [tgT('Topshiriq #{id}: {a} → {b}', til, { id, a: tgT(HOLAT_NOM[t.holat ?? ''] ?? bosh(t.holat, 20), til), b: tgT(HOLAT_NOM[HOLATLAR[h]], til) }), bosh(t.sarlavha, 120), ...(sabab ? [tgT('Sabab: {v}', til, { v: sabab })] : []),
    tgT('Davom etasizmi?', til)].join('\n') + (sabab ? '\n#SB:' + sabab : ''),
  markup: { inline_keyboard: [[{ text: tgT(AMAL_NOM[HOLATLAR[h]], til), callback_data: `g:zk:${kid}:${id}:${y}:${h}:${t.versiya ?? 0}` }, bekorTugma(til)]] },
});

/** Holat tugmasi bosildi → tasdiq ekrani (rad uchun avval sabab so'raladi). Hech narsa yozilmaydi. */
export async function topshiriqSorovi(env: BotEnv, uid: number, til: TgTil, kid: number, id: number, yRaw: number, h: number): Promise<BotJavob> {
  const y: 0 | 1 = yRaw === 1 ? 1 : 0;
  const t = await topshiriqOl(env, uid, kid, id, y);
  if (typeof t === 'number') return { matn: xatoMatni(til, t) };
  const a = topshiriqHarakatlari(String(t.holat), y).find((x) => x.holat === HOLATLAR[h]);
  if (!a) return { matn: tgT('Bu holatdan bu amalni bajarib bo‘lmaydi.', til) };
  return a.izohKerak ? soraydi(til, tgT('Rad etish sababini yozing — shu xabarga javob bering.', til), `[gv:${kid}:${id}:${h}]`, 'sabab…') : topTasdiq(til, kid, id, y, h, t, null);
}
export async function topshiriqRadPreview(env: BotEnv, uid: number, til: TgTil, kid: number, id: number, h: number, matn: string): Promise<BotJavob> {
  const sabab = bosh(matn, 300);
  if (sabab.length < 3) return { matn: tgT('Sabab kamida 3 belgi bo‘lsin. Qaytadan urinib ko‘ring.', til) };
  const t = await topshiriqOl(env, uid, kid, id, 0);   // rad etish — faqat ijrochi («menga»)
  if (typeof t === 'number') return { matn: xatoMatni(til, t) };
  return topshiriqHarakatlari(String(t.holat), 0).some((x) => x.holat === HOLATLAR[h] && x.izohKerak) ? topTasdiq(til, kid, id, 0, h, t, sabab) : { matn: tgT('Bu holatdan bu amalni bajarib bo‘lmaydi.', til) };
}

export async function topshiriqBajar(env: BotEnv, uid: number, til: TgTil, cb: Callback, kid: number, id: number, yRaw: number, h: number, ver: number): Promise<CbNatija> {
  const y: 0 | 1 = yRaw === 1 ? 1 : 0;
  const holat = HOLATLAR[h];
  if (!holat || !(ver > 0)) return rad(til, 'top_notogri', tgT('Tugma eskirgan.', til));
  if (limitOshdi('gtop:' + uid, 8)) return rad(til, 'top_limit', xatoMatni(til, 429));
  const t = await topshiriqOl(env, uid, kid, id, y);
  if (typeof t === 'number') return rad(til, 'top_ol_xato', xatoMatni(til, t));
  const a = topshiriqHarakatlari(String(t.holat), y).find((x) => x.holat === holat);
  if (!a || t.versiya !== ver) return rad(til, 'top_eskirgan', xatoMatni(til, 409));
  const izoh = a.izohKerak ? belgidanOl(cb, 'SB') : null;
  if (a.izohKerak && !izoh) return rad(til, 'top_sabab_yoq', tgT('Tasdiq tugmasi eskirgan. Qaytadan boshlang.', til));
  const r = await botChaqiruv<{ ok?: boolean; code?: string }>(env, uid, { api: 'topshiriq', json: { amal: 'otish', kompaniya_id: kid, topshiriq_id: id, kutilgan_versiya: ver, holat, izoh,
    operation_id: await opId(`tgtop:${uid}:${cb.message?.message_id ?? 0}:${id}:${h}:${ver}`) } }, middleware, topPost);
  if (r.status === 200 && r.body?.ok) return { toast: tgT('Bajarildi', til), amal: 'top_ok', tugmalarniOlibTashla: true, xabar: { matn: tgT('Topshiriq holati yangilandi: {v}', til, { v: tgT(HOLAT_NOM[holat], til) }), markup: { inline_keyboard: [orqaQatori(til, `g:z:${y}:0`)] } } };
  const code = r.body?.code;
  return rad(til, 'top_xato', xatoMatni(til, ['VERSIYA_ESKI', 'OTISH_MUMKIN_EMAS'].includes(String(code)) ? 409 : ['RUXSAT_YOQ', 'IJROCHI_EMAS'].includes(String(code)) ? 403 : r.status === 200 ? 500 : r.status));
}
