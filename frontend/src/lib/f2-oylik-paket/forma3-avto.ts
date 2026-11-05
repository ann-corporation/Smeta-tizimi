/**
 * OYLIK PAKETDA FORMA-3 (egasi 2026-11-05: «forma 3 bermayapdi»): shartnoma + oy uchun saqlangan (qoralama emas) sotuv F3 bo'lsa —
 * o'sha; bo'lmasa — shu oyning TASDIQLANGAN F2 lari jamisidan (QQS bilan, aktning o'z podvali — `f2-akt-eksport`) AVTOMATIK F3,
 * «Ф3 (автоматически по Ф-2, не сохранён)» belgisi bilan. Generator — mavjud `forma3SotuvdanXlsx` (to'liq / bir qatorli).
 * Rekvizit yetishmasa ham F3 yasaladi; yetishmaganlar ro'yxati qaytadi (ПАКЕТ_СОСТАВ.txt va ekran ogohlantirishi). Toza funksiyalar.
 */
import { F3_AVTO_BELGI, forma3SotuvdanXlsx, type Forma3Shakl } from '../forma3-export';
import { paketShakllari, type PaketF3Tanlov } from '../forma3-shakl-tanlov';
import { NDS_SUKUT_FOIZ, yaxlit2 } from '../hisob-yadro';
import type { ImzoNomlar } from '../hujjat-yozuvchi';
import { sotuvF3lar, type SvodShartnoma } from '../nakopitelniy-svod';
import type { ReestrObyekt, ReestrShartnoma } from '../f2-reestr/reestr';
import { oyF3lar, oyJami, oyKaliti, type PaketAkt } from './oylik';

/** Avtomatik F3 ning vaqtinchalik id si (bazada yo'q). */
export const AVTO_F3_ID = -1;

export type OyF3Holati = 'saqlangan' | 'avto' | 'qoralama';

/** Oy F3 holati: saqlangan (tayyor) / faqat qoralama bor (paketga avto kiradi) / hech narsa yo'q (avto). */
export function oyF3Holati(svod: readonly SvodShartnoma[] | null | undefined, shartnomaId: number, oy: string): OyF3Holati {
  if (!svod) return 'avto';
  const f = oyF3lar(svod, new Set([shartnomaId]), oy);
  return f.tayyor.length ? 'saqlangan' : f.qoralama ? 'qoralama' : 'avto';
}

