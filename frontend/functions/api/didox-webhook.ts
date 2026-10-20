/**
 * Didox integratsiyasi HALI ULANMAGAN (2026-10-20). Avval bu endpoint hech narsa qilmasdan «sinxronizatsiya boshlandi,
 * topildi: 5» / «OCR tugatildi: 12 qator» deb SOXTA muvaffaqiyat qaytarardi. Endi halol javob: ulanmagan.
 * Haqiqiy integratsiya (imzo bilan tekshiriladigan webhook) alohida vazifa.
 */
export const onRequestPost: PagesFunction = async () =>
  Response.json({ ok: false, code: 'DIDOX_NOT_CONNECTED', error: 'Didox integratsiyasi hali ulanmagan.' }, { status: 501, headers: { 'Cache-Control': 'no-store' } });
