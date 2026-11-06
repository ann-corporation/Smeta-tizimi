/**
 * xato.ts — server javoblarida XAVFSIZ xato. Xom PostgREST/Supabase/HTML
 * tafsiloti brauzerga HECH QACHON chiqmaydi (schema/implementation oshkorligi).
 * Xom matn `console.error` ga (Cloudflare telemetriyasi) yoziladi, foydalanuvchi
 * barqaror `code` + o'zbekcha xabar oladi.
 */
const XABAR: Record<string, string> = {
  AUTH_REQUIRED: 'Sessiya muddati tugagan. Chiqib, qaytadan kiring.',
  CONFIG: 'Server sozlanmagan. Administrator bilan bog‘laning.',
  FORBIDDEN: 'Bu amal uchun ruxsatingiz yo‘q.',
  NOT_FOUND: 'So‘ralgan ma’lumot topilmadi.',
  BAD_REQUEST: 'So‘rov noto‘g‘ri.',
  CONFLICT: 'Ma’lumot boshqa joyda o‘zgargan — sahifani yangilang.',
  STALE_VERSION: 'Ma’lumot boshqa joyda o‘zgargan — sahifani yangilang.',
  FAKT_CONFLICT: 'Fakt boshqa joyda o‘zgargan — holatni yangilang.',
  REPLICA_CONFLICT: 'Nusxa va kanonik ma’lumot o‘rtasida ziddiyat bor — tekshirish kerak.',
  SHEETS_CONFLICT: 'Sheets nusxasi va kanonik ma’lumot o‘rtasida ziddiyat bor — tekshirish kerak.',
  UPSTREAM: 'Ma’lumotni yuklab bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.',
  /* F2 yozish (audit 2026-11-06, A-8): baza CHECK/trigger xatolari umumiy «yuklab bo‘lmadi» emas, sababi bilan. */
  F2_HAJM_NOL: 'F2 qatorida hajm 0 — bunday qator yozilmaydi. Hajmi 0 qatorni olib tashlang yoki hajm kiriting.',
  QATOR_ALMASHTIRILGAN: 'Qator yangi smeta versiyasi bilan almashtirilgan — F2 faqat faol qatorlarga yoziladi. Sahifani yangilang.',
};

/**
 * Baza xatosidan F2 biznes kodi (faqat xabar/kod bo‘yicha; xom matn brauzerga chiqmaydi):
 *  - 23514 + t2_akt_qator_hajm_check → F2_HAJM_NOL;
 *  - P0001 «QATOR_ALMASHTIRILGAN: …» (versiya qo‘riqchisi triggeri) → QATOR_ALMASHTIRILGAN.
 */
export function bazaBiznesKodi(matn: string): 'F2_HAJM_NOL' | 'QATOR_ALMASHTIRILGAN' | null {
  try {
    const j = JSON.parse(matn) as { code?: unknown; message?: unknown };
    const m = typeof j.message === 'string' ? j.message : '';
    if (j.code === '23514' && /\bt2_akt_qator_hajm_check\b/.test(m)) return 'F2_HAJM_NOL';
    if (j.code === 'P0001' && /^QATOR_ALMASHTIRILGAN\b/.test(m)) return 'QATOR_ALMASHTIRILGAN';
  } catch { /* JSON emas */ }
  return null;
}

/** Upstream payloaddan foydalanuvchiga chiqishi mumkin bo‘lgan barqaror kodlar.
 * PostgREST/SQL/HTTP ichki kodlari hech qachon tashqariga ko‘chirilmaydi. */
function xavfsizKod(raw: unknown, status: number): string {
  let candidate = '';
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'code' in parsed) {
        const value = (parsed as { code?: unknown }).code;
        if (typeof value === 'string') candidate = value;
      }
    } catch { /* JSON emas — faqat statusga tayanamiz. */ }
  } else if (raw && typeof raw === 'object' && 'code' in raw) {
    const value = (raw as { code?: unknown }).code;
    if (typeof value === 'string') candidate = value;
  }

  if (candidate === '42501' || status === 403) return 'FORBIDDEN';
  if (status === 401) return 'AUTH_REQUIRED';

  /* Ichki SQL/PostgREST nomlarini emas, formati tekshirilgan application
     code'ni qoldiramiz. Shu sabab STALE_VERSION kabi client contractlar
     saqlanadi, lekin PGRST125/SQLSTATE brauzerga chiqmaydi. */
  if (/^[A-Z][A-Z0-9_]{1,63}$/.test(candidate)
      && !/^(PGRST|SQL|HTTP|POSTGRES|PG)[A-Z0-9_]*$/.test(candidate)) {
    return candidate;
  }
  if (status === 404) return 'NOT_FOUND';
  if (candidate === '40001' || candidate === '23505' || status === 409) return 'CONFLICT';
  return 'UPSTREAM';
}

/** Xom javobni log qiladi, foydalanuvchiga xavfsiz `Response` qaytaradi. */
export function xavfsizXato(code: string, status: number, xom?: unknown): Response {
  if (xom != null) {
    try { console.error('[api xato]', code, status, typeof xom === 'string' ? xom.slice(0, 500) : xom); }
    catch { /* ignore */ }
  }
  const xabar = XABAR[code] || XABAR.UPSTREAM;
  /* `error` eski frontend kontraktlari uchun saqlanadi, lekin qiymati
     har doim whitelistdagi xavfsiz xabar bo‘ladi. */
  return Response.json({ ok: false, code, xato: xabar, error: xabar }, { status });
}

/** Supabase/uchinchi tomon javobini xom tafsilotsiz qaytaradi.
 * `javobStatusi` kerak bo'lsa gateway o'zining xavfsiz HTTP semantikasini
 * (masalan, not-applied=501 yoki permission=403) saqlab qoladi; body'dagi
 * upstream matni hech qachon response'ga ko'chmaydi. */
export function xavfsizUpstream(status: number, xom?: unknown, javobStatusi?: number): Response {
  const responseStatus = javobStatusi ?? (status >= 400 && status < 500 ? status : 502);
  return xavfsizXato(xavfsizKod(xom, status), responseStatus, xom);
}
