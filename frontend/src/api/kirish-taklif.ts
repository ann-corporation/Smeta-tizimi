/** /api/kirish-taklif va /api/kirish-telegram mijoz tomoni (emailsiz kirish). Maxfiy qiymat (kod/havola) faqat yaratish javobida. */
export type TaklifHolat = 'kutmoqda' | 'ishlatildi' | 'bekor' | 'bloklangan' | 'muddati_otgan';
export type TaklifQator = { id: number; ism: string; telefon: string; rol: string; yaratildi: string; tugaydi: string; holat: TaklifHolat; urinishlar: number; ishlatildi_at: string | null };
export type KirishJavob<T = Record<string, unknown>> = { ok: boolean; code?: string; xabar?: string } & Partial<T>;

async function post<T>(yol: string, tana: Record<string, unknown>): Promise<KirishJavob<T>> {
  try {
    const r = await fetch(yol, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tana) });
    const j = await r.json().catch(() => null) as KirishJavob<T> | null;
    return j ?? ({ ok: false, code: 'SERVER_XATO', xabar: 'Server javobi noto‘g‘ri.' } as KirishJavob<T>);
  } catch { return { ok: false, code: 'TARMOQ', xabar: 'Tarmoq xatosi. Qayta urinib ko‘ring.' } as KirishJavob<T>; }
}

export const taklifYarat = (p: { kompaniyaId: number; ism: string; telefon: string; rol: string }) =>
  post<{ taklif_id: number; tugaydi: string; telefon: string; kod: string; havola: string; takror: boolean }>('/api/kirish-taklif', { amal: 'yarat', kompaniya_id: p.kompaniyaId, ism: p.ism, telefon: p.telefon, rol: p.rol });
export const takliflarRoyxati = (kompaniyaId: number) => post<{ takliflar: TaklifQator[] }>('/api/kirish-taklif', { amal: 'royxat', kompaniya_id: kompaniyaId });
export const taklifBekorQil = (kompaniyaId: number, taklifId: number) => post('/api/kirish-taklif', { amal: 'bekor', kompaniya_id: kompaniyaId, taklif_id: taklifId });
export const taklifQabulQil = (p: { token?: string; telefon?: string; kod?: string; parol: string }) => post<{ rol: string }>('/api/kirish-taklif', { amal: 'qabul', ...p });
export const taklifUlash = (p: { token?: string; telefon?: string; kod?: string }) => post<{ rol: string; kompaniya_id: number }>('/api/kirish-taklif', { amal: 'ulash', ...p });

export const telegramBoshla = (ism: string) => post<{ nonce: string; sir: string; belgi: string; havola: string; tugaydi: string }>('/api/kirish-telegram', { amal: 'boshla', ism });
export const telegramHolat = (nonce: string, sir: string) => post<{ holat: 'kutmoqda' | 'tayyor'; yangi: boolean }>('/api/kirish-telegram', { amal: 'holat', nonce, sir });

/** Server sozlamalari (maxfiy qiymatsiz): qaysi emailsiz yo'llar yoqilgan. */
export async function kirishYoqilgan(): Promise<{ taklif: boolean; telefon: boolean; telegram: boolean }> {
  try {
    const [a, b] = await Promise.all([fetch('/api/kirish-taklif'), fetch('/api/kirish-telegram')]);
    const ja = await a.json().catch(() => null) as { taklif?: boolean; telefon?: boolean } | null;
    const jb = await b.json().catch(() => null) as { yoqilgan?: boolean } | null;
    return { taklif: !!ja?.taklif, telefon: !!ja?.telefon, telegram: !!jb?.yoqilgan };
  } catch { return { taklif: false, telefon: false, telegram: false }; }
}
