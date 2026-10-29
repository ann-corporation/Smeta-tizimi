/**
 * Smeta versiyasi → farq → da'vo (PTO-CORE-001, egasi 2026-10-26). O'qish — /api/sb (kompaniya siyosati), yozish —
 * /api/sb-yoz nomli buyruqlar (a'zolik + smeta.write RPC ichida, operation_id idempotent). t2_qator ga hech narsa yozilmaydi.
 */
import { sbOqi, yozAmali, type AktNatija } from './supabase';
import { t2ToliqOqiParallel } from './t2-toliq-oqish';
import { t } from '../i18n/til';
import type { MoslikHolat, MoslikQator, PozitsiyaQator, Qaror, SmetaVersiya, VersiyaTur, VPozitsiya } from '../lib/smeta-versiya/turlar';
import type { F2Qator, FPozitsiya, VQator } from '../lib/smeta-versiya/faollashtirish-farq';

export type VersiyaNatija = AktNatija & {
  code?: string; versiya_id?: number; yozildi?: number; otkazildi?: number; qolgan?: number; yangilandi?: number;
  ziddiyatlar?: Array<{ moslik_id: number; versiya: number }>;
};

export async function versiyalarOl(obyektId: number) {
  return sbOqi<SmetaVersiya>({ jadval: 't2_smeta_versiya', filtr: `obyekt_id=eq.${obyektId}&holat=neq.bekor`, tartib: 'id.desc', limit: 200 });
}

export async function pozitsiyalarOl(versiyaId: number) {
  return t2ToliqOqiParallel<PozitsiyaQator>(sbOqi, {
    jadval: 't2_smeta_versiya_pozitsiya', filtr: `versiya_id=eq.${versiyaId}`,
    ustunlar: 'id,versiya_id,tartib,ls_kod,ls_nom,razdel,blok,raqam,kod,nom,birlik,hajm,resurslar', limit: 50000,
  }, 'id');
}

export async function mosliklarOl(versiyaId: number) {
  return t2ToliqOqiParallel<MoslikQator>(sbOqi, {
    jadval: 't2_smeta_versiya_moslik', filtr: `versiya_id=eq.${versiyaId}`,
    ustunlar: 'id,versiya_id,pozitsiya_id,qator_id,holat,ishonch,usul,birlik_farq,eski_hajm,joriy_hajm,joriy_kod,joriy_nom,joriy_birlik,tasdiq,qaror,qurilgan_hajm,qaror_izoh,qaror_vaqt,versiya',
    limit: 60000,
  }, 'id');
}

/** Faollashtirish versiyasi pozitsiyalari — `manba.qator_id` (eski smeta qatori) bilan. */
export async function faollashtirishPozitsiyalariOl(versiyaId: number) {
  return t2ToliqOqiParallel<FPozitsiya>(sbOqi, {
    jadval: 't2_smeta_versiya_pozitsiya', filtr: `versiya_id=eq.${versiyaId}`,
    ustunlar: 'id,versiya_id,tartib,ls_kod,ls_nom,razdel,blok,raqam,kod,nom,birlik,hajm,manba', limit: 50000,
  }, 'id');
}

