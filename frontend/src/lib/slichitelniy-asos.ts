/**
 * SLICHITELNIY ASOSI — har farq qatoriga dalil (АОСР, texnadzor qarori) va «tayyorlik» sanog'i (sof mantiq, React yo'q).
 * Manba: `t2_aosr_slichitelniy_v1` (supabase/migrations/20261218200000). Bu yerda pul hisobi YO'Q (summa lib/hisob-yadro da);
 * smeta qatorlari o'qilmaydi — faqat RPC natijasi (fakt/smeta hajm, АОСР, taqdim) hujjat matniga aylanadi.
 *
 * Qoidalar (egasi):
 *  - farq qatorida asos bo'lmasa — ANIQ belgi («основание отсутствует»); bloklamaydi, tayyorlik hisobida ko'rinadi;
 *  - «tasdiqlangan asos» = TASHQI nazorat (buyurtmachi xodimi, buyurtmachi yollagan autsorsing texnadzor yoki eski to'g'ridan-to'g'ri
 *    texnadzor aloqasi) qabuli; pudratchining ichki nazorati («ichki») kuchsizroq belgi — tashqi tasdiq o'rnini bosmaydi;
 *  - texnadzor qarori egasi «kim, qaysi kompaniya, qaysi sifatda» — mavjud qaror yozuvidan; `nomidan_kompaniya`/`nazorat_turi`
 *    maydonlari bo'lmasa xato bermaydi (keyin paydo bo'lganda ko'rsatiladi).
 */

/** Farq chegarasi: fakt hajmi 3 xonagacha yoziladi, smeta 4 xonagacha — yaxlitlash shovqini farq emas (SQL bilan bir xil). */
export const FARQ_CHEGARA = 0.0005;

export type AsosHolat = 'yoq' | 'qoralama' | 'kutilmoqda' | 'tuzatish' | 'ichki' | 'hajm_yetmaydi' | 'tasdiqlangan';
export type AsosAmal = 'aosr_yarat' | 'texnadzorga_yubor' | 'javob_kutilmoqda' | 'tuzatish_kiriting' | 'tashqi_nazorat_kerak' | 'hajm_toldir';

export type AsosAosr = {
  id: number; raqam: string | null; sana: string | null; tur: string | null; holat: string; ish_nomi: string | null;
  /** tasdiqlangan | qogoz | ichki | kutilmoqda | tuzatish | rad | qoralama */
  asos_holat: string;
  tasdiq_vaqti: string | null; taqdim_id: number | null; taqdim_holat: string | null;
  qaror_vaqti: string | null; qaror_izoh: string | null; qaror_kompaniya: string | null; qaror_kim: string | null;
  nomidan_kompaniya?: string | null; nazorat_turi?: string | null; qaror_egasi?: string | null;
};
export type AsosQator = {
  qator_id: number; asos_holat: AsosHolat; farqli: boolean; smeta_hajm: number | null; fakt_hajm: number;
  asoslangan_hajm: number | null; tasdiq_hajm: number | null; aosr: Array<{ id: number; hajm: number | null }>;
};
export type AsosYetishmaydi = {
  qator_id: number; tur: string; kod: string | null; nom: string | null; birlik: string | null;
  smeta_hajm: number | null; fakt_hajm: number; farq_hajm: number; asos_holat: AsosHolat; aosr_soni: number; amal: AsosAmal;
};
export type Tayyorlik = {
  farqli: number; ortiq: number; kam: number; smetada_yoq: number; asosli: number; tasdiqlagan: number; ichki_nazorat?: number;
  kutilmoqda: number; tuzatish: number; qoralama: number; hajm_yetmaydi: number; asossiz: number;
};
export type AsosJavob = {
  ok: boolean; code?: string; error?: string;
  tayyorlik?: Tayyorlik; yetishmaydi_jami?: number; yetishmaydi?: AsosYetishmaydi[]; asoslar?: AsosQator[]; aosrlar?: AsosAosr[];
};

export const AMAL_NOMI: Readonly<Record<AsosAmal, string>> = {
  aosr_yarat: 'АОСР yaratish',
  texnadzorga_yubor: 'Texnadzorga yuborish',
  javob_kutilmoqda: 'Javob kutilmoqda',
  tuzatish_kiriting: 'Tuzatish kiriting va qayta yuboring',
  tashqi_nazorat_kerak: 'Tashqi nazorat tasdig‘i kerak',
  hajm_toldir: 'Hajmni to‘ldirish (АОСР hajmi fakt hajmidan kam)',
};

export const farqliMi = (smeta: number | null | undefined, fakt: number | null | undefined): boolean =>
  fakt != null && fakt !== 0 && (smeta == null || Math.abs(fakt - smeta) > FARQ_CHEGARA);

