/**
 * narx-dalil/katalog-oqish.ts — narx manbasi (katalog, faktura ilovasi, КП jadvali) Excel
 * varag'idan pozitsiyalarni olish. Yangi o'quvchi EMAS: ustunlarni yagona smeta anatomiyasi
 * (`varaqniTahlilQil`) aniqlaydi; topilmasa — operator ustunlarni qo'lda ko'rsatadi.
 * Narx son bo'lmasa — pozitsiya narxsiz qoladi (NULL ≠ 0), lekin ro'yxatda turadi.
 */
import type { SheetGrid } from '../f2-import-parse';
import { varaqniTahlilQil } from '../smeta-anatomiya/varaq';
import type { Katak } from '../smeta-anatomiya/turlar';
import type { NarxManbaQatorKirish } from '../../api/t2-narx-dalil';

export type KatalogUstunlar = { kod: number; nom: number; birlik: number; narx: number; boshQator: number };

export type KatalogOqishNatija = {
  ustunlar: KatalogUstunlar | null;
  /** Ustunlar qayerdan: anatomiya yoki operator. */
  manba: 'anatomiya' | 'operator' | null;
  qatorlar: NarxManbaQatorKirish[];
  narxsiz: number;
};

const matn = (v: unknown) => (v == null ? '' : String(v).trim());

export function katalogSon(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = matn(v).replace(/[\s ]/g, '').replace(',', '.');
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Anatomiya bo'yicha ustunlar (sarlavha bloki topilsa). */
export function katalogUstunlariniTop(nom: string, rows: SheetGrid): KatalogUstunlar | null {
  try {
    const a = varaqniTahlilQil(nom, { nom, rows: rows as unknown as Katak[][] });
    const u = a.ustunlar;
    if (!u || u.nom < 0 || u.narx < 0) return null;
    return { kod: u.shifr, nom: u.nom, birlik: u.birlik, narx: u.narx, boshQator: u.malumotBoshi };
  } catch {
    return null;
  }
}

/** Pozitsiyalarni yig'adi. Bo'lim sarlavhasi (narx ham, birlik ham yo'q) — o'tkazib yuboriladi. */
export function katalogQatorlari(rows: SheetGrid, u: KatalogUstunlar): { qatorlar: NarxManbaQatorKirish[]; narxsiz: number } {
  const qatorlar: NarxManbaQatorKirish[] = [];
  let narxsiz = 0;
  for (let r = Math.max(0, u.boshQator); r < rows.length; r++) {
    const row = rows[r] ?? [];
    const nom = matn(row[u.nom]);
    if (!nom) continue;
    const birlik = u.birlik >= 0 ? matn(row[u.birlik]) : '';
    const narx = katalogSon(row[u.narx]);
    if (narx == null && !birlik) continue; // bo'lim sarlavhasi yoki izoh
    // `\b` kirill harflarida ishlamaydi — keyingi belgi harf emasligini tekshiramiz.
    if (/^(итого|всего|жами|jami)(?![а-яёa-z])/i.test(nom)) continue;
    if (narx == null) narxsiz++;
    qatorlar.push({ kod: u.kod >= 0 ? matn(row[u.kod]) || null : null, nom, birlik: birlik || null, narx });
  }
  return { qatorlar, narxsiz };
}

export function katalogniOqi(nom: string, rows: SheetGrid, qolda?: KatalogUstunlar | null): KatalogOqishNatija {
  const u = qolda ?? katalogUstunlariniTop(nom, rows);
  if (!u) return { ustunlar: null, manba: null, qatorlar: [], narxsiz: 0 };
  const { qatorlar, narxsiz } = katalogQatorlari(rows, u);
  return { ustunlar: u, manba: qolda ? 'operator' : 'anatomiya', qatorlar, narxsiz };
}
