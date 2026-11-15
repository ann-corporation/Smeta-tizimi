/**
 * QULF mantig'i (sof, testlanadi): bo'sh turish / yashirin varaq vaqti bo'yicha qulflash qarori, PIN klaviatura holati, base64url yordamchilari.
 * Eslatma: bu mijoz tomonidagi PRIVACY qulfi (ekranni yashirish). Pul/imzo himoyasi SERVERDA (STEP_UP_KERAK) -- docs/architecture/QULF_VA_TASDIQ_V1.md.
 */
export const BOSH_STANDART_DAQ = 10;
export const BOSH_MIN_DAQ = 1;
export const BOSH_MAX_DAQ = 60;
export const PIN_MIN = 4;
export const PIN_MAX = 6;

export type QulfKirish = {
  yoqilgan: boolean;          // PIN yoki biometrik sozlangan
  oxirgiFaol: number;         // ms: oxirgi foydalanuvchi harakati
  yashirinBoshi: number | null; // ms: varaq yashirin bo'lgan payt
  hozir: number;
  daqiqa: number;             // sozlangan muddat (1..60)
};

export const muddatMs = (daq: number) => Math.min(BOSH_MAX_DAQ, Math.max(BOSH_MIN_DAQ, Math.round(Number(daq) || BOSH_STANDART_DAQ))) * 60_000;

/** Qulflash kerakmi: harakatsiz muddat o'tdi YOKI varaq shuncha vaqt yashirin turdi (soat orqaga ketsa -- ehtiyot uchun qulflanmaydi, lekin yashirin-vaqt hisobi barqaror). */
export function qulfKerakmi(s: QulfKirish): boolean {
  if (!s.yoqilgan) return false;
  const m = muddatMs(s.daqiqa);
  if (s.hozir - s.oxirgiFaol >= m) return true;
  return s.yashirinBoshi != null && s.hozir - s.yashirinBoshi >= m;
}

/** Keyingi tekshiruvgacha ms (taymer uchun): muddat tugashiga qolgan vaqt, kamida 1 s. */
export function keyingiTekshiruvMs(oxirgiFaol: number, hozir: number, daqiqa: number): number {
  return Math.max(1000, muddatMs(daqiqa) - (hozir - oxirgiFaol));
}

export type PinHolat = { raqamlar: string; band: boolean; xato: string | null };
export const pinBosh = (): PinHolat => ({ raqamlar: '', band: false, xato: null });
export function pinRaqam(h: PinHolat, d: string): PinHolat {
  if (h.band || !/^\d$/.test(d) || h.raqamlar.length >= PIN_MAX) return h;
  return { ...h, raqamlar: h.raqamlar + d, xato: null };
}
export function pinOchir(h: PinHolat): PinHolat { return h.band ? h : { ...h, raqamlar: h.raqamlar.slice(0, -1), xato: null }; }
export const pinTayyor = (h: PinHolat) => h.raqamlar.length >= PIN_MIN && h.raqamlar.length <= PIN_MAX && !h.band;

export const b64uDan = (s: string): ArrayBuffer => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
  return a.buffer;
};
export const b64uGa = (buf: ArrayBuffer | Uint8Array): string => {
  const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const x of a) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
