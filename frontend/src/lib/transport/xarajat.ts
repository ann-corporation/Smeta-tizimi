import { yaxlit2 } from '../hisob-yadro';

/**
 * Reys tannarxi (ICHKI, QQS SIZ). SQL `_t2_tr_tannarx_v1` bilan BIR XIL formulalar (acceptance + unit test bir xil raqamlarni tekshiradi).
 *  yoqilg'i  = (haqiqiy sarf, yo'q bo'lsa me'yor) × narx; me'yor = (L/100km × km/100 + L/moto-soat × soat) × koef
 *  haydovchi = stavka(reys | km×stavka | soat×stavka | oylik/26 × kun) × (1 + ijtimoiy%)
 *  amort/ijara = o'z: amort_km×km + amort_soat×soat; ijara: ijara_km×km + ijara_soat×soat + ijara_kun×kun
 *  kutish    = daqiqa/60 × kutish_soat_narx;  + yo'l haqi + boshqa
 * Noma'lum kiritma → o'sha modda null va `yetishmaydi` ro'yxatida (0 EMAS). Jami — ma'lum moddalar yig'indisi; `toliq=false` bo'lsa «kamida».
 */
export type YoqilgiTuri = 'dizel' | 'benzin' | 'metan' | 'propan' | 'elektr';
export type MashinaTannarx = {
  yoqilgiTuri: YoqilgiTuri; norma100km: number | null; normaMotosoat: number | null; egalik: 'oz' | 'ijara';
  amortKm: number | null; amortSoat: number | null; ijaraKm: number | null; ijaraSoat: number | null; ijaraKun: number | null; kutishSoatNarx: number | null;
};
export type HaydovchiTannarx = { tolovTuri: 'reys' | 'km' | 'soat' | 'oylik'; tolovStavka: number | null; ijtimoiyFoiz: number };
export type ReysTannarx = {
  sana: string; rejaKm: number | null; rejaDaqiqa: number | null; kmBoshi: number | null; kmOxiri: number | null; faktKm: number | null;
  motoBoshi: number | null; motoOxiri: number | null; ishSoat: number | null; boshlandi: string | null; tugadi: string | null;
  kutishDaqiqa: number | null; yoqilgiSarfiL: number | null; yoqilgiNarxFakt: number | null; normaKoef: number; yolHaqi: number | null; boshqaXarajat: number | null;
};
export type YoqilgiNarxTarix = Array<{ yoqilgiTuri: string; sana: string; narx: number }>;
export type Modda = 'yoqilgi' | 'haydovchi' | 'amortizatsiya' | 'kutish';

export type Tannarx = {
  km: number | null; kmManba: 'fakt' | 'reja' | null; soat: number | null; kun: number;
  yoqilgi: { normaL: number | null; faktL: number | null; litr: number | null; narx: number | null; narxManba: 'fakt' | 'tarix' | null; summa: number | null; ogishFoiz: number | null };
  haydovchi: number | null; amortizatsiya: number | null; kutish: number | null; yolHaqi: number | null; boshqa: number | null;
  jami: number; toliq: boolean; yetishmaydi: Modda[];
};

const bor = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);

/** Reys sanasidagi (yoki undan oldingi eng so'nggi) yoqilg'i narxi. */
export function yoqilgiNarxiOl(tarix: YoqilgiNarxTarix, tur: string, sana: string): number | null {
  let eng: { sana: string; narx: number } | null = null;
  for (const t of tarix) if (t.yoqilgiTuri === tur && t.sana <= sana && (!eng || t.sana > eng.sana)) eng = t;
  return eng ? eng.narx : null;
}

