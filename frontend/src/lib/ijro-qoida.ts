/**
 * IJRO QOIDALARI — qaysi ish turi uchun laboratoriya protokoli kerak (sof mantiq, bitta joyda).
 * Oddiy kalit so'z qoidalari (RU/UZ lotin/kirill); normativ matn qayta yozilmaydi (IJRO_HUJJATLARI_LAB_TOMONLAR §4.3).
 * Qoida «talab» (ogohlantirish) — bloklamaydi. Aniq norma PTO tasdig'iga qadar `tekshirish_kerak` darajasida.
 */
import type { SinovTuri } from '../api/t2-ijro';

export type LabTalab = Extract<SinovTuri, 'beton' | 'grunt' | 'payvand'>;

export const LAB_TALAB_NOM: Record<LabTalab, string> = {
  beton: 'бетон', grunt: 'уплотнение грунта', payvand: 'сварка',
};

const QOIDALAR: readonly { tur: LabTalab; re: RegExp }[] = [
  { tur: 'beton', re: /бетон|монолит|бетонир|beton|monolit|темирбетон|temirbeton/ },
  { tur: 'grunt', re: /уплотн|трамбов|обратн\S* засып|послойн|зичла|qatlam-qatlam|orqaga ko'm|grunt zich|tuproq zich/ },
  { tur: 'payvand', re: /свар|payvand|электродуг|elektrod/ },
];

const normala = (s: string) => s.toLocaleLowerCase('ru-RU').replace(/[’‘`ʻʼ]/g, "'").replace(/ё/g, 'е');

/** Matndan (ish nomi, tavsif, materiallar) talab qilinadigan laboratoriya sinovlari; bo'sh — talab yo'q. */
export function labTalablari(...matnlar: (string | null | undefined)[]): LabTalab[] {
  const s = normala(matnlar.filter(Boolean).join(' \n '));
  if (!s.trim()) return [];
  return QOIDALAR.filter((q) => q.re.test(s)).map((q) => q.tur);
}

/** Akt matnidan talab qilinadigan, lekin bog'langan protokollar orasida yo'q sinov turlari. */
export function labYetishmaydi(
  akt: { ish_nomi?: string | null; ish_tavsifi?: string | null; materiallar?: string | null },
  boglanganProtokolTurlari: readonly string[],
): LabTalab[] {
  return labTalablari(akt.ish_nomi, akt.ish_tavsifi, akt.materiallar).filter((t) => !boglanganProtokolTurlari.includes(t));
}

/* ── Eski tizim (GAS «Akt generator») qoidalaridan ko'chirilgan sof tekshiruvlar ──────────────
 * AktSmetaBridge: yashirin ish kalit so'zlari; AktQuality: akt qatori sifat tekshiruvi;
 * AktYaratPlus: dublikat (obyekt+ish nomi) nazorati; AktMaterialOptions: material ro'yxati kanoni.
 * AI/Gemini, Jaccard moslash va Sheets-ga xos qismlar KO'CHIRILMAGAN (PR matnida sabablari). */
const YASHIRIN_KALIT = ['ЗЕМЛЯ', 'ФУНДАМЕНТ', 'АРМАТУР', 'ГИДРОИЗОЛ', 'ЗАСЫПК', 'СВАЙ', 'БЕТОН', 'КЛАДК', 'ЗАКЛАДН', 'ПОДГОТОВ', 'УТЕПЛЕН', 'МОНОЛИТ',
  'ИЗОЛЯЦ', 'ГРУНТОВ', 'ПРОКЛАДК', 'ТРУБОПРОВОД', 'КАБЕЛ', 'КАНАЛИЗАЦ', 'ВОДОПРОВОД', 'ТЕПЛОИЗОЛ', 'ШТУКАТУР', 'СКРЫТ'];
const kalitNorm = (s: string | null | undefined) => String(s ?? '').toLocaleUpperCase('ru-RU').replace(/Ё/g, 'Е').replace(/[^А-ЯA-Z0-9'ʻʼ]/g, '');

/** Ish nomi yashirin ishga o'xshaydimi (eski ro'yxat). Faqat «AOSR shart emasmi?» ogohlantirishi uchun; coverage.yashirin ustun turadi. */
export function yashirinIshmi(nom: string | null | undefined): boolean {
  const u = kalitNorm(nom);
  return !!u && YASHIRIN_KALIT.some((k) => u.includes(kalitNorm(k)));
}


export function materialTokenlar(...matnlar: (string | null | undefined)[]): string[] {
  const korilgan = new Set<string>(); const out: string[] = [];
  for (const m of matnlar) {
    for (const x of String(m ?? '').replace(/\r/g, '\n').split(/[;\n]+/)) {
      const t = x.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').replace(/^[\s•·\-–—]+|[\s•·\-–—]+$/g, '').trim();
      const k = t.toLocaleLowerCase('ru-RU');
      if (t && !korilgan.has(k)) { korilgan.add(k); out.push(t); }
    }
  }
  return out;
}

export type AktSifatQoida = 'ish_nomi' | 'material' | 'tugash_sana' | 'sana_xato' | 'yashirin_emas' | 'imzochi';
export const AKT_SIFAT_NOM: Record<AktSifatQoida, string> = {
  ish_nomi: 'ish nomi yo‘q', material: 'material yo‘q', tugash_sana: 'tugash sanasi yo‘q', sana_xato: 'boshlanish > tugash',
  yashirin_emas: 'yashirin ishga o‘xshamaydi', imzochi: 'komissiyada F.I.Sh. yo‘q',
};

/** Akt sifat tekshiruvi (eski AktQuality: majburiy maydonlar, sana mantig'i, yashirin ish, material). Bloklamaydi. */
export function aktSifatMuammolari(a: {
  ish_nomi?: string | null; materiallar?: string | null; boshlanish_sana?: string | null; tugash_sana?: string | null;
  komissiya?: readonly { fio?: string | null }[] | null; tur?: string | null;
}): AktSifatQoida[] {
  const m: AktSifatQoida[] = [];
  if (!String(a.ish_nomi ?? '').trim()) m.push('ish_nomi');
  else if ((a.tur ?? 'aosr') === 'aosr' && !yashirinIshmi(a.ish_nomi)) m.push('yashirin_emas');
  if (!String(a.materiallar ?? '').trim()) m.push('material');
  if (!String(a.tugash_sana ?? '').trim()) m.push('tugash_sana');
  if (a.boshlanish_sana && a.tugash_sana && a.boshlanish_sana.slice(0, 10) > a.tugash_sana.slice(0, 10)) m.push('sana_xato');
  if (Array.isArray(a.komissiya) && a.komissiya.length && !a.komissiya.some((k) => String(k.fio ?? '').trim())) m.push('imzochi');
  return m;
}

/** Dublikat nazorati (eski AktYaratPlus): bir xil obyekt + ish nomi bilan bir nechta faol akt. Qaytadi: takror akt id lar (asli hisobga kirmaydi). */
export function aktDublikatlari(aktlar: readonly { id: number; obyekt_id?: number; ish_nomi?: string | null; holat: string }[]): number[] {
  const korilgan = new Set<string>(); const dub: number[] = [];
  for (const a of aktlar.slice().sort((x, y) => x.id - y.id)) {
    const nom = kalitNorm(a.ish_nomi);
    if (a.holat === 'bekor' || !nom) continue;
    const k = `${a.obyekt_id ?? ''}|${nom}`;
    if (korilgan.has(k)) dub.push(a.id); else korilgan.add(k);
  }
  return dub;
}