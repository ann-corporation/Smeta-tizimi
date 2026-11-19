/**
 * telegram-toliq-obyekt.ts — botda: Obyektlar (sahifalash + qidiruv + kompaniya tanlash) → obyekt kartasi (smeta / fakt / F-2 summalari)
 * → bo'limlar (RZ) bo'yicha summalar. Faqat O'QISH. Summalar serverdagi yagona yadrodan (`/api/obyekt-tugun-summa`: QQS bilan → ustamali
 * (QQS siz) → ustamasiz); null = noma'lum («—», 0 emas). Hisob botda YO'Q.
 */
import { type TgTil, miniAppYoliTugma, tgT } from './telegram';
import { botChaqiruv } from './telegram-amal';
import { type BotJavob } from './telegram-bot';
import { obyektOl, pulMatni, qidiruvSozlari, sbOqi } from './telegram-bot-oqim';
import {
  type BotEnv, XATO_OQISH, bosh, musbat, navQatori, orqaQatori, rolOl, sahifala, soraydi, xatoMatni, yol,
} from './telegram-toliq-yadro';
import { onRequest as middleware } from '../api/_middleware';
import { onRequestGet as tugunGet } from '../api/obyekt-tugun-summa';

type Uch = (number | null)[];
type TugunJavob = { ok?: boolean; ustama?: 'bor' | 'yoq'; obyekt?: Uch[]; tugunlar?: [number, Uch, Uch, Uch][] };
const uchOl = (u: Uch | undefined) => [u?.[0] ?? null, u?.[1] ?? null, u?.[2] ?? null] as const;

/** `Smeta: QQS bilan 1 234 · ustamali 1 000 · ustamasiz 900` — null → «—». */
export function summaQatori(til: TgTil, nom: string, u: Uch | undefined, ustamaYoq = false): string {
  const [q, a, z] = uchOl(u);
  return `${nom}: ${tgT('QQS bilan', til)} ${pulMatni(q)} · ${tgT('ustamali', til)} ${ustamaYoq ? '—' : pulMatni(a)} · ${tgT('ustamasiz', til)} ${pulMatni(z)}`;
}

export async function obyektlarRoyxati(env: BotEnv, uid: number, til: TgTil, p: number, kid: number | null, qidiruv = ''): Promise<BotJavob> {
  const sozlar = qidiruv ? qidiruvSozlari(qidiruv, 3) : [];
  const filtr = ['holat=eq.faol', ...(kid ? [`kompaniya_id=eq.${kid}`] : []), ...sozlar.map((s) => `nom=ilike.*${s}*`)].join('&');
  const q = await sbOqi<{ id?: number; nom?: string; kompaniya_id?: number }>(env, uid, { jadval: 't2_obyekt', filtr, ustunlar: 'id,nom,kompaniya_id', tartib: 'yangilandi.desc', limit: 100 });
  if (!q) return { matn: tgT(XATO_OQISH, til) };
  const ro = q.filter((x) => musbat(x.id));
  const sarlavha = yol(til, tgT('Obyektlar', til), ...(sozlar.length ? [`«${sozlar.join(' ')}»`] : []));
  if (!ro.length) {
    return { matn: [sarlavha, tgT(sozlar.length ? 'Bunday obyekt topilmadi. Boshqa so‘z yozing.' : 'Sizga ochiq obyekt topilmadi.', til)].join('\n'),
      markup: { inline_keyboard: [[{ text: tgT('Obyekt qidirish', til), callback_data: 'g:s' }, { text: tgT('Menyu', til), callback_data: 'g:m' }]] } };
  }
  const { qism, sah, jami } = sahifala(ro, p);
  const kk = kid ? `:${kid}` : '';
  return {
    matn: [sarlavha, tgT('Obyektni tanlang ({n} ta):', til, { n: ro.length })].join('\n'),
    markup: { inline_keyboard: [
      ...qism.map((o) => [{ text: `#${o.id} ${bosh(o.nom, 40)}`.slice(0, 60), callback_data: `g:k:${o.id}` }]),
      ...(sozlar.length ? [] : navQatori(sah, jami, (n) => `g:o:${n}${kk}`)),
      [{ text: tgT('Obyekt qidirish', til), callback_data: 'g:s' + kk }, { text: tgT('Kompaniya', til), callback_data: 'g:c' }],
      [{ text: tgT('Menyu', til), callback_data: 'g:m' }],
    ] },
  };
}

/** Kompaniya tanlash (bir nechta a'zolik bo'lsa) — keyin obyektlar shu kompaniya bo'yicha. */
export async function kompaniyaTanlash(env: BotEnv, uid: number, til: TgTil): Promise<BotJavob> {
  const r = await rolOl(env, uid);
  if (!r) return { matn: tgT(XATO_OQISH, til) };
  if (!r.kompaniyalar.length) return { matn: tgT('Hali hech qaysi ish joyiga a’zo emassiz.', til) };
  return {
    matn: [yol(til, tgT('Kompaniya', til)), tgT('Kompaniyani tanlang:', til)].join('\n'),
    markup: { inline_keyboard: [
      ...r.kompaniyalar.slice(0, 10).map((k) => [{ text: k.nom.slice(0, 60), callback_data: `g:o:0:${k.id}` }]),
      [{ text: tgT('Hammasi', til), callback_data: 'g:o:0' }, { text: tgT('Menyu', til), callback_data: 'g:m' }],
    ] },
  };
}

