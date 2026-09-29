/**
 * Ustun xaritasini MA'LUMOT bilan isbotlash — PTO qo'shgan / o'zgartirgan
 * ustunlarga moslashish (egasi, 2026-09-25: "asosan bir xil bo'ladi, lekin
 * ba'zi PTO lar F2 kabi hujjatlarni qilganida ustun qo'shib qo'yishi yoki
 * o'zgartirishi mumkin — shunga moslasha olishi kerak").
 *
 * Sarlavha so'zlari faqat NOMZOD beradi. Qaysi uchlik (hajm, narx, summa)
 * haqiqiy ekanini ma'lumot qatorlari hal qiladi: `hajm × narx ≈ summa`
 * (yaxlitlash chegarasida) eng ko'p qatorda bajarilgan uchlik tanlanadi.
 * Shu tariqa:
 *   - qo'shilgan "Кол-во по смете" / "Выполнено ранее" / "Остаток" ustunlari
 *     haqiqiy hajm ustunini "o'g'irlay" olmaydi;
 *   - qayta nomlangan ("СУММА" → "СТОИМОСТЬ ВСЕГО") yoki siljigan ustunlar
 *     topiladi;
 *   - hech bir uchlik ishonchli isbotlanmasa — sarlavha natijasi qoladi va
 *     `ishonch: 'past'` (operator tasdiqlaydi; taxmin yo'q).
 * Xaritaga kirmagan har qanday sarlavhali ustun `qoshimcha` ro'yxatida
 * qaytadi — u o'qilmaydi, lekin operatorga ko'rsatiladi.
 */
import type { Katak } from './turlar';

const son = (v: Katak): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const t = String(v).replace(/[\s ]/g, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export const HAJM_NAQSH = /КОЛ|ОБЪЕМ|ОБЬЕМ|ОБЪЁМ|ПО ПРОЕКТ|MIQDOR|МИҚДОР|МИКДОР|ҲАЖМ|ХАЖМ|HAJM|ВЫПОЛН|ФАКТ/;
export const NARX_NAQSH = /ЦЕНА|НАРХ|NARX|НА\.? ?ЕД\.? ?ИЗМ|СТОИМОСТЬ ЕД|ЗА ЕД/;
export const SUMMA_NAQSH = /СУММ|SUMMA|ОБЩ|ВСЕГО|СТОИМ|ЖАМИ|JAMI/;

export type UstunUchlik = { hajm: number; narx: number; summa: number };

export type UchlikDalili = UstunUchlik & {
  /** Sinalgan qatorlar (uchala katak ham son va summa ≠ 0). */
  sinalgan: number;
  /** Shulardan hajm × narx ≈ summa bo'lganlari. */
  mos: number;
};

/** Yaxlitlash chegarasi: yarim so'm yoki 0,5 % (qaysi biri katta). */
const teng = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.51, Math.abs(b) * 0.005);

/**
 * Nomzodlar ichidan `hajm × narx ≈ summa` eng ko'p bajarilgan uchlikni topadi.
 * `qatorlar` — ma'lumot qatorlari (sarlavhadan keyin); ko'pi bilan `chegara`
 * tasi tekshiriladi. Kamida 3 ta sinalgan qator va 60 % moslik bo'lmasa — null.
 */
export function arifmetikUchlik(
  qatorlar: readonly (readonly Katak[])[],
  nomzod: { hajm: readonly number[]; narx: readonly number[]; summa: readonly number[] },
  chegara = 500,
): UchlikDalili | null {
  const namuna = qatorlar.slice(0, chegara);
  let eng: UchlikDalili | null = null;
  /** Tabiiy shakldagi (hajm → narx → summa chapdan o'ngga, eng ixcham) uchliklar. */
  const tabiiylar: UchlikDalili[] = [];
  const yaxshiroq = (a: UchlikDalili, b: UchlikDalili | null) =>
    !b || a.mos > b.mos || (a.mos === b.mos && a.sinalgan > b.sinalgan);
  for (const h of nomzod.hajm) for (const n of nomzod.narx) for (const s of nomzod.summa) {
    if (h === n || h === s || n === s) continue;
    let sinalgan = 0, mos = 0;
    for (const r of namuna) {
      const a = son(r[h]), b = son(r[n]), c = son(r[s]);
      if (a == null || b == null || c == null || c === 0 || a === 0 || b === 0) continue;
      sinalgan++;
      if (teng(a * b, c)) mos++;
    }
    if (sinalgan < 3 || mos / sinalgan < 0.6) continue;
    const d = { hajm: h, narx: n, summa: s, sinalgan, mos };
    if (yaxshiroq(d, eng)) eng = d;
    if (h < n && n < s) tabiiylar.push(d);
  }
  // Ko'paytma simmetrik (G×R = R×G), yordamchi ustunlar esa (R «остаток» = F − 0, Z = H nusxa)
  // miqdor/summani takrorlashi mumkin (Karting F2, 2026-09-29: sarlavha 0 lar bilan, R va Z
  // asl ustunlarni o'g'irlagan). Hujjat shakli: miqdor → narx → summa yonma-yon. Isboti deyarli
  // teng (≥ 80 %) tabiiy uchliklardan eng ixchami (keyin eng chapdagisi) tanlanadi.
  if (eng) {
    const e = eng;
    const ixcham = tabiiylar.filter((d) => d.mos >= e.mos * 0.8)
      .sort((a, b) => (a.summa - a.hajm) - (b.summa - b.hajm) || a.hajm - b.hajm || b.mos - a.mos)[0];
    if (ixcham) return ixcham;
  }
  return eng;
}

