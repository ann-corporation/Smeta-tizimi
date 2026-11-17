/**
 * Ombor hisobotlari uchun DAVR (sana oralig'i): tayyor tanlovlar (bugun, kecha, hafta, oy, o'tgan oy ...) va o'zbek/rus matnidan davrni topish.
 * Sof funksiyalar: tarmoq/DB yo'q, «bugun» tashqaridan beriladi (Toshkent sanasi) -> to'liq test qilinadi. Web, Android, Telegram va Jarvis bir xil.
 */
export type DavrBelgi = 'bugun' | 'kecha' | 'hafta' | 'otgan_hafta' | 'oy' | 'otgan_oy' | 'yil' | 'hammasi' | 'ixtiyoriy';
export type Davr = { belgi: DavrBelgi; dan: string | null; gacha: string | null };
export const DAVR_BELGILARI: readonly DavrBelgi[] = ['bugun', 'kecha', 'hafta', 'otgan_hafta', 'oy', 'otgan_oy', 'yil', 'hammasi', 'ixtiyoriy'];

const MS = 86400_000;
const t = (iso: string) => Date.parse(iso + 'T00:00:00Z');
const f = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const yaroqli = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(t(s)) && f(t(s)) === s;

/** Toshkent bugungi sanasi (UTC+5). */
export const toshkentBugun = (hozir: number = Date.now()): string => f(hozir + 5 * 3600_000);

export function sanaSur(iso: string, kun: number): string { return f(t(iso) + kun * MS); }
function oyBoshi(iso: string): string { return iso.slice(0, 7) + '-01'; }
function oyOxiri(iso: string): string { const d = new Date(t(oyBoshi(iso))); return f(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); }
function haftaBoshi(iso: string): string { const d = new Date(t(iso)).getUTCDay(); return sanaSur(iso, -((d + 6) % 7)); } // dushanba

/** Tayyor tanlov -> aniq sanalar. `ixtiyoriy` uchun dan/gacha tashqaridan (`oraliq`). */
export function davrTanlov(belgi: DavrBelgi, bugun: string, oraliq?: { dan?: string | null; gacha?: string | null }): Davr {
  switch (belgi) {
    case 'bugun': return { belgi, dan: bugun, gacha: bugun };
    case 'kecha': { const k = sanaSur(bugun, -1); return { belgi, dan: k, gacha: k }; }
    case 'hafta': return { belgi, dan: haftaBoshi(bugun), gacha: bugun };
    case 'otgan_hafta': { const b = sanaSur(haftaBoshi(bugun), -7); return { belgi, dan: b, gacha: sanaSur(b, 6) }; }
    case 'oy': return { belgi, dan: oyBoshi(bugun), gacha: bugun };
    case 'otgan_oy': { const oxir = sanaSur(oyBoshi(bugun), -1); return { belgi, dan: oyBoshi(oxir), gacha: oxir }; }
    case 'yil': return { belgi, dan: bugun.slice(0, 4) + '-01-01', gacha: bugun };
    case 'hammasi': return { belgi, dan: null, gacha: null };
    default: {
      let dan = yaroqli(oraliq?.dan) ? oraliq!.dan! : null, gacha = yaroqli(oraliq?.gacha) ? oraliq!.gacha! : null;
      if (dan && gacha && dan > gacha) [dan, gacha] = [gacha, dan];
      return { belgi: 'ixtiyoriy', dan, gacha };
    }
  }
}

/** Mijozdan kelgan filtr (belgi yoki dan/gacha) -> Davr. Noto'g'ri sana -> null. */
export function davrFiltrdan(x: { davr?: unknown; dan?: unknown; gacha?: unknown } | null | undefined, bugun: string): Davr | null {
  const b = DAVR_BELGILARI.find((v) => v === x?.davr);
  if (b && b !== 'ixtiyoriy') return davrTanlov(b, bugun);
  const dan = x?.dan == null || x.dan === '' ? null : x.dan, gacha = x?.gacha == null || x.gacha === '' ? null : x.gacha;
  if ((dan != null && !yaroqli(dan)) || (gacha != null && !yaroqli(gacha))) return null;
  return davrTanlov('ixtiyoriy', bugun, { dan: dan as string | null, gacha: gacha as string | null });
}

