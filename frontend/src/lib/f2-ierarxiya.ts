import { daraxtTartibida } from './daraxt-tartibi';

/**
 * F2 qatorlarini smeta IERARXIYASIDA ko'rsatish (egasi 2026-09-30: "tasdiqlash oynasida
 * ierarxik smeta emas, materiallarning tekis ro'yxati chiqadi").
 *
 * Faqat F2 qatorlari va ularning ota-bobolari (bo'lim → ish) ko'rsatiladi; ota qatorda
 * summa — ichidagi F2 qatorlari yig'indisi (noma'lum summa bo'lsa — bo'sh, NULL ≠ 0).
 * Hujjat qiymatlari o'zgartirilmaydi; faqat joylashuv va oraliq jamilar.
 */
export type F2IerSmeta = {
  id: number; ota_id: number | null; tartib: number | null; tur: string | null;
  kod: string | null; nom: string | null; birlik: string | null;
  qoshimcha?: boolean | null; zamena?: boolean | null;
};
export type F2IerQator<L> = {
  qator_id: number; daraja: number; tur: string; kod: string | null; nom: string | null; birlik: string | null;
  qoshimcha: boolean; zamena: boolean;
  /** Bargda — F2 qatorlari (bitta smeta qatoriga bir nechta F2 qismi tushishi mumkin). */
  qatorlar: L[];
  /** Ota qatorda — ichidagi F2 summasi. */
  summa: number | null;
  bolaSoni: number;
};

export function f2Ierarxiya<L extends { qator_id: number }>(
  lines: readonly L[], smeta: readonly F2IerSmeta[], summaOl: (l: L) => number | null | undefined,
): F2IerQator<L>[] {
  const byId = new Map(smeta.map((s) => [s.id, s]));
  const byQator = new Map<number, L[]>();
  for (const l of lines) { const a = byQator.get(l.qator_id); if (a) a.push(l); else byQator.set(l.qator_id, [l]); }
  // Ko'rsatiladigan tugunlar: F2 qatorlari va barcha ota-bobolari.
  const kerak = new Set<number>();
  for (const id of byQator.keys()) for (let t = byId.get(id); t; t = t.ota_id != null ? byId.get(t.ota_id) : undefined) {
    if (kerak.has(t.id)) break;
    kerak.add(t.id);
  }
  const tanlangan = smeta.filter((s) => kerak.has(s.id)).map((s) => ({ ...s, qator_id: s.id }));
  const tartibli = daraxtTartibida(tanlangan);
  const daraja = new Map<number, number>();
  const out: F2IerQator<L>[] = [];
  for (const s of tartibli) {
    const d = s.ota_id != null && daraja.has(s.ota_id) ? daraja.get(s.ota_id)! + 1 : 0;
    daraja.set(s.id, d);
    out.push({
      qator_id: s.id, daraja: d, tur: s.tur ?? 'rs', kod: s.kod, nom: s.nom, birlik: s.birlik,
      qoshimcha: Boolean(s.qoshimcha), zamena: Boolean(s.zamena),
      qatorlar: byQator.get(s.id) ?? [], summa: null, bolaSoni: 0,
    });
  }
  // Smetada topilmagan F2 qatorlari (o'chirilgan smeta qatori) — oxirida, yo'qolmaydi.
  for (const [id, ls] of byQator) if (!byId.has(id)) out.push({ qator_id: id, daraja: 0, tur: 'rs', kod: null, nom: null, birlik: null, qoshimcha: false, zamena: false, qatorlar: ls, summa: null, bolaSoni: 0 });
  // Oraliq jamilar: pastdan yuqoriga.
  for (let i = out.length - 1; i >= 0; i--) {
    const q = out[i];
    let sum: number | null = q.qatorlar.length ? 0 : null;
    for (const l of q.qatorlar) { const v = summaOl(l); if (v != null) sum = (sum ?? 0) + Number(v); }
    let bola = 0, nomalum = false, bolaSum = 0;
    for (let j = i + 1; j < out.length && out[j].daraja > q.daraja; j++) {
      if (out[j].daraja !== q.daraja + 1) continue;
      bola++;
      if (out[j].summa == null) nomalum = true; else bolaSum += out[j].summa!;
    }
    q.bolaSoni = bola;
    if (bola) q.summa = bolaSum + (sum ?? 0);   // egasi qoidasi: ma'lum summalar har doim yig'iladi
    else q.summa = sum;
  }
  return out;
}
