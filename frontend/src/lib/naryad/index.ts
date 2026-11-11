/**
 * NARYAD — brigada/usta ish topshirig'i (sof mantiq). Smeta ishlari → hajm, normativ mehnat (чел-ч), kelishilgan usta narxi,
 * to'lanadigan summa. Holatlar: berildi → bajarildi (usta, fakt qoralamasi) → qabul (prorab) → hisoblandi (xarajat ЧЕЛ).
 * Pul qoidalari: usta narxi QQS siz (to'g'ri xarajat); smeta mehnati — faqat hisob-yadro; noma'lum — null (0 emas).
 * Fakt: naryad yopilganda FAQAT farq taklif qilinadi — ikki marta yozilmaydi (`faktTaklif`).
 */
import { bosKesim, kesimgaQosh } from '../hisob-yadro';
import { farq, qatorHissalari, taqsimot, SUKUT_ULUSH, uchlik, type Farq, type SmetaQator, type Uchlik, type UstamaKirish } from '../ish-kartasi';
import type { IshKarta } from '../../api/t2-ish-kartasi';

export const NARYAD_HOLATLAR = ['berildi', 'bajarildi', 'qabul', 'hisoblandi', 'bekor'] as const;
export type NaryadHolat = typeof NARYAD_HOLATLAR[number];

export type NaryadQator = {
  id: number; qator_id: number | null; tartib: number; kod: string | null; nom: string; birlik: string | null; hajm: number;
  norma_chel_soat: number | null; smeta_mehnat_birlik: number | null; usta_narx: number | null;
  bajarilgan_hajm: number | null; qabul_hajm: number | null; fakt_boshida: number | null; fakt_delta: number | null; fakt_yozilgan: number | null;
};
export type Naryad = {
  id: number; obyekt_id: number; obyekt_nom?: string | null; raqam: string; davr_dan: string | null; davr_gacha: string | null;
  usta_nom: string; brigada: string | null; holat: NaryadHolat; izoh: string | null; versiya: number;
  fakt_operation_id: string; fakt_holat: 'yozildi' | null; fakt_akt_id: number | null;
  xarajat_id: number | null; xarajat_summa: number | null; yaratildi: string; qatorlar: NaryadQator[];
};
export type NaryadQisqa = {
  id: number; obyekt_id: number; raqam: string; usta_nom: string; brigada: string | null; holat: NaryadHolat; versiya: number;
  davr_dan: string | null; davr_gacha: string | null; qator_soni: number; reja_summa: number | null; narxsiz_soni: number;
  fakt_holat: 'yozildi' | null; xarajat_summa: number | null; yaratildi: string;
};

/** Holat o'tishlari (server `t2_naryad_yoz_v1` bilan bir xil). */
export const HOLAT_OTISH: Readonly<Record<NaryadHolat, readonly string[]>> = {
  berildi: ['bajarildi', 'qabul', 'narx', 'bekor'],
  bajarildi: ['bajarildi', 'qabul', 'narx', 'bekor'],
  qabul: ['narx', 'fakt_yozildi', 'hisobla', 'bekor'],
  hisoblandi: [],
  bekor: [],
};

const son = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);

/** Server qatori → toza son maydonlar (NUMERIC matn bo'lib kelishi mumkin). */
export function naryadTozala(n: Naryad): Naryad {
  return {
    ...n,
    qatorlar: (n.qatorlar ?? []).map((q) => ({
      ...q, hajm: Number(q.hajm), norma_chel_soat: son(q.norma_chel_soat), smeta_mehnat_birlik: son(q.smeta_mehnat_birlik), usta_narx: son(q.usta_narx),
      bajarilgan_hajm: son(q.bajarilgan_hajm), qabul_hajm: son(q.qabul_hajm), fakt_boshida: son(q.fakt_boshida), fakt_delta: son(q.fakt_delta), fakt_yozilgan: son(q.fakt_yozilgan),
    })),
    xarajat_summa: son(n.xarajat_summa),
  };
}

const yaxlit2 = (x: number) => Math.round(x * 100) / 100;

