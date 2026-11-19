/**
 * lib/tekshiruv/yadro.ts - texnadzor tekshiruvi (F-2 dagi QR -> /tekshiruv/<token>) uchun umumiy qism: turlar, talab tozalash, havola.
 * Server (functions/api/tekshiruv.ts) va brauzer (panel) bir xil qoidani ishlatadi. Pul YO'Q: faqat hajm.
 * Texnadzor F-2 ga yozmaydi - bular TAKLIFLAR; F-2 ga yozuv faqat PTO qarori bilan (mavjud /api/f2-buyruq preview->tasdiq).
 */
export const BAYROQLAR = ['olib_tashlansin', 'hajm_notogri', 'hujjat_kerak', 'qabul'] as const;
export type Bayroq = (typeof BAYROQLAR)[number];
export const RANGLAR = ['qizil', 'sariq', 'yashil', 'kok'] as const;
export type Rang = (typeof RANGLAR)[number];
export const HOLATLAR = ['qoralama', 'korib_chiqildi', 'qaytarildi', 'qabul'] as const;
export type TekshiruvHolat = (typeof HOLATLAR)[number];
export const QARORLAR = ['kutilmoqda', 'qabul', 'rad', 'keyinroq'] as const;
export type Qaror = (typeof QARORLAR)[number];
/** "Hujjat kerak" belgisi uchun tez tanlanadigan turlar (ro'yxat bo'sh qoldirilsa ham erkin matn bo'ladi). */
export const HUJJAT_TURLARI = ['Laboratoriya xulosasi', 'Akt razbivka', 'Faktura', 'Sertifikat', 'Ijro sxemasi', 'Foto-hisobot'] as const;

export type TekshiruvTalabi = { qator_id: number; bayroq: Bayroq | null; izoh: string | null; taklif_hajm: number | null; rang: Rang | null; hujjat_turi: string | null; qosh: boolean };

const matn = (v: unknown, max: number): string | null | undefined => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length > max ? undefined : (s || null);
};

/** POST tanasini tozalaydi; noto'g'ri bo'lsa null. Server RPC yana tekshiradi (ikki qatlam). */
export function tekshiruvTalabi(b: Record<string, unknown>): TekshiruvTalabi | null {
  const qator = Number(b.qator_id);
  if (!Number.isSafeInteger(qator) || qator <= 0) return null;
  const bayroq = b.bayroq === undefined || b.bayroq === null || b.bayroq === '' ? null : b.bayroq;
  if (bayroq !== null && !(BAYROQLAR as readonly unknown[]).includes(bayroq)) return null;
  const rang = b.rang === undefined || b.rang === null || b.rang === '' ? null : b.rang;
  if (rang !== null && !(RANGLAR as readonly unknown[]).includes(rang)) return null;
  const izoh = matn(b.izoh, 1000); const ht = matn(b.hujjat_turi, 80);
  if (izoh === undefined || ht === undefined) return null;
  let hajm: number | null = null;
  if (b.taklif_hajm !== undefined && b.taklif_hajm !== null && b.taklif_hajm !== '') {
    hajm = Number(typeof b.taklif_hajm === 'string' ? b.taklif_hajm.replace(',', '.') : b.taklif_hajm);
    if (!Number.isFinite(hajm) || hajm < 0 || hajm > 1e12) return null;
  }
  if (bayroq === 'hujjat_kerak' && !ht) return null;
  return { qator_id: qator, bayroq: bayroq as Bayroq | null, izoh, taklif_hajm: hajm, rang: rang as Rang | null, hujjat_turi: ht, qosh: b.qosh === true };
}

/** Panel havolasi: QR dagi nashr tokeni -> tekshiruv paneli. */
export const tekshiruvYoli = (token: string, kod?: string): string => `/tekshiruv/${token}${kod ? `?k=${encodeURIComponent(kod)}` : ''}`;
export const tekshiruvHavolasi = (origin: string, token: string, kod?: string): string => origin.replace(/\/+$/, '') + tekshiruvYoli(token, kod);

/** Qatorda taklif bormi (tur bo'yicha belgilar). */
export function taklifBelgilari(t: { bayroq: Bayroq | null; izoh: string | null; taklif_hajm: number | null; qosh: boolean }): string[] {
  const out: string[] = [];
  if (t.bayroq) out.push(t.bayroq);
  if (t.taklif_hajm != null) out.push('hajm');
  if (t.izoh) out.push('izoh');
  if (t.qosh) out.push('qosh');
  return out;
}

export type PanelQator = { akt_qator_id: number; qator_id: number; kod: string | null; nom: string | null; birlik: string | null; tur: string; ota_id: number | null; bolim: string | null; hajm: number | null };
export type PanelTaklif = {
  id: number; tekshiruv_id: number; qator_id: number; bayroq: Bayroq | null; izoh: string | null; taklif_hajm: number | null; rang: Rang | null; hujjat_turi: string | null;
  qosh: boolean; qaror: Qaror; qaror_sabab: string | null; hujjat_bor?: boolean; nom?: string | null; kod?: string | null; birlik?: string | null;
};
export type PanelTekshiruv = { id: number; tekshiruvchi_id: number; tekshiruvchi: string; holat: TekshiruvHolat; izoh: string | null; yangilandi: string; meniki: boolean };
export type PanelJavob = {
  ok: true; rol: 'pto' | 'tekshiruvchi'; bog: { id: number; akt_versiya: number };
  akt: { id: number; raqam: string | null; oy: string | null; holat: string; versiya: number; eskirgan: boolean };
  obyekt: { id: number; nom: string | null }; kompaniya: string | null; kompaniya_id: number;
  qatorlar: PanelQator[]; tekshiruvlar: PanelTekshiruv[]; takliflar: PanelTaklif[];
};

/** Qatorlarni bo'limlar bo'yicha guruhlaydi (smeta tartibi saqlanadi: birinchi uchragan bo'lim birinchi). */
export function bolimlarga(qatorlar: readonly PanelQator[]): Array<{ bolim: string; qatorlar: PanelQator[] }> {
  const out: Array<{ bolim: string; qatorlar: PanelQator[] }> = []; const idx = new Map<string, number>();
  for (const q of qatorlar) {
    const b = q.bolim ?? '';
    let i = idx.get(b);
    if (i === undefined) { i = out.length; idx.set(b, i); out.push({ bolim: b, qatorlar: [] }); }
    out[i].qatorlar.push(q);
  }
  return out;
}

/** Takliflar qator_id bo'yicha (bir qatorda bir necha tekshiruvchi taklifi bo'lishi mumkin). */
export function takliflarQatorBoyicha(t: readonly PanelTaklif[]): Map<number, PanelTaklif[]> {
  const m = new Map<number, PanelTaklif[]>();
  for (const x of t) { const a = m.get(x.qator_id); if (a) a.push(x); else m.set(x.qator_id, [x]); }
  return m;
}
