/**
 * t2-narx-dalil.ts — narx manbalari (katalog, faktura, КП, kalkulyatsiyalar) va smeta
 * narxlarining dalili (egasi Q4/Q5, 2026-10-01). Migratsiya: 20261105130000_t2_narx_dalil_v1.
 * Takliflar qoidalari: lib/narx-dalil/taklif.ts. Hujjat: lib/narx-asoslash-export.ts.
 */
import { sbOqi } from './supabase';

export type NarxManbaTur = 'katalog' | 'faktura' | 'kp' | 'kalkulyatsiya_mash' | 'chel_chas' | 'boshqa';

export const NARX_MANBA_TUR_NOMI: Record<NarxManbaTur, string> = {
  katalog: 'Каталог (текущие цены)',
  faktura: 'Счет-фактура',
  kp: 'Коммерческое предложение',
  kalkulyatsiya_mash: 'Калькуляция стоимости маш.-часа',
  chel_chas: 'Стоимость чел.-часа (публикация)',
  boshqa: 'Иной документ',
};

export type NarxManba = {
  id: number; kompaniya_id: number; tur: NarxManbaTur; nom: string; raqam: string | null; sana: string | null;
  yetkazuvchi: string | null; yetkazuvchi_inn: string | null; region: string | null;
  yil: number | null; kvartal: number | null; nds_holati: 'nds_siz' | 'nds_bilan' | 'nomalum';
  fayl_document_id: string | null; izoh: string | null; holat: 'faol' | 'bekor'; versiya: number;
  kim: string | null; yaratildi: string; yangilandi: string; qator_soni: number; dalil_soni: number;
};

export type NarxManbaMalumot = Partial<Pick<NarxManba, 'tur' | 'nom' | 'raqam' | 'sana' | 'yetkazuvchi' | 'yetkazuvchi_inn' | 'region' | 'yil' | 'kvartal' | 'nds_holati' | 'fayl_document_id' | 'izoh'>>;
export type NarxManbaQatorKirish = {
  kod?: string | null; nom: string; birlik?: string | null; narx?: number | null; izoh?: string | null;
  hudud?: string | null; guruh?: string | null; zavod?: string | null; yil?: number | null; kvartal?: number | null; narx_varianti?: string | null; nds_holati?: string | null;
};
export type NarxManbaQidiruvQatori = {
  id: number; manba_id: number; kompaniya_id: number; kod: string | null; nom: string;
  birlik: string | null; narx: number | null; izoh: string | null;
};

export type NarxTaklif = {
  kompaniya_id: number; obyekt_id: number; qator_id: number; tur: string; kat: string | null;
  kod: string | null; nom: string | null; birlik: string | null; smeta_narx: number | null;
  manba_qator_id: number; manba_id: number; manba_tur: NarxManbaTur; manba_nom: string; manba_raqam: string | null;
  manba_sana: string | null; yil: number | null; kvartal: number | null; region: string | null; yetkazuvchi: string | null;
  nds_holati: NarxManba['nds_holati']; manba_kod: string | null; manba_nom_qator: string; manba_birlik: string | null;
  manba_narx: number; moslik: 'kod' | 'nom_birlik' | 'hudud';
  /** Platforma katalogi (2026-10-02): zavod, NDS izohi ("НДС 12%"), narx varianti, mahsulot guruhi, platforma qatori. */
  ishlab_chiqaruvchi?: string | null; nds_izoh?: string | null; narx_varianti?: string | null; manba_guruh?: string | null; platforma?: boolean | null;
};

