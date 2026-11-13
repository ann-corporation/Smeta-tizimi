/**
 * aosr-zanjir.ts — ZANJIRLI АОСР QORALAMA (sof mantiq, tarmoq/UI yo'q).
 * Smeta ishi (bl) tanlanganda uning YASHIRILADIGAN bosqichlari tartib bilan taklif qilinadi:
 *   zamin → podgotovka → armatura → opalubka → beton → gidroizolyatsiya → qoplama asosi.
 * Bosqich aniqlash: norma shifri prefiksi (Е6-1 beton, Е6-2/С124 armatura, Е12-2 gidroizolyatsiya, Е11/Е15 qoplama)
 * va nom kalit so'zlari. Materiallar — ishning o'z resurslaridan (smeta/fakt qatorlari), o'ylab topilmaydi.
 * Smetada yo'q bosqich YASALMAYDI (faqat «smetada yo'q» deb ko'rsatiladi).
 * Hamma qoralama holati — 'yangi'; tasdiqlash faqat qarshi tomon qarori bilan.
 */
import type { AosrCoverage } from '../api/t2-aosr';
import type { AosrMalumot, AosrV2 } from '../api/t2-ijro';
import { qoralamaTanlangandan } from './aosr-qoralama';
import { armaturaBelgilari, betonBelgilari } from './aosr-ilova';
import { materialTokenlar } from './ijro-qoida';

export type Bosqich = 'zamin' | 'podgotovka' | 'armatura' | 'opalubka' | 'beton' | 'gidroizol' | 'qoplama';

/** Zanjir tartibi (qurilish ketma-ketligi). */
export const BOSQICH_TARTIB: readonly Bosqich[] = ['zamin', 'podgotovka', 'armatura', 'opalubka', 'beton', 'gidroizol', 'qoplama'];

/** Akt sarlavhasi (rasmiy hujjat — rus tilida). */
export const BOSQICH_NOM: Record<Bosqich, string> = {
  zamin: 'Устройство и уплотнение основания (земляные работы)',
  podgotovka: 'Устройство подготовки (щебёночной, песчаной, бетонной)',
  armatura: 'Армирование конструкций',
  opalubka: 'Устройство опалубки',
  beton: 'Бетонирование конструкций',
  gidroizol: 'Устройство гидроизоляции',
  qoplama: 'Устройство основания под покрытие (стяжка, подстилающий слой)',
};
/** Interfeys (o'zbekcha) nomi. */
export const BOSQICH_UZ: Record<Bosqich, string> = {
  zamin: 'Zamin', podgotovka: 'Podgotovka', armatura: 'Armatura', opalubka: 'Opalubka', beton: 'Beton', gidroizol: 'Gidroizolyatsiya', qoplama: 'Qoplama asosi',
};

/** Keyingi ishlar maydoni uchun (bosqichdan keyin ruxsat etiladigan ish nomi, «разрешается производство … по устройству»). */
const KEYINGI_NOM: Record<Bosqich, string> = {
  zamin: 'подготовки', podgotovka: 'армирования', armatura: 'опалубки', opalubka: 'бетонирования', beton: 'гидроизоляции', gidroizol: 'основания под покрытие', qoplama: 'покрытия',
};

const katta = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/Ё/g, 'Е');

/** Shifr: lotin E/C ni kirill Е/С ga keltirish, bo'shliq/nuqtalarsiz. */
export function kodNormal(kod: string | null | undefined): string {
  return katta(kod).replace(/\s+/g, '').replace(/E/g, 'Е').replace(/C/g, 'С').replace(/\./g, '-');
}

/**
 * Bitta qator → bosqich (yoki null). Nom bo'yicha aniq belgilar (podgotovka/opalubka va h.k.) shifrdan oldin,
 * chunki bitta shifr (Е6-1) bir nechta ishga to'g'ri kelishi mumkin; keyin shifr prefiksi; keyin nomning umumiy kalit so'zlari.
 */
