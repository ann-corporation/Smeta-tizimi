/**
 * disk-manba-yol.ts - Diskdagi TIZIM hujjatidan uni yasagan ishchi oynaga o'tish («Tizimda ochish»).
 * Yo'llar mavjud sahifalar (lib/reestr/sahifa.ts, App.tsx) va ularning URL parametrlari bilan bir xil: `?obyekt=<id>` butun ish maydoni doirasini
 * (PTO scope) belgilaydi; sahifaga xos: F-2 tayyorlash `akt`, nakopitelniy/F-3 `f3`, `davr`, holat sahifasida `#slichitelniy`.
 * Manba noma'lum yoki oynasi yo'q hujjat (masalan nashr, foto) uchun null - tugma ko'rsatilmaydi.
 */
export type DiskManbaFayl = {
  manba_turi?: string | null; manba_id?: number | null; hujjat_kalit?: string | null; obyekt_id?: number | null; shartnoma_id?: number | null;
};
export type TizimdaOchish = { yol: string; /** Tugma ostidagi qisqa izoh (i18n kaliti). */ qayerda: string };

const musbat = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
const oyKalitdan = (k: string | null | undefined): string | null => (k ? /(\d{4}-\d{2})$/.exec(k)?.[1] ?? null : null);
const q = (p: Record<string, string | number | null | undefined>) => {
  const s = Object.entries(p).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return s ? `?${s}` : '';
};

export function tizimdaOchishYoli(f: DiskManbaFayl): TizimdaOchish | null {
  const tur = (f.manba_turi ?? '').toLowerCase();
  if (!tur) return null;
  const o = musbat(f.obyekt_id) ? f.obyekt_id : null;
  switch (tur) {
    case 'f2': return musbat(f.manba_id) && o ? { yol: `/admin/f2-tayyorlash${q({ obyekt: o, akt: f.manba_id })}`, qayerda: 'F2 tayyorlash' } : { yol: `/admin/f2-tarix${q({ obyekt: o })}`, qayerda: 'F2 tarixi' };
    case 'f2_akt': return { yol: `/admin/f2-tarix${q({ obyekt: o })}`, qayerda: 'F2 tarixi' };
    case 'forma3': {
      const oy = oyKalitdan(f.hujjat_kalit);
      return musbat(f.manba_id) ? { yol: `/admin/nakopitelniy${q({ obyekt: o, f3: 'shartnoma' })}`, qayerda: 'Nakopitelniy va F3' }
        : { yol: `/admin/nakopitelniy${q({ obyekt: o, f3: 1, davr: oy })}`, qayerda: 'Nakopitelniy va F3' };
    }
    case 'nakopitelniy': return { yol: `/admin/nakopitelniy${q({ obyekt: o })}`, qayerda: 'Nakopitelniy va F3' };
    case 'm29': return { yol: `/admin/m29${q({ obyekt: o })}`, qayerda: 'M-29 (material sarfi)' };
    case 'slichitelniy':
    case 'ostatka': return { yol: o ? `/admin/holat/${o}#slichitelniy` : '/admin/holat', qayerda: 'Smeta va Fakt / LRV' };
    case 'aosr': return { yol: `/admin/aosr${q({ obyekt: o })}`, qayerda: 'Yashirin ishlar akti (АОСР)' };
    case 'smeta': case 'smeta_lrv': case 'smeta_res': case 'sverka_lrv_res': return { yol: `/admin/smeta${q({ obyekt: o })}`, qayerda: 'Smeta' };
    case 'shartnoma_oylik_paket': return { yol: '/admin/f2-reestr', qayerda: 'F2 reestri' };
    case 'sverka_shartnoma': return { yol: `/admin/nakopitelniy${q({ f3: 'shartnoma' })}`, qayerda: 'Nakopitelniy va F3' };
    case 'shartnoma': return { yol: '/admin/shartnoma-liniya', qayerda: 'Shartnomalar va tomonlar' };
    default: return null;
  }
}