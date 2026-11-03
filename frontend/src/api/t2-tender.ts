/**
 * TENDER / XARID API (egasi 2026-11-03). O'qish: /api/sb (`tender_*`, stable RPC), yozish: /api/sb-yoz (`tender_*` amallari).
 * Server: 20261122000200_t2_tender_protsess_v1 (P2/P3 poydevori ustida). Actor — sessiyadan; muhr qoidasi (takliflar ochilguncha
 * yashirin) va byudjet yashirinligi BAZADA — bu yerda faqat tur va xaritalash.
 * Narxlar NDS siz keladi; QQS bilan ko'rsatish — lib/tender/pul.ts (yagona hisob-yadro).
 */
import { yozAmali, yangiOperationId, type AktNatija } from './supabase';
import { vaqtliOqish } from './vaqtli-fetch';
import type { TenderHolat } from '../lib/tender/holat';
import type { Meyor, TQator, TTaklif } from '../lib/tender/taqqoslash';

export type TenderTur = 'material' | 'xizmat' | 'subpudrat' | 'transport' | 'texnika_ijara' | 'loyihalash' | 'laboratoriya';
export const TENDER_TURLAR: readonly TenderTur[] = ['material', 'xizmat', 'subpudrat', 'transport', 'texnika_ijara', 'loyihalash', 'laboratoriya'];
export type TenderDoira = 'ochiq' | 'taklif';
export type BaholashUsuli = 'narx' | 'ball';
export type Valyuta = 'UZS' | 'USD' | 'EUR' | 'RUB';
export const TENDER_VALYUTALAR: readonly Valyuta[] = ['UZS', 'USD', 'EUR', 'RUB'];

