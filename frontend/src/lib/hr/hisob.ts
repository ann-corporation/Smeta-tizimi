/**
 * HR + KPI: sof yordamchilar (tabel, tatil taklifi, jamlar, reyting, bayram ma'lumoti).
 * Ish haqi formulasi SQL da (`_t2_hr_hisob_v1`, docs/architecture/HR_KPI_V1.md §3); bu yerda faqat ko'rsatish uchun jamlash:
 * pul `lib/hisob-yadro` orqali, NULL != 0 (noma'lum qiymatlar alohida sanaladi, 0 deb olinmaydi).
 */
import { yigindi2 } from '../hisob-yadro';
import type { HrKpiQator, HrKun, HrTatil } from '../../api/t2-hr';
import bayramData from './bayram-uz.json';

export const TABEL_BELGILAR = ['K', 'N', 'O', 'B', 'D'] as const;
export type TabelBelgi = typeof TABEL_BELGILAR[number];

export const TABEL_NOMI: Record<TabelBelgi, string> = { K: 'Keldi', N: 'Kelmadi', O: 'Otpusk', B: 'Kasal', D: 'Otgul' };

/** SQL ogohlantirish kodlari -> foydalanuvchi matni (kalit; t() bilan tarjima qilinadi). */
export const OGOH_MATN: Record<string, string> = {
  tabel_yoq: 'Tabel kiritilmagan',
  tabel_tasdiqlanmagan: 'Tabel tasdiqlanmagan',
  ish_kun_norma_dan_oshdi: 'Ishlangan kun normadan oshgan',
  baza_nomalum: 'Maosh bazasi kiritilmagan',
  f2_summa_nomalum: 'Ba’zi F2 aktlarda summa noma’lum',
  tuzatma_nomalum: 'Jarima/bonus summasi noma’lum',
  tuzatma_kutilmoqda: 'Tasdiq kutayotgan jarima/bonus bor',
  stavka_kiritilmagan: 'NDFL/INPS stavkalari kiritilmagan',
  manfiy: 'Hisoblangan summa manfiy',
  naryad_kunlari_chiqarildi: 'Naryad davriga tushgan kunlar tabel bo‘yicha to‘lanmadi',
};

export type TabelJami = Record<TabelBelgi, number>;
export function tabelJamlari(kunlar: Record<string, string> | null | undefined): TabelJami {
  const j: TabelJami = { K: 0, N: 0, O: 0, B: 0, D: 0 };
  for (const v of Object.values(kunlar ?? {})) if ((TABEL_BELGILAR as readonly string[]).includes(v)) j[v as TabelBelgi]++;
  return j;
}

const turi = (k: HrKun, grafik: 5 | 6) => (grafik === 6 ? k.tur6 : k.tur5);

/** Hamma ish kuniga «K» (keldi) — tez to'ldirish. */
export function ishKunlariK(kunlar: readonly HrKun[], grafik: 5 | 6): Record<string, string> {
  const r: Record<string, string> = {};
  for (const k of kunlar) if (turi(k, grafik) === 'ish') r[String(Number(k.sana.slice(8, 10)))] = 'K';
  return r;
}

const TATIL_BELGI: Record<HrTatil['tur'], TabelBelgi> = { otpusk: 'O', kasal: 'B', otgul: 'D' };

/** Tasdiqlangan tatil kunlaridan tabel taklifi (faqat ish kunlari; mavjud belgi ustiga yozilmaydi). Saqlanmaguncha bazaga yozilmaydi. */
export function tatildanTaklif(tatillar: readonly HrTatil[], kadrId: number, kunlar: readonly HrKun[], grafik: 5 | 6, mavjud: Record<string, string> = {}): Record<string, string> {
  const r: Record<string, string> = {};
  for (const k of kunlar) {
    const kun = String(Number(k.sana.slice(8, 10)));
    if (mavjud[kun] || turi(k, grafik) !== 'ish') continue;
    const t = tatillar.find((x) => x.kadr_id === kadrId && x.holat === 'tasdiqlangan' && x.dan <= k.sana && x.gacha >= k.sana);
    if (t) r[kun] = TATIL_BELGI[t.tur];
  }
  return r;
}

export type KpiJami = {
  soni: number; baza: number; naryad: number; kpi: number; bonus: number; jarima: number; hisoblangan: number; ndfl: number; inps: number; sof: number; f2_summa: number;
  /** Qiymati noma'lum (NULL) bo'lgan xodimlar soni: hisoblangan / sof. Jamiga kirmaydi, 0 deb ham olinmaydi. */
  nomalum_hisoblangan: number; nomalum_sof: number; toliq_emas: number;
};
export function kpiJamlari(q: readonly HrKpiQator[]): KpiJami {
  return {
    soni: q.length,
    baza: yigindi2(q.map((x) => x.baza)), naryad: yigindi2(q.map((x) => x.naryad_summa ?? null)), kpi: yigindi2(q.map((x) => x.kpi_f2)), bonus: yigindi2(q.map((x) => x.bonus)), jarima: yigindi2(q.map((x) => x.jarima)),
    hisoblangan: yigindi2(q.map((x) => x.hisoblangan)), ndfl: yigindi2(q.map((x) => x.ndfl)), inps: yigindi2(q.map((x) => x.inps)), sof: yigindi2(q.map((x) => x.sof)),
    f2_summa: yigindi2(q.map((x) => x.f2_summa)),
    nomalum_hisoblangan: q.filter((x) => x.hisoblangan == null).length, nomalum_sof: q.filter((x) => x.sof == null).length, toliq_emas: q.filter((x) => !x.toliq).length,
  };
}

export type ReytingMezon = 'kpi' | 'f2' | 'hisoblangan';
/** Xodimlar reytingi (kamayish): noma'lum qiymat oxirida (0 emas), tenglikda ism bo'yicha. */
export function reyting(q: readonly HrKpiQator[], mezon: ReytingMezon): HrKpiQator[] {
  const qiymat = (x: HrKpiQator) => (mezon === 'kpi' ? x.kpi_f2 : mezon === 'f2' ? x.f2_summa : x.hisoblangan);
  return [...q].sort((a, b) => {
    const [va, vb] = [qiymat(a), qiymat(b)];
    if (va == null && vb == null) return a.ism.localeCompare(b.ism, 'ru');
    if (va == null) return 1;
    if (vb == null) return -1;
    return vb - va || a.ism.localeCompare(b.ism, 'ru');
  });
}

export const oyKaliti = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export function oyOffset(oy: string, n: number): string {
  const [y, m] = oy.split('-').map(Number);
  return oyKaliti(new Date(y, m - 1 + n, 1));
}

/** Standart (qat'iy sanali) bayramlar ma'lumoti — kompaniya kalendariga yozish uchun taklif. */
export function bayramlarYil(yil: number): Array<{ sana: string; nom: string }> {
  return bayramData.bayramlar.map((b) => ({ sana: `${yil}-${String(b.oy).padStart(2, '0')}-${String(b.kun).padStart(2, '0')}`, nom: b.nom }));
}
