/**
 * Usta «Bugun»: naryad satrlari USTA O'Z birligida va so'zlarida (qurilish-lugat qisqa nomlari: «100 м2» → «100 kvadrat»).
 * Sof funksiyalar. Pul: faqat serverdan kelgan qiymat (kelishilgan narx / hisoblangan summa) — bu yerda yangi jami hisoblanmaydi;
 * «bu oy ishlab topganim» = HR «Mening oyligim» ning donabay (naryad) qismi (`hrMenOl().qator.naryad_summa`), alohida hisob YO'Q.
 */
import { birlikOdam, odamNomi, type Til } from '../qurilish-lugat';
import type { Naryad, NaryadHolat } from '../naryad';

/** Usta kuzatadigan holat (oddiy so'z): berildi → yuborildi → prorab qabul qildi → hisoblandi. */
export type UstaHolat = 'berildi' | 'yuborildi' | 'qabul' | 'hisoblandi';
const HOLAT: Partial<Record<NaryadHolat, UstaHolat>> = { berildi: 'berildi', bajarildi: 'yuborildi', qabul: 'qabul', hisoblandi: 'hisoblandi' };

export type NaryadSatr = {
  naryadId: number; versiya: number; raqam: string; obyektId: number; naryadQatorId: number;
  /** Smeta qatori (BL) — shu ish oddiy fakt qoralama yo'lidan yashiriladi. */
  qatorId: number | null;
  holat: UstaHolat; nom: string; birlik: string;
  /** Hammasi USTA birligida. */
  hajm: number; bajarilgan: number | null; qabul: number | null; qolgan: number;
  /** Kelishilgan narx 1 usta birligiga (server qiymati); kelishilmagan — null (0 emas). */
  narxBirlik: number | null;
  /** Usta smeta birligi,ga o'tkazish koeffitsienti (1 usta birligi = koef smeta birligi,). */
  koef: number;
  /** Prorab yuborilganidan KAM qabul qildi. */
  kamQabul: boolean;
  /** Naryad izohi (prorabning kamaytirish sababi shu yerga yozilgan bo'lishi mumkin). */
  izoh: string | null;
  /** Usta shu naryad bo'yicha yozgan izoh (serverda saqlanadi). */
  ustaIzoh: string | null;
  /** Hisoblangan naryad uchun serverdagi summa (QQS siz). */
  summa: number | null;
};

const r8 = (x: number) => Number(x.toPrecision(8));

export function ustaNaryadSatrlari(naryadlar: readonly Naryad[], til: Til = 'uz'): NaryadSatr[] {
  return naryadlar.flatMap((n) => {
    const holat = HOLAT[n.holat]; if (!holat) return [];
    return n.qatorlar.map((q): NaryadSatr => {
      const ustaBirlikda = q.usta_birlik != null && q.koef != null && q.koef > 0;
      const k = ustaBirlikda ? (q.koef as number) : 1;
      const hajm = r8(q.hajm / k);
      const bajarilgan = q.bajarilgan_hajm == null ? null : r8(q.bajarilgan_hajm / k);
      const qabul = q.qabul_hajm == null ? null : r8(q.qabul_hajm / k);
      return {
        naryadId: n.id, versiya: n.versiya, raqam: n.raqam, obyektId: n.obyekt_id, naryadQatorId: q.id, qatorId: q.qator_id,
        holat, nom: odamNomi(q, til) || q.nom,
        birlik: birlikOdam(ustaBirlikda ? q.usta_birlik : q.birlik, til),
        hajm, bajarilgan, qabul, qolgan: Math.max(0, r8(hajm - (bajarilgan ?? 0))),
        narxBirlik: q.usta_narx_birlik ?? (ustaBirlikda ? null : q.usta_narx), koef: k,
        kamQabul: holat === 'qabul' || holat === 'hisoblandi' ? qabul != null && bajarilgan != null && qabul < bajarilgan - 1e-9 : false,
        izoh: n.izoh, ustaIzoh: n.usta_izoh ?? null, summa: holat === 'hisoblandi' ? n.xarajat_summa : null,
      };
    });
  });
}

