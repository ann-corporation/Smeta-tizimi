import { yozAmali, sbOqi } from './supabase';
import { trackEntityCommand } from './entity-consistency';

/* ⚡ 2026-08-27 (Claude, MASTER_REJA_ENTERPRISE_OS.md — FAZA-oldi eng
 * ustuvor bo'shliq): to'liq domen iyerarxiyasi
 *   Kompaniya → Loyiha → Obyekt → Bo'lim → Ish → Resurs → Operatsiya
 * dagi "Loyiha" (Project) bosqichi yo'q edi — Kompaniya to'g'ridan-to'g'ri
 * Obyektga osilgan edi. Bu foydalanuvchining "5 shartnoma, 40 obyekt, bitta
 * 32 gektarlik park" gapining bevosita javobi.
 *
 * ⚠️ 2026-08-28 — ANTIGRAVITY BILAN TO'QNASHUV HAL QILINDI.
 * Antigravity `01_T2_LOYIHA_MIGRATSIYA.sql` da UUID li YANGI `t2_loyiha`
 * taklif qilgan edi. Ishga tushirilmadi, sabab:
 *   • Jadval ALLAQACHON bor (bigint id) — `CREATE TABLE IF NOT EXISTS`
 *     jim hech narsa qilmasdi, frontend esa UUID kutib ishlamay qolardi.
 *   • UUID ga o'tish uchun `t2_obyekt.loyiha_id`, `t2_shartnoma.loyiha_id`
 *     va `t2_loyiha_qatnashchi.loyiha_id` FK larini ham ko'chirish kerak
 *     bo'lardi — funksional foyda nol.
 * QAROR: bigint qoldi, Antigravity so'ragan MAYDONLAR (byudjet, kengroq
 * holat) qo'shildi. Funksiya NOMLARI ham ular ishlatgancha saqlandi
 * (`sbT2LoyihalarOl` / `sbT2LoyihaYoz`) — `TestLoyiha.tsx` o'zgarmasin.
 *
 * ⚠️ Yozish `sbYoz` (ixtiyoriy jadvalga yozish) orqali EMAS — bunday
 * funksiya bu loyihada ataylab yo'q. Yozish faqat `sb-yoz.ts` dagi NOMLI
 * amallar orqali (arxitektura qoidasi: yozish eshigi jimgina kengaymasin).
 */

export type LoyihaHolat = 'faol' | 'tuxtatilgan' | 'yakunlangan' | 'bekor';

export type LoyihaObyekt = { obyekt_id: number; obyekt_nom: string };
export type LoyihaQatnashchiQisqa = { id: number; rol: string; nom: string | null };

export type Loyiha = {
  id: number;
  kompaniya_id: number;
  nom: string;
  izoh: string | null;
  hudud: string | null;
  /** NULL = byudjet belgilanmagan (0 EMAS — 0 boshqa ma'no). */
  byudjet: number | null;
  holat: LoyihaHolat;
  versiya: number;
  yaratildi: string;
  obyektlar: LoyihaObyekt[];
  obyekt_soni: number;
  qatnashchilar: LoyihaQatnashchiQisqa[];
};

/** Antigravity ishlatgan nom — saqlandi. */
export function sbT2LoyihalarOl(kompaniyaId: number) {
  return sbOqi<Loyiha>({
    jadval: 't2_loyiha_royxat',
    filtr: 'kompaniya_id=eq.' + kompaniyaId,
    tartib: 'yaratildi.desc',
    limit: 500,
  });
}
/** Eski nom — orqaga moslik uchun. */
export const sbLoyihalarOl = sbT2LoyihalarOl;

/** Yangi loyiha yaratadi. Antigravity ishlatgan nom saqlandi. */
export function sbT2LoyihaYoz(
  kompaniyaId: number,
  data: { nom: string; hudud?: string | null; izoh?: string | null; byudjet?: number | null },
) {
  return trackEntityCommand('loyiha', kompaniyaId, yozAmali({
    amal: 'loyiha_yarat',
    kompaniya_id: kompaniyaId,
    nom: data.nom,
    izoh: data.izoh ?? undefined,
    hudud: data.hudud ?? undefined,
    byudjet: data.byudjet ?? undefined,
  }));
}
export const sbLoyihaYarat = sbT2LoyihaYoz;

