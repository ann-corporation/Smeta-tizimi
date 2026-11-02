/**
 * F2 tayyorlash vaqtidagi RESURS VEDOMOSTI (egasi 2026-10-25): tanlangan ishlar bo'yicha resurslar yig'indisi
 * (kat bo'yicha guruh, nom, birlik, hajm, narx, summa) va har resurs uchun BARCHA manbalardan narx takliflari.
 * Guruhlash Excel «Ведомость ресурсов» (lib/f2-hujjat) bilan BIR XIL: kat + nom kaliti + birlik kaliti + narx
 * (lib/f2-resurs-guruh). Narx hech qachon o'ylab topilmaydi va avtomatik yozilmaydi: taklif faqat egasi «Narxni qo'llash»
 * bosganda F2 qatoriga (certified_unit_price) tushadi; asl smeta o'zgarmaydi. Narx doim NDS siz.
 */
import type { F2Qator } from './f2-tayyor';
import { kodlarMatni, resursGuruhKaliti } from './f2-resurs-guruh';
import { katKesimYigish, type KatKesim } from './ustamali-summa';
import { NAKRUTKA_KATLAR, nakrutkaKat, type NakrutkaKat } from './nakrutka-podval';
import { mashinistMehnati } from './narx-bildirishnoma';
import { qatorniTaqqosla } from './yetkazuvchi/taqqoslash';
import type { NarxVariant } from '../api/t2-ish-abc';
import type { NarxTaklif } from '../api/t2-narx-dalil';

export type VedomostQator = {
  /** Guruh kaliti (kat + nom + birlik) va shu guruhdagi narx belgisi - ro'yxat kaliti. */
  kalit: string; guruh: string;
  kat: NakrutkaKat | null; kodlar: string; nom: string; birlik: string;
  hajm: number; narx: number | null; summa: number | null;
  /** F2 qatorlari (smeta resurs qator id lari) - narx qo'llanganda shularning hammasiga yoziladi. */
  qatorIds: number[];
  /** Shu resurs boshqa narxlarda ham bor (alohida qatorlarga ajratilgan; o'rtacha narx hisoblanmaydi). */
  narxFarqli: boolean;
  /** Narxi yo'q (ma'lum summa emas) qatorlar soni; mashinistlar mehnati (ma'lumot qatori) hisobga kirmaydi. */
  narxsizSoni: number;
  axborot: boolean;
};
export type VedomostGuruhi = { kat: NakrutkaKat | null; qatorlar: VedomostQator[]; summa: number; katKesim: KatKesim };

