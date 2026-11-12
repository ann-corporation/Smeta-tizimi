import { useEffect, useState } from 'react';
import { sbT2AktReestrOl } from '../../api/supabase';
import { f2DavomRoyxatOl } from '../../api/t2-f2-davom';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import type { MarkazAkt } from './markaz';
import { faolOy, ishOyi, type IshOyi } from './oy';
import { forma3OyHolati } from './forma3-holat';

export type QadamMalumot = {
  /** Akt reestri; null — hali yuklanmagan yoki o'qilmadi (chiplar ko'rinmaydi). */
  aktlar: MarkazAkt[] | null;
  /** Tugallanmagan F2 import ishlari; null — noma'lum. */
  importQoralama: number | null;
};

const BOSH: QadamMalumot = { aktlar: null, importQoralama: null };

/**
 * Bir vaqtda ishlayotgan so'rovni bo'lishish: qadam chizig'i va sahifaning o'zi (masalan F2 tayyorlash oyni aniqlash uchun)
 * bir xil obyekt uchun ikki marta akt reestrini o'qimasin. Faqat YURIB TURGAN so'rov bo'lishiladi — tugagach yozuv
 * o'chadi (eskirgan natija hech qachon ko'rsatilmaydi).
 */
const YURIB_TURGAN = new Map<string, { t: number; p: Promise<QadamMalumot> }>();
/** Osilib qolgan so'rov yangi chaqiruvlarni abadiy ushlab turmasin. */
const YURIB_MUDDAT_MS = 15000;
/** Test uchun: bo'lishilgan so'rovlarni tozalash. */
export const qadamMalumotKeshTozala = (): void => YURIB_TURGAN.clear();

function malumotOl(kompaniyaId: number, obyektId: number, kalit: string): Promise<QadamMalumot> {
  const bor = YURIB_TURGAN.get(kalit);
  if (bor && Date.now() - bor.t < YURIB_MUDDAT_MS) return bor.p;
  const p = (async (): Promise<QadamMalumot> => {
    try {
      const [a, i] = await Promise.allSettled([sbT2AktReestrOl(obyektId), f2DavomRoyxatOl(kompaniyaId, obyektId)]);
      const aktlar = a.status === 'fulfilled' && a.value.ok ? (a.value.qatorlar ?? []) : null;
      const importQoralama = i.status === 'fulfilled' && i.value.ok ? i.value.qatorlar.filter((q) => !q.yozilgan).length : null;
      return { aktlar, importQoralama };
    } catch {
      return BOSH;
    }
  })().finally(() => { if (YURIB_TURGAN.get(kalit)?.p === p) YURIB_TURGAN.delete(kalit); });
  YURIB_TURGAN.set(kalit, { t: Date.now(), p });
  return p;
}

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
    void malumotOl(kompaniyaId, obyektId, kalit).then((m) => { if (faol) setNatija({ kalit, m }); });
    return () => { faol = false; };
  }, [kalit, kompaniyaId, obyektId]);
  return natija && natija.kalit === kalit ? natija.m : BOSH;
}

/**
 * Sahifa uchun boshlang'ich OY (F2 tayyorlash, Forma 3, qadam chizig'i — hammasi bir xil qoida):
 * foydalanuvchi aniq tanlagan oy (URL/global kontekst) → obyektning oxirgi fakt/F2 faollik oyi → bugungi oy.
 * `aniq` — akt reestri o'qilib bo'ldimi (false bo'lsa oy hali «bugun» fallback, sahifa kutishi mumkin).
 */
export function useIshOyi(obyektId: number | null, tanlangan?: string | null): IshOyi & { aniq: boolean; malumot: QadamMalumot } {
  const ws = usePTOWorkspace();
  const m = useQadamMalumot(ws.companyId, obyektId);
  const aniq = m.aktlar != null;
  const o = ishOyi({ tanlangan: tanlangan ?? ws.scope?.periodId ?? null, faollik: faolOy(m.aktlar) });
  return { ...o, aniq, malumot: m };
}

/** Shu oy uchun Forma 3 soni (null — noma'lum yoki hali yuklanmagan). Faqat `kerak` bo'lsagina o'qiladi. */
export function useForma3Holat(obyektId: number | null, oy: string, kerak: boolean): number | null {
  const [natija, setNatija] = useState<{ kalit: string; n: number | null } | null>(null);
  const kalit = kerak && obyektId != null ? `${obyektId}:${oy}` : '';
  useEffect(() => {
    if (!kalit || obyektId == null) return;
    let faol = true;
    void forma3OyHolati(obyektId, oy).then((n) => { if (faol) setNatija({ kalit, n }); });
    return () => { faol = false; };
  }, [kalit, obyektId, oy]);
  return natija && natija.kalit === kalit ? natija.n : null;
}
