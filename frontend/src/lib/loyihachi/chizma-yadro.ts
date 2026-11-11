/**
 * LOYIHACHI: chizma reyestri ko'rinishi (sof mantiq, DB/UI dan mustaqil). Revizya holatlari (joriy / eskirgan / ruxsatsiz)
 * mavjud `chizma-revizya.ts` dan olinadi — ikkinchi hisoblagich yozilmaydi.
 *
 *  - toplam (varaq) → `ChizmaVaraq[]` (revizyalar bo'yicha) → `revizyaKorinishlari`;
 *  - АОСР «loyiha hujjati» maydoni — joriy revizyadan avtomatik matn;
 *  - rol uyi «Bugun»: 4–6 katta tugma, har birida son va keyingi qadam (oddiy o'zbekcha).
 */
import { revizyaKorinishlari, type ChizmaVaraq, type RevizyaKorinish } from './chizma-revizya';

export type ChizmaBosqich = 'PD' | 'RD';
export type TaqdimHolatiK = 'yuborilgan' | 'ko_rilmoqda' | 'qabul' | 'rad' | 'tuzatish' | 'qaytarilgan';

export type ToplamLike = {
  id: number; bosqich: ChizmaBosqich; marka: string; varaq: string; nom?: string | null;
  revizyalar: ReadonlyArray<{ id: number; revizya: number; holat: 'qoralama' | 'ruxsat' | 'bekor'; ozgarish_izohi: string | null; ruxsat_vaqti: string | null }>;
};

/** Reyestr varag'i → mavjud revizya mantig'i kirishi. `id` — revizya id si (bitta varaq ichida yagona). */
export function varaqlarga(toplamlar: readonly ToplamLike[]): ChizmaVaraq[] {
  return toplamlar.flatMap((t) => t.revizyalar.map((r) => ({
    id: String(r.id), marka: t.marka, bosqich: t.bosqich, varaq: t.varaq, nom: t.nom ?? undefined, revizya: r.revizya, holat: r.holat,
    ozgarishIzohi: r.ozgarish_izohi ?? undefined, ruxsatVaqti: r.ruxsat_vaqti ?? undefined,
  })));
}

/** revizya id → ko'rinish (joriy / eskirgan / ruxsatsiz / bekor). */
export function revizyaHolatlari(toplamlar: readonly ToplamLike[]): Map<number, RevizyaKorinish> {
  const m = revizyaKorinishlari(varaqlarga(toplamlar));
  return new Map([...m].map(([k, v]) => [Number(k), v]));
}

export const KORINISH_NOMI: Record<RevizyaKorinish, string> = {
  joriy: 'Joriy', eskirgan: 'Eskirgan', ruxsatsiz: 'Qoralama (ruxsatsiz)', bekor: 'Bekor qilingan',
};

export const TAQDIM_NOMI: Record<TaqdimHolatiK, string> = {
  yuborilgan: 'Yuborildi — javob kutilmoqda', ko_rilmoqda: 'Ko‘rib chiqilmoqda', qabul: 'Qabul qilindi',
  rad: 'Rad etildi', tuzatish: 'Tuzatish so‘ralgan', qaytarilgan: 'Qaytarib olindi',
};

export const TAKLIF_TURI_NOMI: Record<'qoshimcha' | 'zamena' | 'olib_tashlash' | 'hajm', string> = {
  qoshimcha: 'Qo‘shimcha ish', zamena: 'Zamena (almashtirish)', olib_tashlash: 'Olib tashlash', hajm: 'Hajm o‘zgarishi',
};

/** Varaqning joriy (eng yuqori ruxsatli) revizyasi — ro'yxatdagi revizyalardan. */
export function joriyRevizyasi<T extends { revizya: number; holat: string }>(revizyalar: readonly T[]): T | null {
  let eng: T | null = null;
  for (const r of revizyalar) if (r.holat === 'ruxsat' && (!eng || r.revizya > eng.revizya)) eng = r;
  return eng;
}

const sanaQisqa = (v?: string | null) => {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};

export type AosrChizma = { marka: string; varaq: string; bosqich: ChizmaBosqich; revizya: number; sana?: string | null };

/** Bitta chizma uchun АОСР «loyiha hujjati» bo'lagi: «КЖ-12 (РД), рев. 3 от 12.11.2026». */
export function chizmaBolagi(c: AosrChizma): string {
  const s = sanaQisqa(c.sana);
  return `${c.marka}-${c.varaq} (${c.bosqich}), рев. ${c.revizya}${s ? ` от ${s}` : ''}`;
}

/** АОСР «Chizmalar № / sana» maydonining avtomatik matni: bog'langan chizmalar joriy revizyada, marka/varaq tartibida. */
export function aosrLoyihaHujjatiMatni(chizmalar: readonly AosrChizma[]): string {
  return [...chizmalar].sort((a, b) => a.marka.localeCompare(b.marka) || a.varaq.localeCompare(b.varaq, undefined, { numeric: true })).map(chizmaBolagi).join('; ');
}

/* ───────────── Rol uyi «Bugun» ───────────── */
export type BugunTomon = 'loyihachi' | 'pudratchi' | 'texnadzor';
export type BugunSanoqLike = Partial<Record<
  'qoralama_revizya' | 'qaror_kutmoqda' | 'tuzatish_soralgan' | 'savol_menga' | 'savol_kechikkan' | 'remark_ochiq' | 'remark_yopishga' | 'remark_kechikkan'
  | 'taklif_kutmoqda' | 'kelgan_yangi' | 'eskirgan_boglanish' | 'taklif_yangi_menga', number>>;
