/**
 * Oylik ish oqimi (fakt → F2 → Forma 3) uchun SOF «qaysi oy» qoidalari (React/tarmoq yo'q).
 * Egasi (2026-11-11 audit): sahifa oyni qo'lda tanlatmasin — oxirgi faollik oyi o'zi taklif qilinsin.
 * Noma'lum — `null` (taxmin qilinmaydi, hech qachon «joriy oy» deb to'qilmaydi — chaqiruvchi o'zi fallback tanlaydi).
 */
import { bosqich } from '../f2-reestr/reestr';
import type { MarkazAkt } from './markaz';

const OY_RE = /^(\d{4})-(0[1-9]|1[0-2])/;

/** «2026-08-15» / «2026-08» → «2026-08»; noto'g'ri qiymat — null. */
export function oyKaliti(oy: string | null | undefined): string | null {
  const m = OY_RE.exec(String(oy ?? '').trim());
  return m ? `${m[1]}-${m[2]}` : null;
}

/** Bugungi oy «YYYY-MM» (mahalliy vaqt). */
export function bugungiOy(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Faol oy: bekor qilinmagan fakt yoki F2 aktlari orasida ENG OXIRGI oy (qoralama ham — ish shu oyda yuribdi).
 * Akt yo'q (yoki hammasi bekor) — null.
 */
export function faolOy(aktlar: readonly Pick<MarkazAkt, 'tur' | 'oy' | 'holat' | 'lifecycle_status'>[] | null | undefined): string | null {
  let eng: string | null = null;
  for (const a of aktlar ?? []) {
    if (a.tur !== 'fakt' && a.tur !== 'f2') continue;
    if (bosqich({ holat: a.holat, lifecycle_status: a.lifecycle_status ?? null }) === 'bekor') continue;
    const k = oyKaliti(a.oy);
    if (k && (eng == null || k > eng)) eng = k;
  }
  return eng;
}

export type IshOyi = { oy: string; manba: 'tanlangan' | 'faollik' | 'bugun' };

/**
 * Sahifa uchun boshlang'ich oy: foydalanuvchi aniq tanlagan (URL/kontekst) → oxirgi faollik oyi → bugungi oy.
 * `manba` — qaysi qoida ishlagani (ekranda «oxirgi faollik oyi» deb aytish uchun).
 */
export function ishOyi(p: { tanlangan?: string | null; faollik?: string | null; bugun?: string }): IshOyi {
  const t = oyKaliti(p.tanlangan);
  if (t) return { oy: t, manba: 'tanlangan' };
  const f = oyKaliti(p.faollik);
  if (f) return { oy: f, manba: 'faollik' };
  return { oy: oyKaliti(p.bugun) ?? bugungiOy(), manba: 'bugun' };
}

/** Berilgan oyda bekor qilinmagan, FAKT yozuvi bormi (F2 tayyorlashda «shu oyda fakt bor/yo'q» xabari). */
export function oydaFaktSoni(aktlar: readonly Pick<MarkazAkt, 'tur' | 'oy' | 'holat' | 'lifecycle_status'>[] | null | undefined, oy: string): number | null {
  if (!aktlar) return null;
  const k = oyKaliti(oy);
  if (!k) return null;
  return aktlar.filter((a) => a.tur === 'fakt' && oyKaliti(a.oy) === k && bosqich({ holat: a.holat, lifecycle_status: a.lifecycle_status ?? null }) !== 'bekor').length;
}

/**
 * Forma 3 (shartnoma rejimi) uchun boshlang'ich oy: server ro'yxatidagi (tasdiqlangan F2) aktlar orasida
 * hech bir Forma 3 ga kirmagan ENG OXIRGI oy; bunday yo'q bo'lsa — umuman eng oxirgi oy; aktlar yo'q — null.
 */
export function f3BoshOy(aktlar: ReadonlyArray<{ oy: string; band?: boolean | null }> | null | undefined): string | null {
  let bosh: string | null = null; let hammasi: string | null = null;
  for (const a of aktlar ?? []) {
    const k = oyKaliti(a.oy);
    if (!k) continue;
    if (hammasi == null || k > hammasi) hammasi = k;
    if (!a.band && (bosh == null || k > bosh)) bosh = k;
  }
  return bosh ?? hammasi;
}

/** «YYYY-MM» dan n oy oldingi «YYYY-MM» (kengaytirilgan qidiruv oralig'i uchun). */
export function oyOldin(oy: string, n: number): string {
  const k = oyKaliti(oy) ?? bugungiOy();
  const y = Number(k.slice(0, 4)); const m = Number(k.slice(5, 7)) - 1 - n;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