const L = '(?<![\\p{L}])', R = '(?![\\p{L}])';
const AP = "['ʻ’`‘]?";
const OYLAR: [RegExp, number][] = [
  [/yanvar|январ/iu, 1], [/fevral|февраль|февраля|февр/iu, 2], [/mart|март/iu, 3], [/aprel|апрел/iu, 4], [/may|мая|май/iu, 5],
  [/iyun|июн/iu, 6], [/iyul|июл/iu, 7], [/avgust|август/iu, 8], [/sentabr|sentyabr|сентябр/iu, 9], [/oktabr|oktyabr|октябр/iu, 10], [/noyabr|noyabr|ноябр/iu, 11], [/dekabr|декабр/iu, 12],
];
const re = (s: string) => new RegExp(s, 'iu');
const QOIDALAR: [RegExp, DavrBelgi][] = [
  [re(`${L}(o${AP}tgan|oxirgi|prosh[\\p{L}]*|прошл[\\p{L}]*|предыдущ[\\p{L}]*)\\s+(oy|oyda|oyga|месяц[\\p{L}]*)${R}`), 'otgan_oy'],
  [re(`${L}(o${AP}tgan|oxirgi|прошл[\\p{L}]*)\\s+(hafta[\\p{L}]*|недел[\\p{L}]*)${R}`), 'otgan_hafta'],
  [re(`${L}(bu|shu|joriy|эт[\\p{L}]*|текущ[\\p{L}]*)\\s+(hafta[\\p{L}]*|недел[\\p{L}]*)${R}|${L}(hafta[\\p{L}]*|за\\s+недел[\\p{L}]*|на\\s+этой\\s+неделе)${R}`), 'hafta'],
  [re(`${L}(bu|shu|joriy|эт[\\p{L}]*|текущ[\\p{L}]*)\\s+(oy[\\p{L}]*|месяц[\\p{L}]*)${R}|${L}(oy\\s+davomida|за\\s+месяц)${R}`), 'oy'],
  [re(`${L}(bu|shu|joriy|эт[\\p{L}]*)\\s+(yil[\\p{L}]*|год[\\p{L}]*)${R}|${L}(yil\\s+boshidan|с\\s+начала\\s+года)${R}`), 'yil'],
  [re(`${L}(kecha[\\p{L}]*|вчера[\\p{L}]*)${R}`), 'kecha'],
  [re(`${L}(bugun[\\p{L}]*|сегодня[\\p{L}]*)${R}`), 'bugun'],
];

/**
 * Matndan davrni topadi: «o'tgan oy», «bu hafta», «bugun», «kecha», «sentabrda», «2026-11-01 dan 2026-11-10 gacha», «за прошлый месяц».
 * Qaytaradi: topilgan Davr va matnning davr iborasi olib tashlangan qismi (nom/yetkazuvchi ajratish uchun).
 */
export function davrMatndan(matn: string, bugun: string): { davr: Davr; qolgan: string } | null {
  const s = String(matn ?? '');
  const isolar = [...s.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((m) => m[1]).filter(yaroqli);
  if (isolar.length >= 2) {
    return { davr: davrTanlov('ixtiyoriy', bugun, { dan: isolar[0], gacha: isolar[1] }), qolgan: s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').replace(re(`${L}(dan|gacha|с|по|от|до)${R}`), ' ') };
  }
  for (const [rx, b] of QOIDALAR) {
    const m = rx.exec(s);
    if (m) return { davr: davrTanlov(b, bugun), qolgan: s.replace(m[0], ' ') };
  }
  for (const [rx, oy] of OYLAR) {
    const m = new RegExp(`${L}(${rx.source})[\\p{L}]*`, 'iu').exec(s);
    if (m) {
      const yil = Number(bugun.slice(0, 4)) - (oy > Number(bugun.slice(5, 7)) ? 1 : 0);
      const b = `${yil}-${String(oy).padStart(2, '0')}-01`;
      return { davr: { belgi: 'ixtiyoriy', dan: b, gacha: oyOxiri(b) > bugun ? bugun : oyOxiri(b) }, qolgan: s.replace(m[0], ' ') };
    }
  }
  if (isolar.length === 1) return { davr: davrTanlov('ixtiyoriy', bugun, { dan: isolar[0], gacha: isolar[0] }), qolgan: s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ') };
  return null;
}