const y2 = (x: number) => Math.round(x * 100) / 100;
const y6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** F2 qatorlari (faqat resurslar: rs/mat/ob) -> vedomost. `kodOl` - smeta qatorining shifri (F2Qator da kod yo'q). */
export function f2ResursYigish(qatorlar: readonly F2Qator[], kodOl: (id: number) => string | null | undefined): VedomostGuruhi[] {
  const m = new Map<string, VedomostQator & { _kodlar: string[] }>();
  for (const x of qatorlar) {
    if (x.tur === 'bl' || x.xato) continue;
    const kat = nakrutkaKat(x.kat) ?? (x.tur === 'mat' ? 'МАТ' : x.tur === 'ob' ? 'ОБ' : null);
    const guruh = resursGuruhKaliti(kat, x.nom, x.birlik);
    const narx = x.narxsiz ? null : x.narx;
    const kalit = `${guruh}|${narx ?? '-'}`;
    const axborot = mashinistMehnati({ nom: x.nom });
    const o = m.get(kalit) ?? { kalit, guruh, kat, kodlar: '', _kodlar: [], nom: x.nom.trim(), birlik: (x.birlik ?? '').trim(), hajm: 0, narx, summa: null, qatorIds: [], narxFarqli: false, narxsizSoni: 0, axborot };
    o.hajm = y6(o.hajm + x.hajm);
    const kod = kodOl(x.id); if (kod) o._kodlar.push(kod);
    if (x.summa != null && !x.narxsiz) o.summa = y2((o.summa ?? 0) + x.summa);
    else if (!axborot) o.narxsizSoni++;
    o.qatorIds.push(x.id);
    m.set(kalit, o);
  }
  const sanoq = new Map<string, number>();
  for (const o of m.values()) if (o.narx != null) sanoq.set(o.guruh, (sanoq.get(o.guruh) ?? 0) + 1);
  const qator = [...m.values()].map(({ _kodlar, ...o }) => ({ ...o, kodlar: kodlarMatni(_kodlar), narxFarqli: o.narx != null && (sanoq.get(o.guruh) ?? 0) > 1 }));
  const out: VedomostGuruhi[] = [];
  for (const kat of [...NAKRUTKA_KATLAR, null] as const) {
    const g = qator.filter((x) => x.kat === kat).sort((a, b) => a.nom.localeCompare(b.nom, 'ru', { sensitivity: 'base' }) || (a.narx ?? 0) - (b.narx ?? 0));
    if (!g.length) continue;
    out.push({ kat, qatorlar: g, summa: y2(g.reduce((s, x) => s + (x.summa ?? 0), 0)), katKesim: katKesimYigish(g.filter((x) => x.summa != null), () => kat, (x) => x.summa) });
  }
  return out;
}

/** Narx taklifi (ko'rsatish uchun): manba nomi va sanasi doim bor (yo'q bo'lsa «sana ko'rsatilmagan»). */
export type NarxTaklifi = { id: string; narx: number; manba: string; sana: string | null; izoh: string; tur: 'smeta' | 'shartnoma' | 'boshqa_smeta' | 'katalog' | 'yetkazuvchi' | 'yetkazuvchi_ortacha' | 'hujjat'; xabar?: string };

const MANBA_NOMI: Record<NarxVariant['manba'], string> = { smeta_obyekt: 'Shu obyekt smetasi', smeta_shartnoma: 'Shartnoma smetalari', smeta: 'Boshqa obyekt smetalari', katalog: 'Narx katalogi', qolda: 'Qo‘lda' };
const TUR: Record<NarxVariant['manba'], NarxTaklifi['tur']> = { smeta_obyekt: 'smeta', smeta_shartnoma: 'shartnoma', smeta: 'boshqa_smeta', katalog: 'katalog', qolda: 'hujjat' };
const MANBA_TUR_NOMI: Record<string, string> = { katalog: 'Katalog', faktura: 'Faktura', kp: 'Tijorat taklifi', kalkulyatsiya_mash: 'Mashina kalkulyatsiyasi', chel_chas: 'Chel-soat jadvali', boshqa: 'Boshqa manba' };

/**
 * Bitta resurs guruhi uchun takliflar: RPC variantlari (shu smeta, shartnoma, boshqa smetalar, katalog) + manba qatorlari
 * (faktura/KP/katalog; qator id bo'yicha). Faqat NDS siz narxlar; NDS bilan/noma'lum - `chetda` soni. Bir mahsulotga bir nechta
 * yetkazuvchi narxi bo'lsa - arifmetik o'rtacha alohida taklif + xabar (har yetkazuvchining oxirgi narxi).
 */
export function takliflarYigish(variantlar: readonly NarxVariant[], manbaTakliflar: readonly NarxTaklif[], qatorIds: ReadonlySet<number>): { takliflar: NarxTaklifi[]; chetda: number } {
  const out: NarxTaklifi[] = [];
  const korilgan = new Set<string>();
  const qosh = (t: NarxTaklifi) => { const k = `${t.tur}|${t.manba}|${t.sana ?? ''}|${t.narx}`; if (korilgan.has(k) || !(t.narx >= 0) || !Number.isFinite(t.narx)) return; korilgan.add(k); out.push(t); };
  for (const v of variantlar) qosh({ id: `v|${v.manba}|${v.narx}|${v.izoh}`, narx: Number(v.narx), manba: MANBA_NOMI[v.manba] ?? v.manba, sana: null, izoh: v.izoh ?? '', tur: TUR[v.manba] ?? 'hujjat' });
  let chetda = 0;
  const yetkazuvchilar: Array<{ nom: string; narx: number; sana: string | null }> = [];
  for (const t of manbaTakliflar) {
    if (!qatorIds.has(t.qator_id)) continue;
    if (t.nds_holati !== 'nds_siz') { chetda++; continue; }
    const narx = Number(t.manba_narx);
    const manba = `${MANBA_TUR_NOMI[t.manba_tur] ?? t.manba_tur}: ${t.manba_nom}${t.manba_raqam ? ` № ${t.manba_raqam}` : ''}${t.yetkazuvchi ? ` · ${t.yetkazuvchi}` : ''}`;
    const sana = t.manba_sana ?? (t.yil ? `${t.yil}${t.kvartal ? `-Q${t.kvartal}` : ''}` : null);
    qosh({ id: `m|${t.manba_qator_id}`, narx, manba, sana, izoh: t.manba_nom_qator, tur: t.yetkazuvchi ? 'yetkazuvchi' : t.manba_tur === 'katalog' ? 'katalog' : 'hujjat' });
    if (t.yetkazuvchi && Number.isFinite(narx)) yetkazuvchilar.push({ nom: t.yetkazuvchi, narx, sana: t.manba_sana });
  }
  if (yetkazuvchilar.length) {
    const nomlar = [...new Set(yetkazuvchilar.map((y) => y.nom))];
    const tq = qatorniTaqqosla({ qatorId: 0, nom: '', birlik: null, miqdor: null, takliflar: yetkazuvchilar.map((y) => ({ yetkazuvchiId: nomlar.indexOf(y.nom), yetkazuvchiNom: y.nom, narx: y.narx, muddatKun: null, yetkazishNarx: null })) });
    if (tq.narxliSoni > 1 && tq.ortacha != null) {
      const sana = yetkazuvchilar.map((y) => y.sana ?? '').sort().pop() || null;
      out.push({ id: 'ortacha', narx: tq.ortacha, manba: `${tq.narxliSoni} ta yetkazuvchi o‘rtachasi`, sana, izoh: '', tur: 'yetkazuvchi_ortacha', xabar: tq.xabar ?? undefined });
    }
  }
  return { takliflar: out, chetda };
}