export type TenderRoyxatQator = {
  id: number; raqam: string | null; nom: string; tur: TenderTur; holat: TenderHolat; effektiv_holat: TenderHolat; doira: TenderDoira;
  muddat: string | null; raund: number; versiya: number; yaratildi: string; valyuta: Valyuta; qqs_foiz: number;
  egasi: boolean; egasi_kompaniya_id: number; egasi_nom: string | null; byudjet_qqs_bilan: number | null;
  qator_soni: number; lot_soni: number; takliflar_soni: number | null;
  mening_taklifim: { id: number; holat: string; versiya: number; raund: number } | null;
};
export type TenderQatorServer = {
  id: number; qator_no: number; lot_no: number; lot_nom: string | null; nom: string; birlik: string; miqdor: number; talab_sana: string | null;
  yetkazish_joyi: string | null; spets: string | null; resurs_kodi: string | null; zayavka_id?: number | null;
  golib_taklif_qator_id?: number | null; mening_yutganim?: boolean | null;
};
export type TenderTaklifQatorServer = { rfq_qator_id: number; taklif_qator_id: number; narx: number; muddat_kun: number | null; mavjud_miqdor: number | null; izoh: string | null };
export type TenderTaklifServer = {
  id: number; yetkazuvchi_kompaniya_id: number; yetkazuvchi_nom: string | null; holat: string; versiya: number; raund: number;
  narx: number | null; yetkazish_narx: number | null; qqs_foiz: number | null; tolov_sharti: string | null; amal_kun: number | null; kafolat_oy: number | null;
  izoh: string | null; yaratildi: string; reyting: { ball: number | null; soni: number } | null; qatorlar: TenderTaklifQatorServer[];
};
export type TenderSavol = { id: number; savol: string; javob: string | null; javob_vaqt: string | null; ommaviy: boolean; yaratildi: string; meniki: boolean; savol_nom: string | null };
export type TenderBuyurtma = {
  id: number; holat: string; bosqich: string | null; summa_nds_siz: number | null; yetkazish_narx: number | null; qqs_foiz: number | null;
  ijrochi_kompaniya_id: number; ijrochi_nom: string | null; yaratildi: string; baho: number | null;
  qatorlar: { nom: string; birlik: string; miqdor: number; narx: number | null; qabul_miqdor: number | null; qabul_holat: string | null }[] | null;
};
export type TenderTafsilot = {
  egasi: boolean; ochilgan: boolean; ruxsat: { yoz: boolean; tasdiq: boolean; taklif: boolean };
  rfq: {
    id: number; raqam: string | null; nom: string; tur: TenderTur; holat: TenderHolat; effektiv_holat: TenderHolat; doira: TenderDoira; muddat: string | null; savol_muddat: string | null;
    izoh: string | null; tolov_sharti: string | null; valyuta: Valyuta; qqs_foiz: number; baholash_usuli: BaholashUsuli; meyor: Meyor; raund: number; versiya: number;
    ochilgan_vaqt: string | null; byudjet_qqs_bilan: number | null; byudjet_korsatish: boolean; obyekt_id: number | null; shartnoma_id: number | null;
    qabul_kompaniya_idlar: number[] | null; golib_asos: string | null; tasdiq_vaqt: string | null; yaratildi: string; yuborgan_actor_id: number | null; tasdiq_actor_id: number | null;
  };
  qatorlar: TenderQatorServer[];
  takliflar_soni: number | null;
  takliflar: TenderTaklifServer[];
  savollar: TenderSavol[];
  baholar: { taklif_id: number; raund: number; jami_ball: number; ballar: Record<string, number>; izoh: string | null }[];
  jurnal: { id: number; hodisa: string; actor_id: number | null; payload: Record<string, unknown>; yaratildi: string }[];
  buyurtmalar: TenderBuyurtma[];
  /** Fayllar R2 da (hujjat-yukla); bu yerda faqat havola (metadata). */
  fayllar: { id: number; hujjat_id: number; primitiv: 'tender' | 'tender_taklif'; primitiv_id: number; turi: string; yaratildi: string }[];
};
export type TenderTahlil = {
  jami: { tender_soni: number; ortacha_ishtirokchi: number | null; jami_tejam_qqs_bilan: number | null; tejam_hisoblangan_soni: number; ortacha_aylanish_kun: number | null };
  holat_boyicha: Record<string, number>;
  tenderlar: { id: number; raqam: string | null; nom: string; holat: string; tur: string; valyuta: string; byudjet_qqs_bilan: number | null; golib_qqs_bilan: number | null;
    ishtirokchi: number; raund: number; tejam_qqs_bilan: number | null; aylanish_kun: number | null }[];
  yetkazuvchilar: { kompaniya_id: number; nom: string; reyting_ball: number | null; baho_soni: number; buyurtma_soni: number }[];
};
export type TenderYetkazuvchi = { kompaniya_id: number; nom: string; reyting_ball: number | null; baho_soni: number; buyurtma_soni: number };

type Javob<T> = { ok: true; natija: T } | { ok: false; error: string; code?: string };

