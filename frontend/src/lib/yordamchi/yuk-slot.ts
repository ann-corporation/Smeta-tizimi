/**
 * «5 tonna sement uchun Navoiydan Toshkentga mashina top» — naqsh slotlari (model chaqirilmaydi): nima, tonna, qayerdan, qayerga.
 * Natija: /admin/yuk-chaqirish?nom&tonna&a_nom&b_nom (forma to'ldirilgan ochiladi; e'lon faqat formada, qo'lda). Faqat uz-lotin va ru/en asosiy shakllar.
 */
export type YukSlot = { nom: string | null; tonna: number | null; a: string | null; b: string | null };

const FEL = /(?:mashina|yuk\s*mashina|yuk\s*tashuvchi|haydovchi|gruzovik|фуру|машину|truck|driver)\s*(?:top|chaqir|kerak|найди|найти|find|call|order)|(?:top|chaqir|найди|find|call)\s*(?:mashina|машину|truck)|yuk\s*(?:chaqir|e.lon\s*qil)/i;
const OFFSET = { dan: /([a-zA-Zʻ’'‘ʼО-я]+?)(?:dan|дан)\s+/, ga: /([a-zA-Zʻ’'‘ʼО-я]+?)(?:ga|qa|ka|ге|га)\s+(?=(?:mashina|yuk|top|chaqir))/ };

const toza = (s: string) => s.replace(/[ʻʼ‘’`´]/g, '’').trim();
const bosh = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function yukSlotAjrat(matn: string): YukSlot | null {
  const x = toza(matn);
  if (!FEL.test(x)) return null;
  const t = /(\d+(?:[.,]\d+)?)\s*(?:tonna|tonn|t\b|тонн\w*|tons?\b)\s+([^\s]+(?:\s+[^\s]+)?)\s+(?:uchun|для|for)\b/i.exec(x);
  const tonna = t ? Number(t[1].replace(',', '.')) : (() => { const m = /(\d+(?:[.,]\d+)?)\s*(?:tonna|tonn|t\b|тонн\w*|tons?\b)/i.exec(x); return m ? Number(m[1].replace(',', '.')) : null; })();
  const nom = t ? t[2].trim() : null;
  const dan = /(?:^|\s)([A-Za-zА-Яа-яʻ’]{3,})(?:dan|дан)\s+([A-Za-zА-Яа-яʻ’]{3,})(?:ga|qa|ka|га|ге)\b/i.exec(x);
  const a = dan ? dan[1] : null;
  const b = dan ? dan[2] : null;
  void OFFSET;
  return { nom: nom ? bosh(nom) : null, tonna: tonna != null && Number.isFinite(tonna) && tonna > 0 ? tonna : null, a: a ? bosh(a) : null, b: b ? bosh(b) : null };
}

export function yukSlotUrl(s: YukSlot): string {
  const p = new URLSearchParams();
  if (s.nom) p.set('nom', s.nom);
  if (s.tonna != null) p.set('tonna', String(s.tonna));
  if (s.a) p.set('a_nom', s.a);
  if (s.b) p.set('b_nom', s.b);
  const q = p.toString();
  return '/admin/yuk-chaqirish' + (q ? '?' + q : '');
}
