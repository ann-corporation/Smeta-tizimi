/**
 * telegram-toliq-fakt.ts — botda: FAKT kiritish va F-2 (ro'yxat / xulosa / qoralama qatorini tahrirlash).
 *
 * YOZISH QOIDASI (egasi): hech narsa preview + «Tasdiqlash» siz yozilmaydi. Hammasi MAVJUD yagona nuqta `/api/f2-buyruq` orqali
 * (fakt_yoz → t2_fakt_yoz_v2, f2_qoralama_tahrir → t2_f2_qoralama_yangila_v1): 1) vosita serverda dry_run + ROLLBACK qiladi va imzolangan
 * tasdiq tokenini beradi; 2) «Tasdiqlash» (g:ok) tokenni aktor+kompaniya+obyektga bog'liq tekshirib yozadi (15 daqiqa, qayta bosish takror yozmaydi,
 * preview dan keyin ma'lumot o'zgargan bo'lsa 409). Token xabar matnining oxirida (`#JF:…`) — callback_data ga sig'maydi, serverda saqlanmaydi.
 * Bot yangi yozish yo'li YARATMAYDI; hisob (QQS bilan / ustamali / ustamasiz) serverdan.
 */
import { type TgTil, miniAppYoliTugma, tgT } from './telegram';
import { botChaqiruv } from './telegram-amal';
import { type BotJavob, type Callback, limitOshdi } from './telegram-bot';
import { bugunToshkent, hajmSon, obyektOl, pulMatni, qatorMatni, qidiruvSozlari, qatorQidir, sbOqi } from './telegram-bot-oqim';
import { type BotEnv, type CbNatija, XATO_OQISH, bosh, musbat, orqaQatori, soraydi, xatoMatni, yol } from './telegram-toliq-yadro';
import { tokenTekshir } from './f2-buyruq-yadro';
import { f2XatoMatni } from '../../src/lib/yordamchi/vosita/f2-mcp-liniya';
import type { F2Javob, F2Preview, F2Uchlik } from '../../src/lib/jarvis/f2-javob';
import { onRequest as middleware } from '../api/_middleware';
import { onRequestPost as f2Post } from '../api/f2-buyruq';

const MARKER = /\n#JF:([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

async function vosita(env: BotEnv, uid: number, kid: number, nom: string, args: Record<string, unknown>) {
  return botChaqiruv<F2Javob>(env, uid, { api: 'f2-buyruq', json: { amal: 'vosita', kompaniya_id: kid, nom, args } }, middleware, f2Post);
}

/* ═════════ FAKT: qator qidirish → hajm → preview → Tasdiqlash ═════════ */
export const faktQidiruviSorovi = (til: TgTil, oid: number): BotJavob =>
  soraydi(til, tgT('Qaysi ish? Smeta qatori nomidan so‘z yozing — shu xabarga javob bering (masalan: beton, armatura).', til), `[gq:${oid}]`, 'so‘z yozing…');

export async function faktQatorlari(env: BotEnv, uid: number, til: TgTil, oid: number, matn: string): Promise<BotJavob> {
  if (limitOshdi('gq:' + uid, 15)) return { matn: xatoMatni(til, 429) };
  const sozlar = qidiruvSozlari(matn);
  if (!sozlar.length) return { matn: tgT('Kamida bitta so‘z (2 ta harfdan) yozing.', til) };
  const r = await qatorQidir(env, uid, oid, sozlar, null, 8);
  if (!r) return { matn: tgT(XATO_OQISH, til) };
  if (!r.length) { const s = faktQidiruviSorovi(til, oid); return { ...s, matn: tgT('Mos smeta qatori topilmadi. Boshqa so‘z yozing.', til) + '\n' + s.matn }; }
  return {
    matn: [yol(til, tgT('Obyektlar', til), `#${oid}`, tgT('Fakt kiritish', til)), tgT('Qatorni tanlang:', til), ...r.map((q, i) => `${i + 1}. ${qatorMatni(q)}`)].join('\n'),
    markup: { inline_keyboard: [...r.map((q, i) => [{ text: `${i + 1}. ${qatorMatni(q)}`.slice(0, 60), callback_data: `g:r:${oid}:${q.id}` }]), orqaQatori(til, `g:k:${oid}`)] },
  };
}

