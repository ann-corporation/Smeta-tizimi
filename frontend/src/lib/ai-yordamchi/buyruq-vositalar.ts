/**
 * Ctrl+K «AI buyruq satri» vositalari (sof funksiyalar — test qilinadi). Yangi AI dvigatel EMAS: fakt oynasi vositalari
 * (`fakt-vositalar`: qidir, holat, amal tekshiruvi) qayta ishlatiladi, ustiga ikki yangi o'qish buyrug'i: `narxsiz`, `qoldiq`.
 *
 * Yozuv — faqat mavjud yo'llar (`sbFaktYoz` → fakt_yoz_v2, `narxProtokolYarat` → narx_protokol_yarat), har biri operation_id
 * bilan (idempotent: bir xil taklif to'plami qayta yuborilsa ikkinchi hujjat yaratilmaydi). Pul/huquqiy ta'sirli amal
 * (`PUL_TURLARI`) — panelda ikkinchi aniq «Tasdiqlayman» talab qilinadi; ovoz hech qachon tasdiqlamaydi.
 */
import type { T2Qator, T2QatorHolat } from '../../api/supabase';
import { bolimSummalari, jurnalQur, type JurnalHolat } from '../fakt-jurnal';
import { qidiruvTayyorla } from '../qidiruv-normalizatsiya';
import { bosKatKesim, katKesimgaQosh, type KatKesim } from '../ustamali-summa';
import { qoldiqHajmi } from '../zamena-qoldiq';
import { t } from '../../i18n/til';
import type { NaryadQisqa } from '../naryad';
import { naryadMatni } from '../naryad/jarvis';
import { lugatTushuntir, odamNomi } from '../qurilish-lugat';
import { faktAmalTekshir, faktHajmOqi, faktHolat, faktIndeks, faktKontekst, faktQidir, qatorSatri, summalarBloki, type FaktMalumot, type UstamaliFn } from './fakt-vositalar';
import type { OqishSorovi, SahifaAmal } from './protokol';
import type { SahifaVositalar } from './sikl';

export type BuyruqMalumot = FaktMalumot & { rows: readonly T2Qator[]; qatorById: ReadonlyMap<number, T2Qator>; naryadlar?: readonly NaryadQisqa[] };

export function buyruqMalumotQur(rows: readonly T2Qator[], states: readonly (T2QatorHolat | JurnalHolat)[], opts: { obyektNomi?: string; ustamali?: UstamaliFn; naryadlar?: readonly NaryadQisqa[] } = {}): BuyruqMalumot {
  const holatlar = states as readonly JurnalHolat[];
  const { bolimlar, bolimIshlari } = jurnalQur(rows, holatlar);
  return { obyektNomi: opts.obyektNomi, bolimlar, bolimIshlari, holatMap: new Map(holatlar.map((s) => [s.qator_id, s])), summalar: bolimSummalari(rows, holatlar),
    bajHajm: new Map(), ustamali: opts.ustamali, rows, qatorById: new Map(rows.map((r) => [r.id, r])), naryadlar: opts.naryadlar };
}

/** Pul yoki huquqiy ta'sirli amallar — «Bajarish»dan keyin ALOHIDA «Tasdiqlayman» kerak (ovoz bilan tasdiqlanmaydi). */
export const PUL_TURLARI: ReadonlySet<string> = new Set(['narx_tuzat', 'f2_yarat', 'f2_qoralama', 'forma3', 'akt_bekor', 'zamena', 'zamena_qosh', 'qoshimcha', 'qoshimcha_ish', 'podval_tahrir', 'snapshot_qaytar', 'ish_ochir', 'bajarilmadi']);
export const pulAmalmi = (a: Pick<SahifaAmal, 'tur'>) => PUL_TURLARI.has(a.tur);

const raqam = (v: number | null | undefined, d = 3) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: d }));
const NARXSIZ_TUR = new Set(['rs', 'mat', 'ob']);
const TUR_NOM: Record<string, string> = { bl: 'ISH', mat: 'MAT', ob: 'OB', rs: 'RES' };

