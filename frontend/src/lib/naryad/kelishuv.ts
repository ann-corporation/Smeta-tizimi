/**
 * KELISHUV — «oltin o'rtalik» (egasi: «smetada rigel m3 da, usta metrda 250 mingdan quyaman deydi; tizim ikkala taraf uchun
 * oltin o'rtalikni topib bera olsin»). Sof hisob: usta O'Z birligi va narxini aytadi, tizim smeta birligiga o'giradi va ikki
 * tomonga ko'rsatadi: (1) usta narxi smeta birligiga o'girilganda; (2) smeta mehnati (yoki МАТ/МАШ) puli usta birligiga o'girilganda =
 * «adolatli» narx; (3) tarix — shu kompaniyada shu ish uchun oldin to'langan narx (pol); (4) tavsiya va bir gaplik sabab.
 * Pul faqat `lib/hisob-yadro` orqali (yaxlit2, ustamali/QQS — chaqiruvchi `ustamali` funksiyasi bilan). NULL ≠ 0: noma'lum — «—», o'ylab topilmaydi.
 */
import { yaxlit2 } from '../hisob-yadro';
import { birlikAylantir, koefParametrdan, type SmetaQator } from '../ish-kartasi';
import type { IshKarta } from '../../api/t2-ish-kartasi';
import type { NaryadKat } from './index';

/** Usta aytgan birlik (oddiy til) → smeta birligi yozuvi: «metr» → м, «dona» → шт. Tanilmasa — kirgan matn. */
const USTA_BIRLIK: ReadonlyArray<[RegExp, string]> = [
  [/^(?:m|metr|metrga|pm|pogon)$/i, 'м'], [/^(?:m2|m²|kvadrat|kv|kvm)$/i, 'м²'], [/^(?:m3|m³|kub|kubmetr)$/i, 'м³'],
  [/^(?:dona|sht|шт|ta|nafar)$/i, 'шт'], [/^(?:t|tonna|tn)$/i, 'т'], [/^(?:kg|kilo|kilogramm)$/i, 'кг'], [/^(?:komplekt|kompl)$/i, 'комплект'],
];
export function ustaBirlikNorm(s: string | null | undefined): string | null {
  const t = (s ?? '').trim();
  if (!t) return null;
  for (const [re, b] of USTA_BIRLIK) if (re.test(t.replace(/\s+/g, ''))) return b;
  return t;
}

/** Koef (1 usta birligidagi smeta birligi): sof birlik o'girish (м² ↔ 100М2). Boshqa o'lchamlar (m ↔ m³) — null: geometriya/karta/tarix kerak. */
export function koefBirlikdan(ustaBirlik: string | null | undefined, smetaBirlik: string | null | undefined): number | null {
  const u = ustaBirlikNorm(ustaBirlik);
  return u && smetaBirlik ? birlikAylantir(1, u, smetaBirlik) : null;
}

export type TarixSatr = { usta_narx: number | null; usta_narx_birlik: number | null; koef: number | null; usta_birlik: string | null; kat?: string; raqam?: string };

/** Tarixdan koef taklifi: eng oxirgi (massiv boshi) qaydda shu usta birligi bilan koef bo'lsa — o'sha (kompaniya uni eslab qoladi). */
export function koefTarixdan(tarix: readonly TarixSatr[], ustaBirlik: string | null | undefined): number | null {
  const u = ustaBirlikNorm(ustaBirlik);
  if (!u) return null;
  const t = tarix.find((x) => x.koef != null && x.koef > 0 && ustaBirlikNorm(x.usta_birlik) === u);
  return t?.koef ?? null;
}

/** Tarix narxlari, 1 SMETA birligiga (har satrning o'z koefi bilan o'girilgan; usta narxi saqlanganidek). */
export const tarixSmetaNarxlari = (tarix: readonly TarixSatr[]): number[] =>
  tarix.map((x) => x.usta_narx).filter((v): v is number => v != null && Number.isFinite(v) && v >= 0);