export async function faktHajmSorovi(env: BotEnv, uid: number, til: TgTil, oid: number, qid: number): Promise<BotJavob> {
  const q = await sbOqi<{ id?: number; kod?: string | null; nom?: string | null; birlik?: string | null }>(env, uid,
    { jadval: 't2_qator', filtr: `id=eq.${qid}&obyekt_id=eq.${oid}`, ustunlar: 'id,kod,nom,birlik', limit: 1 });
  const x = q?.find((r) => r.id === qid);
  if (!x) return { matn: tgT(q ? 'Qator topilmadi.' : XATO_OQISH, til) };
  return soraydi(til, [tgT('Qator: {v}', til, { v: qatorMatni({ kod: bosh(x.kod, 24), nom: bosh(x.nom, 100), birlik: bosh(x.birlik, 12) }) }),
    tgT('Bugungi bajarilgan hajmni yozing — shu xabarga javob bering (masalan: 12,5). Kamaytirish uchun minus.', til)].join('\n'), `[gh:${oid}:${qid}]`, 'hajm…');
}

const sonMatni = (n: unknown) => (n == null || !Number.isFinite(Number(n)) ? '—' : String(Math.round(Number(n) * 1e6) / 1e6).replace('.', ','));
const uchlikQatori = (til: TgTil, nom: string, u: F2Uchlik | null | undefined) =>
  u ? `${nom}: ${tgT('QQS bilan', til)} ${pulMatni(u.qqs_bilan)} · ${tgT('ustamali', til)} ${pulMatni(u.ustamali)} · ${tgT('ustamasiz', til)} ${pulMatni(u.ustamasiz)}` : `${nom}: —`;

/** Server preview → oddiy matn (Markdown YO'Q) + tasdiq tugmalari. Token xabar oxirida. */
export function previewJavobi(til: TgTil, sarlavha: string, j: F2Javob): BotJavob {
  const p = j.preview as F2Preview | undefined;
  const satrlar = [sarlavha, ...(j.tavsif ? [bosh(j.tavsif, 160)] : [])];
  for (const r of (p?.qatorlar ?? []).slice(0, 8)) {
    const nom = bosh(`${r.kod ?? '#' + r.qator_id} ${r.nom ?? ''}`, 60);
    satrlar.push(r.olib_tashlandi ? `• ${nom}: ${tgT('olib tashlanadi', til)}` : `• ${nom}: ${r.ozgarish.map((o) => `${o.maydon} ${sonMatni(o.oldin)} → ${sonMatni(o.keyin)}`).join('; ') || tgT('o‘zgarmaydi', til)}`);
  }
  if ((p?.qatorlar.length ?? 0) > 8) satrlar.push(tgT('… yana {n} qator', til, { n: (p?.qatorlar.length ?? 0) - 8 }));
  if (p?.jami) satrlar.push(uchlikQatori(til, tgT('Oldin', til), p.jami.oldin), uchlikQatori(til, tgT('Keyin', til), p.jami.keyin), uchlikQatori(til, tgT('Farq', til), p.jami.farq));
  for (const o of (j.ogohlantirish ?? []).slice(0, 3)) satrlar.push('! ' + bosh(o, 160));
  satrlar.push(tgT('«Tasdiqlash» bosilmaguncha hech narsa yozilmaydi. Yozish tokenlardan yechadi; qayta bosish takror yechmaydi.', til));
  const marker = '\n#JF:' + String(j.token);
  if (marker.length > 700) return { matn: tgT('Taklif juda katta. Uni Mini App da bajaring.', til) };
  return {
    matn: satrlar.join('\n').slice(0, 3900 - marker.length) + marker,
    markup: { inline_keyboard: [[{ text: tgT('Tasdiqlash', til), callback_data: 'g:ok' }, { text: tgT('Bekor', til), callback_data: 'g:no' }]] },
  };
}

