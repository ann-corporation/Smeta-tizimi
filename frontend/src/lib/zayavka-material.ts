/**
 * «Yangi zayavka» uchun smeta materiallari — sof mantiq. Egasi (audit 71): material smeta resurslaridan tanlansin,
 * birlik o'sha materialdan olinsin («metr» emas), miqdor = smeta − oldin so'ralgan. Noma'lum hajm — null (0 emas).
 */
export type SmetaMaterial = { nom: string | null; birlik: string | null; hajm: number | string | null };
export type OldingiZayavka = { itemText: string; requestedQty: number; unit: string | null; status: string };
export type MaterialTaklif = { nom: string; birlik: string | null; smetaHajm: number | null; soralgan: number; qoldiq: number | null };

const kalit = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function materialTakliflari(qatorlar: readonly SmetaMaterial[], zayavkalar: readonly OldingiZayavka[]): MaterialTaklif[] {
  const m = new Map<string, { nom: string; birlik: string | null; hajm: number | null }>();
  for (const q of qatorlar) {
    const nom = String(q.nom ?? '').trim();
    if (!nom) continue;
    const k = `${kalit(nom)}|${kalit(q.birlik)}`;
    const h = q.hajm == null || q.hajm === '' ? null : Number(q.hajm);
    const bor = m.get(k) ?? { nom, birlik: q.birlik?.trim() || null, hajm: null };
    if (h != null && Number.isFinite(h)) bor.hajm = (bor.hajm ?? 0) + h;
    m.set(k, bor);
  }
  const soralgan = (nom: string, birlik: string | null) => zayavkalar
    .filter((z) => z.status !== 'cancelled' && kalit(z.itemText) === kalit(nom) && (!birlik || !z.unit || kalit(z.unit) === kalit(birlik)))
    .reduce((s, z) => s + (Number.isFinite(z.requestedQty) ? z.requestedQty : 0), 0);
  return [...m.values()].map((x) => {
    const s = soralgan(x.nom, x.birlik);
    return { nom: x.nom, birlik: x.birlik, smetaHajm: x.hajm, soralgan: s, qoldiq: x.hajm == null ? null : Math.max(0, Math.round((x.hajm - s) * 1e6) / 1e6) };
  }).sort((a, b) => a.nom.localeCompare(b.nom, 'ru'));
}

/** Yozilgan nom aynan bitta smeta materialiga mos kelsa — shu taklif (birlik/qoldiq uchun); aks holda null. */
export function materialTopish(royxat: readonly MaterialTaklif[], yozilgan: string): MaterialTaklif | null {
  const k = kalit(yozilgan);
  if (!k) return null;
  const mos = royxat.filter((x) => kalit(x.nom) === k);
  return mos.length === 1 ? mos[0] : null;
}
