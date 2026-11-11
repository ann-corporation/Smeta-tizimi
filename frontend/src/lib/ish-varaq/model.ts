/**
 * Ish varag'i modeli (sof mantiq, DOM yo'q): jurnal modeli (`jurnalQur`) → tekislangan ko'rinadigan qatorlar.
 * Yopiq bo'lim/ish ichi ro'yxatga KIRMAYDI (virtualizatorga ham, DOM'ga ham). Yangi formula yo'q: summa — `t2_qator_holat`
 * summalari + yadro `yigindi2`; jamilar — `bolimSummalari` (kalit 0 = butun obyekt).
 */
import type { T2Qator } from '../../api/supabase';
import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import { yigindi2 } from '../hisob-yadro';
import { chiqarilganmi } from '../resurs-amal';
import { bosKatKesim, katKesimgaQosh, type KatKesim } from '../ustamali-summa';
import type { JurnalBolim, JurnalHolat, JurnalIsh, JurnalQator, Kiritma } from '../fakt-jurnal';

export const BOLIMSIZ_ID = -1;

export type VSatr =
  | { key: string; tur: 'bolim'; id: number; nom: string; daraja: number; yopiq: boolean; ishSoni: number }
  | { key: string; tur: 'ish'; q: JurnalIsh; daraja: number; bolaSoni: number; ochiq: boolean; tahrir: boolean }
  | { key: string; tur: 'resurs'; q: JurnalQator; daraja: number; avto: boolean; tahrir: boolean };

export type VaraqKirish = {
  bolimlar: readonly JurnalBolim[];
  bolimIshlari: ReadonlyMap<number, JurnalIsh[]>;
  ildizIshlari: readonly JurnalIsh[];
  /** Yig'ilgan bo'limlar (ichi ko'rinmaydi). */
  yopiqBolim: ReadonlySet<number>;
  /** Resurslari ochilgan ishlar (sukut — yopiq: resurslar DOM'da yo'q). */
  ochiqIsh: ReadonlySet<number>;
  /** Fakti qo'lda kiritilmaydigan (hosila) qatorlar — tuzatish qatorlari. */
  hosila: ReadonlyMap<number, number>;
  /** Qidiruv matni (bo'sh — filtr yo'q). */
  qidiruv: string;
};

/** Tekislash: bo'lim sarlavhasi → uning ishlari → (ochiq ish) resurslari → ichki bo'limlar (daraxt tartibida). */
export function varaqSatrlari(k: VaraqKirish): VSatr[] {
  const out: VSatr[] = [];
  const q = qidiruvKaliti(k.qidiruv.trim());
  const mos = (x: JurnalQator) => qidiruvKaliti(`${x.kod ?? ''} ${x.nom}`).includes(q);
  const ishMos = (ish: JurnalIsh) => !q || mos(ish) || ish.resurslar.some(mos) || ish.avtomatik.some(mos);
  const daraja = new Map<number, number>();
  const yashirin = new Set<number>();
  const ishlarYoz = (ishlar: readonly JurnalIsh[], d: number) => {
    for (const ish of ishlar) {
      if (!ishMos(ish)) continue;
      const bolaSoni = ish.resurslar.length + ish.avtomatik.length;
      const ochiq = bolaSoni > 0 && k.ochiqIsh.has(ish.id);
      out.push({ key: `q-${ish.id}`, tur: 'ish', q: ish, daraja: d, bolaSoni, ochiq, tahrir: !k.hosila.has(ish.id) });
      if (!ochiq) continue;
      for (const r of ish.resurslar) out.push({ key: `q-${r.id}`, tur: 'resurs', q: r, daraja: d + 1, avto: false, tahrir: !k.hosila.has(r.id) });
      for (const r of ish.avtomatik) out.push({ key: `q-${r.id}`, tur: 'resurs', q: r, daraja: d + 1, avto: true, tahrir: false });
    }
  };
  for (const b of k.bolimlar) {
    const d = b.otaId != null ? (daraja.get(b.otaId) ?? 0) + 1 : 0;
    daraja.set(b.id, d);
    // Qidiruvda yig'ish hisobga olinmaydi (mos qatorlar yashirin bo'lib qolmasin).
    const ota = b.otaId;
    if (!q && ota != null && (k.yopiqBolim.has(ota) || yashirin.has(ota))) { yashirin.add(b.id); continue; }
    const ishlar = k.bolimIshlari.get(b.id) ?? [];
    const yopiq = !q && k.yopiqBolim.has(b.id);
    if (q && !ishlar.some(ishMos)) continue;
    out.push({ key: `b-${b.id}`, tur: 'bolim', id: b.id, nom: b.nom, daraja: d, yopiq, ishSoni: b.ishSoni });
    if (!yopiq) ishlarYoz(ishlar, d + 1);
  }
  if (k.ildizIshlari.length && (!q || k.ildizIshlari.some(ishMos))) {
    const yopiq = !q && k.yopiqBolim.has(BOLIMSIZ_ID);
    out.push({ key: `b-${BOLIMSIZ_ID}`, tur: 'bolim', id: BOLIMSIZ_ID, nom: '', daraja: 0, yopiq, ishSoni: k.ildizIshlari.length });
    if (!yopiq) ishlarYoz(k.ildizIshlari, 1);
  }
  return out;
}