function taklifNatijasi(til: TgTil, sarlavha: string, r: { status: number; body: F2Javob | null }): BotJavob {
  const b = r.body;
  if (r.status === 200 && b?.ok && b.holat === 'tasdiq_kerak' && typeof b.token === 'string') return previewJavobi(til, sarlavha, b);
  if (r.status === 200 && b?.holat === 'rad') return { matn: [sarlavha, tgT('Server rad etdi: {v}', til, { v: bosh(b.xabar, 200) || '—' })].join('\n') };
  if (b && (b.code || b.xabar)) return { matn: f2XatoMatni(b) };
  return { matn: xatoMatni(til, r.status) };
}

export async function faktPreview(env: BotEnv, uid: number, til: TgTil, oid: number, qid: number, matn: string): Promise<BotJavob> {
  const hajm = hajmSon(matn.replace(/^-/, ''));
  if (hajm == null) return { matn: tgT('Hajm tushunilmadi (oddiy son kerak, masalan 12,5). Qaytadan urinib ko‘ring.', til) };
  if (limitOshdi('gfakt:' + uid, 8)) return { matn: xatoMatni(til, 429) };
  const ob = await obyektOl(env, uid, oid);
  if (!ob) return { matn: tgT('Bu obyekt sizga ochiq emas.', til) };
  const r = await vosita(env, uid, ob.kompaniya_id, 'fakt_yoz', { obyekt_id: oid, sana: bugunToshkent(), qatorlar: [{ qator_id: qid, hajm: matn.trim().startsWith('-') ? -hajm : hajm }], izoh: 'Telegram' });
  return taklifNatijasi(til, yol(til, tgT('Obyektlar', til), `#${oid} ${ob.nom}`, tgT('Fakt kiritish', til)), r);
}

/* ═════════ F-2 ═════════ */
type Akt = { id?: number; raqam?: string | null; oy?: string | null; sana?: string | null; holat?: string | null; lifecycle_status?: string | null; hujjat_jami?: number | string | null };
const oyKaliti = (ym: number) => `${Math.floor(ym / 100)}-${String(ym % 100).padStart(2, '0')}`;
const oyNav = (ym: number, d: number) => { const y = Math.floor(ym / 100), m = (ym % 100) - 1 + d; return (y + Math.floor(m / 12)) * 100 + (((m % 12) + 12) % 12) + 1; };
const qoralamami = (a: Akt) => a.lifecycle_status === 'draft' || a.holat === 'qoralama';

export async function f2Royxati(env: BotEnv, uid: number, til: TgTil, oid: number, ymKirish: number | null): Promise<BotJavob> {
  const ob = await obyektOl(env, uid, oid);
  if (!ob) return { matn: tgT('Bu obyekt sizga ochiq emas.', til) };
  const ym = ymKirish && ymKirish > 200001 ? ymKirish : Number(bugunToshkent().slice(0, 7).replace('-', ''));
  const r = await vosita(env, uid, ob.kompaniya_id, 'f2_royxat', { obyekt_id: oid, tur: 'f2', limit: 100 });
  const aktlar = (r.body as { aktlar?: Akt[] } | null)?.aktlar;
  if (r.status !== 200 || !r.body?.ok || !Array.isArray(aktlar)) return { matn: r.body?.code ? f2XatoMatni(r.body) : xatoMatni(til, r.status), markup: { inline_keyboard: [orqaQatori(til, `g:k:${oid}`)] } };
  const oy = oyKaliti(ym);
  const shu = aktlar.filter((a) => musbat(a.id) && String(a.oy ?? a.sana ?? '').slice(0, 7) === oy);
  const nav = [{ text: '‹ ' + oyKaliti(oyNav(ym, -1)), callback_data: `g:f:${oid}:${oyNav(ym, -1)}` }, { text: oy, callback_data: `g:f:${oid}:${ym}` }, { text: oyKaliti(oyNav(ym, 1)) + ' ›', callback_data: `g:f:${oid}:${oyNav(ym, 1)}` }];
  return {
    matn: [yol(til, tgT('Obyektlar', til), `#${oid} ${ob.nom}`, 'F-2', oy),
      ...(shu.length ? shu.map((a) => `• № ${bosh(a.raqam, 20) || '—'} · ${bosh(a.lifecycle_status ?? a.holat, 20) || '—'} · ${tgT('Hujjat jami', til)} ${pulMatni(a.hujjat_jami)}`) : [tgT('Bu oyda F-2 yo‘q.', til)]),
      tgT('Har obyekt uchun oyiga bitta F-2.', til)].join('\n'),
    markup: { inline_keyboard: [...shu.slice(0, 8).map((a) => [{ text: `№ ${bosh(a.raqam, 14) || a.id} · ${bosh(a.lifecycle_status ?? a.holat, 12)}`.slice(0, 60), callback_data: `g:a:${oid}:${a.id}` }]), nav, orqaQatori(til, `g:k:${oid}`)] },
  };
}