const oyOxiri = (oy: string) => { const [y, m] = oy.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

/** Svodda shartnoma bo'lmasa (masalan, shartnoma tuzilmagan lot) — reestrdagi ma'lumotdan minimal svod. */
export function minimalSvod(sh: ReestrShartnoma, obyektlar: readonly Pick<ReestrObyekt, 'id' | 'nom'>[]): SvodShartnoma {
  return { id: sh.id, loyiha_id: null, raqam: sh.raqam, nom: sh.nom, asosiy: false, holat: 'faol', jami_nds_bilan: sh.jami_nds_bilan,
    obyektlar: obyektlar.map((o) => ({ id: o.id, nom: o.nom })) as SvodShartnoma['obyektlar'], ds: [], f2: [], f3: [], tolovlar: [] };
}

/** Yetishmagan rekvizitlar (rus tilida — hujjat va ПАКЕТ_СОСТАВ uchun). */
export function f3RekvizitKamchilik(sh: Pick<SvodShartnoma, 'raqam' | 'nom'>, o: { tashkilot?: string | null; imzo?: ImzoNomlar | null }): string[] {
  const out: string[] = [];
  if (!o.tashkilot?.trim() && !o.imzo?.pudratchi?.trim()) out.push('подрядчик (наименование)');
  if (!o.imzo?.zakazchik?.trim()) out.push('заказчик (реквизиты)');
  const tuzilmagan = /tuzilmagan|tuzilmadi|не\s*заключ|без\s*договор/i.test(`${sh.raqam} ${sh.nom ?? ''}`);
  if (!sh.raqam?.trim() || tuzilmagan) out.push('номер и дата договора (договор не заключён)');
  return out;
}

export type AvtoF3 = {
  fayllar: Array<{ shakl: Forma3Shakl; bytes: Uint8Array; faylNomi: string }>;
  /** F3 summasi = tasdiqlangan F2 lar QQS bilan jami (ma'lum qismi). */
  summa: number;
  /** Summasi noma'lum tasdiqlangan F2 lar soni (jamiga kirmagan). */
  nomalum: number;
  kamchilik: string[];
};

/**
 * Oyning TASDIQLANGAN F2 laridan avtomatik F3. Tasdiqlangan F2 yo'q yoki ma'lum summa yo'q bo'lsa — null.
 * Oldingi saqlangan sotuv F3 lar «с начала строительства / года» ustunlariga kiradi (mavjud hisob).
 */
export function avtoForma3(i: {
  sh: SvodShartnoma; oy: string; rows: readonly PaketAkt[]; tanlov: PaketF3Tanlov;
  tashkilot?: string | null; imzo?: ImzoNomlar | null; ndsFoiz?: number;
}): AvtoF3 | null {
  const tasdiq = i.rows.filter((r) => r.bosqich === 'tasdiqlangan' && oyKaliti(r.akt.oy) === i.oy);
  if (!tasdiq.length) return null;
  const j = oyJami(tasdiq).jami;
  if (j.soni - j.nomalum <= 0) return null;
  const summa = yaxlit2(j.malum);
  const kamchilik = f3RekvizitKamchilik(i.sh, { tashkilot: i.tashkilot, imzo: i.imzo });
  const virtual: SvodShartnoma = {
    ...i.sh,
    // Shu oydagi saqlangan sotuv F3 lar (qoralama) olib tashlanadi — avto F3 ularning o'rnida.
    f3: [...sotuvF3lar(i.sh).filter((x) => oyKaliti(x.sotuv_sana) !== i.oy), {
      id: AVTO_F3_ID, manba: 'sotuv', raqam: null, sotuv_sana: oyOxiri(i.oy), sotuv_summa: summa, nds_foiz: i.ndsFoiz ?? NDS_SUKUT_FOIZ,
      davr_boshi: `${i.oy}-01`, davr_oxiri: oyOxiri(i.oy), holat: 'tayyor', bajarilgan_f2_summa: summa, izoh: F3_AVTO_BELGI, versiya: 0,
    }],
  };
  const izoh = [
    `${F3_AVTO_BELGI}: сумма за отчётный период = сумма утверждённых Ф-2 за месяц с НДС (${tasdiq.length} шт.; накрутка — по подвалу самого акта, иначе по подвалу сметы).`,
    ...(j.nomalum ? [`Ф-2 с неизвестной суммой в Ф3 не вошли: ${j.nomalum}.`] : []),
    ...(kamchilik.length ? [`Не хватает реквизитов: ${kamchilik.join('; ')}.`] : []),
  ];
  const fayllar: AvtoF3['fayllar'] = [];
  for (const shakl of paketShakllari(i.tanlov)) {
    const h = forma3SotuvdanXlsx(virtual, AVTO_F3_ID, { tashkilot: i.tashkilot, imzo: i.imzo ?? undefined, shakl, avto: { izoh } });
    if (h) fayllar.push({ shakl, bytes: h.bytes, faylNomi: h.faylNomi.replace(/\.xlsx$/i, `_${i.oy}.xlsx`) });
  }
  return { fayllar, summa, nomalum: j.nomalum, kamchilik };
}

/** Saqlangan F3 va F2 lar solishtiruvi (MUNDARIJA tekshiruv qatori uchun). */
export function f3F2Farq(f3Summa: number, rows: readonly PaketAkt[], oy: string): { f2: number | null; farq: number | null } {
  const j = oyJami(rows.filter((r) => r.bosqich === 'tasdiqlangan' && oyKaliti(r.akt.oy) === oy)).jami;
  const f2 = j.soni - j.nomalum > 0 ? yaxlit2(j.malum) : null;
  return { f2, farq: f2 == null ? null : yaxlit2(f3Summa - f2) };
}