const median = (a: number[]): number | null => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export type KelishuvKirish = {
  kat?: NaryadKat;
  smetaBirlik: string | null; ustaBirlik: string | null;
  /** 1 usta birligidagi smeta birligi. null — noma'lum (usta narxi smetaga o'girilmaydi). */
  koef: number | null;
  /** Usta taklifi, 1 usta birligiga (QQS siz). */
  taklif: number | null;
  /** Smeta puli (mehnat/МАТ/МАШ, ustamasiz), 1 smeta birligiga. null — smetada yo'q. */
  smetaPulBirlik: number | null;
  /** Ustamasiz summa → ustamali (hisob-yadro `uchlik` orqali; ustama ma'lumoti yo'q — null). */
  ustamali?: (ustamasiz: number) => number | null;
  tarix?: readonly TarixSatr[];
  /** Ish hajmi, USTA birligida (foyda/zarar jami uchun). */
  ustaHajm?: number | null;
};

export type Kelishuv = {
  koef: number | null;
  /** Usta taklifi smeta birligiga o'girilgan. */
  taklifSmetaBirlikda: number | null;
  /** Smeta puli usta birligiga o'girilgan = «adolatli» narx (ustamasiz / ustamali). */
  adolatli: number | null; adolatliUstamali: number | null;
  /** Oldin to'langan narx, usta birligida: eng past (pol) va o'rtacha (median). */
  tarixPol: number | null; tarixOrta: number | null; tarixSoni: number;
  /** Taklif adolatlidan necha foiz qimmat (+) yoki arzon (−). */
  farqFoiz: number | null;
  /** Taklif smeta puliga sig'adimi (ustamasiz). null — ikkala tomon ham ma'lum emas. */
  sigadi: boolean | null;
  tavsiya: number | null; sabab: string;
  /** 1 usta birligiga foyda (+) / zarar (−), tavsiya va taklif narxida; jami — ustaHajm bo'lsa. */
  foydaTavsiya: number | null; foydaTaklif: number | null; foydaTaklifJami: number | null; foydaTavsiyaJami: number | null;
};

const so = (v: number) => Math.round(v).toLocaleString('ru-RU').replace(/\s/g, ' ');

