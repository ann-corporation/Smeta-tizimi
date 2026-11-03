/**
 * /api/ish-joyi shlyuzining SOF mantiqi (Pages turlarisiz) — kod, xesh va so'rovni tekshirish. Testlar shuni import qiladi
 * (brauzer typecheck'iga Pages handler kirmasin).
 */
type Yuk = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const sonmi = (v: unknown) => v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0;
const opId = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : crypto.randomUUID());
export const TAKLIF_ROLLARI = ['rahbar', 'bugalter', 'pto', 'prorab', 'buyurtmachi', 'pudratchi', 'kuzatuvchi',
  /* Ekotizim rollari (E2 §3.2; SQL t2_ish_joyi_taklif_yarat_v1 bilan bir xil) */
  'omborchi', 'mexanik', 'kadr', 'taminotchi', 'usta', 'brigadir', 'haydovchi', 'inspektor', 'loyihachi'] as const;

/** Ochiq kod alifbosi: o'xshash belgilarsiz (0/O, 1/I/L yo'q). */
const KOD_ALIFBO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function yangiKod(): string {
  const b = new Uint8Array(15);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += KOD_ALIFBO[x % KOD_ALIFBO.length];
  return `${s.slice(0, 5)}-${s.slice(5, 10)}-${s.slice(10, 15)}`;
}
export const kodTozala = (k: string) => k.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Tomon kodlaridan ajratilgan tuz («ish-joyi-taklif:») — bir tur kod boshqasida ishlamaydi. */
export async function kodXeshi(kod: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ish-joyi-taklif:' + kodTozala(kod)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Yozish so'rovini RPC nomi + yukiga aylantiradi (xato bo'lsa — matn). Kod xeshi alohida (async). Actor yukka qo'shilmaydi. */
export function yozishYuki(amal: string, so: Yuk): { rpc: string; yuk: Yuk } | string {
  const turi = String(so.turi ?? '');
  switch (amal) {
    case 'yarat': {
      const nom = String(so.nom ?? '').replace(/\s+/g, ' ').trim();
      if (nom.length < 2 || nom.length > 120) return 'Ish joyi nomi 2–120 belgi bo‘lsin';
      if (turi !== 'shaxsiy' && turi !== 'tashkilot') return 'Turi: shaxsiy yoki tashkilot';
      return { rpc: 't2_ish_joyi_yarat_v1', yuk: { p_nom: nom, p_turi: turi, p_operation_id: opId(so.operation_id) } };
    }
    case 'turi':
      if (!sonmi(so.kompaniya_id)) return 'kompaniya_id kerak';
      if (turi !== 'shaxsiy' && turi !== 'tashkilot') return 'Turi: shaxsiy yoki tashkilot';
      return { rpc: 't2_ish_joyi_turi_v1', yuk: { p_kompaniya_id: Number(so.kompaniya_id), p_turi: turi } };
    case 'taklif_yarat': {
      if (!sonmi(so.kompaniya_id)) return 'kompaniya_id kerak';
      const rol = String(so.rol ?? '');
      if (!(TAKLIF_ROLLARI as readonly string[]).includes(rol)) return 'Havola orqali beriladigan rolni tanlang';
      const soat = Number(so.muddat_soat ?? 72), soni = Number(so.max_soni ?? 1);
      if (!Number.isInteger(soat) || soat < 1 || soat > 720) return 'Muddat 1 soatdan 30 kungacha';
      if (!Number.isInteger(soni) || soni < 1 || soni > 500) return 'Foydalanish soni 1–500';
      return { rpc: 't2_ish_joyi_taklif_yarat_v1', yuk: { p_kompaniya_id: Number(so.kompaniya_id), p_rol: rol, p_muddat_soat: soat, p_max_soni: soni,
        p_izoh: so.izoh == null ? null : String(so.izoh).slice(0, 200), p_operation_id: opId(so.operation_id) } };
    }
    case 'taklif_bekor':
      if (!sonmi(so.kompaniya_id) || !sonmi(so.taklif_id)) return 'kompaniya_id va taklif_id kerak';
      return { rpc: 't2_ish_joyi_taklif_bekor_v1', yuk: { p_kompaniya_id: Number(so.kompaniya_id), p_taklif_id: Number(so.taklif_id) } };
    case 'qoshil': {
      const kod = kodTozala(String(so.kod ?? ''));
      if (kod.length < 10 || kod.length > 40) return 'Taklif kodi noto‘g‘ri';
      return { rpc: 't2_ish_joyi_qoshil_v1', yuk: { p_kod: kod, p_operation_id: opId(so.operation_id) } };
    }
    default: return 'Amal ochiq emas';
  }
}