type AktJavob = { ok?: boolean; code?: string; akt?: Akt & { obyekt_id?: number }; summa?: F2Uchlik | null; qatorlar?: { qator_id?: number; hajm?: number | null; summa?: number | null; kod?: string | null; nom?: string | null; birlik?: string | null }[]; keyingi_offset?: number | null };

/** F-2 akt xulosasi: sarlavha, jami (QQS bilan / ustamali / ustamasiz), eng katta qatorlar; qoralamada — qatorni tahrirlash tugmalari. */
export async function f2AktXulosasi(env: BotEnv, uid: number, til: TgTil, oid: number, aktId: number): Promise<BotJavob> {
  const ob = await obyektOl(env, uid, oid);
  if (!ob) return { matn: tgT('Bu obyekt sizga ochiq emas.', til) };
  const r = await vosita(env, uid, ob.kompaniya_id, 'f2', { akt_id: aktId, limit: 300 });
  const b = r.body as AktJavob | null;
  if (r.status !== 200 || !b?.ok || !b.akt || b.akt.obyekt_id !== oid) return { matn: b?.code ? f2XatoMatni(b as F2Javob) : xatoMatni(til, r.status === 200 ? 404 : r.status), markup: { inline_keyboard: [orqaQatori(til, `g:f:${oid}`)] } };
  const qator = (b.qatorlar ?? []).filter((x) => musbat(x.qator_id)).sort((p, q) => Math.abs(Number(q.summa ?? 0)) - Math.abs(Number(p.summa ?? 0))).slice(0, 6);
  const tahrir = qoralamami(b.akt);
  return {
    matn: [yol(til, tgT('Obyektlar', til), `#${oid} ${ob.nom}`, `F-2 № ${bosh(b.akt.raqam, 20) || '—'}`),
      `${tgT('Holat', til)}: ${bosh(b.akt.lifecycle_status ?? b.akt.holat, 20) || '—'} · ${bosh(b.akt.oy, 10) || '—'}`,
      uchlikQatori(til, tgT('Jami', til), b.summa), ...(b.summa?.narxsiz_soni ? [tgT('Narxsiz qator: {n}', til, { n: b.summa.narxsiz_soni })] : []),
      tgT('Qatorlar: {n}{ko}', til, { n: (b.qatorlar ?? []).length, ko: b.keyingi_offset != null ? '+' : '' }),
      ...qator.map((x, i) => `${i + 1}. ${bosh(`${x.kod ?? ''} ${x.nom ?? ''}`, 50)} — ${sonMatni(x.hajm)} ${bosh(x.birlik, 8)} · ${pulMatni(x.summa)}`),
      ...(tahrir ? [tgT('Qoralama: qatorni tanlab hajmini o‘zgartirish mumkin (preview + Tasdiqlash).', til)] : [tgT('Bu F-2 muzlagan (qoralama emas) — tahrirlanmaydi.', til)])].join('\n'),
    markup: { inline_keyboard: [
      ...(tahrir ? qator.map((x, i) => [{ text: `${tgT('Tahrir', til)} ${i + 1}`, callback_data: `g:l:${oid}:${aktId}:${x.qator_id}` }]) : []),
      [{ text: tgT('Bo‘limlar', til), callback_data: `g:b:${oid}:0` }, miniAppYoliTugma(env, til, `/admin/f2-tarix?obyekt=${oid}`, 'Mini App da ochish')],
      orqaQatori(til, `g:f:${oid}`),
    ] },
  };
}