export const obyektQidiruviSorovi = (til: TgTil, kid: number | null): BotJavob =>
  soraydi(til, tgT('Obyekt nomidan so‘z yozing — shu xabarga javob bering (masalan: bog‘, maktab).', til), `[gs:${kid ?? 0}]`, 'so‘z yozing…');

export async function obyektKarta(env: BotEnv, uid: number, til: TgTil, oid: number): Promise<BotJavob & { obyektId?: number }> {
  const ob = await obyektOl(env, uid, oid);
  if (!ob) return { matn: tgT('Bu obyekt sizga ochiq emas.', til) };
  const [s, rol] = await Promise.all([
    botChaqiruv<TugunJavob>(env, uid, { api: 'obyekt-tugun-summa', method: 'GET', query: { obyekt_id: oid } }, middleware, tugunGet), rolOl(env, uid)]);
  const satrlar = s.status === 200 && s.body?.ok && s.body.obyekt
    ? [summaQatori(til, tgT('Smeta', til), s.body.obyekt[0], s.body.ustama === 'yoq'), summaQatori(til, tgT('Fakt', til), s.body.obyekt[1], s.body.ustama === 'yoq'),
      summaQatori(til, 'F-2', s.body.obyekt[2], s.body.ustama === 'yoq'), ...(s.body.ustama === 'yoq' ? [tgT('Ustama manbasi topilmadi — ustamali summa ko‘rsatilmadi (0 emas).', til)] : [])]
    : [xatoMatni(til, s.status === 200 ? 500 : s.status)];
  const b = (kalit: string, data: string) => ({ text: tgT(kalit, til), callback_data: data });
  return {
    obyektId: oid,
    matn: [yol(til, tgT('Obyektlar', til), `#${oid} ${ob.nom}`), ...satrlar, tgT('Summalar so‘mda; birlik narxi QQS siz.', til)].join('\n'),
    markup: { inline_keyboard: [
      [...(rol?.ijro ? [b('Fakt kiritish', `g:y:${oid}`)] : []), b('F-2', `g:f:${oid}`)],
      [b('Bo‘limlar', `g:b:${oid}:0`), b('Hujjatlar', `g:h:${oid}`), b('Fakt jurnali', `g:j:${oid}:0:0`)],
      [miniAppYoliTugma(env, til, `/admin/obyektlar?obyekt=${oid}`, 'Mini App da ochish')],
      orqaQatori(til, 'g:o:0'),
    ] },
  };
}

/** Bo'limlar (RZ) bo'yicha smeta / fakt / F-2 (ustamasiz; tugun summasi serverdan). */
export async function bolimlarJavobi(env: BotEnv, uid: number, til: TgTil, oid: number, p: number): Promise<BotJavob> {
  const ob = await obyektOl(env, uid, oid);
  if (!ob) return { matn: tgT('Bu obyekt sizga ochiq emas.', til) };
  const [s, rz] = await Promise.all([
    botChaqiruv<TugunJavob>(env, uid, { api: 'obyekt-tugun-summa', method: 'GET', query: { obyekt_id: oid } }, middleware, tugunGet),
    sbOqi<{ id?: number; kod?: string | null; nom?: string | null }>(env, uid, { jadval: 't2_qator', filtr: `obyekt_id=eq.${oid}&tur=eq.rz&versiya_holat=eq.faol`, ustunlar: 'id,kod,nom', tartib: 'tartib.asc,id.asc', limit: 200 })]);
  if (s.status !== 200 || !s.body?.ok || !rz) return { matn: xatoMatni(til, s.status === 200 ? 500 : s.status), markup: { inline_keyboard: [orqaQatori(til, `g:k:${oid}`)] } };
  const tugun = new Map((s.body.tugunlar ?? []).map((t) => [Number(t[0]), t] as const));
  const ro = rz.filter((x) => musbat(x.id));
  const { qism, sah, jami } = sahifala(ro, p, 5);
  const satr = (x: { id?: number; kod?: string | null; nom?: string | null }) => {
    const t = tugun.get(x.id as number);
    return [`• ${[bosh(x.kod, 10), bosh(x.nom, 40)].filter(Boolean).join(' ')}`,
      `  ${tgT('Smeta', til)} ${pulMatni(t?.[1]?.[2])} · ${tgT('Fakt', til)} ${pulMatni(t?.[2]?.[2])} · F-2 ${pulMatni(t?.[3]?.[2])}`].join('\n');
  };
  return {
    matn: [yol(til, tgT('Obyektlar', til), `#${oid} ${ob.nom}`, tgT('Bo‘limlar', til)), tgT('Ustamasiz summalar (so‘m):', til), ...(qism.length ? qism.map(satr) : [tgT('Bu obyektda bo‘limlar topilmadi.', til)])].join('\n'),
    markup: { inline_keyboard: [...navQatori(sah, jami, (n) => `g:b:${oid}:${n}`), orqaQatori(til, `g:k:${oid}`)] },
  };
}

