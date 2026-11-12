/**
 * Obyektning ЗАКАЗЧIGI nomi (hujjat sarlavhalari uchun): obyekt shartnomasidagi buyurtmachi (kompaniya registri yoki
 * shartnomaning o'z maydonlari); topilmasa — AYNAN BITTA «buyurtmachi» kontragent; aks holda null (to'qilmaydi).
 */
import { sbT2KompaniyalarOl } from '../../api/supabase';
import { sbT2ShartnomaBogOl, sbT2ShartnomalarOl, zakazchikRekvizit } from '../../api/t2-shartnoma';
import { sbKontragentlarOl } from '../../api/t2-kontragent';

export async function obyektZakazchikNomi(kompaniyaId: number, obyektId: number): Promise<string | null> {
  try {
    const bog = await sbT2ShartnomaBogOl(obyektId);
    const shId = bog.ok ? (bog.qatorlar ?? [])[0]?.shartnoma_id ?? null : null;
    if (shId != null) {
      const [sh, kk] = await Promise.all([sbT2ShartnomalarOl(kompaniyaId, false), sbT2KompaniyalarOl()]);
      const s = sh.ok ? (sh.qatorlar ?? []).find((x) => x.id === shId) : undefined;
      if (s) {
        const rek = zakazchikRekvizit(s, (id) => (kk.ok ? (kk.qatorlar ?? []).find((x) => x.id === id) : undefined));
        if (rek.toliqNom?.trim()) return rek.toliqNom.trim();
      }
    }
    const kg = await sbKontragentlarOl(kompaniyaId);
    const b = kg.ok ? (kg.qatorlar ?? []).filter((k) => k.mavqe === 'buyurtmachi') : [];
    return b.length === 1 ? b[0].nom : null;
  } catch { return null; }
}
