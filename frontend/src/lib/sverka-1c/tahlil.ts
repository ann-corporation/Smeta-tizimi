/**
 * 1C «Акт сверки взаимных расчетов» — jadvalni o'qish (sof funksiya, brauzerda; fayl serverga yuborilmaydi).
 *
 * Ustunlar QATTIQ harf bilan emas, sarlavha qatori («Дата | Документ | Дебет | Кредит») orqali topiladi:
 * ba'zi eksportlarda jadval bir ustun o'ngga surilgan bo'ladi. Birinchi «Дебет/Кредит» juftligi — bizning (NTB) tomon.
 *
 * Bloklar: «дог. №… от … г., сумма договора …» yoki «Основной договор» → qatorlar → «Итого по договору» → «Сальдо конечное».
 * Fayl darajasi: «Сальдо начальное», «Обороты за период», «Сальдо конечное на <sana>».
 *
 * Qoidalar: hamma pul TIYINDA (butun son; 10743236164.669998 → 1074323616467), qoldiq «+» — buyurtmachi qarzi (debet),
 * «−» — bizning qarz / ishlanmagan avans (kredit). Qator sanasi — «Дата» ustunidan; hujjat ichidagi sana faqat ma'lumot
 * («Продажа (3 от 23.09.0026)» kabi xato yil qatorni buzmaydi, faqat ogohlantirish).
 */
import { tiyin } from '../nakopitelniy-svod';

export type SverkaTur = 'sotuv' | 'tolov' | 'qaytarim' | 'nomalum';

export type SverkaQator = {
  /** Fayldagi qator raqami (1 dan). */
  qator: number;
  sana: string;
  hujjat: string;
  tur: SverkaTur;
  /** «Оплата (№3871600185 от …)» → 3871600185; «Продажа (1 от …)» → 1. */
  raqam: string | null;
  /** Hujjat ichidagi sana (faqat ma'lumot); xato bo'lsa null va `hujjatSanaXato`. */
  hujjatSana: string | null;
  hujjatSanaXato: boolean;
  /** Tiyinda; bo'sh katak — null. */
  debet: number | null;
  kredit: number | null;
  /** Musbat summa (tiyin): sotuv — debet, to'lov/qaytarim — kredit (bo'lmasa debet). */
  summa: number;
};

export type SverkaBlok = {
  sarlavha: string;
  /** «Основной договор» — raqamsiz umumiy blok. */
  asosiyDogovor: boolean;
  /** Fayldagi raqam («ЯНШСХК 1/1»), sana va sarlavhadagi shartnoma summasi (tiyin). */
  raqam: string | null; sana: string | null; summa: number | null;
  /** Boshlang'ich qoldiq (tiyin; debet − kredit). Sarlavhada ko'rsatilmagan — 0. */
  boshlangich: number;
  qatorlar: SverkaQator[];
  itogoDebet: number | null; itogoKredit: number | null;
  /** Fayldagi «Сальдо конечное» (debet − kredit); qator yo'q — null. */
  yakuniy: number | null;
  /** boshlangich + Σdebet − Σkredit (ustunlar bo'yicha, tur farqisiz). */
  hisoblanganYakuniy: number;
  /** Faylning o'zi bilan tenglik (yakuniy bor bo'lsa). */
  ichkiMos: boolean | null;
};

export type SverkaFayl = {
  davrDan: string | null; davrGacha: string | null;
  boshlangich: number | null; aylanmaDebet: number | null; aylanmaKredit: number | null; yakuniy: number | null;
  bloklar: SverkaBlok[];
  /** Fayl yakuniy qoldig'i − bloklar yakuniy yig'indisi: faylda ko'rsatilmagan (harakatsiz) shartnomalar qoldig'i. */
  korsatilmaganQoldiq: number | null;
  ogohlantirishlar: string[];
};

const matn = (v: unknown): string => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
const pad = (n: number) => String(n).padStart(2, '0');