export function tannarxHisobla(m: MashinaTannarx, h: HaydovchiTannarx | null, r: ReysTannarx, narxTarix: YoqilgiNarxTarix): Tannarx {
  const yet: Modda[] = [];
  let km: number | null = null; let kmManba: Tannarx['kmManba'] = null;
  if (bor(r.kmBoshi) && bor(r.kmOxiri)) { km = r.kmOxiri - r.kmBoshi; kmManba = 'fakt'; }
  else if (bor(r.faktKm)) { km = r.faktKm; kmManba = 'fakt'; }
  else if (bor(r.rejaKm)) { km = r.rejaKm; kmManba = 'reja'; }

  let soat: number | null = null;
  if (bor(r.motoBoshi) && bor(r.motoOxiri)) soat = r.motoOxiri - r.motoBoshi;
  else if (bor(r.ishSoat)) soat = r.ishSoat;
  else if (r.boshlandi && r.tugadi) soat = yaxlit2((Date.parse(r.tugadi) - Date.parse(r.boshlandi)) / 3_600_000);
  else if (bor(r.rejaDaqiqa)) soat = yaxlit2(r.rejaDaqiqa / 60);
  let kun = 1;
  if (r.boshlandi && r.tugadi) {
    const kd = (iso: string) => Math.floor(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') / 86_400_000);
    kun = Math.max(1, kd(r.tugadi) - kd(r.boshlandi) + 1);
  }

  let norma: number | null = null;
  if (bor(m.norma100km) && km != null) norma = (norma ?? 0) + (m.norma100km * km) / 100;
  if (bor(m.normaMotosoat) && soat != null) norma = (norma ?? 0) + m.normaMotosoat * soat;
  if (norma != null) norma = yaxlit2(norma * r.normaKoef);
  const fakt = bor(r.yoqilgiSarfiL) ? r.yoqilgiSarfiL : null;
  const litr = fakt ?? norma;
  let narx: number | null = null; let narxManba: 'fakt' | 'tarix' | null = null;
  if (bor(r.yoqilgiNarxFakt)) { narx = r.yoqilgiNarxFakt; narxManba = 'fakt'; }
  else { narx = yoqilgiNarxiOl(narxTarix, m.yoqilgiTuri, r.sana); narxManba = narx == null ? null : 'tarix'; }
  let yoq: number | null = null;
  if (litr != null && narx != null) yoq = yaxlit2(litr * narx); else yet.push('yoqilgi');
  const ogish = fakt != null && norma != null && norma > 0 ? Math.round(((fakt - norma) / norma) * 1000) / 10 : null;

  let hay: number | null = null;
  if (!h || !bor(h.tolovStavka)) yet.push('haydovchi');
  else {
    const t = h.tolovTuri === 'reys' ? h.tolovStavka
      : h.tolovTuri === 'km' ? (km == null ? null : h.tolovStavka * km)
      : h.tolovTuri === 'soat' ? (soat == null ? null : h.tolovStavka * soat)
      : h.tolovStavka / 26 * kun;
    if (t == null) yet.push('haydovchi'); else hay = yaxlit2(t * (1 + h.ijtimoiyFoiz / 100));
  }

  let amo: number | null = null; let bo = false; let at = 0;
  const qosh = (stavka: number | null, miqdor: number | null) => { if (bor(stavka) && miqdor != null) { at += stavka * miqdor; bo = true; } };
  if (m.egalik === 'oz') { qosh(m.amortKm, km); qosh(m.amortSoat, soat); }
  else { qosh(m.ijaraKm, km); qosh(m.ijaraSoat, soat); qosh(m.ijaraKun, kun); }
  if (bo) amo = yaxlit2(at); else yet.push('amortizatsiya');

  let kut: number | null = null;
  if (!bor(r.kutishDaqiqa) || r.kutishDaqiqa === 0) kut = 0;
  else if (!bor(m.kutishSoatNarx)) yet.push('kutish');
  else kut = yaxlit2((r.kutishDaqiqa / 60) * m.kutishSoatNarx);

  const jami = yaxlit2((yoq ?? 0) + (hay ?? 0) + (amo ?? 0) + (kut ?? 0) + (r.yolHaqi ?? 0) + (r.boshqaXarajat ?? 0));
  return {
    km, kmManba, soat, kun, yoqilgi: { normaL: norma, faktL: fakt, litr, narx, narxManba, summa: yoq, ogishFoiz: ogish },
    haydovchi: hay, amortizatsiya: amo, kutish: kut, yolHaqi: r.yolHaqi, boshqa: r.boshqaXarajat, jami, toliq: yet.length === 0, yetishmaydi: yet,
  };
}
