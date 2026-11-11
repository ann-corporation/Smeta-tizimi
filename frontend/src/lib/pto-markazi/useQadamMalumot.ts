import { useEffect, useState } from 'react';
import { sbT2AktReestrOl } from '../../api/supabase';
import { f2DavomRoyxatOl } from '../../api/t2-f2-davom';
import type { MarkazAkt } from './markaz';

export type QadamMalumot = {
  /** Akt reestri; null — hali yuklanmagan yoki o'qilmadi (chiplar ko'rinmaydi). */
  aktlar: MarkazAkt[] | null;
  /** Tugallanmagan F2 import ishlari; null — noma'lum. */
  importQoralama: number | null;
};

const BOSH: QadamMalumot = { aktlar: null, importQoralama: null };

/**
 * B0 qadam chizig'i uchun ikkita YENGIL o'qish: obyektning akt reestri (`t2_akt_reestr`) va ochiq F2 import
 * qoralamalari (`f2_import_job_royxat_v1`). Biri xato bersa — o'sha qism null (chip yo'q), sahifa to'xtamaydi.
 */
export function useQadamMalumot(kompaniyaId: number | null, obyektId: number | null): QadamMalumot {
  const [natija, setNatija] = useState<{ kalit: string; m: QadamMalumot } | null>(null);
  const kalit = kompaniyaId != null && obyektId != null ? `${kompaniyaId}:${obyektId}` : '';
  useEffect(() => {
    if (!kalit || kompaniyaId == null || obyektId == null) return;
    let faol = true;
    const ol = async () => {
      const [a, i] = await Promise.allSettled([sbT2AktReestrOl(obyektId), f2DavomRoyxatOl(kompaniyaId, obyektId)]);
      if (!faol) return;
      const aktlar = a.status === 'fulfilled' && a.value.ok ? (a.value.qatorlar ?? []) : null;
      const importQoralama = i.status === 'fulfilled' && i.value.ok ? i.value.qatorlar.filter((q) => !q.yozilgan).length : null;
      setNatija({ kalit, m: { aktlar, importQoralama } });
    };
    void ol();
    return () => { faol = false; };
  }, [kalit, kompaniyaId, obyektId]);
  return natija && natija.kalit === kalit ? natija.m : BOSH;
}