export type BugunTugma = { kalit: string; nom: string; izoh: string; son: number | null; ogoh: boolean; yol: string };

/** Rol → tomon: loyihachi — loyihachi; inspektor (texnadzor) — texnadzor; qolgan hamma (pto, prorab, boss…) — pudratchi tomoni. */
export function bugunTomoni(rol: string | null | undefined): BugunTomon {
  if (rol === 'loyihachi') return 'loyihachi';
  if (rol === 'inspektor') return 'texnadzor';
  return 'pudratchi';
}

const n = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** 4–6 katta tugma; sanoq yo'q (hali yuklanmagan) bo'lsa son = null (0 emas). `izoh` — keyingi qadam, oddiy gap bilan. */
export function bugunTugmalari(tomon: BugunTomon, s: BugunSanoqLike | null): BugunTugma[] {
  const v = (k: keyof BugunSanoqLike) => (s == null ? null : n(s[k]));
  if (tomon === 'loyihachi') return [
    { kalit: 'revizya', nom: 'Yangi revizya chiqarish', izoh: 'Fayl yuklang, nima o‘zgarganini yozing, pudratchiga yuboring', son: v('qoralama_revizya'), ogoh: false, yol: '/admin/chizmalar?holat=qoralama' },
    { kalit: 'javob', nom: 'Chizmalarim holati', izoh: 'Pudratchi qabul qildimi yoki tuzatish so‘radimi', son: s == null ? null : n(s.qaror_kutmoqda) + n(s.tuzatish_soralgan), ogoh: n(s?.tuzatish_soralgan) > 0, yol: '/admin/chizmalar' },
    { kalit: 'savol', nom: 'Pudratchi savollari', izoh: 'Savolga javob yozing, kerak bo‘lsa fayl biriktiring', son: v('savol_menga'), ogoh: n(s?.savol_kechikkan) > 0, yol: '/admin/murojaatlar?turi=savol&yonalish=menga' },
    { kalit: 'remark', nom: 'Mualliflik nazorati remarklari', izoh: 'Remark yozing, muddat qo‘ying, bajarilganini yoping', son: v('remark_ochiq'), ogoh: n(s?.remark_kechikkan) > 0 || n(s?.remark_yopishga) > 0, yol: '/admin/murojaatlar?turi=mualliflik_remark&yonalish=mendan' },
    { kalit: 'taklif', nom: 'Smeta o‘zgarish takliflari', izoh: 'Loyiha o‘zgarishidan qaysi ish smetaga qo‘shiladi yoki almashadi', son: v('taklif_kutmoqda'), ogoh: false, yol: '/admin/chizmalar?taklif=1' },
    { kalit: 'reestr', nom: 'Chizmalar reyestri', izoh: 'Obyekt bo‘yicha hamma chizma va revizyalar', son: null, ogoh: false, yol: '/admin/chizmalar' },
  ];
  if (tomon === 'texnadzor') return [
    { kalit: 'kelgan', nom: 'Yangi chizmalar', izoh: 'Chiqarilgan revizyani ko‘ring va qabul qiling', son: v('kelgan_yangi'), ogoh: n(s?.kelgan_yangi) > 0, yol: '/admin/chizmalar?holat=kelgan' },
    { kalit: 'reestr', nom: 'Chizmalar reyestri', izoh: 'Qaysi revizya joriy ekanini tekshiring', son: null, ogoh: false, yol: '/admin/chizmalar' },
    { kalit: 'remark', nom: 'Remark va predpisaniya', izoh: 'Ochiq remarklar va muddatlar', son: null, ogoh: false, yol: '/admin/murojaatlar' },
  ];
  return [
    { kalit: 'kelgan', nom: 'Yangi chizma revizyalari', izoh: 'Loyihachi yangi revizya chiqardi — ko‘rib qabul qiling', son: v('kelgan_yangi'), ogoh: n(s?.kelgan_yangi) > 0, yol: '/admin/chizmalar?holat=kelgan' },
    { kalit: 'eskirgan', nom: 'Eskirgan chizmaga tayangan ishlar', izoh: 'Smeta qatori yoki АОСР eski revizyaga bog‘langan — yangilang', son: v('eskirgan_boglanish'), ogoh: n(s?.eskirgan_boglanish) > 0, yol: '/admin/chizmalar?holat=eskirgan' },
    { kalit: 'taklif', nom: 'Loyiha o‘zgarishidan takliflar', izoh: 'Qo‘shimcha yoki zamena taklifini smeta o‘zgarishiga aylantiring', son: v('taklif_yangi_menga'), ogoh: n(s?.taklif_yangi_menga) > 0, yol: '/admin/chizmalar?taklif=1' },
    { kalit: 'savol', nom: 'Loyihachiga savol', izoh: 'Chizmada tushunarsiz joy bo‘lsa — savol yozing', son: null, ogoh: false, yol: '/admin/murojaatlar?turi=savol&yonalish=mendan' },
    { kalit: 'reestr', nom: 'Chizmalar reyestri', izoh: 'Obyekt bo‘yicha hamma chizma va revizyalar', son: null, ogoh: false, yol: '/admin/chizmalar' },
  ];
}