export function bosqichAniqla(q: { kod?: string | null; nom?: string | null }): Bosqich | null {
  const nom = katta(q.nom);
  const kod = kodNormal(q.kod);
  if (/ОПАЛУБ/.test(nom)) return 'opalubka';
  if (/ПОДГОТОВ|ПОДСЫПК|ПОДУШК|ЩЕБЕН|ПЕСЧАН/.test(nom) && !/ПОДГОТОВКА\s+ПОД\s+(ПОКРЫТ|ПОЛ)/.test(nom)) return 'podgotovka';
  if (/АРМИР|АРМАТУР|КАРКАС|АРМОКАРКАС/.test(nom)) return 'armatura';
  if (/ГИДРОИЗОЛ|ОКЛЕЕЧН|ОБМАЗОЧН|МЕМБРАН|ГИДРОСТЕКЛ|ГИДРОБАРЬЕР/.test(nom)) return 'gidroizol';
  if (/^Е6-2|^С124/.test(kod)) return 'armatura';
  if (/^Е12-2/.test(kod)) return 'gidroizol';
  if (/^Е6-1/.test(kod)) return 'beton';
  if (/^Е(11|15)-/.test(kod)) return 'qoplama';
  if (/БЕТОН|МОНОЛИТ|ЖЕЛЕЗОБЕТОН/.test(nom)) return 'beton';
  if (/СТЯЖК|ПОДСТИЛАЮЩ|ОСНОВАНИЕ ПОД (ПОКРЫТ|ПОЛ)|ПОДГОТОВКА ПОД (ПОКРЫТ|ПОЛ)|ГРАНИТ|ПЛИТК|ОБЛИЦОВ|ПОКРЫТИ/.test(nom)) return 'qoplama';
  if (/ЗАСЫПК|ПЛАНИРОВК|УПЛОТН|ТРАМБ|КОТЛОВАН|ВЫЕМК|ЗЕМЛЯН|РАЗРАБОТК\S* ГРУНТ|ГРУНТ(?!ОВ)/.test(nom)) return 'zamin';
  return null;
}

const resursmi = (c: Pick<AosrCoverage, 'kat'>) => c.kat === 'mat' || c.kat === 'ob';

export type ZanjirKirish = {
  /** Tanlangan ISH qatorlari (bl). */
  ishlar: readonly AosrCoverage[];
  /** Ish id → uning resurs qatorlari (mat/ob/rs; fakt>0 yoki hajmi bor). */
  resurslar: ReadonlyMap<number, readonly AosrCoverage[]>;
};

export type BosqichQoralama = {
  bosqich: Bosqich;
  ishlar: AosrCoverage[];
  resurslar: AosrCoverage[];
  /** Akt matn maydonlari (raqam/komissiya/sanalar tashqaridan qo'yiladi). */
  malumot: Pick<AosrMalumot, 'ish_nomi' | 'ish_tavsifi' | 'materiallar' | 'keyingi_ishlar'>;
  /** Interfeysda ko'rsatiladigan belgilar: B25, Ø12 А500С … */
  belgilar: string[];
  /** Bog'lanadigan qator id lar (ish + resurs). */
  qatorIds: number[];
};

export type ZanjirNatija = {
  qoralamalar: BosqichQoralama[];
  /** Zanjirda bo'lishi mumkin, lekin smetada dalili yo'q bosqichlar (faqat axborot). */
  yoq: Bosqich[];
  /** Bosqichi aniqlanmagan ishlar (zanjirga kirmaydi; qo'lda akt). */
  aniqlanmagan: AosrCoverage[];
};

const belgilarQur = (b: Bosqich, matn: string): string[] => {
  const out: string[] = [];
  if (b === 'beton') { const x = betonBelgilari(matn); out.push(...[x.sinf, x.marka, x.suv, x.sovuq].filter((v): v is string => !!v)); }
  if (b === 'armatura') {
    const a = armaturaBelgilari(matn);
    out.push(...a.diametrlar.map((d) => `Ø${d}`), ...a.klasslar);
  }
  return out;
};

