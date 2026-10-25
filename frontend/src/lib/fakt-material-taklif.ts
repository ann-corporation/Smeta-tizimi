/**
 * Ish ostidagi ALOHIDA materiallar uchun fakt taklifi (egasi 2026-10-25, «Yo'l 2,5 km»: 595 ta material, ≈7,5 mlrd).
 *
 * Ko'p smetalarda material ishning bolasi emas — ish qatoridan KEYIN alohida qator (tur='mat'/'ob', ota = bo'lim).
 * Ishga fakt kiritilganda faqat uning rs bolalari normadan hisoblanadi, alohida materiallar jim qoladi.
 * Bu modul: (1) bog'lanish — bo'lim ichida tartib bo'yicha ish → keyingi ishgacha turgan alohida mat/ob;
 * (2) taklif — ish ulushida (ish fakti / ish smetasi × material smetasi) yetishmagan hajm.
 * Hech narsa avtomatik yozilmaydi: taklifni foydalanuvchi tugma bilan kiritmaga oladi va o'zi saqlaydi.
 * Qo'shimcha/zamena qatorlar bog'lanishga kirmaydi (asl smeta tuzilmasi bo'yicha); hajm bloklanmaydi; NULL ≠ 0.
 */
export type TaklifQator = { id: number; ota_id: number | null; tur: string | null; tartib?: number | null; qoshimcha?: boolean | null; zamena?: boolean | null };

const RESURS = new Set(['mat', 'ob']);

/** Ish (bl) id → shu ishdan keyin (bir xil bo'limda, keyingi ish yoki ichki bo'limgacha) turgan alohida mat/ob id'lari. */
export function ishKeyingiMateriallari(rows: readonly TaklifQator[]): Map<number, number[]> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const bolalar = new Map<number, TaklifQator[]>();
  for (const r of rows) {
    if (r.ota_id == null || byId.get(r.ota_id)?.tur !== 'rz') continue;
    const a = bolalar.get(r.ota_id); if (a) a.push(r); else bolalar.set(r.ota_id, [r]);
  }
  const out = new Map<number, number[]>();
  for (const arr of bolalar.values()) {
    const tartibli = [...arr].sort((a, b) => (a.tartib ?? Number.MAX_SAFE_INTEGER) - (b.tartib ?? Number.MAX_SAFE_INTEGER) || a.id - b.id);
    let joriy: number | null = null;
    for (const r of tartibli) {
      if (r.qoshimcha || r.zamena) continue; // qo'shilgan/zamena qatorlar asl tartibni buzmaydi
      if (r.tur === 'bl') { joriy = r.id; continue; }
      if (r.tur === 'rz') { joriy = null; continue; }
      if (joriy != null && RESURS.has(r.tur ?? '')) { const a = out.get(joriy); if (a) a.push(r.id); else out.set(joriy, [r.id]); }
    }
  }
  return out;
}

/**
 * Material uchun «bugun» taklifi: ish ulushidagi maqsad (ishFakt / ishSmeta × matSmeta) − material fakti.
 * Smeta noma'lum/manfiy (chegirma) yoki taklif ≤ 0 bo'lsa null.
 */
export function materialTaklifi(ishFakt: number, ishSmeta: number | null, matSmeta: number | null, matFakt: number): number | null {
  if (ishSmeta == null || matSmeta == null || !(ishSmeta > 0) || !(matSmeta > 0) || !(ishFakt > 0)) return null;
  const maqsad = ishFakt / ishSmeta * matSmeta; // hajm bloklanmaydi: ish smetadan oshsa, taklif ham shu ulushda
  const d = Math.round((maqsad - matFakt) * 1e6) / 1e6;
  return d > 1e-9 ? d : null;
}
