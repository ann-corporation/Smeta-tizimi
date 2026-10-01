/**
 * Shartnoma liniyasi (egasi, 2026-10-01): Kompaniya → Loyiha → Shartnoma (tomonlar) → Obyektlar.
 * O'qish: /api/sb `shartnoma_liniya_v1` (GET → stable, a'zolik ichida). Yozish: /api/sb-yoz `shartnoma_saqla_v2`.
 * Asosiy shartnoma (buyurtmachi ↔ pudratchi) — obyektda bitta; qo'shimchalar (subpudrat, lab, loyihachi…) — cheklanmagan.
 */
import { yozAmali, type AktNatija } from './supabase';

export type LiniyaTomon = { id?: number; rol: string; nom: string; inn: string | null; kontragent_id?: number | null; tomon_kompaniya_id?: number | null; rekvizit?: Record<string, unknown> };
export type LiniyaShartnoma = {
  id: number; loyiha_id: number | null; raqam: string; nom: string | null; turi: string | null; asosiy: boolean; holat: string;
  summa_bez_nds: number | null; nds: number | null; jami_nds_bilan: number | null; izoh: string | null; versiya: number;
  tomonlar: LiniyaTomon[]; obyektlar: number[];
};
export type LiniyaObyekt = { id: number; nom: string; loyiha_id: number | null; asosiy_shartnoma_id: number | null };
export type LiniyaLoyiha = { id: number; nom: string; holat: string | null };
export type Liniya = { loyihalar: LiniyaLoyiha[]; shartnomalar: LiniyaShartnoma[]; obyektlar: LiniyaObyekt[]; rollar: string[]; turlar: string[] };

export async function shartnomaLiniyaOl(kompaniyaId: number): Promise<{ ok: true; natija: Liniya } | { ok: false; error: string }> {
  try {
    const r = await fetch('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soro: 'shartnoma_liniya_v1', kompaniya_id: kompaniyaId }) });
    const j = await r.json() as { ok: boolean; natija?: Liniya; error?: string };
    if (!j.ok || !j.natija) return { ok: false, error: j.error || 'Liniyani o‘qib bo‘lmadi.' };
    return { ok: true, natija: j.natija };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

export type ShartnomaMalumot = {
  loyiha_id: number; raqam: string; nom?: string | null; turi?: string | null; asosiy: boolean;
  summa_bez_nds?: number | null; nds?: number | null; jami_nds_bilan?: number | null; izoh?: string | null;
};

export function shartnomaSaqlaV2(p: {
  kompaniyaId: number; id?: number | null; kutilganVersiya?: number | null; malumot: ShartnomaMalumot;
  tomonlar?: LiniyaTomon[] | null; obyektlar?: number[] | null; operationId: string;
}): Promise<AktNatija & { id?: number; versiya?: number; code?: string }> {
  return yozAmali({
    amal: 'shartnoma_saqla_v2', kompaniya_id: p.kompaniyaId, id: p.id ?? null, kutilgan_versiya: p.kutilganVersiya ?? null,
    malumot: p.malumot, tomonlar: p.tomonlar ?? null, obyektlar: p.obyektlar ?? null, operation_id: p.operationId,
  });
}

export function liniyaXato(r: { error?: string; xabar?: string; code?: string } | null | undefined): string {
  const m = `${r?.code ?? ''} ${r?.error ?? ''} ${r?.xabar ?? ''}`;
  const band = /OBYEKT_BOSHQA_ASOSIY:\s*([^\n]+)/.exec(m);
  if (band) return `Obyekt boshqa asosiy shartnomada: ${band[1].trim()}. Obyektda faqat bitta asosiy (buyurtmachi ↔ pudratchi) shartnoma bo‘ladi.`;
  const loy = /OBYEKT_BOSHQA_LOYIHA:\s*([^\n]+)/.exec(m);
  if (loy) return `Obyekt shartnoma loyihasida emas: ${loy[1].trim()}.`;
  if (/RAQAM_BAND/.test(m)) return 'Bu raqamli shartnoma allaqachon bor.';
  if (/RAQAM_REQUIRED/.test(m)) return 'Shartnoma raqami kiritilmagan.';
  if (/LOYIHA_REQUIRED|LOYIHA_NOT_FOUND/.test(m)) return 'Loyihani tanlang — shartnoma loyiha ichida bo‘ladi.';
  if (/ASOSIY_OZGARMAYDI/.test(m)) return 'Obyektlari bor shartnomaning asosiy/qo‘shimcha turi o‘zgarmaydi — avval obyektlarni ajrating.';
  if (/LOYIHA_OZGARMAYDI/.test(m)) return 'Shartnoma obyektlari boshqa loyihada — loyihani o‘zgartirib bo‘lmaydi.';
  if (/TOMON_INVALID/.test(m)) return 'Har tomonda rol va nom bo‘lishi shart.';
  if (/STALE_VERSION/.test(m)) return 'Shartnoma shu orada o‘zgargan — yangilab qayta urinib ko‘ring.';
  if (/WRITE_ROLE_REQUIRED/.test(m)) return 'Bu amal uchun PTO, buxgalter, rahbar yoki admin roli kerak.';
  return r?.error || r?.xabar || r?.code || 'Saqlab bo‘lmadi.';
}