/** Smeta qatori → 1 smeta birligiga mehnat puli (ustamasiz) va normativ чел-ч. Resursi yo'q / hajmi 0 — null (0 emas). */
export function qatorMehnat(q: SmetaQator): { mehnatBirlik: number | null; chelSoatBirlik: number | null } {
  const t = qatorHissalari({ qator_id: q.id, obyekt_id: q.obyekt_id, rol: 'asosiy', koef: 1, bosqich: null, material_guruh: null }, q);
  if (t.holat !== 'ok') return { mehnatBirlik: null, chelSoatBirlik: null };
  const tq = taqsimot(t.hissalar, SUKUT_ULUSH);
  const bor = t.hissalar.some((h) => h.guruh === 'mehnat');
  return { mehnatBirlik: bor ? tq.mehnat.jami : null, chelSoatBirlik: tq.chelSoat };
}

/** Naryad qatori uchun surat (yaratish paytida): hajmga normativ чел-ч va 1 birlikka smeta mehnati. */
export function qatorSurati(q: SmetaQator, hajm: number): { norma_chel_soat: number | null; smeta_mehnat_birlik: number | null } {
  const m = qatorMehnat(q);
  return {
    norma_chel_soat: m.chelSoatBirlik == null ? null : Math.round(m.chelSoatBirlik * hajm * 1e4) / 1e4,
    smeta_mehnat_birlik: m.mehnatBirlik == null ? null : Math.round(m.mehnatBirlik * 1e4) / 1e4,
  };
}

/**
 * Usta narxi taklifi (1 SMETA birligiga): ish kartasida shu qator «asosiy» bog' bo'lsa, karta naryad narxi (1 amaliy birlikka)
 * / koef (1 amaliy birlikka smeta birligi). Topilmasa — null (qo'lda kiritiladi).
 */
export function ustaNarxTaklif(qatorId: number, kartalar: readonly Pick<IshKarta, 'naryad_narx' | 'holat' | 'bog'>[]): number | null {
  for (const k of kartalar) {
    if (k.holat !== 'faol' || k.naryad_narx == null) continue;
    const b = k.bog.find((x) => x.qator_id === qatorId && x.rol === 'asosiy' && x.koef != null && x.koef > 0);
    if (b && b.koef) return yaxlit2(k.naryad_narx / b.koef);
  }
  return null;
}

/** To'lov hajmi: qabul → bajarilgan → reja (oxirgi ma'lum). */
export const tolovHajmi = (q: Pick<NaryadQator, 'hajm' | 'bajarilgan_hajm' | 'qabul_hajm'>): number => q.qabul_hajm ?? q.bajarilgan_hajm ?? q.hajm;

export type SatrTahlil = {
  hajm: number; summa: number | null; chelSoat: number | null; smetaMehnat: number | null;
  /** smeta mehnati − usta summasi: musbat — tejash (foyda), manfiy — ortiqcha to'lov (zarar). */
  foyda: number | null; farq: Farq; narxsiz: boolean;
};

/** Bitta satr: to'lov hajmi bo'yicha usta summasi, smeta mehnati va foyda/zarar. Narx yo'q — summa null (0 emas). */
export function satrTahlil(q: NaryadQator, rejim: 'reja' | 'amalda' = 'amalda'): SatrTahlil {
  const hajm = rejim === 'reja' ? q.hajm : tolovHajmi(q);
  const summa = q.usta_narx == null ? null : yaxlit2(hajm * q.usta_narx);
  const smetaMehnat = q.smeta_mehnat_birlik == null ? null : yaxlit2(hajm * q.smeta_mehnat_birlik);
  const chelSoat = q.norma_chel_soat == null ? null : (q.hajm > 0 ? q.norma_chel_soat * hajm / q.hajm : null);
  const f = farq(summa, smetaMehnat);
  return { hajm, summa, chelSoat, smetaMehnat, foyda: summa != null && smetaMehnat != null ? yaxlit2(smetaMehnat - summa) : null, farq: f, narxsiz: q.usta_narx == null };
}

export type NaryadJami = {
  ustaSumma: number | null; smetaMehnat: number | null; chelSoat: number | null; foyda: number | null; foiz: number | null;
  narxsizSoni: number; smetasizSoni: number;
};

