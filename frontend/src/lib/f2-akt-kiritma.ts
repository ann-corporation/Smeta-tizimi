/**
 * F2 qoralama akt qatorlari → F2 tayyorlash kiritmalari (hajm/narx/summa/narxsiz).
 * F2TayyorlashNative'dagi «?akt=ID» yuklash mantiqidan CHIQARILGAN (xulq o'zgarmagan): Ish varag'i ham aynan shu
 * funksiya bilan mavjud qoralamani o'qiydi — qoralama qatorlari jim yo'qolmasin (saqlash qatorlarni to'liq almashtiradi).
 */
import { sonMatn, y6, bosKiritma, type F2Bolim, type F2Kiritma, type F2Resurs } from './f2-tayyor';
import { stornoQatorimi } from './f2-storno';

export type AktBand = {
  id?: number; qator_id: number; hajm: number | string | null; certified_quantity: number | string | null;
  certified_unit_price: number | string | null; certified_amount: number | string | null; provenance_status: string | null; raw_snapshot?: unknown;
};

const sonQ = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function aktdanKiritma(aktQatorlari: readonly AktBand[], bolimlar: readonly F2Bolim[]): { k: F2Kiritma; yoq: number; hajmQ: ReadonlySet<number> } {
  const hajmQ = new Set<number>(); const avtoOta = new Map<number, number>(); const resQ = new Map<number, F2Resurs>();
  for (const b of bolimlar) {
    for (const i of b.ishlar) { hajmQ.add(i.id); for (const r of i.resurslar) { resQ.set(r.id, r); if (r.avto) avtoOta.set(r.id, i.id); else hajmQ.add(r.id); } }
    for (const r of b.alohida) { hajmQ.add(r.id); resQ.set(r.id, r); }
  }
  const nk = bosKiritma(); let yoq = 0;
  const avtoAktda: Array<{ id: number; ota: number }> = [];
  for (const x of aktQatorlari) {
    if (stornoQatorimi(x)) continue; // Сторно (eski F2) bloki alohida saqlanadi (aktniYangila), kiritmalarga tushmaydi
    const snap = (x.raw_snapshot ?? {}) as { narxsizSabab?: unknown };
    const id = x.qator_id; const qty = sonQ(x.certified_quantity) ?? sonQ(x.hajm);
    // Son → matn faqat sonMatn orqali (A-4): String(1e-7) = «1e-7» edi va yolg'on «0 bo'lmasin» xatosini berardi.
    if (hajmQ.has(id)) { if (qty != null) nk.hajm[id] = sonMatn(qty); }
    else if (avtoOta.has(id)) avtoAktda.push({ id, ota: avtoOta.get(id)! });
    else { yoq++; continue; }
    const r = resQ.get(id);
    if (!r) continue;
    const narx = sonQ(x.certified_unit_price); const summa = sonQ(x.certified_amount);
    // Avtomatik narxsiz (qoralamada narx topilmagan) ongli «narxsiz» ga aylanmaydi — tasdiqlash uni baribir so'raydi.
    if (x.provenance_status === 'price_intentionally_absent') { if (snap.narxsizSabab !== 'avto_qoralama') nk.narxsiz[id] = true; }
    else if (narx != null) {
      // A-20: narx taklif bilan bir xil bo'lsa kiritmaga yozilmaydi — manba «qo'lda» emas, asl manbasi (smeta/oldingi F2/protokol) qoladi.
      if (r.taklifNarx == null || Math.abs(y6(r.taklifNarx) - narx) > 1e-9) nk.narx[id] = sonMatn(narx);
      if (qty != null && summa != null && Math.abs(qty * narx - summa) > 0.005) nk.summa[id] = sonMatn(summa);
    }
  }
  // A-27: ishi aktda yo'q (yoki hajmi o'qilmagan) avtomatik resurs jim yo'qolmaydi — «ro'yxatda topilmadi» sanog'iga.
  for (const a of avtoAktda) if (nk.hajm[a.ota] === undefined) yoq++;
  return { k: nk, yoq, hajmQ };
}