/** Tanlangan ishlardan bosqichlar zanjiri. Ish o'zi bosqichga ega bo'lmasa — resurslari bo'yicha (armatura/beton/…) taqsimlanadi. */
export function zanjirQur(k: ZanjirKirish): ZanjirNatija {
  const xarita = new Map<Bosqich, { ishlar: AosrCoverage[]; resurslar: AosrCoverage[]; asos: AosrCoverage[] }>();
  const joy = (b: Bosqich) => { let x = xarita.get(b); if (!x) { x = { ishlar: [], resurslar: [], asos: [] }; xarita.set(b, x); } return x; };
  const asosQosh = (b: Bosqich, ish: AosrCoverage) => { const x = joy(b); if (!x.asos.some((a) => a.qator_id === ish.qator_id)) x.asos.push(ish); };
  const aniqlanmagan: AosrCoverage[] = [];
  for (const ish of k.ishlar) {
    const ichki = (k.resurslar.get(ish.qator_id) ?? []).filter(resursmi); // faqat material/uskuna (mehnat/mash-soat aktga kirmaydi)
    const o = bosqichAniqla(ish);
    // Resurslar: o'z bosqichi bo'yicha (armatura po'lati — armaturaga, beton aralashmasi — betonga), aniqlanmasa ishning bosqichiga.
    const resBoy = ichki.map((r) => ({ r, b: bosqichAniqla(r) }));
    if (o) {
      joy(o).ishlar.push(ish); asosQosh(o, ish);
      for (const { r, b } of resBoy) {
        const maqsad: Bosqich = b && b !== o && (b === 'armatura' || b === 'gidroizol' || b === 'opalubka') && resursmi(r) ? b : o;
        joy(maqsad).resurslar.push(r);
        if (maqsad !== o) asosQosh(maqsad, ish);
      }
    } else {
      // Ish nomidan bosqich aniqlanmadi (masalan «монолитная плита»): resurslaridan zanjir.
      const bosqichli = resBoy.filter((x) => x.b);
      if (!bosqichli.length) { aniqlanmagan.push(ish); continue; }
      for (const { r, b } of resBoy) {
        const maqsad: Bosqich = b ?? bosqichli[0].b!;
        joy(maqsad).resurslar.push(r);
        asosQosh(maqsad, ish);
      }
    }
  }
  const mavjud = BOSQICH_TARTIB.filter((b) => xarita.has(b));
  const qoralamalar: BosqichQoralama[] = mavjud.map((b, i) => {
    const x = xarita.get(b)!;
    const ishlar = x.ishlar;
    const resurslar = [...new Map(x.resurslar.map((r) => [r.qator_id, r])).values()];
    const baza = qoralamaTanlangandan([...ishlar, ...resurslar]);
    const konstruksiya = (x.asos[0]?.nom ?? ishlar[0]?.nom) ? String(x.asos[0]?.nom ?? ishlar[0]?.nom) : '';
    const nomi = konstruksiya ? `${BOSQICH_NOM[b]} — ${konstruksiya}` : BOSQICH_NOM[b];
    const matnHammasi = [...ishlar, ...resurslar].map((c) => c.nom ?? '').join('\n');
    const keyingi = mavjud[i + 1];
    return {
      bosqich: b, ishlar, resurslar,
      malumot: {
        ish_nomi: nomi.slice(0, 300),
        ish_tavsifi: baza.ish_tavsifi || (konstruksiya ? `${BOSQICH_NOM[b]}: ${konstruksiya}` : BOSQICH_NOM[b]),
        materiallar: materialTokenlar(baza.materiallar).join('; '),
        keyingi_ishlar: keyingi ? BOSQICH_NOM[keyingi] : KEYINGI_NOM[b],
      },
      belgilar: belgilarQur(b, matnHammasi),
      qatorIds: [...new Set([...x.asos, ...ishlar, ...resurslar].map((c) => c.qator_id))],
    };
  });
  return { qoralamalar, yoq: BOSQICH_TARTIB.filter((b) => !xarita.has(b) && mavjud.length > 0 && BOSQICH_TARTIB.indexOf(b) > BOSQICH_TARTIB.indexOf(mavjud[0]) && BOSQICH_TARTIB.indexOf(b) < BOSQICH_TARTIB.indexOf(mavjud[mavjud.length - 1])), aniqlanmagan };
}

/* ── Raqamlash va avto-qoralama belgisi ──────────────────────────── */
const raqamSoni = (r: string | null | undefined): number | null => { const m = /\d+/.exec(String(r ?? '')); return m ? Number(m[0]) : null; };

/** Obyekt bo'yicha davomli raqam: bekor qilinmagan aktlarning eng kattasi + 1 (bo'sh ro'yxat — 1). */
export function keyingiAosrRaqam(aktlar: readonly Pick<AosrV2, 'raqam' | 'holat'>[]): number {
  const sonlar = aktlar.filter((a) => a.holat !== 'bekor').map((a) => raqamSoni(a.raqam)).filter((n): n is number => n != null && n > 0);
  return (sonlar.length ? Math.max(...sonlar) : 0) + 1;
}

/** Tizim o'zi yasagan (slichitelniy asosi — `izoh: 'avto: …'`) va hali qoralama holatidagi akt. */
export const avtoQoralamami = (a: Pick<AosrV2, 'holat' | 'izoh'>): boolean => a.holat === 'yangi' && /^\s*avto\s*:/i.test(String(a.izoh ?? ''));

/** Bekor qilishga yaroqli avto-qoralamalar: qoralama, hech qanday protokolga ilova qilinmagan va qarshi tomonga yuborilmagan. */
export function bekorQilsaBoladigan(aktlar: readonly Pick<AosrV2, 'id' | 'holat' | 'izoh' | 'protokol_soni'>[], yuborilgan: ReadonlySet<number>): number[] {
  return aktlar.filter((a) => avtoQoralamami(a) && !(Number(a.protokol_soni ?? 0) > 0) && !yuborilgan.has(a.id)).map((a) => a.id);
}
