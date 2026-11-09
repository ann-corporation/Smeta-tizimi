import { normBir } from '../f2-match-engine';

/**
 * F2 importdan yaratiladigan ZAMENA rejasi (F2 import auditi, 2026-11-09, P6): zamena hajmi bitta F2 hajmidan, boshqa
 * birlikda olinsa (Т ↔ 1000М2, 1000М3 ↔ М3) «umumiy qozon» asl qatorning qoldig'ini noto'g'ri kamaytiradi va qoldiq
 * minusga tushadi. Qoida: birlik farqli bo'lsa — aslning qancha hajmini almashtirishi (aslning birligida) MAJBURIY.
 */
export interface ZamenaRejaKirish { aslBirlik: string | null | undefined; aslHajm?: number | null; birlik: string | null | undefined; almashtirishHajm?: number | null }

export function zamenaBirlikFarqli(aslBirlik: unknown, birlik: unknown): boolean {
  const a = normBir(aslBirlik), b = normBir(birlik);
  return !!a && !!b && a !== b;
}

/** null — reja to'g'ri; aks holda foydalanuvchiga ko'rsatiladigan xato matni (o'zbekcha). */
export function zamenaRejaXatosi(k: ZamenaRejaKirish): string | null {
  if (!zamenaBirlikFarqli(k.aslBirlik, k.birlik)) return null;
  if (k.almashtirishHajm == null || !Number.isFinite(k.almashtirishHajm)) {
    return `Zamena birligi (${k.birlik}) asl qator birligidan (${k.aslBirlik}) farq qiladi — asl qatorning qancha hajmini almashtirishini (${k.aslBirlik} da) kiriting; aks holda qoldiq minusga tushadi.`;
  }
  if (k.almashtirishHajm < 0) return 'Almashtiriladigan hajm manfiy bo‘lmagan son bo‘lishi shart.';
  if (k.aslHajm != null && Number.isFinite(k.aslHajm) && Math.abs(k.almashtirishHajm) > Math.abs(k.aslHajm) * 1.001 + 1e-9) {
    return `Almashtiriladigan hajm (${k.almashtirishHajm}) asl qator hajmidan (${k.aslHajm} ${k.aslBirlik}) katta.`;
  }
  return null;
}