/** «dd.mm.yy», «dd.mm.yyyy», Excel seriya raqami yoki Date → ISO. Yil < 1900 — null. */
export function sanaOqi(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(matn(v));
  if (!m) return null;
  let yil = Number(m[3]);
  if (m[3].length === 2) yil += 2000;
  const oy = Number(m[2]); const kun = Number(m[1]);
  if (yil < 1900 || oy < 1 || oy > 12 || kun < 1 || kun > 31) return null;
  return `${yil}-${pad(oy)}-${pad(kun)}`;
}

/** Katakdagi son → tiyin. Matn bo'lsa («35 810 787 215,57») ham o'qiladi; bo'sh — null. */
export function pulOqi(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? tiyin(v) : null;
  const t = matn(v).replace(/[\s ]/g, '').replace(',', '.');
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return tiyin(Number(t));
}

export function turAniqla(hujjat: string): SverkaTur {
  const h = hujjat.toLowerCase();
  if (/^\s*(продаж|реализац)/.test(h)) return 'sotuv';
  if (/возврат/.test(h)) return 'qaytarim';
  if (/^\s*(оплат|поступлен|плат[её]ж)/.test(h)) return 'tolov';
  return 'nomalum';
}

function hujjatRaqami(hujjat: string): { raqam: string | null; sana: string | null; xato: boolean } {
  const m = /\(\s*№?\s*([^\s()]+)\s+от\s+([\d.]+)\s*\)/i.exec(hujjat);
  if (!m) return { raqam: /№\s*([^\s,()]+)/.exec(hujjat)?.[1] ?? null, sana: null, xato: false };
  const sana = sanaOqi(m[2]);
  return { raqam: m[1], sana, xato: sana == null };
}

/** Shartnoma sarlavhasi: «дог. №ЯНШСХК 1/1 от 18.04.2025 г., сумма договора 91 333 804 000 сум. (…)». */
export function sarlavhaOqi(s: string): { raqam: string | null; sana: string | null; summa: number | null } {
  const r = /№\s*(.+?)\s+от\s+(\d{1,2}\.\d{1,2}\.\d{4})/i.exec(s);
  const sm = /сумма договора\s+([\d\s ]+(?:,\d+)?)/i.exec(s);
  return { raqam: r ? r[1].trim() : null, sana: r ? sanaOqi(r[2]) : null, summa: sm ? pulOqi(sm[1]) : null };
}

type Ustunlar = { sana: number; hujjat: number; debet: number; kredit: number; sarlavhaQatori: number };

export function ustunlarniTop(rows: readonly (readonly unknown[])[]): Ustunlar | null {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = rows[i].map((x) => matn(x).toLowerCase());
    const sana = r.findIndex((x) => x === 'дата');
    const hujjat = r.findIndex((x, j) => j > sana && x === 'документ');
    if (sana < 0 || hujjat < 0) continue;
    const debet = r.findIndex((x, j) => j > hujjat && x === 'дебет');
    const kredit = r.findIndex((x, j) => j > debet && x === 'кредит');
    if (debet > 0 && kredit > 0) return { sana, hujjat, debet, kredit, sarlavhaQatori: i };
  }
  return null;
}