const holatOf = (m: BuyruqMalumot, id: number) => m.holatMap.get(id);

/** Birlik narxi (NDS siz): holatdagi smeta narxi → qator narxi → smeta summa / hajm; bo'lmasa null (0 emas). */
export function birlikNarxi(m: Pick<BuyruqMalumot, 'holatMap' | 'qatorById'>, id: number): number | null {
  const h = m.holatMap.get(id); const r = m.qatorById.get(id);
  const f2 = h?.f2_narx; if (f2 != null && Number.isFinite(Number(f2))) return Number(f2);
  const a = h?.smeta_narx ?? r?.narx; if (a != null && Number.isFinite(Number(a))) return Number(a);
  const sum = h?.smeta_summa; const hajm = h?.smeta_hajm ?? r?.hajm;
  return sum != null && hajm != null && Number(hajm) !== 0 ? Number(sum) / Number(hajm) : null;
}

const qatorMatni = (m: BuyruqMalumot, r: T2Qator) => `[#${r.id}] ${TUR_NOM[r.tur ?? ''] ?? r.tur} ${r.kod ?? ''} ${r.nom ?? ''} | ${r.birlik ?? '—'} | hajm ${raqam(holatOf(m, r.id)?.smeta_hajm ?? r.hajm)}`;

/** narxsiz: tur rs/mat/ob, narxi NULL (0 — bu narx, narxsiz emas) va hajmi bor. */
export function buyruqNarxsiz(m: BuyruqMalumot, arg: string | null, limit = 30): string {
  const f = arg && arg.trim().length >= 2 ? qidiruvTayyorla(arg.trim()) : null;
  const l = m.rows.filter((r) => NARXSIZ_TUR.has(r.tur ?? '') && r.narx == null && Number(holatOf(m, r.id)?.smeta_hajm ?? r.hajm ?? 0) !== 0 && (!f || f(`${r.kod ?? ''} ${r.nom ?? ''}`)));
  if (!l.length) return arg ? `«${arg}» bo‘yicha narxsiz qator yo‘q.` : 'Narxsiz qator yo‘q (hammasida narx bor).';
  return [`Narxsiz qatorlar: ${l.length}${l.length > limit ? `, birinchi ${limit} tasi` : ''} (summasi noma’lum — 0 emas):`, ...l.slice(0, limit).map((r) => `- ${qatorMatni(m, r)} | narxsiz`)].join('\n');
}

/** qoldiq: smeta − F2 − almashtirilgan (F2 qoldig'i) va fakt qoldig'i; eng kattalar tepada. */
export function buyruqQoldiq(m: BuyruqMalumot, arg: string | null, limit = 25): string {
  const f = arg && arg.trim().length >= 2 ? qidiruvTayyorla(arg.trim()) : null;
  const ind = faktIndeks(m);
  const l = [...ind.values()].filter((j) => !j.avto && (j.ish == null || j.ish.id === j.q.id) && (!f || f(`${j.q.kod ?? ''} ${j.q.nom}`)))
    .map((j) => { const h = holatOf(m, j.q.id); const f2 = h?.f2_hajm == null ? null : Number(h.f2_hajm);
      const q = h?.qoldiq_hajm != null ? Number(h.qoldiq_hajm) : qoldiqHajmi(j.q.smeta, f2, j.q.almashtirilgan); return { j, q }; })
    .filter((x) => x.q != null && Math.abs(x.q) > 1e-9).sort((a, b) => Math.abs(b.q ?? 0) - Math.abs(a.q ?? 0));
  if (!l.length) return arg ? `«${arg}» bo‘yicha qoldiq topilmadi.` : 'Qoldiq bor qator yo‘q.';
  return [`Qoldiq bor qatorlar: ${l.length}${l.length > limit ? `, eng kattalari ${limit} ta` : ''} (qoldiq = smeta − F2 − almashtirilgan; fakt qoldig‘i alohida):`,
    ...l.slice(0, limit).map((x) => `- ${qatorSatri(m, x.j)} | fakt qoldig‘i ${raqam(x.j.q.qoldiq)}`),
    ...(arg ? [] : ['Obyekt jami:', summalarBloki(m, 0)])].join('\n');
}