/** Naryad jami. Summa faqat HAMMA satr narxi ma'lum bo'lsa to'liq; aks holda ma'lum qismi + narxsizSoni (jim 0 emas). */
export function naryadJami(qatorlar: readonly NaryadQator[], rejim: 'reja' | 'amalda' = 'amalda'): NaryadJami {
  let usta = 0; let smeta = 0; let chel = 0; let ustaBor = false; let smetaBor = false; let chelBor = false; let narxsiz = 0; let smetasiz = 0;
  let juftUsta = 0; let juftSmeta = 0;
  for (const q of qatorlar) {
    const s = satrTahlil(q, rejim);
    if (s.summa != null) { usta += s.summa; ustaBor = true; } else narxsiz++;
    if (s.smetaMehnat != null) { smeta += s.smetaMehnat; smetaBor = true; } else smetasiz++;
    if (s.chelSoat != null) { chel += s.chelSoat; chelBor = true; }
    if (s.summa != null && s.smetaMehnat != null) { juftUsta += s.summa; juftSmeta += s.smetaMehnat; }
  }
  const foyda = juftSmeta || juftUsta ? yaxlit2(juftSmeta - juftUsta) : null;
  return {
    ustaSumma: ustaBor ? yaxlit2(usta) : null, smetaMehnat: smetaBor ? yaxlit2(smeta) : null, chelSoat: chelBor ? Math.round(chel * 100) / 100 : null,
    foyda, foiz: foyda != null && juftSmeta > 0 ? (foyda / juftSmeta) * 100 : null, narxsizSoni: narxsiz, smetasizSoni: smetasiz,
  };
}

/** Smeta mehnatining ustamali/QQS li ko'rinishi — yagona hisob-yadro orqali (ustama ma'lumoti yo'q — ustamali/QQS null). */
export function mehnatUchlik(summaUstamasiz: number | null, ustama: UstamaKirish): Uchlik | null {
  if (summaUstamasiz == null) return null;
  const k = bosKesim();
  kesimgaQosh(k, 'ЧЕЛ', summaUstamasiz);
  return uchlik(k, ustama);
}

/* ───────────────────────── Fakt farqi (ikki marta yozilmaydi) ───────────────────────── */

export type FaktTaklifSatr = { qatorId: number; naryadQatorId: number; delta: number; ogohlantirish: string | null };
export type FaktHozir = { fakt_hajm: number | null; smeta_hajm: number | null };

/**
 * Qabul qilingan naryad bo'yicha fakt FARQI: kutilgan fakt = fakt_boshida + qabul hajmi; hozirgi fakt shundan kam bo'lsa — farq yoziladi.
 * Bu orada fakt boshqa yo'l bilan kiritilgan bo'lsa farq kamayadi (ikki marta yozilmaydi). Ortiqcha fakt manfiy farq bilan «tuzatilmaydi».
 * Allaqachon yozilgan (fakt_yozilgan) satrlar o'tkazib yuboriladi. Smeta hajmidan oshsa — ogohlantirish (to'smaydi).
 */
export function faktTaklif(qatorlar: readonly NaryadQator[], hozir: ReadonlyMap<number, FaktHozir>): FaktTaklifSatr[] {
  const out: FaktTaklifSatr[] = [];
  for (const q of qatorlar) {
    if (q.qator_id == null || q.fakt_yozilgan != null) continue;
    const qabul = q.qabul_hajm ?? q.bajarilgan_hajm;
    if (qabul == null) continue;
    const h = hozir.get(q.qator_id);
    const joriy = h?.fakt_hajm ?? q.fakt_boshida ?? 0;
    const delta = Math.round(Math.max((q.fakt_boshida ?? 0) + qabul - joriy, 0) * 1e6) / 1e6;
    if (delta <= 0) continue;
    const oshadi = h?.smeta_hajm != null && joriy + delta > h.smeta_hajm + 1e-9;
    out.push({ qatorId: q.qator_id, naryadQatorId: q.id, delta, ogohlantirish: oshadi ? 'SMETA_HAJMIDAN_OSHADI' : null });
  }
  return out;
}

/** Ekranga: holat nomi (t() bilan o'raladi). */
export const HOLAT_NOMI: Readonly<Record<NaryadHolat, string>> = {
  berildi: 'Berildi', bajarildi: 'Bajarildi (usta)', qabul: 'Qabul qilindi (prorab)', hisoblandi: 'Hisoblandi', bekor: 'Bekor qilindi',
};

/** Ro'yxat qatorlarini holat bo'yicha sanash (bosh sahifa/Jarvis uchun). */
export function holatSoni(list: readonly Pick<NaryadQisqa, 'holat'>[]): Record<NaryadHolat, number> {
  const r: Record<NaryadHolat, number> = { berildi: 0, bajarildi: 0, qabul: 0, hisoblandi: 0, bekor: 0 };
  for (const n of list) r[n.holat]++;
  return r;
}
