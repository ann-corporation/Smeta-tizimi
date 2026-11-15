/**
 * Qollanma kartasi «ko'rildi» belgisi — HAR FOYDALANUVCHI uchun alohida.
 *
 * Serverda umumiy foydalanuvchi sozlamalari jadvali yo'q (`t2_kompaniya_sozlama` — kompaniya darajasi,
 * `t2_agent_shaxsiy_sozlama` — faqat AI agent uslubi); yangi migratsiya ochmaslik uchun belgi brauzer xotirasida
 * (localStorage), kaliti foydalanuvchi bo'yicha (email xeshi). Xotira yopiq bo'lsa ham sahifa ishlaydi — karta
 * faqat shu sessiyada qayta chiqmaydi.
 */

export type QollanmaXotira = { korilgan: string[]; ochiq: boolean };

const PREFIKS = 'fz-qollanma:';
/** «Keyinroq» — brauzer sessiyasi davomida (sessionStorage; qayta yuklash ham ko'rsatmaydi). Xotira yopiq bo'lsa — shu xotiradagi zaxira. */
const keyinroq = new Set<string>();
const KEYINROQ_KALIT = 'fz-qollanma-keyinroq';
function keyinroqOqi(): Set<string> {
  try {
    const a = JSON.parse(sessionStorage.getItem(KEYINROQ_KALIT) ?? '[]') as unknown;
    if (Array.isArray(a)) return new Set<string>([...keyinroq, ...a.filter((k): k is string => typeof k === 'string')]);
  } catch { /* sessionStorage yopiq */ }
  return keyinroq;
}
/** Xotira yopiq bo'lsa — shu sessiyadagi zaxira. */
const zaxira = new Map<string, QollanmaXotira>();

/** Email → qisqa barqaror xesh (localStorage kalitida email ochiq turmasin). */
export function foydalanuvchiKaliti(email: string | null | undefined): string | null {
  const s = (email ?? '').trim().toLowerCase();
  if (!s) return null;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function xotiraOqi(foyd: string): QollanmaXotira {
  try {
    const x = JSON.parse(localStorage.getItem(PREFIKS + foyd) ?? 'null') as Partial<QollanmaXotira> | null;
    if (x && typeof x === 'object') return { korilgan: Array.isArray(x.korilgan) ? x.korilgan.filter((k) => typeof k === 'string') : [], ochiq: x.ochiq !== false };
  } catch { /* xotira yopiq yoki buzilgan */ }
  return zaxira.get(foyd) ?? { korilgan: [], ochiq: true };
}

function yoz(foyd: string, x: QollanmaXotira) {
  zaxira.set(foyd, x);
  try { localStorage.setItem(PREFIKS + foyd, JSON.stringify(x)); } catch { /* xotira yopiq — sessiya zaxirasi yetadi */ }
}

/** Avtomatik ko'rsatilsinmi: ko'rilmagan, «Keyinroq» bosilmagan va avto-kartalar o'chirilmagan. */
export function avtoKorsatilsinmi(foyd: string, kalit: string): boolean {
  const x = xotiraOqi(foyd);
  return x.ochiq && !x.korilgan.includes(kalit) && !keyinroqOqi().has(foyd + '|' + kalit);
}

/** «Tushunarli» — shu karta boshqa avtomatik chiqmaydi. */
export function korildiDeb(foyd: string, kalit: string) {
  const x = xotiraOqi(foyd);
  if (!x.korilgan.includes(kalit)) yoz(foyd, { ...x, korilgan: [...x.korilgan, kalit] });
}

/** «Keyinroq» — shu sessiya davomida shu sahifa uchun qayta chiqmaydi (yangi sessiyada yana chiqadi). */
export function keyinroqDeb(foyd: string, kalit: string) {
  keyinroq.add(foyd + '|' + kalit);
  try { sessionStorage.setItem(KEYINROQ_KALIT, JSON.stringify([...keyinroqOqi()])); } catch { /* zaxira yetadi */ }
}

/** «Ko'rsatmang» — avtomatik kartalar butunlay o'chadi («?» tugmasi bilan baribir ochiladi). */
export function avtoOchir(foyd: string, kalit?: string) {
  const x = xotiraOqi(foyd);
  yoz(foyd, { korilgan: kalit && !x.korilgan.includes(kalit) ? [...x.korilgan, kalit] : x.korilgan, ochiq: false });
}

/** Faqat testlar uchun. */
export function _qollanmaXotirasiniTozala() { keyinroq.clear(); zaxira.clear(); try { sessionStorage.removeItem(KEYINROQ_KALIT); } catch { /* */ } }
