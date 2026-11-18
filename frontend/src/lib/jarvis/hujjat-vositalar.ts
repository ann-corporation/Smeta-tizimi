/**
 * hujjat-vositalar.ts - Jarvis uchun HUJJAT MAYDONI (Hujjatlarim / Kompaniya diski) vositalari (server tool registry).
 * f2-vositalar.ts naqshi: nom + versiya, o'zbekcha tavsif, kirish sxemasi, o'qish/yozish belgisi. Sof mantiq (tarmoq/DB yo'q).
 * AI-first qoida: diskdagi har amal Jarvis orqali ham bajariladi; hammasi /api/hujjat-buyruq ning `vosita` amali orqali ishlaydi.
 * Aktor sessiyadan; kirishda actor_id YO'Q (qat'iy rad). `kompaniya_id` - faqat KONTEKST (a'zolik serverda, RPC da tekshiriladi);
 * kompaniya_id berilmasa - shaxsiy maydon.
 * YOZISH QOIDASI: ulashish va savat - taklif (preview); bajarish faqat `tasdiqlayman: true` bilan, OVOZ bilan HECH QACHON.
 * Token: o'z fayllarini yuklab olish/ro'yxat BEPUL; disk kvotasi va ortiqcha xotira kunlik hisobi (t2_hm_hisobla_v1) tokenda.
 */
export type HujjatVositaNomi = 'fayl_qidir' | 'fayl_royxat' | 'fayl_kvota' | 'fayl_faoliyat' | 'fayl_yukla' | 'fayl_ulash' | 'fayl_savat' | 'fayl_taqdim_nishon' | 'fayl_taqdim';

export type HujjatVosita = { nom: HujjatVositaNomi; versiya: 1; tavsif: string; yozadi: boolean; tasdiqKerak: boolean; kirish: Record<string, string> };

export const HUJJAT_VOSITALAR: readonly HujjatVosita[] = [
  { nom: 'fayl_qidir', versiya: 1, yozadi: false, tasdiqKerak: false, tavsif: 'Fayl nomi VA fayl ichidagi matn (pdf, docx, xlsx, pptx, matn) bo\'yicha qidirish (shaxsiy yoki kompaniya diski). Natijada mos parcha ko\'rsatiladi.', kirish: { matn: 'nom bo\'lagi (kamida 2 belgi)', kompaniya_id: 'ixtiyoriy; bo\'lmasa shaxsiy' } },
  { nom: 'fayl_royxat', versiya: 1, yozadi: false, tasdiqKerak: false, tavsif: 'Papkadagi fayl va papkalar ro\'yxati (hajm, versiya, qulf).', kirish: { papka_id: 'ixtiyoriy (ildiz)', kompaniya_id: 'ixtiyoriy', savat: 'true = savat' } },
  { nom: 'fayl_kvota', versiya: 1, yozadi: false, tasdiqKerak: false, tavsif: 'Disk hajmi: ishlatilgan / limit / foiz.', kirish: { kompaniya_id: 'ixtiyoriy' } },
  { nom: 'fayl_faoliyat', versiya: 1, yozadi: false, tasdiqKerak: false, tavsif: 'Faoliyat lentasi: kim nima qildi.', kirish: { fayl_id: 'ixtiyoriy', kompaniya_id: 'ixtiyoriy', limit: '1..100' } },
  { nom: 'fayl_yukla', versiya: 1, yozadi: true, tasdiqKerak: false, tavsif: 'Suhbatdan matn faylini saqlash (.txt/.md). Bir xil nom = yangi versiya. Kvota serverda tekshiriladi.', kirish: { nom: 'fayl nomi (majburiy)', matn: 'mazmun (<= 200 000 belgi)', papka_id: 'ixtiyoriy', kompaniya_id: 'ixtiyoriy' } },
  { nom: 'fayl_ulash', versiya: 1, yozadi: true, tasdiqKerak: true, tavsif: 'Faylni foydalanuvchiga ulashish TAKLIFI (ikkinchi tasdiq bilan). Daraja: korish | izoh | tahrir.', kirish: { fayl_id: 'majburiy', foydalanuvchi_id: 'majburiy', daraja: 'korish|izoh|tahrir (sukut korish)', tasdiqlayman: 'true (majburiy bajarish uchun)' } },
  { nom: 'fayl_savat', versiya: 1, yozadi: true, tasdiqKerak: true, tavsif: 'Faylni savatga olish TAKLIFI (30 kun ichida tiklanadi).', kirish: { fayl_id: 'majburiy', tasdiqlayman: 'true (majburiy bajarish uchun)' } },
  { nom: 'fayl_taqdim_nishon', versiya: 1, yozadi: false, tasdiqKerak: false, tavsif: 'Kompaniya faylini QAYERGA taqdim qilish mumkin: faol aloqalar (pudratchi / sub / buyurtmachi).', kirish: { kompaniya_id: 'majburiy' } },
  { nom: 'fayl_taqdim', versiya: 1, yozadi: true, tasdiqKerak: true, tavsif: 'Kompaniya fayli yoki papkasini aloqadagi tomonga o\'zgarmas SURAT sifatida taqdim qilish TAKLIFI (ikkinchi tasdiq bilan; oluvchi faqat o\'qiydi).', kirish: { fayl_id: 'fayl_id YOKI papka_id', papka_id: 'fayl_id YOKI papka_id', aloqa_id: 'majburiy (fayl_taqdim_nishon dan)', izoh: 'ixtiyoriy', tasdiqlayman: 'true (majburiy bajarish uchun)' } },
];