/** lugat: oddiy so'z (g'isht, pol quyish, кирпич) → lug'at tushunchasi + shu so'z bilan obyektda topilgan qatorlar (qidir bilan bir xil lug'at). */
export function buyruqLugat(m: BuyruqMalumot, arg: string | null): string {
  const a = (arg ?? '').trim();
  if (a.length < 2) return 'Lug‘at uchun so‘z kerak (masalan: g‘isht, pol quyish, кирпич).';
  const f = qidiruvTayyorla(a);
  const topildi = m.rows.filter((r) => (r.tur === 'bl') && f(`${r.kod ?? ''} ${r.nom ?? ''}`));
  return [lugatTushuntir(a), topildi.length ? `Obyektda mos ish qatorlari: ${topildi.length}${topildi.length > 8 ? ' (birinchi 8 tasi)' : ''}:` : 'Obyektda mos ish qatori topilmadi.',
    ...topildi.slice(0, 8).map((r) => `- ${qatorMatni(m, r)} → ${odamNomi(r, 'uz')}`)].join('\n');
}

export function buyruqKontekst(m: BuyruqMalumot): string {
  return faktKontekst(m).replace('Sahifa: Fakt jurnali', 'Sahifa: Buyruq satri (butun obyekt)');
}

export function buyruqOqi(m: BuyruqMalumot, s: OqishSorovi): string {
  switch (s.vosita) {
    case 'qidir': return faktQidir(m, s.arg ?? '');
    case 'holat': return faktHolat(m, s.arg);
    case 'narxsiz': return buyruqNarxsiz(m, s.arg);
    case 'qoldiq': return buyruqQoldiq(m, s.arg);
    case 'lugat': return buyruqLugat(m, s.arg);
    case 'naryad': return naryadMatni(m.naryadlar, s.arg);
    default: return `Noma’lum vosita: ${s.vosita}`;
  }
}

const yangiNarxOqi = (v: string | null): number | null => {
  const x = Number((v ?? '').replace(/\s+/g, '').replace(',', '.'));
  return v != null && v.trim() !== '' && Number.isFinite(x) && x > 0 ? x : null;
};

/** Amal taklifini tekshiradi: null — mumkin; matn — nega mumkin emas (taklif tanlanmaydi). */
export function buyruqAmalTekshir(m: BuyruqMalumot, a: SahifaAmal): string | null {
  if (PUL_TURLARI.has(a.tur) && a.tur !== 'narx_tuzat') return t('Bu amal buyruq satridan bajarilmaydi — tegishli sahifada (F2 tayyorlash, Hujjatlar, Fakt) bajaring');
  switch (a.tur) {
    case 'fakt_hajm': {
      const e = faktAmalTekshir(m, a, new Set());
      if (e) return e;
      return faktDelta(m, a) === 0 ? t('Hajm o‘zgarmaydi') : null;
    }
    case 'narx_tuzat': {
      const r = a.qator != null ? m.qatorById.get(a.qator) : undefined;
      if (!r) return 'Qator topilmadi (AI bergan id obyektda yo‘q)';
      if (r.tur === 'rz') return t('Bo‘lim qatoriga narx qo‘yilmaydi');
      const yangi = yangiNarxOqi(a.qiymat);
      if (yangi == null) return t('Yangi narx musbat son bo‘lishi kerak (QQS siz)');
      return r.narx != null && Math.abs(Number(r.narx) - yangi) < 1e-9 ? t('Narx o‘zgarmaydi') : null;
    }
    case 'korsat': return a.qator != null && m.qatorById.has(a.qator) ? null : 'Qator topilmadi (AI bergan id obyektda yo‘q)';
    default: return 'Noma’lum amal';
  }
}

