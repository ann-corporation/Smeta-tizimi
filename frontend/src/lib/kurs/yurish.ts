/**
 * YO‘L-YO‘RIQ (walkthrough) HOLAT MASHINASI — sof funksiya. Hech qachon ma’lumot yozmaydi: faqat qaysi qadam ko‘rsatilishini hal qiladi.
 * Holat: null (yo‘l-yo‘riq yo‘q) yoki { dars, qadam, otkazilgan }. Chiqish — holat null, lekin progressda joyi eslab qolinadi (davom etish mumkin).
 */
export type YurishHolat = { dars: string; qadam: number; otkazilgan: readonly number[] } | null;

export type YurishAmal =
  | { tur: 'boshla'; dars: string; qadam?: number }
  | { tur: 'keyingi' }
  | { tur: 'oldingi' }
  | { tur: 'otkaz' }
  | { tur: 'chiqish' };

export type YurishNatija = { holat: YurishHolat; tugadi: boolean; chiqdi: boolean };

/** `qadamSoni` — joriy dars qadamlari soni (boshla da — yangi darsniki). */
export function yurishYangila(h: YurishHolat, a: YurishAmal, qadamSoni: number): YurishNatija {
  const ichida = (qadam: number, otk: readonly number[]): YurishNatija => ({ holat: h ? { ...h, qadam, otkazilgan: otk } : h, tugadi: false, chiqdi: false });
  switch (a.tur) {
    case 'boshla': {
      const qadam = Math.min(Math.max(a.qadam ?? 0, 0), Math.max(qadamSoni - 1, 0));
      return { holat: { dars: a.dars, qadam, otkazilgan: [] }, tugadi: false, chiqdi: false };
    }
    case 'chiqish': return { holat: null, tugadi: false, chiqdi: !!h };
    case 'oldingi': return h ? ichida(Math.max(h.qadam - 1, 0), h.otkazilgan) : { holat: h, tugadi: false, chiqdi: false };
    case 'keyingi':
    case 'otkaz': {
      if (!h) return { holat: h, tugadi: false, chiqdi: false };
      const otk = a.tur === 'otkaz' && !h.otkazilgan.includes(h.qadam) ? [...h.otkazilgan, h.qadam] : h.otkazilgan;
      if (h.qadam + 1 >= qadamSoni) return { holat: null, tugadi: true, chiqdi: false };
      return ichida(h.qadam + 1, otk);
    }
  }
}
