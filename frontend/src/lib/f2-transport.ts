/**
 * Ф-2 da TRANSPORT ko'rinishi (migratsiya 20270120200000_t2_transport_turi_v1).
 *
 * Smetada transportning 3 turi bor: «ish» (Е310/С310/Е311 normativ ishlar), «tkm» (mahalliy ommaviy material uchun
 * alohida t·km qatori) va «foiz» (podval % — material kategoriyalari bazasiga). Bu modul faqat KO'RSATISH uchun:
 *  - t·km qatori materialining tagida «↳ ТРАНСПОРТ Т·КМ: » prefiksi bilan chiqadi;
 *  - podvaldan keyin qisqa «СПРАВОЧНО: транспорт» (3 qator: т·км / % транспорт / Е310-311 ishlar).
 * Hisob (podval bazasidan chiqarish) — serverda (`_t2_nakrutka_kaskad_v1`); bu yerda pul qayta hisoblanmaydi.
 * t·km qatori bo'lmasa — hujjat o'zgarmaydi (golden).
 */

/** t·km qatorining nomi oldidagi belgi (hujjatda materialning tagida ko'rinadi). */
export const TKM_PREFIKS = '↳ ТРАНСПОРТ Т·КМ: ';

/** Transport maydonlari (`t2_qator`; `t2_daraxt` view'ida yo'q - alohida o'qib qo'shiladi). */
export type TransportMaydon = {
  id: number; ota_id?: number | null; kod?: string | null; tur?: string | null;
  transport_usul?: string | null; transport_manba_qator_id?: number | null;
};

/** t·km qatori id → u tashiydigan material qatori id (faqat bog'langanlar). */
export function tkmQatorlar(rows: readonly TransportMaydon[] | null | undefined): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of rows ?? []) if (r.transport_manba_qator_id != null) m.set(r.id, Number(r.transport_manba_qator_id));
  return m;
}

/** Nomga prefiks (takror qo'shilmaydi). */
export const tkmNomi = (nom: string): string => (nom.startsWith(TKM_PREFIKS) ? nom : TKM_PREFIKS + nom);

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

export type TransportSpravkaKirish = {
  /** Hujjatdagi qatorlar (faqat summasi ma'lumlar sanaladi). */
  qatorlar: ReadonlyArray<{ id: number; tur: string; kod?: string | null; summa: number | null }>;
  tkm: ReadonlyMap<number, number>;
  /** Smeta daraxti (ish → resurs bog'lanishi uchun); yo'q — faqat qatorning o'z kodi. */
  rows?: ReadonlyArray<TransportMaydon> | null;
  /** Podval foizli transport qatorlari yig'indisi (tr_mat + tr_kab + tr_ob), yadro natijasidan. */
  foizTransport: number | null;
};

export type TransportSpravka = { tkmJami: number; foizJami: number | null; tashishJami: number };

/** Справка uchun uchta son. t·km qatori yo'q va tashish ishlari yo'q bo'lsa ham hisoblanadi; ko'rsatish qarori chaqiruvchida. */
export function transportSpravka(k: TransportSpravkaKirish): TransportSpravka {
  const byId = new Map((k.rows ?? []).map((r) => [r.id, r] as const));
  const otalar = new Set<number>();
  for (const r of k.rows ?? []) if (r.ota_id != null) otalar.add(r.ota_id);
  let tkmJami = 0; let tashishJami = 0;
  for (const q of k.qatorlar) {
    if (q.summa == null || !Number.isFinite(q.summa)) continue;
    if (k.tkm.has(q.id)) { tkmJami += q.summa; continue; }
    const ota = byId.get(byId.get(q.id)?.ota_id ?? -1);
    const oz = tashishIshimi(q.kod ?? byId.get(q.id)?.kod);
    // ish (bl): barg bo'lsagina o'z summasi; resurs: ota ishi shifri bo'yicha.
    if ((q.tur === 'bl' && oz && !otalar.has(q.id)) || (q.tur !== 'bl' && ota?.tur === 'bl' && tashishIshimi(ota.kod))) tashishJami += q.summa;
  }
  return { tkmJami, foizJami: k.foizTransport, tashishJami };
}

const fmt = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const som = (x: number | null): string => (x == null ? 'не определено' : `${fmt.format(x)} сум`);

/** «СПРАВОЧНО: транспорт» — hujjatga 4 qator (sarlavha + 3). Faqat ko'rsatish; jami summalarga kirmaydi. */
export function transportSpravkaQatorlari(s: TransportSpravka): string[] {
  return [
    'СПРАВОЧНО: транспорт',
    `Транспорт т·км (отдельные строки, без процентов): ${som(s.tkmJami)}`,
    `Транспорт процентом (подвал, к привозным материалам): ${som(s.foizJami)}`,
    `Работы Е310/Е311 (автовозка, погрузка-разгрузка): ${som(s.tashishJami)}`,
  ];
}