const sum = (xs: readonly (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

/** Butun varaq (sheet_to_json header:1, raw:true) → tuzilma. Sarlavha qatori topilmasa — null. */
export function sverkaJadvalOqi(rows: readonly (readonly unknown[])[]): SverkaFayl | null {
  const u = ustunlarniTop(rows);
  if (!u) return null;
  const ogoh: string[] = [];
  const fayl: SverkaFayl = {
    davrDan: null, davrGacha: null, boshlangich: null, aylanmaDebet: null, aylanmaKredit: null, yakuniy: null,
    bloklar: [], korsatilmaganQoldiq: null, ogohlantirishlar: ogoh,
  };
  for (const r of rows.slice(0, u.sarlavhaQatori)) {
    const m = /за период:?\s*(\d{1,2}\.\d{1,2}\.\d{4})\s*-\s*(\d{1,2}\.\d{1,2}\.\d{4})/i.exec(r.map(matn).join(' '));
    if (m) { fayl.davrDan = sanaOqi(m[1]); fayl.davrGacha = sanaOqi(m[2]); break; }
  }
  let blok: SverkaBlok | null = null;
  let aylanmaKorildi = false;
  const qoldiq = (r: readonly unknown[]) => {
    const d = pulOqi(r[u.debet]); const k = pulOqi(r[u.kredit]);
    return { d, k, q: (d ?? 0) - (k ?? 0), bor: d != null || k != null };
  };

  for (let i = u.sarlavhaQatori + 1; i < rows.length; i++) {
    const r = rows[i];
    const a = matn(r[u.sana]);
    const h = matn(r[u.hujjat]);
    const yorliq = a || h;
    const yl = yorliq.toLowerCase();
    if (!yorliq && !r.some((x) => matn(x))) continue;

    if (/^сальдо начальное/.test(yl)) { fayl.boshlangich = qoldiq(r).q; continue; }
    if (/^(дог\.|договор\b|основной договор)/.test(yl)) {
      const s = sarlavhaOqi(yorliq);
      const q = qoldiq(r);
      blok = {
        sarlavha: yorliq, asosiyDogovor: /^основной договор/.test(yl), raqam: s.raqam, sana: s.sana, summa: s.summa,
        boshlangich: q.q, qatorlar: [], itogoDebet: null, itogoKredit: null, yakuniy: null, hisoblanganYakuniy: q.q, ichkiMos: null,
      };
      fayl.bloklar.push(blok);
      continue;
    }
    if (/итого по договору/.test(yl) || /итого по договору/i.test(h)) {
      if (blok) { const q = qoldiq(r); blok.itogoDebet = q.d; blok.itogoKredit = q.k; }
      continue;
    }
    if (/^обороты за период/.test(yl)) {
      const q = qoldiq(r); fayl.aylanmaDebet = q.d; fayl.aylanmaKredit = q.k; aylanmaKorildi = true; blok = null;
      continue;
    }
    if (/^сальдо конечное/.test(yl)) {
      const q = qoldiq(r);
      if (!aylanmaKorildi && blok && blok.yakuniy == null) blok.yakuniy = q.q;
      else if (fayl.yakuniy == null) fayl.yakuniy = q.q;
      continue;
    }
    const sana = sanaOqi(r[u.sana]);
    if (!sana) continue; // imzo, «По данным…» va boshqa matn qatorlari
    if (!blok) { ogoh.push(`${i + 1}-qator: shartnoma sarlavhasisiz yozuv o'tkazildi.`); continue; }
    const d = pulOqi(r[u.debet]); const k = pulOqi(r[u.kredit]);
    const tur = turAniqla(h);
    const hr = hujjatRaqami(h);
    if (hr.xato) ogoh.push(`${i + 1}-qator: hujjat ichidagi sana xato («${h.slice(0, 60)}») — qator sanasi ${sana} olindi.`);
    const summa = Math.abs(tur === 'sotuv' ? (d ?? k ?? 0) : (k ?? d ?? 0));
    blok.qatorlar.push({ qator: i + 1, sana, hujjat: h, tur, raqam: hr.raqam, hujjatSana: hr.sana, hujjatSanaXato: hr.xato, debet: d, kredit: k, summa });
  }

  for (const b of fayl.bloklar) {
    b.hisoblanganYakuniy = b.boshlangich + sum(b.qatorlar.map((q) => q.debet)) - sum(b.qatorlar.map((q) => q.kredit));
    // «Сальдо конечное на г.» bo'sh bo'lsa (Основной договор, netto 0) — 0 deb o'qilgan; tenglik shu bilan tekshiriladi.
    b.ichkiMos = b.yakuniy == null ? null : b.yakuniy === b.hisoblanganYakuniy;
    if (b.ichkiMos === false) ogoh.push(`«${b.sarlavha.slice(0, 60)}»: faylda yakuniy qoldiq qatorlar yig'indisiga teng emas.`);
  }
  if (fayl.yakuniy != null) {
    fayl.korsatilmaganQoldiq = fayl.yakuniy - sum(fayl.bloklar.map((b) => b.yakuniy ?? b.hisoblanganYakuniy));
  }
  return fayl;
}
