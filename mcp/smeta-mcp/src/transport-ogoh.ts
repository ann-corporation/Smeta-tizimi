/** Transport auditi yordamchisi (ish-oqimi bilan aylanma import bo'lmasligi uchun alohida fayl). */
import type { Mijoz } from './db';

type Audit = { xulosa?: Record<string, number> };

/** F-2 qoralama yaratilganda: transport xatolari bo'lsa ogohlantirish (qoralama bloklanmaydi; tasdiqlash serverda bloklanadi). */
export async function transportOgoh(m: Mijoz, aktor: number, obyektId: number, ogoh: string[]): Promise<void> {
  try {
    const au = (await m.query<{ r: Audit | null }>('select public.t2_qator_transport_audit_v1($1::bigint, $2::bigint) as r', [aktor, obyektId])).rows[0]?.r;
    const n = au?.xulosa?.xato_soni ?? 0;
    if (n > 0) ogoh.push(`TRANSPORT: ${n} ta xato (transport_tekshir) — F-2 tasdiqlanishidan oldin tuzating, aks holda server tasdiqlashni rad etadi.`);
  } catch { /* migratsiya qo'llanmagan bo'lsa jim */ }
}

