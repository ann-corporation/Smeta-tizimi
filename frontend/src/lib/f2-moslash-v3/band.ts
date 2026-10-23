/**
 * F2 HAJM NAZORATI — FAQAT KO'RSATISH (egasi 2026-10-23: loyiha hajmlari xato bo'lishi normal — blok yo'q;
 * haqiqiy dublikat qo'riqchi — shu fayl+varaq SHA256 avval F2 sifatida kiritilganini ogohlantirish, F2ImportV3 da).
 *
 * Import qoldig'i = smeta hajmi − tasdiqlangan F2 − BOSHQA bekor qilinmagan qoralamalar (shu aktdan tashqari) − shu F2.
 * Qoralamalar bir-birini ko'rmasa ikki qoralamaga bir hajm tushadi — shuning uchun «qoralamalarda band» alohida hisoblanadi.
 * Ishora — reja (smeta) ishorasiga nisbatan (chegirma ishi manfiy): `oshibKetdimi` (ostatka-export) bilan bir xil qoida.
 * Qo'shimcha/zamena qatorlari (F2 o'zi yaratgan smeta qatori) ko'rsatilmaydi.
 */
import { oshibKetdimi } from '../ostatka-export';

export type BandManba = { aktId: number; qatorId: number; hajm: number | null };

/** Boshqa qoralamalardagi hajm (qator → jami). `istisnoAktId` — hozir tahrirlanayotgan qoralama (o'zini o'zi band qilmaydi). */
export function qoralamaBandi(lines: readonly BandManba[], istisnoAktId: number | null): Map<number, number> {
  const m = new Map<number, number>();
  for (const l of lines) {
    if (l.aktId === istisnoAktId || l.hajm == null || !Number.isFinite(l.hajm)) continue;
    m.set(l.qatorId, (m.get(l.qatorId) ?? 0) + l.hajm);
  }
  return m;
}

/** Qoldiq: smeta − tasdiqlangan − band (shu F2 siz). Smeta hajmi noma'lum — qoldiq ham noma'lum (kiritilmaydi). */
export function importQoldigi(smeta: ReadonlyMap<number, number | null>, tasdiqlangan: ReadonlyMap<number, number>, band: ReadonlyMap<number, number>): Map<number, number> {
  const m = new Map<number, number>();
  for (const [id, h] of smeta) if (h != null) m.set(id, h - (tasdiqlangan.get(id) ?? 0) - (band.get(id) ?? 0));
  return m;
}

export type QoldiqOshish = { qatorId: number; smeta: number; tasdiqlangan: number; band: number; shu: number; qoldiq: number };

/**
 * Shu F2 qatorlari (bir smeta qatoriga bir necha qism bo'lishi mumkin — yig'iladi) qoldiqdan oshadimi.
 * `tekshirilmaydi` — qo'shimcha/zamena qator id lari; `ruxsat` — «Oshirib yozish» belgisi qo'yilgan qator id lari.
 */
export function qoldiqOshishlari(
  rows: ReadonlyArray<{ qatorId: number; hajm: number | string | null }>,
  smeta: ReadonlyMap<number, number | null>,
  tasdiqlangan: ReadonlyMap<number, number>,
  band: ReadonlyMap<number, number>,
  tekshirilmaydi: ReadonlySet<number> = new Set(),
  ruxsat: ReadonlySet<number> = new Set(),
): QoldiqOshish[] {
  const shu = new Map<number, number>();
  for (const r of rows) {
    const h = typeof r.hajm === 'string' ? Number(r.hajm) : r.hajm;
    if (h == null || !Number.isFinite(h)) continue;
    shu.set(r.qatorId, (shu.get(r.qatorId) ?? 0) + h);
  }
  const out: QoldiqOshish[] = [];
  for (const [id, h] of shu) {
    if (tekshirilmaydi.has(id) || ruxsat.has(id) || id <= 0) continue;
    const s = smeta.get(id);
    if (s == null) continue;
    const t = tasdiqlangan.get(id) ?? 0, b = band.get(id) ?? 0;
    const qoldiq = s - t - b - h;
    if (oshibKetdimi(s, qoldiq) && Math.abs(qoldiq) > 1e-6) out.push({ qatorId: id, smeta: s, tasdiqlangan: t, band: b, shu: h, qoldiq });
  }
  return out.sort((a, b) => a.qatorId - b.qatorId);
}