/** Oltin o'rtalik hisobi — ikki tomonga ham tushunarli. Hech qachon yo'q raqam to'qimaydi. */
export function kelishuvHisob(k: KelishuvKirish): Kelishuv {
  const koef = k.koef != null && Number.isFinite(k.koef) && k.koef > 0 ? k.koef : null;
  const O = k.taklif != null && Number.isFinite(k.taklif) && k.taklif >= 0 ? k.taklif : null;
  const S0 = k.smetaPulBirlik != null && Number.isFinite(k.smetaPulBirlik) ? k.smetaPulBirlik : null;
  const S = S0 != null && koef != null ? yaxlit2(S0 * koef) : null;
  const SU = S != null && k.ustamali ? k.ustamali(S) : null;
  const tarix = k.tarix ?? [];
  const tn = tarixSmetaNarxlari(tarix);
  const T = tn.length && koef != null ? yaxlit2(Math.min(...tn) * koef) : null;
  const Tm = tn.length && koef != null ? yaxlit2((median(tn) ?? 0) * koef) : null;
  const taklifSmeta = O != null && koef != null ? yaxlit2(O / koef) : null;
  const farqFoiz = O != null && S != null && S !== 0 ? ((O - S) / S) * 100 : null;
  const sigadi = O != null && S != null ? O <= S : null;
  const birlik = k.ustaBirlik ?? 'birlik';

  let tavsiya: number | null = null; let sabab: string;
  if (koef == null) {
    sabab = 'Koef noma’lum: 1 ' + birlik + ' necha ' + (k.smetaBirlik ?? 'smeta birligi') + ' ekanini kiriting — shundan keyin narxlar solishtiriladi.';
  } else if (S == null && O == null && T == null) {
    sabab = 'Smetada bu ish uchun pul ham, usta taklifi ham yo‘q — narx taklif qilib bo‘lmaydi.';
  } else if (S == null) {
    tavsiya = T;
    sabab = T != null ? `Smetada bu ish puli noma’lum; oldin ${so(T)} so‘mdan to‘langan — shuni asos qiling.` : 'Smetada bu ish puli noma’lum — narxni qo‘lda kelishing.';
  } else if (O == null) {
    tavsiya = S;
    sabab = `Usta narx aytmagan: smetadagi pulga teng narx ${so(S)} so‘m / ${birlik} (ustamasiz) — shu adolatli.`;
  } else if (O <= S) {
    const past = T != null && O < T;
    tavsiya = past ? Math.min(T as number, S) : O;
    sabab = past
      ? `Taklif smetaga sig‘adi, lekin oldin ${so(T as number)} so‘mdan to‘langan — usta rozi bo‘lmasligi mumkin; ${so(tavsiya)} so‘m adolatli.`
      : `Taklif smetaga sig‘adi (smetadagi ${so(S)} so‘mdan ${so(S - O)} arzon) — rozi bo‘lish mumkin.`;
  } else {
    // Usta smetadan qimmat: pol (tarix) bor bo'lsa shu oraliqda, yo'q bo'lsa o'rtasida.
    tavsiya = yaxlit2(T != null ? Math.min(O, Math.max(S, T)) : (S + O) / 2);
    sabab = `Usta smetadan ${Math.round(farqFoiz ?? 0)}% qimmat so‘ramoqda (smeta ${so(S)}, usta ${so(O)}); o‘rtacha narx ${so(tavsiya)} so‘m${T != null ? ` (oldin ${so(T)} to‘langan)` : ''} — shundan yuqorisi zarar.`;
  }
  const foyda = (narx: number | null) => (S != null && narx != null ? yaxlit2(S - narx) : null);
  const jami = (f: number | null) => (f != null && k.ustaHajm != null && Number.isFinite(k.ustaHajm) ? yaxlit2(f * k.ustaHajm) : null);
  const fT = foyda(tavsiya); const fO = foyda(O);
  return {
    koef, taklifSmetaBirlikda: taklifSmeta, adolatli: S, adolatliUstamali: SU, tarixPol: T, tarixOrta: Tm, tarixSoni: tn.length,
    farqFoiz, sigadi, tavsiya, sabab, foydaTavsiya: fT, foydaTaklif: fO, foydaTaklifJami: jami(fO), foydaTavsiyaJami: jami(fT),
  };
}

export type KoefTaklif = { koef: number; manba: 'tarix' | 'karta' | 'birlik' };

/**
 * Koef taklifi (avtomatik, bir marta kiritiladi): 1) shu kompaniyada oldingi naryaddan (tarix); 2) ish kartasi geometriyasidan
 * (rigel 20×40: 1 m = 0,08 m³); 3) sof birlik o'girishdan (м² → 100М2). Topilmasa — null: foydalanuvchi kiritadi, o'ylab topilmaydi.
 */
export function koefTaklif(q: Pick<SmetaQator, 'id' | 'birlik'>, ustaBirlik: string | null | undefined, kartalar: readonly Pick<IshKarta, 'holat' | 'tur' | 'birlik' | 'parametrlar' | 'bog'>[], tarix: readonly TarixSatr[]): KoefTaklif | null {
  const u = ustaBirlikNorm(ustaBirlik);
  if (!u) return null;
  const t = koefTarixdan(tarix, u);
  if (t != null) return { koef: t, manba: 'tarix' };
  for (const k of kartalar) {
    if (k.holat !== 'faol' || ustaBirlikNorm(k.birlik) !== u || !k.bog.some((b) => b.qator_id === q.id && b.rol === 'asosiy')) continue;
    const c = koefParametrdan(k.tur, k.birlik, k.parametrlar ?? {}, q.birlik);
    if (c != null && c > 0) return { koef: c, manba: 'karta' };
  }
  const b = koefBirlikdan(u, q.birlik);
  return b != null && b > 0 ? { koef: b, manba: 'birlik' } : null;
}