/** Ma'lumot qatorlarida son bor ustunlar (nomzodlar zaxirasi). */
export function sonliUstunlar(qatorlar: readonly (readonly Katak[])[], chetla: ReadonlySet<number>, chegara = 200): number[] {
  const hisob = new Map<number, number>();
  for (const r of qatorlar.slice(0, chegara)) r.forEach((v, i) => { if (!chetla.has(i) && son(v) != null) hisob.set(i, (hisob.get(i) ?? 0) + 1); });
  return [...hisob.entries()].filter(([, k]) => k >= 2).map(([i]) => i).sort((a, b) => a - b);
}

export type MoslashuvNatija = {
  uchlik: UstunUchlik;
  /** 'sarlavha' — sarlavha natijasi ma'lumot bilan tasdiqlandi yoki isbot
   * yo'q; 'arifmetika' — ma'lumot boshqa ustunlarni isbotladi (PTO ustun
   * qo'shgan/o'zgartirgan). */
  qoida: 'sarlavha' | 'arifmetika';
  ishonch: 'yuqori' | 'orta' | 'past';
  izoh: string;
  dalil: UchlikDalili | null;
};

/**
 * Sarlavha bo'yicha topilgan uchlikni ma'lumot bilan tekshiradi va kerak bo'lsa
 * almashtiradi. `sarlavhalar[c]` — c-ustunning birlashtirilgan sarlavha matni
 * (katta harf). `band` — nom/birlik/shifr/tartib/norma ustunlari (nomzod emas).
 */
export function uchlikniMoslashtir(
  sarlavhalar: readonly string[],
  qatorlar: readonly (readonly Katak[])[],
  sarlavhaUchligi: UstunUchlik,
  band: ReadonlySet<number>,
): MoslashuvNatija {
  const nomzod = (re: RegExp, taqiq?: RegExp) => sarlavhalar.map((s, i) => (re.test(s) && !(taqiq && taqiq.test(s)) && !band.has(i) ? i : -1)).filter((i) => i >= 0);
  let hajm = nomzod(HAJM_NAQSH, /ЦЕНА|НАРХ|СУММ|СТОИМ/);
  let narx = nomzod(NARX_NAQSH, /ОБЩ|ВСЕГО|ВЕСЬ/);
  let summa = nomzod(SUMMA_NAQSH, NARX_NAQSH);
  // Sarlavhasi tanilmagan (qayta nomlangan) ustunlar — sonli ustunlar zaxirasidan.
  const zaxira = sonliUstunlar(qatorlar, band);
  if (!hajm.length) hajm = zaxira;
  if (!narx.length) narx = zaxira;
  if (!summa.length) summa = zaxira;
  const hs = sarlavhaUchligi;
  const sarlavhaDalili = hs.hajm >= 0 && hs.narx >= 0 && hs.summa >= 0 ? arifmetikUchlik(qatorlar, { hajm: [hs.hajm], narx: [hs.narx], summa: [hs.summa] }) : null;
  // Sarlavha so'zlari faqat nomzod: ular isbot bermasa (masalan o'ngdagi yordamchi matn ustuni
  // «ОБЩЕСТРОИТЕЛЬНЫЕ РАБОТЫ» summa nomzodi bo'lib qolgan — YEVROPA F2, 2026-09-29) — barcha sonli
  // ustunlardan arifmetik isbot qidiriladi.
  const eng = arifmetikUchlik(qatorlar, { hajm, narx, summa }) ?? arifmetikUchlik(qatorlar, { hajm: zaxira, narx: zaxira, summa: zaxira });
  if (sarlavhaDalili && (!eng || sarlavhaDalili.mos >= eng.mos)) {
    return { uchlik: hs, qoida: 'sarlavha', ishonch: 'yuqori', izoh: `sarlavha ma'lumot bilan tasdiqlandi: ${sarlavhaDalili.mos}/${sarlavhaDalili.sinalgan} qatorda hajm × narx = summa`, dalil: sarlavhaDalili };
  }
  if (eng) {
    const f = (n: string, a: number, b: number) => (a !== b ? `${n}: ${a + 1}→${b + 1}-ustun` : '');
    const ozg = [f('hajm', hs.hajm, eng.hajm), f('narx', hs.narx, eng.narx), f('summa', hs.summa, eng.summa)].filter(Boolean).join(', ');
    return {
      uchlik: { hajm: eng.hajm, narx: eng.narx, summa: eng.summa }, qoida: 'arifmetika',
      ishonch: eng.mos / eng.sinalgan >= 0.9 ? 'yuqori' : 'orta',
      izoh: `ustunlar ma'lumot bo'yicha aniqlandi (${eng.mos}/${eng.sinalgan} qatorda hajm × narx = summa)${ozg ? `; sarlavhadan farqi — ${ozg}` : ''}`,
      dalil: eng,
    };
  }
  return { uchlik: hs, qoida: 'sarlavha', ishonch: 'past', izoh: "ma'lumot bilan isbotlanmadi (narxli qator yetarli emas) — operator tasdiqlaydi", dalil: null };
}

/** Xaritaga kirmagan, sarlavhasi bor ustunlar — o'qilmaydi, operatorga ko'rsatiladi. */
export function qoshimchaUstunlar(sarlavhalar: readonly string[], ishlatilgan: ReadonlySet<number>): Array<{ ustun: number; sarlavha: string }> {
  return sarlavhalar.map((s, i) => ({ ustun: i, sarlavha: s.trim() })).filter((x) => x.sarlavha && !ishlatilgan.has(x.ustun));
}