export const f2HajmSorovi = (til: TgTil, oid: number, aktId: number, qid: number): BotJavob =>
  soraydi(til, tgT('Qatorning yangi (jami) hajmini yozing — shu xabarga javob bering. Yozishdan oldin preview ko‘rsatiladi.', til), `[ge:${oid}:${aktId}:${qid}]`, 'yangi hajm…');

export async function f2TahrirPreview(env: BotEnv, uid: number, til: TgTil, oid: number, aktId: number, qid: number, matn: string): Promise<BotJavob> {
  const hajm = hajmSon(matn);
  if (hajm == null) return { matn: tgT('Hajm tushunilmadi (oddiy son kerak, masalan 12,5). Qaytadan urinib ko‘ring.', til) };
  if (limitOshdi('gf2:' + uid, 8)) return { matn: xatoMatni(til, 429) };
  const ob = await obyektOl(env, uid, oid);
  if (!ob) return { matn: tgT('Bu obyekt sizga ochiq emas.', til) };
  const r = await vosita(env, uid, ob.kompaniya_id, 'f2_qoralama_tahrir', { akt_id: aktId, ozgartir: [{ qator_id: qid, hajm }] });
  return taklifNatijasi(til, yol(til, tgT('Obyektlar', til), `#${oid} ${ob.nom}`, `F-2 #${aktId}`, tgT('Tahrir', til)), r);
}

/* ═════════ Tasdiqlash / Bekor (ikkala oqim uchun umumiy) ═════════ */
export async function yozuvTasdiqi(env: BotEnv, uid: number, til: TgTil, cb: Callback): Promise<CbNatija> {
  const rad = (amal: string, matn: string): CbNatija => ({ toast: tgT('Bajarilmadi', til), amal, tugmalarniOlibTashla: true, xabar: { matn } });
  const token = MARKER.exec(cb.message?.text ?? '')?.[1];
  if (!token) return rad('yozuv_token_yoq', tgT('Tasdiq tugmasi eskirgan. Qaytadan boshlang.', til));
  const y = await tokenTekshir(String(env.SESSIYA_KALIT ?? ''), token);
  if (y === 'muddati') return rad('yozuv_muddati', tgT('Tasdiq muddati o‘tdi (15 daqiqa). Hech narsa yozilmadi — qaytadan boshlang.', til));
  if (!y || y.a !== uid) return rad('yozuv_yaroqsiz', tgT('Tasdiq yaroqsiz. Hech narsa yozilmadi — qaytadan boshlang.', til));
  const r = await botChaqiruv<F2Javob>(env, uid, { api: 'f2-buyruq', json: { amal: 'tasdiq', kompaniya_id: y.k, token, tasdiqlayman: true } }, middleware, f2Post);
  if (r.status === 200 && r.body?.ok) {
    return { toast: tgT('Yozildi', til), amal: 'yozuv_ok', tugmalarniOlibTashla: true, xabar: {
      matn: tgT('Yozildi.', til) + (r.body.bepul_takror ? ' ' + tgT('(takror bosish — token yechilmadi)', til) : ''),
      markup: { inline_keyboard: [[{ text: tgT('Obyekt kartasi', til), callback_data: `g:k:${y.o}` }]] } } };
  }
  return rad('yozuv_xato', r.body && (r.body.code || r.body.xabar) ? f2XatoMatni(r.body) : xatoMatni(til, r.status));
}

export const yozuvBekori = (til: TgTil): CbNatija => ({ toast: tgT('Bekor qilindi', til), amal: 'yozuv_bekor', tugmalarniOlibTashla: true, xabar: { matn: tgT('Bekor qilindi. Hech narsa yozilmadi.', til) } });
