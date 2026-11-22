/**
 * Ф-2 da TRANSPORT ko'rinishi (migratsiya 20270120200000_t2_transport_turi_v1).
 *
 * Smetada transportning 3 turi bor: «ish» (Е310/С310/Е311 normativ ishlar), «tkm» (mahalliy ommaviy material uchun
 * alohida t·km qatori) va «foiz» (podval % — material kategoriyalari bazasiga). Bu modul KO'RSATISH uchun yordamchilar:
 *  - t·km qatori materialining tagida «↳ ТРАНСПОРТ: …» nomi bilan; norma/hajm — materialning norma/hajmiga TIRIK formula;
 *  - podvaldan keyin «СПРАВОЧНО: транспорт» (3 qator, SUMIF formulalari bilan).
 * Hisob (podval bazasidan chiqarish) — `hisob-yadro` va serverda; bu yerda pul qayta hisoblanmaydi.
 */

/** t·km qatori nomi oldidagi belgi (hujjatda materialning tagida ko'rinadi). */
export const TKM_PREFIKS = 'ТРАНСПОРТ: '; // egasi 2026-11-21: strelka kerak emas

/** Transport maydonlari (`t2_qator`). */
export type TransportMaydon = {
  id: number; ota_id?: number | null; kod?: string | null; tur?: string | null; nom?: string | null;
  transport_usul?: string | null; transport_manba_qator_id?: number | null;
  transport_zichlik?: number | string | null; transport_km?: number | string | null;
};

/** t·km qatori id → u tashiydigan material qatori id (faqat bog'langanlar). */
export function tkmQatorlar(rows: readonly TransportMaydon[] | null | undefined): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of rows ?? []) if (r.transport_manba_qator_id != null) m.set(r.id, Number(r.transport_manba_qator_id));
  return m;
}

/** Transport-% bazasidan chiqariladigan materiallar: qator id → usul (tkm / narx_ichida). Bo'sh xarita — hisob o'zgarmaydi. */
export function transportUsulXaritasi(rows: readonly TransportMaydon[] | null | undefined): Map<number, string> {
  const m = new Map<number, string>();
  for (const r of rows ?? []) if (r.transport_usul === 'tkm' || r.transport_usul === 'narx_ichida') m.set(r.id, r.transport_usul);
  return m;
}

const son = (x: unknown): number | null => { if (x == null || x === '') return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 6 });
const fmtSom = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * t·km qatori nomi: «↳ ТРАНСПОРТ: <material> — 1,5 т/м³ × 14,5 км × 1 227,1 сум/т·км» (zichlik 1 — «1 т × 14,5 км × …»).
 * zichlik/km yoki material noma'lum bo'lsa — qatorning o'z nomi (oldiga belgi bilan).
 */
export function tkmSarlavha(ozNom: string, o: { material?: string | null; zichlik?: unknown; km?: unknown; narx?: number | null }): string {
  const z = son(o.zichlik); const km = son(o.km);
  // Eski nom «↳ ТРАНСПОРТ: …» bo'lsa strelka olib tashlanadi; prefiks ikki marta qo'shilmaydi.
  const bor = (s: string) => { const x = s.replace(/^\s*↳\s*/, ''); return /^ТРАНСПОРТ/i.test(x) ? x : TKM_PREFIKS + x; };
  if (!o.material?.trim() || z == null || km == null) return bor(ozNom);
  const qisqa = o.material.trim().replace(/\s+/g, ' ');
  const mat = qisqa; // egasi 2026-11-21: nom TO'LIQ yoziladi («…» bilan kesilmaydi)
  const zt = z === 1 ? '1 т' : `${fmt.format(z)} т/м³`;
  const narx = o.narx != null && Number.isFinite(o.narx) ? ` × ${fmt.format(o.narx)} сум/т·км` : '';
  return `${TKM_PREFIKS}${mat} — ${zt} × ${fmt.format(km)} км${narx}`;
}

/**
 * Ro'yxatda t·km qatorini o'z materialining TO'G'RIDAN-TO'G'RI tagiga ko'chiradi (ikkalasi ham shu ro'yxatda bo'lsa).
 * Qolgan qatorlar tartibi saqlanadi; tkm bo'sh bo'lsa — o'sha ro'yxat qaytadi.
 */
export function transportTartib<T extends { id: number }>(royxat: readonly T[], tkm: ReadonlyMap<number, number>): readonly T[] {
  if (!tkm.size) return royxat;
  const ids = new Set(royxat.map((x) => x.id));
  const ostida = new Map<number, T[]>();
  const asos: T[] = [];
  for (const x of royxat) {
    const mat = tkm.get(x.id);
    if (mat != null && ids.has(mat) && mat !== x.id) { const a = ostida.get(mat) ?? []; a.push(x); ostida.set(mat, a); } else asos.push(x);
  }
  if (!ostida.size) return royxat;
  return asos.flatMap((x) => [x, ...(ostida.get(x.id) ?? [])]);
}

/** Е310 / С310 (avtovozka) va Е311 (pogruzka-razgruzka) normativ ish shifrlari (kirill va lotin harflari). */
const TASHISH_KOD = /^\s*[ЕЕEСC]\s*31[01]\b/i;
export const tashishIshimi = (kod: string | null | undefined): boolean => TASHISH_KOD.test(kod ?? '');

/** Yashirin «Транспорт» ustuni (L) belgilari: material usuli / t·km qatori / Е310-311 ish. SUMIF/SUMIFS shu belgilarga tayanadi. */
export const TR_BELGI = { tkmQator: 'т·км', tashish: 'Е310/311' } as const;

/** «СПРАВОЧНО: транспорт» matnlari (H katagida SUMIF formulasi; qiymat — keshi). */
export const SPRAVKA_SARLAVHA = 'СПРАВОЧНО: транспорт';
export const SPRAVKA_NOMLAR = {
  tkm: 'Транспорт т·км (отдельные строки, без процентов)',
  foiz: 'Транспорт процентом (подвал, к привозным материалам)',
  tashish: 'Работы Е310/Е311 (автовозка, погрузка-разгрузка)',
} as const;

export const som = (x: number | null): string => (x == null ? 'не определено' : `${fmtSom.format(x)} сум`);
