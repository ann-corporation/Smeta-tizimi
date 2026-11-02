/**
 * To'lovni OBYEKTLARGA taqsimlash — ko'p obyektli shartnoma (masalan 1-lot: bir to'lov bir necha obyektga).
 * Sukut (taklif): FIFO — to'lov shu shartnoma obyektlarining eng eski to'lanmagan F2 summalarini (oy tartibida, QQS bilan) yopadi;
 * qolgani — «taqsimlanmagan avans» (obyekt_id null). PTO taklifni ko'rib, summalarni qo'lda o'zgartirib tasdiqlaydi.
 * Saqlangan taqsimot (manba='qolda' yoki tasdiqlangan 'fifo') navbatni oldindan yopadi — taklif faqat taqsimotsiz to'lovlarga.
 * Hamma summa tiyinda; jami har doim to'lov summasiga teng.
 */
export type TaqsimotNavbat = { obyektId: number; sana: string; summa: number };
export type TaqsimotTolov = { id: number; sana: string; summa: number; saqlangan: readonly { obyektId: number | null; summa: number }[] };
export type TaqsimotTaklif = { obyektId: number | null; summa: number };

export function fifoTaklif(tolovlar: readonly TaqsimotTolov[], navbat: readonly TaqsimotNavbat[]): Map<number, TaqsimotTaklif[]> {
  const q = navbat.filter((n) => n.summa > 0).slice().sort((a, b) => a.sana.localeCompare(b.sana) || a.obyektId - b.obyektId).map((n) => ({ ...n }));
  const yop = (obyektId: number | null, summa: number) => {
    // Saqlangan taqsimot: shu obyektning eng eski qarzlarini yopadi
    let qol = summa;
    for (const n of q) { if (qol <= 0) break; if (n.obyektId !== obyektId || n.summa <= 0) continue; const o = Math.min(n.summa, qol); n.summa -= o; qol -= o; }
  };
  const tartib = tolovlar.slice().sort((a, b) => a.sana.localeCompare(b.sana) || a.id - b.id);
  for (const t of tartib) for (const s of t.saqlangan) if (s.obyektId != null) yop(s.obyektId, s.summa);
  const natija = new Map<number, TaqsimotTaklif[]>();
  for (const t of tartib) {
    if (t.saqlangan.length || t.summa <= 0) continue;
    let qol = t.summa;
    const qism = new Map<number, number>();
    for (const n of q) {
      if (qol <= 0) break;
      if (n.summa <= 0) continue;
      const o = Math.min(n.summa, qol);
      n.summa -= o; qol -= o;
      qism.set(n.obyektId, (qism.get(n.obyektId) ?? 0) + o);
    }
    const r: TaqsimotTaklif[] = [...qism.entries()].map(([obyektId, summa]) => ({ obyektId, summa }));
    if (qol > 0) r.push({ obyektId: null, summa: qol });
    natija.set(t.id, r);
  }
  return natija;
}

/** Qo'lda o'zgartirilgan taqsimot to'g'rimi: har summa > 0, obyekt takrorlanmaydi, jami = to'lov. */
export function taqsimotTekshir(tolovSumma: number, qatorlar: readonly TaqsimotTaklif[]): { ok: true } | { ok: false; sabab: 'SUMMA' | 'TAKROR' | 'JAMI'; farq?: number } {
  if (qatorlar.some((q) => !Number.isInteger(q.summa) || q.summa <= 0)) return { ok: false, sabab: 'SUMMA' };
  if (new Set(qatorlar.map((q) => q.obyektId ?? 0)).size !== qatorlar.length) return { ok: false, sabab: 'TAKROR' };
  const jami = qatorlar.reduce((a, q) => a + q.summa, 0);
  return jami === tolovSumma ? { ok: true } : { ok: false, sabab: 'JAMI', farq: tolovSumma - jami };
}
