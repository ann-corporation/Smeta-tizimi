/**
 * Bozor havolalari (faqat yo'l/parametr; hisob yo'q). «Bozordan narx so'rash» — zayavka qatori / smeta qatori / narxsiz qator -> bir bosishda to'ldirilgan so'rov formasi.
 * Logistika (#386, /yuk) ga ulanish: faqat havola+parametr; /yuk landing hozircha parametrlarni e'tiborsiz qoldirishi mumkin.
 */
export type SorovBoshlangich = {
  nom: string; birlik: string; hajm?: number | null; hudud?: string | null; resurs_kodi?: string | null;
  zayavka_id?: number | null; obyekt_id?: number | null; tur?: 'tovar' | 'xizmat' | 'ijara';
};

export function sorovHavolasi(b: SorovBoshlangich): string {
  const p = new URLSearchParams();
  p.set('yarat', '1');
  p.set('nom', b.nom.slice(0, 300));
  p.set('birlik', b.birlik.slice(0, 40));
  if (b.hajm != null && Number.isFinite(b.hajm) && b.hajm > 0) p.set('hajm', String(b.hajm));
  if (b.hudud) p.set('hudud', b.hudud);
  if (b.resurs_kodi) p.set('kod', b.resurs_kodi);
  if (b.zayavka_id != null) p.set('zayavka_id', String(b.zayavka_id));
  if (b.obyekt_id != null) p.set('obyekt_id', String(b.obyekt_id));
  if (b.tur && b.tur !== 'tovar') p.set('tur', b.tur);
  return '/admin/bozor-sorov?' + p.toString();
}

export function sorovBoshlangichOqi(p: URLSearchParams): SorovBoshlangich | null {
  if (p.get('yarat') !== '1') return null;
  const son = (k: string) => { const v = Number(p.get(k)); return Number.isFinite(v) && v > 0 ? v : null; };
  const tur = p.get('tur');
  return {
    nom: p.get('nom') ?? '', birlik: p.get('birlik') ?? '', hajm: son('hajm'), hudud: p.get('hudud'), resurs_kodi: p.get('kod'),
    zayavka_id: son('zayavka_id'), obyekt_id: son('obyekt_id'), tur: tur === 'xizmat' || tur === 'ijara' ? tur : 'tovar',
  };
}

/** Yetkazib berish kerak -> Logistika /yuk formasi (faqat havola; hajm faqat tonnada bo'lsa uzatiladi, boshqa birlikda hisob qilinmaydi). */
export function yetkazishHavolasi(b: { nom: string; hajm?: number | null; birlik?: string | null; hudud?: string | null }): string {
  const p = new URLSearchParams();
  p.set('nom', b.nom.slice(0, 120));
  if (b.birlik === 'tonna' && b.hajm != null && Number.isFinite(b.hajm) && b.hajm > 0) p.set('tonna', String(b.hajm));
  if (b.hudud) p.set('b_nom', b.hudud);
  return '/admin/yuk-chaqirish?' + p.toString();
}