/** Fakt hajmining o'zgarishi (delta): «+5» → 5; «=40» → 40 − hozirgi fakt. */
export function faktDelta(m: Pick<BuyruqMalumot, 'bolimIshlari'>, a: SahifaAmal): number | null {
  const j = a.qator != null ? faktIndeks(m).get(a.qator) : undefined; const h = faktHajmOqi(a.qiymat);
  if (!j || !h) return null;
  const q = Number(h.qiymat);
  return Math.round((h.rejim === '+' ? q : q - j.q.fakt) * 1e6) / 1e6;
}

export const BUYRUQ_AMAL_NOMI: Record<string, string> = { fakt_hajm: 'Fakt hajmi', narx_tuzat: 'Narx tuzatish (protokol qoralamasi)', korsat: 'Qatorni ko‘rsatish' };

export type AmalDelta = { eski: string; yangi: string; ustamasiz: number | null; kesim: KatKesim | null };

/** Taklif kartasi uchun: eski → yangi va pul farqi (ustamasiz + kesim; ustamali — SummaJuft). Narx noma'lum bo'lsa summa null (0 emas). */
export function amalDelta(m: BuyruqMalumot, a: SahifaAmal): AmalDelta | null {
  const r = a.qator != null ? m.qatorById.get(a.qator) : undefined;
  if (!r) return null;
  const kat = m.holatMap.get(r.id) ? (m.holatMap.get(r.id) as T2QatorHolat).kat ?? r.kat : r.kat;
  const kesimQur = (summa: number | null): AmalDelta['kesim'] => katKesimgaQosh(bosKatKesim(), kat, summa);
  if (a.tur === 'fakt_hajm') {
    const d = faktDelta(m, a); const j = faktIndeks(m).get(r.id); if (d == null || !j) return null;
    const narx = birlikNarxi(m, r.id); const s = narx == null ? null : d * narx;
    return { eski: `${raqam(j.q.fakt)} ${r.birlik ?? ''}`.trim(), yangi: `${raqam(j.q.fakt + d)} ${r.birlik ?? ''}`.trim(), ustamasiz: s, kesim: kesimQur(s) };
  }
  if (a.tur === 'narx_tuzat') {
    const yangi = yangiNarxOqi(a.qiymat); if (yangi == null) return null;
    const hajm = Number(holatOf(m, r.id)?.smeta_hajm ?? r.hajm ?? 0);
    const eski = r.narx == null ? null : Number(r.narx);
    const s = eski == null ? yangi * hajm : (yangi - eski) * hajm;
    return { eski: eski == null ? t('narxsiz') : raqam(eski, 2), yangi: raqam(yangi, 2), ustamasiz: s, kesim: kesimQur(s) };
  }
  return null;
}

export const buyruqAmalNomi = (m: BuyruqMalumot, a: SahifaAmal): string => {
  const r = a.qator != null ? m.qatorById.get(a.qator) : undefined;
  const nom = r ? `${r.kod ? r.kod + ' ' : ''}${r.nom ?? ''}` : `#${a.qator ?? '—'}`;
  const d = amalDelta(m, a);
  return `${t(BUYRUQ_AMAL_NOMI[a.tur] ?? a.tur)} · ${nom}${a.qiymat ? ` · ${a.qiymat}` : ''}${d ? ` (${d.eski} → ${d.yangi})` : ''}`;
};

/* ───────────────────────────── Bajarish (faqat mavjud yozish yo'llari) ───────────────────────────── */

export type YozNatija = { ok: boolean; error?: string; xabar?: string; raqam?: string; takror?: boolean };
export type BuyruqYoz = {
  faktYoz: (p: { obyektId: number; sana: string; qatorlar: Array<{ qator_id: number; hajm: number }>; operationId: string; izoh: string }) => Promise<YozNatija>;
  narxProtokol: (p: { obyektId: number; qatorlar: Array<{ qator_id: number; yangi_narx: number }>; izoh: string; operationId: string }) => Promise<YozNatija>;
  korsat: (qatorId: number) => void;
  /** Muvaffaqiyatli yozuvdan keyin ma'lumotni qayta o'qish. */
  yangila?: () => void;
  yangiOperationId: () => string;
  bugun?: () => string;
};

