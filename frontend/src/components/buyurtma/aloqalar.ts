import { useEffect, useState } from 'react';
import { aloqalarOl, type Aloqa } from '../../api/t2-tomon';

/** Buyurtma berish mumkin bo'lgan tomon: faol aloqasi bor kompaniya (baza ham shuni talab qiladi: `ALOQA_KERAK`). */
export type Yetkazuvchi = { kompaniyaId: number; aloqaId: number; nom: string };

/** Faol aloqalardan (obyekt-ulashish havolalari `obyekt:*` aloqa emas) kompaniyalar ro'yxati; bitta kompaniya bitta marta. */
export function faolAloqalar(aloqalar: readonly Aloqa[]): Yetkazuvchi[] {
  const korilgan = new Set<number>();
  const r: Yetkazuvchi[] = [];
  for (const a of aloqalar) {
    if (a.holat !== 'faol' || String(a.turi || '').startsWith('obyekt:') || a.qarshi_kompaniya_id == null || korilgan.has(a.qarshi_kompaniya_id)) continue;
    korilgan.add(a.qarshi_kompaniya_id);
    r.push({ kompaniyaId: a.qarshi_kompaniya_id, aloqaId: a.id, nom: a.qarshi_nom || '' });
  }
  return r;
}

/** null = yuklanmoqda; [] = faol aloqa yo'q (yoki yuklab bo'lmadi). */
export function useFaolAloqalar(kompaniyaId: number | undefined): Yetkazuvchi[] | null {
  const [holat, setHolat] = useState<{ k: number | undefined; royxat: Yetkazuvchi[] } | null>(null);
  useEffect(() => {
    if (!kompaniyaId) return;
    let bekor = false;
    void aloqalarOl(kompaniyaId).then((r) => { if (!bekor) setHolat({ k: kompaniyaId, royxat: r.ok ? faolAloqalar(r.natija) : [] }); });
    return () => { bekor = true; };
  }, [kompaniyaId]);
  return holat && holat.k === kompaniyaId ? holat.royxat : null;
}

/** Kompaniya id -> ko'rsatiladigan nom (aloqadan); noma'lum bo'lsa raqam. */
export const kompaniyaNomi = (royxat: readonly Yetkazuvchi[] | null, id: number): string =>
  royxat?.find((y) => y.kompaniyaId === id)?.nom || '#' + id;