async function oqi<T>(soro: string, yuk: Record<string, unknown>): Promise<Javob<T>> {
  try {
    const r = await vaqtliOqish('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soro, ...yuk }) });
    const j = await r.json() as { ok: boolean; natija?: Record<string, unknown>; error?: string };
    if (!j.ok || !j.natija || typeof j.natija !== 'object') return { ok: false, error: j.error || 'Tender ma’lumotini o‘qib bo‘lmadi.' };
    if (j.natija.ok !== true) return { ok: false, error: 'Tender ma’lumotini o‘qib bo‘lmadi.', code: typeof j.natija.code === 'string' ? j.natija.code : undefined };
    return { ok: true, natija: j.natija as unknown as T };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

export type TenderYonalish = 'meniki' | 'menga' | 'ochiq';
export const tenderRoyxatOl = (p: { kompaniyaId: number; yonalish: TenderYonalish; tur?: string | null; holat?: string | null; limit?: number; keyinId?: number | null }) =>
  oqi<{ qatorlar: TenderRoyxatQator[]; keyingi_id: number | null }>('tender_royxat_v1', {
    kompaniya_id: p.kompaniyaId, yonalish: p.yonalish, ...(p.tur ? { tur: p.tur } : {}), ...(p.holat ? { holat: p.holat } : {}),
    ...(p.limit ? { limit: p.limit } : {}), ...(p.keyinId ? { keyin_id: p.keyinId } : {}) });
export const tenderTafsilotOl = (kompaniyaId: number, rfqId: number) => oqi<TenderTafsilot & { ok: true }>('tender_tafsilot_v2', { kompaniya_id: kompaniyaId, rfq_id: rfqId });
export const tenderYetkazuvchilarOl = (kompaniyaId: number) => oqi<{ qatorlar: TenderYetkazuvchi[] }>('tender_yetkazuvchilar_v1', { kompaniya_id: kompaniyaId });
export const tenderTahlilOl = (kompaniyaId: number, dan?: string | null, gacha?: string | null) =>
  oqi<TenderTahlil>('tender_tahlil_v1', { kompaniya_id: kompaniyaId, ...(dan ? { dan } : {}), ...(gacha ? { gacha } : {}) });

/** Server tafsilotini taqqoslash/ball kutubxonasi turlariga o'tkazadi. Narxsiz qator taklifda yo'q (baza yozmaydi). */
export function tafsilotTaqqoslashga(t: Pick<TenderTafsilot, 'qatorlar' | 'takliflar'>): { qatorlar: TQator[]; takliflar: TTaklif[] } {
  const qatorlar: TQator[] = t.qatorlar.map((q) => ({ id: q.id, qatorNo: q.qator_no, lotNo: q.lot_no, nom: q.nom, birlik: q.birlik, miqdor: Number(q.miqdor) }));
  const takliflar: TTaklif[] = t.takliflar.filter((x) => x.holat === 'berildi' || x.holat === 'faol' || x.holat === 'golib' || x.holat === 'yutqazdi').map((x) => ({
    id: x.id, yetkazuvchiId: x.yetkazuvchi_kompaniya_id, nom: x.yetkazuvchi_nom ?? '', qqsFoiz: x.qqs_foiz == null ? null : Number(x.qqs_foiz),
    yetkazishNarx: x.yetkazish_narx == null ? null : Number(x.yetkazish_narx), amalKun: x.amal_kun, kafolatOy: x.kafolat_oy,
    reyting: x.reyting?.ball == null ? null : Number(x.reyting.ball),
    qatorlar: x.qatorlar.map((q) => ({ rfqQatorId: q.rfq_qator_id, narx: Number(q.narx), muddatKun: q.muddat_kun, mavjudMiqdor: q.mavjud_miqdor == null ? null : Number(q.mavjud_miqdor) })),
  }));
  return { qatorlar, takliflar };
}

/* ───────────── Yozish (har chaqiruvda operation_id: qayta urinishda bir xil beriladi) ───────────── */
type Natija = AktNatija & { id?: number; versiya?: number; raqam?: string; code?: string; raund?: number; buyurtma_idlar?: number[] };
const yoz = (amal: string, kompaniyaId: number, yuk: Record<string, unknown>, operationId?: string): Promise<Natija> =>
  yozAmali({ amal, kompaniya_id: kompaniyaId, operation_id: operationId ?? yangiOperationId(), ...yuk }) as Promise<Natija>;

export type TenderQatorYozuv = {
  nom: string; birlik: string; miqdor: number; lot_no?: number; lot_nom?: string; talab_sana?: string; yetkazish_joyi?: string; spets?: string;
  resurs_kodi?: string; zayavka_id?: number; smeta_qator_id?: number; izoh?: string;
};
export type TenderMaydonlar = {
  sarlavha: string; izoh?: string; byudjet_qqs_bilan?: number | null; byudjet_korsatish?: boolean; qqs_foiz?: number; valyuta?: Valyuta;
  baholash_usuli?: BaholashUsuli; meyor?: Meyor; savol_muddat?: string | null; tolov_sharti?: string;
};
export const tenderSaqla = (kompaniyaId: number, p: { rfqId?: number | null; kutilganVersiya?: number | null; tur: TenderTur; doira: TenderDoira; qabulKompaniyaIdlar?: number[]; obyektId?: number | null;
  muddat?: string | null; maydonlar: TenderMaydonlar; qatorlar: TenderQatorYozuv[] }, operationId?: string) =>
  yoz('tender_saqla_v1', kompaniyaId, { rfq_id: p.rfqId ?? null, kutilgan_versiya: p.kutilganVersiya ?? null, tur: p.tur, doira: p.doira, qabul_kompaniya_idlar: p.qabulKompaniyaIdlar ?? null,
    obyekt_id: p.obyektId ?? null, muddat: p.muddat ?? null, maydonlar: p.maydonlar, qatorlar: p.qatorlar }, operationId);
export const tenderOtish = (kompaniyaId: number, p: { rfqId: number; kutilganVersiya: number; ga: TenderHolat; izoh?: string; shartnomaId?: number | null }, operationId?: string) =>
  yoz('tender_otish_v1', kompaniyaId, { rfq_id: p.rfqId, kutilgan_versiya: p.kutilganVersiya, ga: p.ga, izoh: p.izoh ?? null, shartnoma_id: p.shartnomaId ?? null }, operationId);
export const tenderRaund = (kompaniyaId: number, p: { rfqId: number; kutilganVersiya: number; muddat: string; izoh: string }, operationId?: string) =>
  yoz('tender_raund_v1', kompaniyaId, { rfq_id: p.rfqId, kutilgan_versiya: p.kutilganVersiya, muddat: p.muddat, izoh: p.izoh }, operationId);
export type TenderTaklifYozuv = { rfq_qator_id: number; narx: number; muddat_kun?: number | null; mavjud_miqdor?: number | null; izoh?: string };
export const tenderTaklifBer = (kompaniyaId: number, p: { rfqId: number; qatorlar: TenderTaklifYozuv[]; izoh?: string;
  shart?: { yetkazish_narx?: number | null; qqs_foiz?: number | null; tolov_sharti?: string; amal_kun?: number | null; kafolat_oy?: number | null } }, operationId?: string) =>
  yoz('tender_taklif_v2', kompaniyaId, { rfq_id: p.rfqId, qatorlar: p.qatorlar, izoh: p.izoh ?? null, shart: p.shart ?? {} }, operationId);
export const tenderTaklifQaytar = (kompaniyaId: number, p: { taklifId: number; kutilganVersiya: number }, operationId?: string) =>
  yoz('tender_taklif_qaytar_v2', kompaniyaId, { taklif_id: p.taklifId, kutilgan_versiya: p.kutilganVersiya }, operationId);
export const tenderSavolBer = (kompaniyaId: number, p: { rfqId: number; savol: string }, operationId?: string) =>
  yoz('tender_savol_ber_v1', kompaniyaId, { rfq_id: p.rfqId, savol: p.savol }, operationId);
export const tenderJavob = (kompaniyaId: number, p: { savolId: number; javob: string; ommaviy?: boolean }, operationId?: string) =>
  yoz('tender_javob_v1', kompaniyaId, { savol_id: p.savolId, javob: p.javob, ommaviy: p.ommaviy ?? true }, operationId);
export const tenderBaholashSaqla = (kompaniyaId: number, p: { rfqId: number; kutilganVersiya: number; ballar: { taklif_id: number; ballar: Meyor; izoh?: string }[] }, operationId?: string) =>
  yoz('tender_baholash_saqla_v1', kompaniyaId, { rfq_id: p.rfqId, kutilgan_versiya: p.kutilganVersiya, ballar: p.ballar }, operationId);
export const tenderGolib = (kompaniyaId: number, p: { rfqId: number; kutilganVersiya: number; tanlov: { taklif_id: number; qator_idlar?: number[] | null }[]; asos: string; yakun?: boolean }, operationId?: string) =>
  yoz('tender_golib_v2', kompaniyaId, { rfq_id: p.rfqId, kutilgan_versiya: p.kutilganVersiya, tanlov: p.tanlov, asos: p.asos, yakun: p.yakun ?? true }, operationId);
/** Fayl (PDF/Excel/rasm) avval R2 ga hujjat-yukla orqali yuklanadi; so'ng shu yerda hujjat id si tenderga/taklifga bog'lanadi. */
export const tenderFaylBogla = (kompaniyaId: number, p: { rfqId: number; hujjatIdlar: number[] }, operationId?: string) =>
  yoz('tender_fayl_bogla_v1', kompaniyaId, { rfq_id: p.rfqId, hujjat_idlar: p.hujjatIdlar }, operationId);
export const tenderTaklifFaylBogla = (kompaniyaId: number, p: { taklifId: number; hujjatIdlar: number[] }, operationId?: string) =>
  yoz('tender_taklif_fayl_bogla_v1', kompaniyaId, { taklif_id: p.taklifId, hujjat_idlar: p.hujjatIdlar }, operationId);
export const tenderBahoBer = (kompaniyaId: number, p: { buyurtmaId: number; ball: number; izoh?: string }, operationId?: string) =>
  yoz('tender_baho_ber_v1', kompaniyaId, { buyurtma_id: p.buyurtmaId, ball: p.ball, izoh: p.izoh ?? null }, operationId);

/** Server `code` → foydalanuvchiga tushunarli xabar kaliti (UI `t()` bilan o'raydi). */
export const TENDER_XATO_XABARI: Readonly<Record<string, string>> = {
  VERSIYA_ESKI: 'Tender boshqa foydalanuvchi tomonidan o‘zgartirilgan. Sahifani yangilang.',
  HOLAT: 'Tender holati bu amalga mos emas.',
  MUDDAT_OTGAN: 'Muddat o‘tgan.',
  MUDDAT_OTMAGAN: 'Takliflarni ochish uchun muddat tugashi kerak.',
  MUDDAT_KERAK: 'Avval taklif qabul qilish muddatini kiriting.',
  IZOH_KERAK: 'Sababni yozing.',
  ASOS_KERAK: 'G‘olib tanlash asosini yozing (kamida 10 belgi).',
  MEYOR_YIGINDI: 'Ball usulida mezon vaznlari yig‘indisi 100 bo‘lishi va narx mezoni bo‘lishi kerak.',
  QATORLAR_YOQ: 'Kamida bitta pozitsiya kerak.',
  ALOQA_YOQ: 'Tanlangan yetkazuvchi bilan faol aloqa yo‘q.',
  ALOQA_KERAK: 'G‘olib bilan avval aloqa o‘rnating.',
  QATOR_BAND: 'Bu pozitsiya allaqachon g‘olibga berilgan.',
  QATOR_NARX: 'Har pozitsiya uchun narxni kiriting (narxsiz pozitsiya yuborilmaydi).',
  SAVOL_YOPIQ: 'Savol berish muddati tugagan.',
  JAVOB_BOR: 'Bu savolga javob berilgan.',
  BAHO_BOR: 'Bu buyurtma baholangan.',
  RAUND_CHEGARA: 'Qayta raundlar soni cheklangan.',
  SHARTNOMA_BEGONA: 'Shartnoma topilmadi.',
  HUJJAT_NOTOGRI: 'Hujjatlar noto‘g‘ri (1–10 ta).',
  FAYL_CHEGARA: 'Fayllar soni chegarasi (20 ta) oshdi.',
  DALIL_BEGONA: 'Hujjat sizning kompaniyangizga tegishli emas.',
  PERMISSION_DENIED: 'Bu amal uchun ruxsat yo‘q.',
};
