/**
 * Nakopitelniy: har tasdiqlangan F-2 — alohida ustun (egasi 2026-11-14). Qiymatlar imzolangan aktdan aynan (t2_f2_tafsilot,
 * `certified_amount ?? summa`); aktning o'z podvali va imzolangan ВСЕГО — yadro bahosidan (`F3DavrAktKeng`). Bekor qilingan aktlar
 * ustun bo'lmaydi (jamiga kirmaydi) — faqat ma'lumot ilovasi: raqam, oy, qaysi akt bilan almashtirilgan.
 */
import type { F2Tafsilot } from '../api/t2-narx';
import type { F3DavrAktKeng } from './f2-oylik-paket/portfel';
import type { NakopitelniyAktMeta, NakopitelniyOylar } from './nakopitelniy-vedomost-export';

const raqamKaliti = (r: string | null | undefined) => String(r ?? '').trim().toLowerCase();

/** Akt reestridagi bekor (cancelled) akt: lmashtirganId — yangi akt (correction_of_akt_id yoki lifecycle_reason matnidan). */
export type BekorAktKirish = { aktId: number; raqam: string | null; oy: string; almashtirganId?: number | null };

export function f2AktUstunlari(rows: readonly F2Tafsilot[], period: string, baho: ReadonlyArray<F3DavrAktKeng>, bekorRoyxat: ReadonlyArray<BekorAktKirish> = []): NakopitelniyOylar & { qiymat: Map<number, Map<string, { hajm: number; summa: number | null }>> } {
  const oyP = period.slice(0, 7);
  const bahoBy = new Map(baho.map((b) => [b.aktId, b] as const));
  const meta = new Map<number, { aktId: number; oy: string; raqam: string | null }>();
  const qiymat = new Map<number, Map<string, { hajm: number; summa: number | null }>>();
  for (const r of rows) {
    const oy = String(r.oy).slice(0, 7);
    if (r.akt_holat !== 'tasdiqlangan' || oy > oyP) continue;
    if (!meta.has(r.akt_id)) meta.set(r.akt_id, { aktId: r.akt_id, oy, raqam: r.raqam });
    const kalit = `a${r.akt_id}`;
    let m = qiymat.get(r.qator_id);
    if (!m) { m = new Map(); qiymat.set(r.qator_id, m); }
    const x = m.get(kalit) ?? { hajm: 0, summa: 0 as number | null };
    x.hajm += Number(r.certified_quantity ?? r.hajm ?? 0);
    const s = r.certified_amount ?? r.summa;
    x.summa = s == null || x.summa == null ? null : x.summa + Number(s);
    m.set(kalit, x);
  }
  const tartib = [...meta.values()].sort((a, b) => a.oy.localeCompare(b.oy) || String(a.raqam ?? '').localeCompare(String(b.raqam ?? ''), 'ru', { numeric: true }) || a.aktId - b.aktId);
  const aktlar: NakopitelniyAktMeta[] = tartib.map((a) => {
    const b = bahoBy.get(a.aktId);
    return { kalit: `a${a.aktId}`, aktId: a.aktId, oy: a.oy, raqam: a.raqam, nk: b?.nk ?? null, qqsBilan: b ? b.qqsBilan : null, birlikSoni: b?.birlikSoni, imzolangan: b?.imzolangan ?? null, podvalQatorlar: b?.podvalQatorlar ?? null };
  });
  // Bekor aktlar (akt reestridan): jamiga kirmaydi; almashtirgan akt — `correction_of_akt_id`, sabab matnidagi «akt N», yoki shu oy/raqamli tasdiqlangan akt.
  const bekorAktlar = bekorRoyxat.map((a) => {
    const id = a.almashtirganId ?? tartib.find((t) => t.oy === a.oy.slice(0, 7) && raqamKaliti(t.raqam) === raqamKaliti(a.raqam))?.aktId ?? null;
    const alm = id == null ? null : { aktId: id, raqam: tartib.find((t) => t.aktId === id)?.raqam ?? null };
    return { aktId: a.aktId, raqam: a.raqam, oy: a.oy.slice(0, 7), almashtirgan: alm };
  }).sort((x, y) => x.oy.localeCompare(y.oy) || x.aktId - y.aktId);
  return { oylar: aktlar.map((a) => a.kalit), qiymat, aktlar, bekorAktlar };
}