/** Ochiq naryad (berildi/yuborildi) bilan qoplangan smeta qatorlari — ular oddiy fakt qoralama yo'lida ko'rsatilmaydi. */
export const ochiqNaryadQatorlari = (satrlar: readonly NaryadSatr[]): Set<number> =>
  new Set(satrlar.filter((s) => (s.holat === 'berildi' || s.holat === 'yuborildi') && s.qatorId != null).map((s) => s.qatorId as number));

/** Qayta «Bajardim» bosish mumkin: berildi va yuborildi (prorab qabul qilmaguncha o'zgartirsa bo'ladi). */
export const bajardimMumkin = (s: Pick<NaryadSatr, 'holat'>) => s.holat === 'berildi' || s.holat === 'yuborildi';

/**
 * `usta_bajarildi` yuki - FAQAT tahrirlangan satr (usta birligidagi hajm x koef = smeta birligi). Boshqa satrlar yuborilmaydi:
 * RPC (`t2_naryad_usta_bajarildi_v1`) ro'yxatda yo'q satrlarga tegmaydi, shuning uchun bitta satrni yuborish boshqasining
 * yuborilgan hajmini O'CHIRA OLMAYDI.
 */
export function bajarildiYuk(naryad: readonly NaryadSatr[], naryadQatorId: number, hajmUsta: number): Array<{ id: number; bajarilgan_hajm: number }> {
  const s = naryad.find((x) => x.naryadQatorId === naryadQatorId);
  return s && bajardimMumkin(s) ? [{ id: s.naryadQatorId, bajarilgan_hajm: r8(hajmUsta * s.koef) }] : [];
}

/** Shu naryadning BOSHQA satrlari orasida hali hech narsa yuborilmaganlari (bajarilgan = null) soni. 0 bo'lsa - bu oxirgi satr: naryad prorabga o'tadi. */
export const boshqaQolgan = (naryad: readonly NaryadSatr[], naryadQatorId: number): number =>
  naryad.filter((x) => x.naryadQatorId !== naryadQatorId && bajardimMumkin(x) && x.bajarilgan == null).length;
const son = (v: number) => Number(v.toFixed(3)).toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const pul = (v: number | null) => (v == null ? '—' : `${Math.round(v).toLocaleString('ru-RU')} so‘m`);

/** Jarvis: «bugungi ishlarim», «naryadim», «qancha ishlab topdim» — shu ekran ma'lumotidan (to'qilmaydi). */
export function ustaJarvisMatni(satrlar: readonly NaryadSatr[], oyDaromad: number | null): string {
  if (!satrlar.length) return `Sizda ochiq naryad yo‘q. Bu oy ishlab topganingiz (donabay): ${pul(oyDaromad)}.`;
  const qator = satrlar.map((s) => {
    const holat = s.holat === 'berildi' ? `berildi, qoldi ${son(s.qolgan)} ${s.birlik}` : s.holat === 'yuborildi' ? `yuborildi (${son(s.bajarilgan ?? 0)} ${s.birlik}), prorab qabulini kutmoqda`
      : s.holat === 'qabul' ? `prorab qabul qildi: ${son(s.qabul ?? 0)} ${s.birlik}${s.kamQabul ? ' (yuborganingizdan kam)' : ''}` : `hisoblandi: ${pul(s.summa)}`;
    return `- ${s.nom} — ${holat}${s.narxBirlik != null ? `; kelishilgan narx ${pul(s.narxBirlik)} / ${s.birlik}` : ''}`;
  });
  return [`Naryadlarim: ${satrlar.length} ta ish.`, ...qator, `Bu oy ishlab topganim (donabay): ${pul(oyDaromad)}.`].join('\n');
}
