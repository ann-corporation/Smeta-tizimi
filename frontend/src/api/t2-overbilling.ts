import { sbOqi } from './supabase';

/* ⚡ 2026-08-28 (MASTER_REJA_ENTERPRISE_OS.md FAZA 5, band 50 —
 * "Overbilling radori"): F2 hujjatlari faktdan yoki smetadan oshib
 * ketgan qatorlarni ko'rsatadi. ⚠️ Bu FAQAT ko'rish uchun — yozishda
 * hech narsa bloklanmaydi (foydalanuvchi qarori: "fakt yozilmagan
 * bo'lsa ham f2 yozilgan bo'lishi mumkin, faqat ogohlantirish
 * yetarli"). Manfiy `smeta_hajm` (ПЕРЕРАСЧЁТ/korrektirovka qatorlari)
 * ATAYLAB solishtiruvdan chiqarilgan — ular ceiling emas, tuzatish
 * yozuvi, ularga nisbatan "oshib ketdi" degan signal ma'nosiz bo'lardi
 * (birinchi versiyada shu sabab 1092 soxta signal chiqqan edi, tuzatib
 * 353 haqiqiy signalga tushirilgan — Supabase MCP orqali tekshirilgan). */
export type OverbillingQator = {
  qator_id: number; obyekt_id: number; obyekt_nom: string; kompaniya_id: number;
  kod: string | null; nom: string; birlik: string | null; kat: string | null;
  smeta_hajm: number | null; fakt_hajm: number | null; f2_hajm: number | null;
  f2_fakt_ortiqcha: number | null;
  f2_smeta_ortiqcha: number | null;
  fakt_smeta_ortiqcha: number | null;
};

export function sbOverbillingRadarOl(kompaniyaId: number, obyektId?: number) {
  const shartlar = ['kompaniya_id=eq.' + kompaniyaId];
  if (obyektId) shartlar.push('obyekt_id=eq.' + obyektId);
  return sbOqi<OverbillingQator>({
    jadval: 't2_overbilling_radar',
    filtr: shartlar.join('&'),
    limit: 2000,
  });
}