const bugunSana = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const imzo = (list: readonly SahifaAmal[]) => list.map((a) => `${a.tur}|${a.qator}|${a.qiymat}`).sort().join(';');

export function buyruqVositalar(getM: () => BuyruqMalumot, obyektId: number, yoz: BuyruqYoz): SahifaVositalar & { pul: (a: SahifaAmal) => boolean } {
  /** Bir xil taklif to'plami — bir xil operation_id (qayta bosish/tarmoq takrori ikkinchi hujjat yaratmaydi). */
  const opIdlar = new Map<string, string>();
  const opId = (kalit: string) => { let v = opIdlar.get(kalit); if (!v) { v = yoz.yangiOperationId(); opIdlar.set(kalit, v); } return v; };
  const xato = (r: YozNatija) => r.error ?? r.xabar ?? 'Yozib bo‘lmadi';
  return {
    sahifa: 'buyruq',
    kontekst: () => buyruqKontekst(getM()),
    oqi: (s) => buyruqOqi(getM(), s),
    tekshir: (a) => buyruqAmalTekshir(getM(), a),
    nomi: (a) => buyruqAmalNomi(getM(), a),
    pul: pulAmalmi,
    bajar: async (list) => {
      const m = getM(); const out: string[] = [];
      const yaroqli = list.filter((a) => !buyruqAmalTekshir(m, a));
      if (yaroqli.length < list.length) out.push(`✗ ${t('{n} ta taklif yaroqsiz — o‘tkazildi', { n: list.length - yaroqli.length })}`);
      for (const a of yaroqli.filter((x) => x.tur === 'korsat')) if (a.qator != null) yoz.korsat(a.qator);
      const fakt = new Map<number, number>();
      for (const a of yaroqli.filter((x) => x.tur === 'fakt_hajm')) { const d = faktDelta(m, a); if (a.qator != null && d != null) fakt.set(a.qator, (fakt.get(a.qator) ?? 0) + d); }
      if (fakt.size) {
        const kalit = `fakt:${imzo(yaroqli.filter((x) => x.tur === 'fakt_hajm'))}`; const id = opId(kalit);
        const r = await yoz.faktYoz({ obyektId, sana: (yoz.bugun ?? bugunSana)(), operationId: id, izoh: `AI buyruq satri: ${fakt.size} qator`,
          qatorlar: [...fakt].map(([qator_id, hajm]) => ({ qator_id, hajm })) });
        out.push(r.ok ? `✓ ${t('Fakt yozildi: {n} qator', { n: fakt.size })}${r.raqam ? ` · ${r.raqam}` : ''} · operation_id ${id.slice(0, 8)}${r.takror ? ` (${t('takror — ikkinchi hujjat yaratilmadi')})` : ''}` : `✗ ${t('Fakt yozilmadi')}: ${xato(r)}`);
        if (r.ok) yoz.yangila?.();
      }
      const narx = new Map<number, number>();
      for (const a of yaroqli.filter((x) => x.tur === 'narx_tuzat')) { const y = yangiNarxOqi(a.qiymat); if (a.qator != null && y != null) narx.set(a.qator, y); }
      if (narx.size) {
        const kalit = `narx:${imzo(yaroqli.filter((x) => x.tur === 'narx_tuzat'))}`; const id = opId(kalit);
        const r = await yoz.narxProtokol({ obyektId, operationId: id, izoh: `AI buyruq satri: ${narx.size} qator`, qatorlar: [...narx].map(([qator_id, yangi_narx]) => ({ qator_id, yangi_narx })) });
        out.push(r.ok ? `✓ ${t('Narx protokoli qoralamasi yaratildi: {n} qator (kuchga kirish — imzolangan nusxa bilan alohida tasdiq)', { n: narx.size })}${r.raqam ? ` · ${r.raqam}` : ''} · operation_id ${id.slice(0, 8)}` : `✗ ${t('Narx protokoli yaratilmadi')}: ${xato(r)}`);
        if (r.ok) yoz.yangila?.();
      }
      return out;
    },
  };
}