export const hujjatVositaTop = (nom: unknown): HujjatVosita | null => HUJJAT_VOSITALAR.find((v) => v.nom === nom) ?? null;

const butun = (v: unknown): number | null => { const n = typeof v === 'string' && v.trim() ? Number(v) : v; return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null; };
const matn = (v: unknown, n: number): string | undefined => { const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; return s ? s.slice(0, n) : undefined; };
export const HUJJAT_MATN_MAX = 200_000;
const TAQIQ = /^(actor_?id|p_actor|aktor|kim|egasi_foydalanuvchi_id)$/i;

export type HujjatSorov = { amal: 'oqish' | 'yozish'; vosita: HujjatVosita; a: Record<string, unknown> } | { xato: string; tafsilot?: string };
const xato = (kod: string, tafsilot?: string) => ({ xato: kod, ...(tafsilot ? { tafsilot } : {}) });

export function hujjatVositaSorov(nom: unknown, args: unknown): HujjatSorov {
  const v = hujjatVositaTop(nom);
  if (!v) return xato('VOSITA_NOMALUM');
  if (args != null && (typeof args !== 'object' || Array.isArray(args))) return xato('ARGUMENT_NOTOGRI');
  const x = (args ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(x)) if (TAQIQ.test(k)) return xato('ARGUMENT_TAQIQLANGAN', `\u00ab${k}\u00bb yuborilmaydi: aktor sessiyadan olinadi`);
  const komp = x.kompaniya_id == null ? null : butun(x.kompaniya_id);
  if (x.kompaniya_id != null && !komp) return xato('KOMPANIYA_NOTOGRI');
  const ok = (amal: 'oqish' | 'yozish', a: Record<string, unknown>): HujjatSorov => ({ amal, vosita: v, a: { kompaniya_id: komp, ...a } });
  switch (v.nom) {
    case 'fayl_qidir': { const q = matn(x.matn, 80); return q && q.length >= 2 ? ok('oqish', { matn: q }) : xato('QIDIRUV_BOSH', 'kamida 2 belgi'); }
    case 'fayl_royxat': return ok('oqish', { papka_id: x.papka_id == null ? null : butun(x.papka_id), savat: x.savat === true });
    case 'fayl_kvota': return ok('oqish', {});
    case 'fayl_faoliyat': return ok('oqish', { fayl_id: x.fayl_id == null ? null : butun(x.fayl_id), limit: Math.min(100, Math.max(1, Math.trunc(Number(x.limit) || 30))) });
    case 'fayl_yukla': {
      const n = matn(x.nom, 200); const m = typeof x.matn === 'string' ? x.matn : '';
      if (!n) return xato('NOM_KERAK');
      if (!m.length || m.length > HUJJAT_MATN_MAX) return xato('MATN_NOTOGRI', `1..${HUJJAT_MATN_MAX} belgi`);
      const nom2 = /\.(txt|md)$/i.test(n) ? n : n + '.txt';
      return ok('yozish', { nom: nom2, matn: m, papka_id: x.papka_id == null ? null : butun(x.papka_id) });
    }
    case 'fayl_ulash': {
      const f = butun(x.fayl_id); const u = butun(x.foydalanuvchi_id);
      const d = x.daraja == null ? 'korish' : String(x.daraja);
      if (!f || !u) return xato('FAYL_VA_FOYDALANUVCHI_KERAK');
      if (!['korish', 'izoh', 'tahrir'].includes(d)) return xato('DARAJA_NOTOGRI');
      return ok('yozish', { fayl_id: f, foydalanuvchi_id: u, daraja: d, tasdiqlayman: x.tasdiqlayman === true });
    }
    case 'fayl_taqdim_nishon': return komp ? ok('oqish', {}) : xato('KOMPANIYA_KERAK');
    case 'fayl_taqdim': {
      const f = butun(x.fayl_id); const pk = butun(x.papka_id); const al = butun(x.aloqa_id);
      if ((!f && !pk) || (f && pk) || !al) return xato('FAYL_YOKI_PAPKA_VA_ALOQA_KERAK');
      return ok('yozish', { fayl_id: f, papka_id: pk, aloqa_id: al, izoh: matn(x.izoh, 500) ?? '', tasdiqlayman: x.tasdiqlayman === true });
    }
    case 'fayl_savat': { const f = butun(x.fayl_id); return f ? ok('yozish', { fayl_id: f, tasdiqlayman: x.tasdiqlayman === true }) : xato('FAYL_KERAK'); }
  }
}