export type NarxDalilHolat = {
  id: number; kompaniya_id: number; obyekt_id: number; qator_id: number; tur: string; kat: string | null;
  kod: string | null; nom: string | null; birlik: string | null; hajm: number | null; hozirgi_narx: number | null;
  smeta_narx: number | null; manba_narx: number | null; izoh: string | null; kim: string | null; vaqt: string;
  manba_id: number; manba_tur: NarxManbaTur; manba_nom: string; manba_raqam: string | null; manba_sana: string | null;
  yil: number | null; kvartal: number | null; region: string | null; yetkazuvchi: string | null; yetkazuvchi_inn: string | null;
  nds_holati: NarxManba['nds_holati']; fayl_document_id: string | null;
  manba_kod: string | null; manba_nom_qator: string; manba_birlik: string | null;
  ishlab_chiqaruvchi?: string | null; nds_izoh?: string | null; narx_varianti?: string | null; manba_guruh?: string | null; platforma?: boolean | null;
};

export function sbNarxManbalarOl(kompaniyaId: number) {
  return sbOqi<NarxManba>({ jadval: 't2_narx_manba_royxat', filtr: 'kompaniya_id=eq.' + kompaniyaId + '&holat=eq.faol', tartib: 'yangilandi.desc', limit: 1000 });
}
/** Source rows are read-only evidence. They are used for semantic suggestions;
 * this read never changes smeta/Fakt/F2 prices. */
export function sbNarxManbaQidiruvQatorlariOl(kompaniyaId: number) {
  return sbOqi<NarxManbaQidiruvQatori>({
    jadval: 't2_narx_manba_qator',
    ustunlar: 'id,manba_id,kompaniya_id,kod,nom,birlik,narx,izoh',
    filtr: 'kompaniya_id=eq.' + kompaniyaId,
    tartib: 'id.asc',
    limit: 50000,
  });
}
export function sbNarxTakliflarOl(kompaniyaId: number, obyektId: number) {
  return sbOqi<NarxTaklif>({ jadval: 't2_narx_taklif', filtr: 'kompaniya_id=eq.' + kompaniyaId + '&obyekt_id=eq.' + obyektId, limit: 50000 });
}
export function sbNarxDalillarOl(kompaniyaId: number, obyektId: number) {
  return sbOqi<NarxDalilHolat>({ jadval: 't2_narx_dalil_holat', filtr: 'kompaniya_id=eq.' + kompaniyaId + '&obyekt_id=eq.' + obyektId, limit: 50000 });
}

type Natija = { ok: boolean; error?: string; sabab?: string; id?: number; versiya?: number; qator_qoshildi?: number; boglandi?: number; olib_tashlandi?: number };

async function yoz(yuk: Record<string, unknown>): Promise<Natija> {
  try {
    const r = await fetch('/api/sb-yoz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(yuk) });
    const matn = await r.text();
    try { return JSON.parse(matn) as Natija; }
    catch { return { ok: false, error: `Server vaqtincha javob bermadi (HTTP ${r.status})` }; }
  } catch (e) {
    return { ok: false, error: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) };
  }
}

/** Bitta chaqiruv (metama'lumot + ixtiyoriy qatorlar bo'lagi). */
export function sbNarxManbaYoz(p: { kompaniyaId: number; malumot: NarxManbaMalumot; qatorlar?: NarxManbaQatorKirish[] | null; rejim?: 'almashtir' | 'qosh'; id?: number; kutilganVersiya?: number; operationId?: string }) {
  return yoz({
    amal: 'narx_manba_yoz', kompaniya_id: p.kompaniyaId, malumot: p.malumot, qatorlar: p.qatorlar ?? null, rejim: p.rejim ?? 'almashtir',
    id: p.id, kutilgan_versiya: p.kutilganVersiya, operation_id: p.operationId,
  });
}