/** Asos xaritasi: qator → asos yozuvi, АОСР → tafsilot. RPC javobi bo'lmasa — null (hujjat «Основание» ustunisiz chiqadi). */
export class AsosXarita {
  private readonly q = new Map<number, AsosQator>();
  private readonly a = new Map<number, AsosAosr>();
  constructor(javob: AsosJavob | null | undefined) {
    for (const x of javob?.asoslar ?? []) this.q.set(Number(x.qator_id), x);
    for (const x of javob?.aosrlar ?? []) this.a.set(Number(x.id), x);
  }
  qator(id: number): AsosQator | undefined { return this.q.get(id); }
  aosr(id: number): AsosAosr | undefined { return this.a.get(id); }
  aosrlar(): AsosAosr[] { return [...this.a.values()].sort((x, y) => x.id - y.id); }
  get bosh(): boolean { return this.q.size === 0 && this.a.size === 0; }
}

const sanaRu = (s: string | null | undefined): string => {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
};
const raqamli = (x: number): string => String(Math.round(x * 1e6) / 1e6).replace('.', ',');

/** Qaror egasi: «kim, kompaniya, nomidan: X, sifat» — mavjud maydonlardan (bo'lmasa bo'sh joylar tushib qoladi). */
export function qarorEgasi(a: AsosAosr): string {
  if (a.qaror_egasi) return a.qaror_egasi;
  return [a.qaror_kim, a.qaror_kompaniya, a.nomidan_kompaniya ? `от имени: ${a.nomidan_kompaniya}` : '', a.nazorat_turi].filter(Boolean).join(', ');
}

const HOLAT_RU: Record<string, string> = {
  tasdiqlangan: 'принят', qogoz: 'подписан на бумаге', ichki: 'пройден внутренний контроль подрядчика (не заменяет внешнего)',
  kutilmoqda: 'на рассмотрении у технадзора', tuzatish: 'возвращен на доработку', rad: 'отклонен',
};
HOLAT_RU.qoralama = 'черновик, не направлен технадзору';

export const holatMatni = (h: string): string => HOLAT_RU[h] ?? h;

/** Bitta АОСР ning hujjat matni: «АОСР № A-0001 от 12.10.2026: принят (Ism, Kompaniya, sifat) 14.10.2026; объем 12». */
export function aosrMatni(a: AsosAosr, hajm: number | null | undefined): string {
  const bosh = `АОСР № ${a.raqam || a.id}${a.sana ? ` от ${sanaRu(a.sana)}` : ''}`;
  const h = HOLAT_RU[a.asos_holat] ?? a.asos_holat;
  const kim = a.qaror_vaqti ? qarorEgasi(a) : '';
  const izoh = a.asos_holat === 'tuzatish' || a.asos_holat === 'rad' ? (a.qaror_izoh ? `: ${a.qaror_izoh}` : '') : '';
  return `${bosh} — ${h}${kim ? ` (${kim})` : ''}${a.qaror_vaqti ? ` ${sanaRu(a.qaror_vaqti)}` : ''}${izoh}${hajm != null ? `; объем по акту ${raqamli(hajm)}` : ''}`;
}

export const ASOS_YOQ_MATNI = 'основание отсутствует';

/**
 * Qator uchun «Основание» matni. `farqli` — qator farqli (fakt ≠ smeta); farqsiz qatorda asos bo'lmasa bo'sh.
 * Farqli va asos yo'q — «основание отсутствует»; hajm yetmasa — «объем по актам X из Y».
 */
export function asosMatniQator(x: AsosXarita | null | undefined, qatorId: number | null, farqli: boolean, faktHajm?: number | null): string {
  if (!x || qatorId == null) return '';
  const r = x.qator(qatorId);
  if (!r) return farqli ? ASOS_YOQ_MATNI : '';
  const qatorlar = r.aosr.map((b) => { const a = x.aosr(b.id); return a ? aosrMatni(a, b.hajm) : `АОСР № ${b.id}`; });
  if (r.asos_holat === 'hajm_yetmaydi' && faktHajm != null) qatorlar.push(`подтверждено объема: ${raqamli(r.tasdiq_hajm ?? 0)} из ${raqamli(faktHajm)}`);
  return qatorlar.join('\n');
}

export type Navbat = { amal: AsosAmal; soni: number; qatorIdlar: number[] };
/** «Nima yetishmaydi» ro'yxatini amal bo'yicha guruhlaydi (bir bosishda ommaviy amal uchun). */
export function amalBoyichaGuruh(royxat: readonly AsosYetishmaydi[]): Navbat[] {
  const tartib: AsosAmal[] = ['aosr_yarat', 'texnadzorga_yubor', 'tuzatish_kiriting', 'hajm_toldir', 'tashqi_nazorat_kerak', 'javob_kutilmoqda'];
  const m = new Map<AsosAmal, number[]>();
  for (const r of royxat) { const a = m.get(r.amal) ?? []; a.push(r.qator_id); m.set(r.amal, a); }
  return tartib.filter((a) => m.has(a)).map((a) => ({ amal: a, soni: m.get(a)!.length, qatorIdlar: m.get(a)! }));
}

