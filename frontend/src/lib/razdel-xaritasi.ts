/**
 * Smeta qatori → eng yaqin razdel xaritasi (sof, bog'liqliksiz). `ijro-tayyorla` bu yerdan qayta eksport qiladi;
 * yengil modul — Excel/hujjat kutubxonalarini tortmaydi (testlar va yengil komponentlar uchun).
 */
export type QatorMeta = { id: number; ota_id: number | null; tartib: number | null; tur: string | null; nom: string | null };
export type RazdelInfo = { id: number | null; nom: string; yol: number[] };

export const RAZDELSIZ: RazdelInfo = { id: null, nom: '', yol: [Number.MAX_SAFE_INTEGER] };

/** Har qator uchun eng yaqin razdel (tur='rz') va uning tartib yo'li. */
export function razdelXaritasi(meta: readonly QatorMeta[]): Map<number, RazdelInfo> {
  const byId = new Map(meta.map((m) => [m.id, m] as const));
  const yolOf = new Map<number, number[]>();
  const yol = (id: number, kor = new Set<number>()): number[] => {
    const eski = yolOf.get(id); if (eski) return eski;
    const m = byId.get(id);
    if (!m || kor.has(id)) return [];
    kor.add(id);
    const ota = m.ota_id != null ? yol(m.ota_id, kor) : [];
    const r = [...ota, m.tartib ?? m.id];
    yolOf.set(id, r);
    return r;
  };
  const out = new Map<number, RazdelInfo>();
  for (const m of meta) {
    let cur: QatorMeta | undefined = m; let qadam = 0;
    while (cur && cur.tur !== 'rz' && qadam++ < 64) cur = cur.ota_id != null ? byId.get(cur.ota_id) : undefined;
    out.set(m.id, cur && cur.tur === 'rz' ? { id: cur.id, nom: cur.nom ?? '', yol: yol(cur.id) } : RAZDELSIZ);
  }
  return out;
}