/** Katta manba (katalog 25–30 ming qator): yaratadi va qatorlarni bo'laklab yuklaydi. */
export async function narxManbaniYukla(kompaniyaId: number, malumot: NarxManbaMalumot, qatorlar: NarxManbaQatorKirish[], operationId: string, bolak = 5000, jarayon?: (yuklandi: number, jami: number) => void): Promise<Natija> {
  const birinchi = await sbNarxManbaYoz({ kompaniyaId, malumot, qatorlar: qatorlar.slice(0, bolak), rejim: 'almashtir', operationId });
  if (!birinchi.ok || !birinchi.id) return birinchi;
  let versiya = 1;
  let yuklandi = Math.min(bolak, qatorlar.length);
  jarayon?.(yuklandi, qatorlar.length);
  for (let i = bolak; i < qatorlar.length; i += bolak) {
    const r = await sbNarxManbaYoz({ kompaniyaId, malumot: {}, qatorlar: qatorlar.slice(i, i + bolak), rejim: 'qosh', id: birinchi.id, kutilganVersiya: versiya });
    if (!r.ok) return { ...r, id: birinchi.id, error: `${yuklandi} ta qator yuklangandan keyin to'xtadi: ${r.error ?? r.sabab ?? ''}` };
    versiya++;
    yuklandi = Math.min(i + bolak, qatorlar.length);
    jarayon?.(yuklandi, qatorlar.length);
  }
  return { ok: true, id: birinchi.id, qator_qoshildi: yuklandi };
}

/** Platforma katalogi manbalari (bir marta yuklanadi, hamma kompaniya ko'radi). */
export type PlatformaNarxManba = { id: number; /** chala yuklangan manbani aniqlash uchun */ tur: NarxManbaTur; nom: string; yil: number | null; kvartal: number | null; region: string | null; nds_holati: NarxManba['nds_holati']; fayl_document_id: string | null; holat: string; versiya: number; qator_soni: number; yangilandi: string };
export function sbPlatformaManbalarOl() {
  return sbOqi<PlatformaNarxManba>({ jadval: 't2_platforma_narx_manba', filtr: 'holat=eq.faol', tartib: 'yangilandi.desc', limit: 1000 });
}

/** Platforma manbasining JORIY holati (har urinishdan oldin bazadan — sahifa ochilgandagi eski versiya emas). */
export async function platformaManbaHolati(id: number): Promise<{ versiya: number; qator_soni: number } | null> {
  const r = await sbOqi<{ id: number; versiya: number; qator_soni: number }>({ jadval: 't2_platforma_narx_manba', ustunlar: 'id,versiya,qator_soni', filtr: 'id=eq.' + id, limit: 1 });
  const q = r.ok ? r.qatorlar?.[0] : undefined;
  return q ? { versiya: Number(q.versiya), qator_soni: Number(q.qator_soni) } : null;
}

/** Superadmin: platforma katalogini bo'laklab yuklash (server superadminlikni tekshiradi).
 *  2026-10-03: 213 691 qatorlik katalog avval 25 000, keyin 76 000 da uzildi (Cloudflare HTML xato sahifasi).
 *  - bo'lak 1000; har bo'lak vaqtinchalik xatoda 5 marta (2→30 s) qayta uriniladi;
 *  - javob yo'qolgan bo'lak bazadagi versiya/qator soni bo'yicha aniqlanadi (ikki marta yozilmaydi);
 *  - `davomId` — chala manba: bazadagi JORIY qatorlar sonidan DAVOM etadi (bir xil fayl, bir xil tartib). */
