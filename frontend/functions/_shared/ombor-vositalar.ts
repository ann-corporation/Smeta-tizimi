/**
 * ombor-vositalar.ts — Jarvis / agent uchun OMBOR VOSITALARI (server tool registry). Sof mantiq: tarmoq/DB yo'q, to'liq testlanadi.
 *
 * Shartnoma (JARVIS_YADRO.md «Tool contract»): nom + versiya, kirish sxemasi (qo'lda tekshiruv), ruxsat, o'qish/yozish belgisi.
 * Hamma vosita `/api/ombor-buyruq` ning `vosita` amali orqali ishlaydi: aktor/kompaniya/ombor sessiyadan va ruxsat tekshiruvi o'sha yerda (mijoz id yubormaydi).
 *
 * YOZISH QOIDASI: `ombor_kirim` va `ombor_chiqim` HECH QACHON yozmaydi — faqat qoralama (preview + HMAC tasdiq tokeni) qaytaradi.
 * Yozish faqat `ombor_tasdiq` (token + aniq `tasdiqlayman: true`) bilan, token aktor/ombor/payload ga bog'langan va 15 daqiqa amal qiladi.
 * `ombor_eksport` fayl baytini bermaydi: yuklab olish tavsifini qaytaradi; token yechish yuklab olish paytida (har ish pul ishlasin, qayta yuklash bepul).
 */
export type VositaNomi = 'ombor_kirim_taklif' | 'ombor_kirim' | 'ombor_chiqim' | 'ombor_tasdiq' | 'ombor_qoldiq' | 'ombor_hisobot' | 'ombor_eksport';
export type Vosita = {
  nom: VositaNomi; versiya: 1; tavsif: string;
  /** Baza/hujjatga yozadimi (faqat ombor_tasdiq). Qoralama yaratish yozish emas. */
  yozadi: boolean; tasdiqKerak: boolean;
  ruxsat: 'warehouse.read' | 'warehouse.write';
  kirish: Record<string, string>;
};

export const OMBOR_VOSITALAR: readonly Vosita[] = [
  { nom: 'ombor_kirim_taklif', versiya: 1, yozadi: false, tasdiqKerak: false, ruxsat: 'warehouse.read',
    tavsif: 'Kirim/chiqim takliflari: material, birlik, odatiy miqdor, oxirgi va o\'rtacha narx (QQS siz/bilan), yetkazuvchi; yetkazuvchi -> odatiy materiallari.',
    kirish: { q: 'qidiruv matni (ixtiyoriy)', tur: 'prixod | chiqim (sukut prixod)', yetkazuvchi: 'yetkazuvchi/qabul qiluvchi (ixtiyoriy)', limit: '1..20' } },
  { nom: 'ombor_kirim', versiya: 1, yozadi: false, tasdiqKerak: true, ruxsat: 'warehouse.read',
    tavsif: 'Kirim QORALAMASI (preview + tasdiq tokeni). Yozmaydi: yozish uchun ombor_tasdiq kerak.',
    kirish: { nomi: 'material (majburiy)', miqdor: 'musbat son (majburiy)', birlik: 'birlik', narx: 'birlik narxi (ixtiyoriy)', narx_rejim: 'bilan | siz (QQS bilanmi/sizmi; aytilmasa bir marta so\'raladi)', yetkazuvchi: 'yetkazuvchi', sana: 'YYYY-MM-DD', izoh: 'izoh' } },
  { nom: 'ombor_chiqim', versiya: 1, yozadi: false, tasdiqKerak: true, ruxsat: 'warehouse.read',
    tavsif: 'Chiqim QORALAMASI (preview + tasdiq tokeni; ostatka tekshiriladi). Yozmaydi.',
    kirish: { nomi: 'material (majburiy)', miqdor: 'musbat son (majburiy)', birlik: 'birlik', qabul_qiluvchi: 'kimga', obyekt: 'obyekt nomi', sana: 'YYYY-MM-DD', izoh: 'izoh' } },
  { nom: 'ombor_tasdiq', versiya: 1, yozadi: true, tasdiqKerak: true, ruxsat: 'warehouse.write',
    tavsif: 'Qoralamani tasdiqlab YOZADI. Faqat foydalanuvchi aniq tasdiqlagandan keyin (tasdiqlayman: true).',
    kirish: { token: 'qoralama tokeni (majburiy)', tasdiqlayman: 'true (majburiy)' } },
  { nom: 'ombor_qoldiq', versiya: 1, yozadi: false, tasdiqKerak: false, ruxsat: 'warehouse.read',
    tavsif: 'Ostatka: hozir yoki istalgan sanada (sana), material bo\'yicha qidirib.',
    kirish: { sana: 'YYYY-MM-DD (bo\'sh = hozir)', q: 'material (ixtiyoriy)', faqat_musbat: 'true/false' } },
  { nom: 'ombor_hisobot', versiya: 1, yozadi: false, tasdiqKerak: false, ruxsat: 'warehouse.read',
    tavsif: 'Kirim-chiqim jadvali va jami (QQS siz/bilan) istalgan davr uchun; storno/qaytarishlarsiz.',
    kirish: { davr: 'bugun|kecha|hafta|otgan_hafta|oy|otgan_oy|yil|hammasi', dan: 'YYYY-MM-DD', gacha: 'YYYY-MM-DD', q: 'material', yetkazuvchi: 'yetkazuvchi', qabul: 'qabul qiluvchi', obyekt: 'obyekt nomi', operatsiya: 'kirim | chiqim' } },
  { nom: 'ombor_eksport', versiya: 1, yozadi: false, tasdiqKerak: false, ruxsat: 'warehouse.read',
    tavsif: 'Excel yuklab olish tavsifi (ostatka yoki hisobot). Token yuklab olishda yechiladi; bu vosita faylni o\'zi bermaydi.',
    kirish: { tur: 'qoldiq | hisobot', davr: 'hisobot uchun davr', dan: 'YYYY-MM-DD', gacha: 'YYYY-MM-DD', q: 'filtr' } },
];