/** Qator summasi (smeta, NDS siz) kategoriya kesimi bilan: ish (bl) — resurslar yig'indisi; resurs — o'zi. NULL ≠ 0. */
export function qatorSumma(q: JurnalQator | JurnalIsh, holat: ReadonlyMap<number, JurnalHolat>, rowById: ReadonlyMap<number, T2Qator>): { ustamasiz: number | null; kesim: KatKesim } {
  const qismlar: JurnalQator[] = q.tur === 'bl' && 'resurslar' in q ? [...q.resurslar, ...q.avtomatik] : [q];
  const kesim = bosKatKesim();
  const qiymatlar: Array<number | null> = [];
  for (const x of qismlar) {
    const v = holat.get(x.id)?.smeta_summa;
    const s = v == null || !Number.isFinite(Number(v)) ? null : Number(v);
    qiymatlar.push(s);
    katKesimgaQosh(kesim, rowById.get(x.id)?.kat, s);
  }
  return { ustamasiz: qiymatlar.some((s) => s != null) ? yigindi2(qiymatlar) : null, kesim };
}

/**
 * Katak matni → kiritma: `+5` (bugun), `=40` (jami), `50%` (smeta foizi, jami), oddiy son — «+» (bugun, Fakt jurnali bilan bir xil).
 * Bo'sh — null (kiritma o'chiriladi). Yaroqsiz matn ham saqlanadi (paket xatosi katakda ko'rinadi).
 */
export function varaqMatnniOqi(matn: string): Kiritma | null {
  const m = matn.trim();
  if (!m) return null;
  if (m[0] === '+') return { rejim: '+', qiymat: m.slice(1).trim() };
  if (m[0] === '=') return { rejim: '=', qiymat: m.slice(1).trim() };
  if (m.endsWith('%')) return { rejim: '=', qiymat: m };
  return { rejim: '+', qiymat: m };
}

/** Kiritma → katakda ko'rinadigan matn (`varaqMatnniOqi` ning teskarisi). */
export function varaqMatnQur(k: Kiritma | undefined): string {
  if (!k) return '';
  if (k.rejim === '=' && k.qiymat.trim().endsWith('%')) return k.qiymat;
  return `${k.rejim}${k.qiymat}`;
}

/** Fokus tartibi: kiritiladigan qatorlar (ish va qo'lda kiritiladigan resurslar). */
export function kirishTartibiOl(satrlar: readonly VSatr[]): number[] {
  const out: number[] = [];
  for (const s of satrlar) if (s.tur !== 'bolim' && s.tahrir) out.push(s.q.id);
  return out;
}

/** Ishdan chiqarilgan resurslar to'plami (bo'lim/obyekt fakt jamisiga qo'shilmaydi) — FaktJurnal bilan bir xil qoida. */
export function chiqarilganlarOl(rows: readonly T2Qator[], states: readonly JurnalHolat[], bajHajm: ReadonlyMap<number, number>): Set<number> {
  const sm = new Map(states.map((s) => [s.qator_id, s.smeta_hajm]));
  const s = new Set<number>();
  for (const r of rows) if ((r.tur === 'rs' || r.tur === 'mat' || r.tur === 'ob') && bajHajm.has(r.id) && chiqarilganmi(sm.get(r.id) ?? r.hajm, bajHajm.get(r.id))) s.add(r.id);
  return s;
}
