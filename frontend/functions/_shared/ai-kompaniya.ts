/**
 * Sessiyadan AI uchun kompaniyani aniqlaydi (eski unmetered endpointlarni ham hisobli qilish uchun): so'ralgan kompaniya sessiya ruxsatida bo'lishi shart;
 * so'ralmasa — faqat bitta ruxsatli kompaniya bo'lsa shu. Jimgina boshqasiga o'tmaydi.
 */
export type SessiyaKompaniyalari = { foydalanuvchi_id?: unknown; kompaniyalar?: Array<{ kompaniya_id: number }> } | null | undefined;
export type KompaniyaNatijasi = { ok: true; id: number; actor: number } | { ok: false; status: number; xabar: string };

export function sessiyaKompaniya(sess: SessiyaKompaniyalari, soralgan: unknown): KompaniyaNatijasi {
  const actor = Number(sess?.foydalanuvchi_id);
  if (!Number.isSafeInteger(actor) || actor <= 0) return { ok: false, status: 401, xabar: 'Sessiyada foydalanuvchi yo‘q' };
  if (!Array.isArray(sess?.kompaniyalar)) return { ok: false, status: 403, xabar: 'Sessiya kompaniya ruxsatini tasdiqlamayapti; qayta kiring' };
  let id: number | null = null;
  if (soralgan != null && soralgan !== '') {
    id = Number(soralgan);
    if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, status: 400, xabar: 'kompaniya_id musbat butun son bo‘lishi kerak' };
  } else if (sess.kompaniyalar.length === 1) id = sess.kompaniyalar[0].kompaniya_id;
  if (!id) return { ok: false, status: 422, xabar: 'Kompaniyani tanlang (bir nechta kompaniya bor)' };
  if (!sess.kompaniyalar.some((a) => a.kompaniya_id === id)) return { ok: false, status: 403, xabar: 'Bu kompaniyaga ruxsat yo‘q' };
  return { ok: true, id, actor };
}