export const vositaTop = (nom: unknown): Vosita | null => OMBOR_VOSITALAR.find((v) => v.nom === nom) ?? null;

/** Vosita chaqiruvi -> `/api/ombor-buyruq` ichki amali va tanasi. Xato bo'lsa `xato` kodi. */
export type VositaSorov = { amal: string; tana: Record<string, unknown>; vosita: Vosita } | { xato: string };

const matn = (v: unknown, n = 500): string | undefined => { const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; return s ? s.slice(0, n) : undefined; };
const son = (v: unknown): number | undefined => { const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.').replace(/\s/g, '')) : NaN; return Number.isFinite(n) && n > 0 ? n : undefined; };
const sana = (v: unknown): string | undefined => { const s = matn(v, 10); return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined; };
const yonalish = (v: unknown): 'prixod' | 'rasxod' | undefined => {
  const s = typeof v === 'string' ? v.toLowerCase() : ''; return /^(prixod|kirim|приход)$/.test(s) ? 'prixod' : /^(rasxod|chiqim|расход)$/.test(s) ? 'rasxod' : undefined;
};

export function vositaSorov(nom: unknown, args: unknown): VositaSorov {
  const v = vositaTop(nom);
  if (!v) return { xato: 'VOSITA_NOMALUM' };
  if (args != null && (typeof args !== 'object' || Array.isArray(args))) return { xato: 'ARGUMENT_NOTOGRI' };
  const a = (args ?? {}) as Record<string, unknown>;
  const ok = (amal: string, tana: Record<string, unknown>): VositaSorov => ({ amal, tana, vosita: v });
  switch (v.nom) {
    case 'ombor_kirim_taklif':
      return ok('taklif', { q: matn(a.q, 120) ?? '', tur: a.tur === 'chiqim' ? 'chiqim' : 'prixod', yetkazuvchi: matn(a.yetkazuvchi, 200), limit: Math.min(20, Math.max(1, Number(a.limit ?? 6) || 6)) });
    case 'ombor_kirim': case 'ombor_chiqim': {
      const nomi = matn(a.nomi), miqdor = son(a.miqdor);
      if (!nomi || !miqdor) return { xato: 'REQUIRED_FIELD' };
      const kirim = v.nom === 'ombor_kirim';
      const narx = kirim && a.narx != null && a.narx !== '' ? son(a.narx) : undefined;
      if (kirim && a.narx != null && a.narx !== '' && narx === undefined) return { xato: 'NARX_NOTOGRI' };
      return ok('tahlil', { buyruq: { amal: kirim ? 'prixod' : 'chiqim', nomi, miqdor, birlik: matn(a.birlik, 100), narx, narx_rejim: a.narx_rejim === 'siz' || a.narx_rejim === 'bilan' ? a.narx_rejim : undefined, kontragent: matn(kirim ? a.yetkazuvchi : a.qabul_qiluvchi, 500), obyekt: kirim ? undefined : matn(a.obyekt, 200), sana: sana(a.sana), izoh: matn(a.izoh, 1000) } });
    }
    case 'ombor_tasdiq':
      if (a.tasdiqlayman !== true) return { xato: 'TASDIQ_KERAK' };
      if (typeof a.token !== 'string' || !a.token) return { xato: 'REQUIRED_FIELD' };
      return ok('tasdiq', { token: a.token });
    case 'ombor_qoldiq':
      return ok('qoldiq', { ...(sana(a.sana) ? { sana: sana(a.sana) } : {}), filtr: { ...(matn(a.q, 120) ? { qidir: matn(a.q, 120) } : {}), musbat: a.faqat_musbat === false ? '0' : '1', tartib: 'nom' }, limit: 50 });
    case 'ombor_hisobot':
      return ok('hisobot', { filtr: hisobotFiltr(a), limit: 100 });
    case 'ombor_eksport': {
      const hisobot = a.tur === 'hisobot';
      return ok('eksport_reja', { tur: hisobot ? 'hisobot' : 'qoldiq', filtr: hisobot ? hisobotFiltr(a) : { ...(matn(a.q, 120) ? { qidir: matn(a.q, 120) } : {}) } });
    }
  }
}

function hisobotFiltr(a: Record<string, unknown>): Record<string, string> {
  const o: Record<string, string> = {};
  const set = (k: string, v: string | undefined) => { if (v) o[k] = v; };
  set('davr', typeof a.davr === 'string' ? a.davr : undefined); set('dan', sana(a.dan)); set('gacha', sana(a.gacha));
  set('qidir', matn(a.q, 120)); set('yetkazuvchi', matn(a.yetkazuvchi, 200)); set('qabul', matn(a.qabul, 200)); set('obyekt', matn(a.obyekt, 200)); set('operatsiya', yonalish(a.operatsiya));
  return o;
}
