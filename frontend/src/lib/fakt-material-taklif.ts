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
 * Ish (bl) id → shu ishga ERGASHADIGAN barcha mat/ob (tadqiqot 02, birinchi navbat #3; egasi: «ish bajarildi, materiallari
 * ergashmadi»): (1) ishning o'z ichidagi mat/ob bolalari (ota = ish; ichki rs/mat orqali ham, boshqa ishdan o'tmaydi) —
 * smeta importida `rs` emas `mat` deb belgilangan resurslar ham shu yerda; (2) ishdan keyingi alohida mat/ob
 * (`ishKeyingiMateriallari`). Qo'shimcha/zamena qatorlar kirmaydi (asl smeta tuzilmasi bo'yicha). Tartib: avval ichkilar.
 */
export function ishMateriallari(rows: readonly TaklifQator[]): Map<number, number[]> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = new Map<number, number[]>();
  const tartibli = [...rows].sort((a, b) => (a.tartib ?? Number.MAX_SAFE_INTEGER) - (b.tartib ?? Number.MAX_SAFE_INTEGER) || a.id - b.id);
  for (const r of tartibli) {
    if (!RESURS.has(r.tur ?? '') || r.qoshimcha || r.zamena) continue;
    let p = r.ota_id != null ? byId.get(r.ota_id) : undefined; let n = 0; let ish: TaklifQator | undefined;
    while (p && n++ < 20) {
      if (p.qoshimcha || p.zamena || p.tur === 'rz') break;
      if (p.tur === 'bl') { ish = p; break; }
      p = p.ota_id != null ? byId.get(p.ota_id) : undefined;
    }
    if (ish) { const a = out.get(ish.id); if (a) a.push(r.id); else out.set(ish.id, [r.id]); }
  }
  for (const [ish, ms] of ishKeyingiMateriallari(rows)) out.set(ish, [...(out.get(ish) ?? []), ...ms]);
  return out;
}

/**
 * Material uchun «bugun» taklifi: ish ulushidagi maqsad (ishFakt / ishSmeta × (matSmeta − yopiq)) − material fakti.
 * `yopiq` — materialning zamena qoplagan va «bajarilmaydi» hajmi (yagona ochiq qoldiq formulasi bilan bir xil asos).
 * Smeta noma'lum/manfiy (chegirma) yoki taklif ≤ 0 bo'lsa null.
 */
export function materialTaklifi(ishFakt: number, ishSmeta: number | null, matSmeta: number | null, matFakt: number, yopiq = 0): number | null {
  if (ishSmeta == null || matSmeta == null || !(ishSmeta > 0) || !(matSmeta > 0) || !(ishFakt > 0)) return null;
  const asos = matSmeta - Math.max(yopiq, 0);
  if (!(asos > 0)) return null;
  const maqsad = ishFakt / ishSmeta * asos; // hajm bloklanmaydi: ish smetadan oshsa, taklif ham shu ulushda
  const d = Math.round((maqsad - matFakt) * 1e6) / 1e6;
  return d > 1e-9 ? d : null;
}