/**
 * Mavjud loyihani tahrirlaydi.
 * `kutilganVersiya` — ro'yxatdan olingan `versiya`. Mos kelmasa RAD etiladi
 * (ikki admin bir vaqtda tahrirlasa jimgina ustidan yozilmasin).
 */
export function sbLoyihaYangila(
  id: number,
  kutilganVersiya: number,
  o: { nom?: string; izoh?: string; hudud?: string; byudjet?: number; holat?: LoyihaHolat },
) {
  return yozAmali({
    amal: 'loyiha_yangila', id, kutilgan_versiya: kutilganVersiya,
    nom: o.nom, izoh: o.izoh, hudud: o.hudud, byudjet: o.byudjet, holat: o.holat,
  });
}

/** Kompaniyada loyiha bo'lmasa avtomatik «Umumiy» loyiha yaratadi (idempotent); mavjud bo'lsa — birinchisini qaytaradi. */
export function sbLoyihaUmumiy(kompaniyaId: number) {
  return fetch('/api/tomon', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amal: 'loyiha_umumiy', kompaniya_id: kompaniyaId }),
  }).then((r) => r.json() as Promise<{ ok: boolean; id?: number; yangi?: boolean; error?: string }>)
    .catch(() => ({ ok: false as const, error: 'Tarmoq xatosi' }));
}

export function sbLoyihaOchir(id: number) {
  return yozAmali({ amal: 'loyiha_ochir', id });
}

/** Obyektni loyihaga biriktirish; `loyihaId: null` — guruhdan chiqarish. */
export function sbObyektLoyihagaBiriktir(obyektId: number, loyihaId: number | null) {
  return yozAmali({ amal: 'obyekt_loyihaga_biriktir', obyekt_id: obyektId, loyiha_id: loyihaId });
}

/* ⚡ 2026-08-28 — POLIMORFIK TASHKILOT MODELI (MASTER_REJA band 1):
 * "Bitta kompaniya turli loyihalarda turli rol o'ynaydi: Buyurtmachi,
 * Bosh pudratchi, Subpudratchi, Loyihachi, Ta'minotchi." Taraf ikki xil
 * bo'lishi mumkin — bizning tenant (`t2_kompaniya`) yoki tashqi B2B
 * reestr (`t2_kontragent`) — ANIQ BITTASI, hech qachon ikkalasi birga. */

export type LoyihaRol =
  | 'zakazchik' | 'bosh_pudratchi' | 'subpudratchi' | 'loyihachi' | 'taminotchi';

export type LoyihaQatnashchi = {
  id: number; rol: LoyihaRol; izoh: string | null; versiya: number;
  kompaniya_id: number | null; kompaniya_nom: string | null;
  kontragent_id: number | null; kontragent_nom: string | null;
};

export type LoyihaQatnashchilar = {
  loyiha_id: number; loyiha_nom: string; qatnashchilar: LoyihaQatnashchi[];
};

export function sbLoyihaQatnashchilarOl(loyihaId: number) {
  return sbOqi<LoyihaQatnashchilar>({
    jadval: 't2_loyiha_qatnashchilar_royxat',
    filtr: 'loyiha_id=eq.' + loyihaId,
    limit: 1,
  });
}

/** Taraf sifatida FAQAT bittasini bering: `kompaniyaId` YOKI `kontragentId`. */
export function sbLoyihaQatnashchiBiriktir(p: {
  loyihaId: number; kompaniyaId?: number | null; kontragentId?: number | null;
  rol: LoyihaRol; izoh?: string;
}) {
  return yozAmali({
    amal: 'loyiha_qatnashchi_biriktir',
    loyiha_id: p.loyihaId,
    kompaniya_id: p.kompaniyaId ?? null,
    kontragent_id: p.kontragentId ?? null,
    rol: p.rol,
    izoh: p.izoh,
  });
}

/** Optimistik qulf — `kutilganVersiya` ro'yxatdan olingan `versiya` bo'lishi shart. */
export function sbLoyihaQatnashchiOchir(id: number, kutilganVersiya: number) {
  return yozAmali({ amal: 'loyiha_qatnashchi_ochir', id, kutilgan_versiya: kutilganVersiya });
}

/** Antigravity `T2Loyiha` deb import qilgan bo'lsa — shu nom ham ishlaydi. */
export type T2Loyiha = Loyiha;