/** Tayyorlik foizi: tasdiqlangan asosli farq qatorlari / farqli qatorlar (farq yo'q — 100 %, NULL emas). */
export function tayyorlikFoiz(t: Tayyorlik | null | undefined): number | null {
  if (!t) return null;
  return t.farqli === 0 ? 100 : Math.round((t.tasdiqlagan / t.farqli) * 1000) / 10;
}

/** Jarvis (Ctrl+K) «slichitelniy» vositasi: tayyorlik sanog'i va «nima yetishmaydi» (faqat o'qish; pul yo'q). */
export function jarvisSlichitelniyMatni(j: AsosJavob | null | undefined, limit = 12): string {
  if (!j) return 'Slichitelniy asoslari hali o‘qilmadi (yoki ruxsat/tarmoq yo‘q). «Smeta va Fakt / LRV» sahifasini oching.';
  if (!j.ok || !j.tayyorlik) return `Slichitelniy asoslari o‘qilmadi${j.error ? `: ${j.error}` : ''}.`;
  const t = j.tayyorlik;
  const satr = [`Slichitelniy tayyorligi: farqli ish qatorlari ${t.farqli} (smetadan ortiq ${t.ortiq}, kam ${t.kam}); asosi (АОСР) bor ${t.asosli}; texnadzor (tashqi nazorat) tasdiqlagan ${t.tasdiqlagan}${tayyorlikFoiz(t) != null ? ` — ${tayyorlikFoiz(t)} %` : ''}; javob kutilmoqda ${t.kutilmoqda}; tuzatishga qaytgan ${t.tuzatish}; qoralama ${t.qoralama}${t.ichki_nazorat ? `; ichki nazoratdan o‘tgan (tashqi tasdiq emas) ${t.ichki_nazorat}` : ''}; hajmi yetmaydi ${t.hajm_yetmaydi}; asosi YO‘Q ${t.asossiz}.`];
  const g = amalBoyichaGuruh(j.yetishmaydi ?? []);
  if (g.length) satr.push(`Nima yetishmaydi (amal bo‘yicha): ${g.map((x) => `${AMAL_NOMI[x.amal]} — ${x.soni}`).join('; ')}${(j.yetishmaydi_jami ?? 0) > (j.yetishmaydi?.length ?? 0) ? ` (ro‘yxat qisqartirilgan: jami ${j.yetishmaydi_jami})` : ''}.`);
  else satr.push('Hamma farqli qator tasdiqlangan asos bilan ta’minlangan.');
  const bosh = (j.yetishmaydi ?? []).slice(0, limit);
  if (bosh.length) satr.push(...bosh.map((r) => `- [#${r.qator_id}] ${r.kod ?? ''} ${r.nom ?? ''} | smeta ${r.smeta_hajm ?? '—'} ${r.birlik ?? ''}, fakt ${r.fakt_hajm} | ${AMAL_NOMI[r.amal]}`));
  satr.push('Slichitelniy Excel («Основание» ustuni bilan) va АОСР qoralamalari — «Smeta va Fakt / LRV» → «Slichitelniy tayyorligi».');
  return satr.join('\n');
}

/** Jarvis «asossiz» vositasi: asosi umuman yo'q farqli qatorlar (arg — so'z bo'yicha filtr). */
export function jarvisAsossizMatni(j: AsosJavob | null | undefined, arg: string | null, limit = 25): string {
  if (!j || !j.ok) return jarvisSlichitelniyMatni(j);
  const f = arg && arg.trim().length >= 2 ? arg.trim().toLowerCase() : null;
  const l = (j.yetishmaydi ?? []).filter((r) => r.asos_holat === 'yoq' && (!f || `${r.kod ?? ''} ${r.nom ?? ''}`.toLowerCase().includes(f)));
  if (!l.length) return f ? `«${arg}» bo‘yicha asosi yo‘q farqli qator topilmadi (ro‘yxat ${j.yetishmaydi?.length ?? 0} tagacha).` : 'Asosi yo‘q farqli qator yo‘q.';
  return [`Asosi yo‘q farqli qatorlar: ${l.length}${l.length > limit ? `, birinchi ${limit} tasi` : ''} (АОСР yaratish kerak):`, ...l.slice(0, limit).map((r) => `- [#${r.qator_id}] ${r.kod ?? ''} ${r.nom ?? ''} | smeta ${r.smeta_hajm ?? '—'} ${r.birlik ?? ''}, fakt ${r.fakt_hajm}, farq ${r.farq_hajm > 0 ? '+' : ''}${r.farq_hajm}`)].join('\n');
}