export async function platformaManbaniYukla(malumot: NarxManbaMalumot, qatorlar: Array<Record<string, unknown>>, operationId: string, bolak = 1000,
  jarayon?: (yuklandi: number, jami: number) => void, davomId?: number): Promise<Natija> {
  const jami = qatorlar.length;
  const kut = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /** Bitta bo'lak: yozilganini bazadan tasdiqlab, vaqtinchalik xatoda qayta uradi. */
  const bolakYoz = async (id: number, boshi: number): Promise<Natija & { versiya?: number }> => {
    let oxirgi: Natija = { ok: false, error: 'yozilmadi' };
    for (let n = 0; n < 5; n++) {
      const h = await platformaManbaHolati(id);
      if (!h) return { ok: false, error: 'Manba topilmadi' };
      if (h.qator_soni >= boshi + Math.min(bolak, jami - boshi)) return { ok: true, id }; // allaqachon yozilgan
      if (h.qator_soni !== boshi) return { ok: false, error: `Manbada kutilmagan qatorlar soni: ${h.qator_soni} (kutilgan ${boshi})` };
      oxirgi = await yoz({ amal: 'platforma_narx_manba_yoz', malumot: {}, qatorlar: qatorlar.slice(boshi, boshi + bolak), rejim: 'qosh', id, kutilgan_versiya: h.versiya });
      if (oxirgi.ok) return oxirgi;
      if (oxirgi.sabab && oxirgi.sabab !== 'versiya') return oxirgi; // mantiqiy rad — qayta urinilmaydi
      await kut(Math.min(30000, 2000 * 2 ** n));
    }
    return oxirgi;
  };

  let id = davomId ?? null;
  let boshi = 0;
  if (id == null) {
    // Yangi manba: birinchi bo'lak (operation_id — idempotent: javob yo'qolsa ham ikkinchi manba yaratilmaydi).
    let r: Natija = { ok: false };
    for (let n = 0; n < 5; n++) {
      r = await yoz({ amal: 'platforma_narx_manba_yoz', malumot, qatorlar: qatorlar.slice(0, bolak), rejim: 'almashtir', operation_id: operationId });
      if (r.ok || (r.sabab && r.sabab !== 'versiya')) break;
      await kut(Math.min(30000, 2000 * 2 ** n));
    }
    if (!r.ok || !r.id) return r;
    id = r.id;
  }
  const h = await platformaManbaHolati(id);
  if (!h) return { ok: false, error: 'Manba topilmadi' };
  boshi = h.qator_soni;
  jarayon?.(boshi, jami);
  while (boshi < jami) {
    const r = await bolakYoz(id, boshi);
    if (!r.ok) return { ...r, id, error: `${boshi.toLocaleString('ru-RU')} ta qator yuklangandan keyin to'xtadi: ${r.error ?? r.sabab ?? ''}. Faylni qayta tanlang — tizim shu joydan davom etadi.` };
    boshi = Math.min(boshi + bolak, jami);
    jarayon?.(boshi, jami);
  }
  return { ok: true, id, qator_qoshildi: boshi };
}

/** Obyekt hududi va xaritadagi joylashuvi (chel.-soat narxi shu hududdan). */
export async function obyektHududOl(obyektId: number): Promise<{ hudud: string | null; lat: number | null; lng: number | null } | null> {
  const r = await sbOqi<{ id: number; hudud: string | null; lat: number | null; lng: number | null }>({ jadval: 't2_obyekt', ustunlar: 'id,hudud,lat,lng', filtr: 'id=eq.' + obyektId, limit: 1 });
  const q = r.ok ? r.qatorlar?.[0] : undefined;
  return q ? { hudud: q.hudud, lat: q.lat == null ? null : Number(q.lat), lng: q.lng == null ? null : Number(q.lng) } : null;
}
export function obyektHududBelgila(obyektId: number, hudud: string | null) {
  return yoz({ amal: 'obyekt_hudud_belgila', obyekt_id: obyektId, hudud });
}

export function sbNarxManbaBekor(kompaniyaId: number, id: number, kutilganVersiya: number) {
  return yoz({ amal: 'narx_manba_bekor', kompaniya_id: kompaniyaId, id, kutilgan_versiya: kutilganVersiya });
}

/** Operator tanlagan dalillarni yozish (smeta narxi o'zgarmaydi). */
export function sbNarxDalilBogla(kompaniyaId: number, obyektId: number, boglar: { qator_id: number; manba_qator_id: number; izoh?: string }[]) {
  return yoz({ amal: 'narx_dalil_bogla', kompaniya_id: kompaniyaId, obyekt_id: obyektId, boglar });
}

export function sbNarxDalilOchir(kompaniyaId: number, obyektId: number, qatorIds: number[]) {
  return yoz({ amal: 'narx_dalil_ochir', kompaniya_id: kompaniyaId, obyekt_id: obyektId, qator_ids: qatorIds });
}