/** Shu versiya bilan almashtirilgan ESKI qatorlar — aniq opt-in `versiya: 'tarix'` (shlyuz sukut bo'yicha faqat faolni beradi). */
export async function eskiQatorlarOl(obyektId: number, versiyaId: number) {
  return t2ToliqOqiParallel<VQator>(sbOqi, {
    jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&almashtirgan_versiya_id=eq.${versiyaId}`,
    ustunlar: 'id,ota_id,tur,kat,hajm,narx,summa', limit: 200000, versiya: 'tarix',
  }, 'id');
}

/** Eski (almashtirilgan) qatorlardagi tasdiqlangan F2 — tarix, o'zgarmaydi. */
export async function eskiF2Ol(obyektId: number) {
  return t2ToliqOqiParallel<F2Qator>(sbOqi, {
    jadval: 't2_qator_holat', filtr: `obyekt_id=eq.${obyektId}&versiya_holat=eq.almashtirilgan&or=(f2_hajm.neq.0,f2_summa.neq.0)`,
    ustunlar: 'qator_id,f2_hajm,f2_summa', limit: 200000,
  }, 'qator_id');
}

/** E — «bajarilgan, smetadan tashqari / da'vo» o'qish modeli (fakt jurnali uchun; faktga avtomatik yozilmaydi). */
export type DavaQator = {
  kompaniya_id: number; obyekt_id: number; versiya_id: number; versiya_nom: string; versiya_tur: VersiyaTur;
  moslik_id: number; pozitsiya_id: number; qator_id: number | null; holat: MoslikHolat;
  ls_kod: string | null; ls_nom: string | null; kod: string | null; nom: string; birlik: string | null;
  eski_hajm: number | null; joriy_hajm: number | null; qurilgan_hajm: number | null; dava_hajm: number | null;
  qaror: Qaror; qaror_izoh: string | null; qaror_vaqt: string | null;
};
export async function davaRoyxatOl(obyektId: number) {
  return sbOqi<DavaQator>({ jadval: 't2_smeta_versiya_dava', filtr: `obyekt_id=eq.${obyektId}`, tartib: 'moslik_id.asc', limit: 20000 });
}

export function versiyaYarat(p: { kompaniyaId: number; obyektId: number; nom: string; tur: VersiyaTur; manbaSana: string | null; fayllar: Array<{ nom: string; hajm: number }>; izoh?: string; operationId: string }) {
  return yozAmali({ amal: 'smeta_versiya_yarat_v1', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, nom: p.nom, tur: p.tur,
    manba_sana: p.manbaSana, manba_fayllar: p.fayllar, izoh: p.izoh ?? null, operation_id: p.operationId }) as Promise<VersiyaNatija>;
}

/** Pozitsiya bo'lagi (≤ 1000). */
export function pozitsiyaYoz(p: { kompaniyaId: number; versiyaId: number; pozitsiyalar: VPozitsiya[]; operationId: string }) {
  return yozAmali({ amal: 'smeta_versiya_pozitsiya_yoz_v1', kompaniya_id: p.kompaniyaId, versiya_id: p.versiyaId, operation_id: p.operationId,
    pozitsiyalar: p.pozitsiyalar.map((x) => ({ tartib: x.tartib, ls_kod: x.lsKod, ls_nom: x.lsNom, razdel: x.razdel, blok: x.blok, raqam: x.raqam,
      kod: x.kod, nom: x.nom, birlik: x.birlik, hajm: x.hajm, resurslar: x.resurslar, manba: x.manba ?? null })) }) as Promise<VersiyaNatija>;
}

export type MoslikYuk = {
  tartib: number | null; qator_id: number | null; holat: MoslikHolat; ishonch: number | null; usul: string; birlik_farq: boolean;
  eski_hajm: number | null; joriy_hajm: number | null; joriy_kod: string | null; joriy_nom: string | null; joriy_birlik: string | null;
};
export function moslikYoz(p: { kompaniyaId: number; versiyaId: number; mosliklar: MoslikYuk[]; yakunla: boolean; operationId: string }) {
  return yozAmali({ amal: 'smeta_versiya_moslik_yoz_v1', kompaniya_id: p.kompaniyaId, versiya_id: p.versiyaId, mosliklar: p.mosliklar,
    yakunla: p.yakunla, operation_id: p.operationId }) as Promise<VersiyaNatija>;
}

export type QarorYuk = { moslik_id: number; kutilgan_versiya: number; tasdiq?: 'tasdiqlandi' | 'rad'; qaror?: Qaror; qurilgan_hajm?: number; izoh?: string };
export function qarorYoz(p: { kompaniyaId: number; versiyaId: number; qarorlar: QarorYuk[]; operationId: string }) {
  return yozAmali({ amal: 'smeta_versiya_qaror_v1', kompaniya_id: p.kompaniyaId, versiya_id: p.versiyaId, qarorlar: p.qarorlar, operation_id: p.operationId }) as Promise<VersiyaNatija>;
}

export function versiyaBekor(p: { kompaniyaId: number; versiyaId: number; sabab?: string; operationId: string }) {
  return yozAmali({ amal: 'smeta_versiya_bekor_v1', kompaniya_id: p.kompaniyaId, versiya_id: p.versiyaId, sabab: p.sabab ?? null, operation_id: p.operationId }) as Promise<VersiyaNatija>;
}

/** Server kodlari → foydalanuvchi matni. */
export function versiyaXatoMatni(r: VersiyaNatija): string {
  switch (r.code) {
    case 'VERSIYA_ZIDDIYAT': return t('Boshqa foydalanuvchi shu qatorlarni o‘zgartirdi — ro‘yxat yangilandi, qayta tanlang.');
    case 'VERSIYA_YOPIQ': case 'VERSIYA_TAYYOR_EMAS': return t('Versiya holati o‘zgargan — sahifani yangilang.');
    case 'MOSLIK_TOLIQ_EMAS': return t('Moslik to‘liq yozilmadi — yuklashni qayta boshlang.');
    case 'QATOR_SCOPE_MISMATCH': return t('Joriy smeta qatori bu obyektga tegishli emas (smeta o‘zgargan bo‘lishi mumkin).');
    case 'QAROR_MOS_EMAS': return t('Bu qatorga qaror qo‘yib bo‘lmaydi (eski versiyada yo‘q).');
    default: return r.error || r.xabar || r.code || t('Amal bajarilmadi');
  }
}
