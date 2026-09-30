import { yozAmali, sbOqi } from './supabase';
import { trackEntityCommand } from './entity-consistency';

/* ⚡ 2026-08-27 (Claude, MASTER_REJA_ENTERPRISE_OS.md band 16 — "B2B
 * Kontragentlar Tarmoq Reestri"): bu jadval `t2_kompaniya` (tizim
 * tenant'lari, `useKompaniya()`) EMAS — bu bizning ADRESS DAFTARIMIZ:
 * boshqa tashkilotlar (buyurtmachi/pudratchi/subpudratchi/loyihachi/
 * taminotchi), ular bu tizimga hech qachon kirmaydi, faqat
 * shartnoma/aloqa rekviziti sifatida saqlanadi.
 *
 * ⚠️ STIR (INN) haqiqiy davlat/Didox API orqali avto-to'ldirish HALI
 * BOG'LANMAGAN (bu funksiya faqat SAQLASHNI ta'minlaydi — INN'dan
 * rekvizit "tortib olish" qismi alohida, haqiqiy API kaliti kerak
 * bo'ladi). Loyihaning eng qattiq qoidasi bo'yicha BU YERDA VA HECH
 * QAYERDA soxta/mock kompaniya ma'lumoti ishlatilmasin — kalit
 * bog'lanmaguncha forma foydalanuvchidan qo'lda kiritishni so'rasin. */
export type Kontragent = {
  id: number; kompaniya_id: number; inn: string | null; nom: string;
  rahbar: string | null; manzil: string | null; mfo: string | null;
  hisob_raqam: string | null; qqs_tolovchi: boolean | null;
  mavqe: 'buyurtmachi' | 'pudratchi' | 'subpudratchi' | 'loyihachi' | 'taminotchi' | 'laboratoriya' | null;
  versiya: number; yaratildi: string;
};

export function sbKontragentlarOl(kompaniyaId: number) {
  return sbOqi<Kontragent>({ jadval: 't2_kontragent_royxat', filtr: 'kompaniya_id=eq.' + kompaniyaId, tartib: 'nom.asc', limit: 1000 });
}

/** Upsert — `inn` berilsa va bazada mavjud bo'lsa, yozuv YANGILANADI (dublikat yaratilmaydi). */
export function sbKontragentSaqla(p: {
  kompaniyaId: number; inn?: string; nom: string; rahbar?: string; manzil?: string;
  mfo?: string; hisobRaqam?: string; qqsTolovchi?: boolean;
  mavqe?: 'buyurtmachi' | 'pudratchi' | 'subpudratchi' | 'loyihachi' | 'taminotchi' | 'laboratoriya';
}) {
  return trackEntityCommand('kontragent', p.kompaniyaId, yozAmali({
    amal: 'kontragent_saqla', kompaniya_id: p.kompaniyaId, inn: p.inn, nom: p.nom,
    rahbar: p.rahbar, manzil: p.manzil, mfo: p.mfo, hisob_raqam: p.hisobRaqam,
    qqs_tolovchi: p.qqsTolovchi, mavqe: p.mavqe,
  }));
}

export function sbKontragentOchir(id: number) {
  return yozAmali({ amal: 'kontragent_ochir', id });
}
