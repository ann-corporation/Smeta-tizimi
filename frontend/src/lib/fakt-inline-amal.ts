/**
 * Fakt jurnali — qator OSTIDAGI inline amallar (egasi 2026-11-07: «zamena yoki qo'shimcha ish yoki material juda qiyin…
 * alohida oynada bo'lgani uchun chalkashtiradi»). Sof mantiq: tekshiruv, server yuklamasi, xato matni, juftlar.
 *
 * YANGI pul formulasi YO'Q: yozuv mavjud `ish_abc_saqla_v1` (IshAbcModal bilan bir xil yuklama shakli):
 *  - ish zamenasi      → command 'replacement' (asl ish o'zgarmaydi; yangi qator unga ishora qiladi, asl qoldig'i zamena bajarilgan sari yopiladi);
 *  - resurs zamenasi   → command 'resurs_zamena';
 *  - qo'shimcha ish    → command 'additional' (shu bo'lim yoki «СМЕТАДАН ТАШҚАРИ ИШЛАР» — server qoidasi);
 *  - qo'shimcha material → command 'additional': material nomidagi ish + bitta МАТ resurs (norma 1) — summa = hajm × narx, bir marta.
 * Narx: bo'sh = NULL (narxsiz, 0 emas) — saqlanadi, ogohlantirish bilan.
 */
import type { AbcSaqlaInput, Kat, NarxManba } from '../api/t2-ish-abc';
import { abcXato } from '../api/t2-ish-abc';
import { t } from '../i18n/til';
import { son, type AbcResurs } from './ish-abc';
import type { JurnalIsh, JurnalQator, ZamenaBoglanish } from './fakt-jurnal';

export type InlineTur = 'zamena' | 'qoshimcha_ish' | 'qoshimcha_material';
export const INLINE_TURLAR: readonly InlineTur[] = ['zamena', 'qoshimcha_ish', 'qoshimcha_material'];
/** Tab nomi va tugmasi (faol qatorda z / q / m; yozayotganda Alt+…). */
export const INLINE_TAB: Record<InlineTur, { nom: string; tugma: string }> = {
  zamena: { nom: 'Boshqasi bilan almashtirildi (zamena)', tugma: 'z' },
  qoshimcha_ish: { nom: 'Qo‘shimcha ish', tugma: 'q' },
  qoshimcha_material: { nom: 'Qo‘shimcha material', tugma: 'm' },
};

/** Panel ochiladigan qator (JurnalQator dan kerakli maydonlar). */
export type InlineQator = Pick<JurnalQator, 'id' | 'tur' | 'kod' | 'nom' | 'birlik' | 'kat' | 'norma' | 'smeta' | 'otaId' | 'otaVersiya' | 'qoshimcha' | 'zamena'>;

/** Zamena joyi: resurs bo'lsa — ota ish hajmi (norma × ish hajmi); ish (bl) bo'lsa — kerak emas. */
export type InlineKontekst = {
  /** Resurs zamenasida: ota ish (bl) hajmi; ota ish bo'lmasa (alohida resurs) null → aniq hajm kiritiladi. */
  otaIshHajm: number | null;
  /** Qatorning eng yaqin bo'limi (qo'shimcha shu yerga); topilmasa null → «СМЕТАДАН ТАШҚАРИ ИШЛАР». */
  bolim: { id: number; nom: string; versiya: number | null } | null;
  /** Zamena mumkin emasligi sababi (mehnat, chiqarilgan, o'zi qo'shilgan); mumkin bo'lsa null. */
  zamenaYoq: string | null;
};

export type InlineForma = {
  kod: string; nom: string; birlik: string;
  /** Ish/material hajmi; resurs zamenasida — norma qo'llansa bo'sh qolishi mumkin. */
  hajm: string;
  /** Resurs zamenasida norma (asl normadan oldindan to'ladi). */
  norma: string;
  narx: string; manba: NarxManba; kat: Kat;
  /** Sabab / izoh — server majburiy (SABAB_REQUIRED). */
  izoh: string;
  /** Bajarilgan hajm (fakt) — ixtiyoriy; ish/material uchun. */
  fakt: string;
  /** Birlik farqli zamena: «aslning qancha hajmini almashtiradi» (aslning birligida), ixtiyoriy. */
  almHajm: string;
  /** Qo'shimcha qayerga: shu bo'lim yoki «СМЕТАДАН ТАШҚАРИ ИШЛАР». */
  joy: 'shu' | 'tashqari';
  /** Ish katalogi/smetadan tanlansa — uning resurs tarkibi (normalar bilan); qo'lda yozilsa bo'sh. */
  sostav: AbcResurs[];
};

export const bosForma = (q: InlineQator, tur: InlineTur): InlineForma => ({
  kod: '', nom: '', birlik: tur === 'zamena' ? q.birlik ?? '' : '', hajm: '', narx: '', manba: 'qolda',
  norma: tur === 'zamena' && q.tur !== 'bl' && q.norma != null && q.norma > 0 ? String(q.norma) : '',
  // Kategoriya faqat zamenada asl qatordan olinadi; qo'shimcha material doim МАТ (ЧЕЛ/МАШ qatoridan ham).
  kat: tur === 'zamena' && (q.kat === 'ЧЕЛ' || q.kat === 'МАШ' || q.kat === 'МАТ' || q.kat === 'ОБ') ? q.kat : 'МАТ',
  izoh: '', fakt: '', almHajm: '', joy: 'shu', sostav: [],
});

/** Zamena nega mumkin emas (mavjud qator tugmasi qoidalari bilan bir xil); mumkin bo'lsa null. */
export function zamenaYoqSabab(q: InlineQator, o: { mehnat: boolean; chiqarilgan: boolean; mehnatMatn: string }): string | null {
  if (q.qoshimcha || q.zamena) return t('Bu qatorni o‘zingiz qo‘shgansiz — uni tahrirlang (qalam tugmasi).');
  if (q.otaId == null) return t('Bu qatorning joyi aniqlanmadi — zamena qilib bo‘lmaydi.');
  if (q.tur !== 'bl' && o.mehnat) return t(o.mehnatMatn);
  if (q.tur !== 'bl' && o.chiqarilgan) return t('Resurs ishdan chiqarilgan — avval chiqarishni bekor qiling.');
  return null;
}

/** Qatorning eng yaqin bo'limi (rz) — ota zanjiri bo'yicha. */
export function bolimTop(otaId: number | null, ol: (id: number) => { id: number; tur: string | null; ota_id: number | null; nom: string | null; versiya: number | null } | undefined): InlineKontekst['bolim'] {
  let id = otaId; let n = 0;
  while (id != null && n++ < 60) {
    const r = ol(id); if (!r) return null;
    if (r.tur === 'rz') return { id: r.id, nom: r.nom ?? '', versiya: r.versiya ?? null };
    id = r.ota_id;
  }
  return null;
}

/** Zamena rejimi: ish (bl) → ish zamenasi; boshqasi → resurs zamenasi. */
export const zamenaRejim = (q: Pick<InlineQator, 'tur'>): 'ish' | 'resurs' => (q.tur === 'bl' ? 'ish' : 'resurs');

/** Resurs zamenasida norma qo'llanadimi (ota ish hajmi ma'lum va norma > 0). */
export const normaQollanadi = (f: Pick<InlineForma, 'norma'>, k: Pick<InlineKontekst, 'otaIshHajm'>): boolean => {
  const n = son(f.norma); return k.otaIshHajm != null && n != null && n > 0;
};

/** Yangi birlik asl birligidan farqlimi (zamena qoldig'i uchun «almashtirilgan hajm» maydoni). */
export const birlikFarqli = (q: Pick<InlineQator, 'birlik'>, f: Pick<InlineForma, 'birlik'>): boolean =>
  !!f.birlik.trim() && !!q.birlik?.trim() && f.birlik.trim().toLowerCase() !== q.birlik.trim().toLowerCase();

/** Forma tekshiruvi — oddiy so'zlar bilan (bo'sh ro'yxat = saqlash mumkin). */
export function inlineTekshir(tur: InlineTur, q: InlineQator, f: InlineForma, k: InlineKontekst): string[] {
  const x: string[] = [];
  if (tur === 'zamena' && k.zamenaYoq) x.push(k.zamenaYoq);
  if (!f.nom.trim()) x.push(t('Nomini yozing yoki ro‘yxatdan tanlang.'));
  if (!f.birlik.trim()) x.push(t('Birlikni yozing.'));
  const resursZamena = tur === 'zamena' && zamenaRejim(q) === 'resurs';
  if (resursZamena) {
    const h = son(f.hajm);
    if (!normaQollanadi(f, k) && (h == null || h === 0)) x.push(t('Hajmni yozing (0 dan farqli).'));
  } else {
    const h = son(f.hajm);
    if (h == null || h <= 0) x.push(t('Hajm 0 dan katta bo‘lishi kerak.'));
    const fk = son(f.fakt);
    if (f.fakt.trim() && (fk == null || fk < 0)) x.push(t('Bajarilgan hajm noto‘g‘ri.'));
  }
  const p = son(f.narx);
  if (f.narx.trim() && (p == null || p < 0)) x.push(t('Narx noto‘g‘ri (bo‘sh qoldirsangiz — narxsiz saqlanadi).'));
  const a = son(f.almHajm);
  if (f.almHajm.trim() && (a == null || a < 0)) x.push(t('Almashtiriladigan hajm manfiy bo‘lmagan son bo‘lishi shart.'));
  if (!f.izoh.trim()) x.push(t('Sababini yozing (masalan: loyihachi xati, buyurtmachi topshirig‘i).'));
  return x;
}

const resursP = (r: AbcResurs): AbcSaqlaInput['resurslar'][number] => {
  const n = son(r.norma);
  return { kat: r.kat, kod: r.kod.trim() || null, nom: r.nom.trim(), birlik: r.birlik.trim(), norma: n != null && n > 0 ? n : null,
    hajm: n != null && n > 0 ? null : son(r.hajm ?? ''), narx: son(r.narx), narx_manba: r.manba };
};

/** Server yuklamasi (`ishAbcSaqla`) — IshAbcModal bilan bir xil maydonlar. */
export function inlineYuklama(p: { kompaniyaId: number; obyektId: number; sana: string; operationId: string; tur: InlineTur; q: InlineQator; f: InlineForma; k: InlineKontekst }): AbcSaqlaInput {
  const { tur, q, f, k } = p;
  const asos = { kompaniyaId: p.kompaniyaId, obyektId: p.obyektId, sana: p.sana, sabab: f.izoh.trim(), operationId: p.operationId };
  const narx = son(f.narx);
  const fakt = son(f.fakt);
  if (tur === 'zamena' && zamenaRejim(q) === 'resurs') {
    const nq = normaQollanadi(f, k);
    return { ...asos, command: 'resurs_zamena', almashtirilayotganQatorId: q.id, ish: null, faktHajm: null,
      resurslar: [{ kat: f.kat, kod: f.kod.trim() || null, nom: f.nom.trim(), birlik: f.birlik.trim(), norma: nq ? son(f.norma) : null, hajm: nq ? null : son(f.hajm), narx, narx_manba: narx == null ? 'qolda' : f.manba }] };
  }
  const ish = { kod: f.kod.trim() || null, nom: f.nom.trim(), birlik: f.birlik.trim(), hajm: son(f.hajm)! };
  const faktHajm = fakt != null && fakt > 0 ? fakt : null;
  if (tur === 'zamena') {
    return { ...asos, command: 'replacement', otaQatorId: q.otaId, kutilganVersiya: q.otaVersiya, almashtirilayotganQatorId: q.id, ish, faktHajm, resurslar: f.sostav.map(resursP) };
  }
  const shuBolim = f.joy === 'shu' && k.bolim != null;
  const joy = { otaQatorId: shuBolim ? k.bolim!.id : null, kutilganVersiya: shuBolim ? k.bolim!.versiya : null, almashtirilayotganQatorId: null };
  if (tur === 'qoshimcha_material') {
    return { ...asos, command: 'additional', ...joy, ish, faktHajm,
      resurslar: [{ kat: f.kat, kod: f.kod.trim() || null, nom: f.nom.trim(), birlik: f.birlik.trim(), norma: 1, hajm: null, narx, narx_manba: narx == null ? 'qolda' : f.manba }] };
  }
  return { ...asos, command: 'additional', ...joy, ish, faktHajm, resurslar: f.sostav.map(resursP) };
}

/** Server/tarmoq xatosi → oddiy o'zbekcha matn (mavjud abcXato ustiga inline uchun qo'shimcha kodlar). */
export function inlineXato(r: { ok?: boolean; code?: string; error?: string; xabar?: string } | null | undefined): string {
  if (r == null) return t('Javob olinmadi. Qayta bosing — takroriy saqlash xavfsiz.');
  const m = `${r.code ?? ''} ${r.error ?? ''}`;
  if (/SABAB_REQUIRED/.test(m)) return t('Sababini yozing (masalan: loyihachi xati, buyurtmachi topshirig‘i).');
  if (/ISH_NOM_BIRLIK_REQUIRED/.test(m)) return t('Nom va birlik kiritilishi shart.');
  if (/RESURS_NOT_FOUND|RESURS_REQUIRED/.test(m)) return t('Almashtiriladigan resurs topilmadi — jadvalni yangilang.');
  if (/PARENT_REQUIRED|OBJECT_ACCESS_DENIED|OBJECT_SCOPE_INVALID/.test(m)) return t('Bo‘lim yoki obyekt topilmadi — jadvalni yangilang.');
  if (/FAKT_NOT_WRITTEN/.test(m)) return t('Qator yozilmadi: fakt qabul qilinmadi. Hajmni tekshirib qayta urinib ko‘ring.');
  if (/RESURSLAR_0_60/.test(m)) return t('Resurslar ko‘p (60 tadan oshmasin).');
  if (/permission|PERMISSION|FORBIDDEN|403/.test(m)) return t('Bu amal uchun PTO, rahbar yoki admin roli kerak.');
  return abcXato(r);
}

/** Zamena juftlari: zamena → asl (serverdagi replaces_line_id) va teskarisi asl → zamenalar. */
export function zamenaJuftlari(zb: ZamenaBoglanish | null | undefined): { asl: ReadonlyMap<number, number>; zamenalar: ReadonlyMap<number, readonly number[]> } {
  const zamenalar = new Map<number, number[]>();
  for (const [z, a] of zb?.almashtiradi ?? []) { const l = zamenalar.get(a); if (l) l.push(z); else zamenalar.set(a, [z]); }
  for (const l of zamenalar.values()) l.sort((x, y) => x - y);
  return { asl: zb?.almashtiradi ?? new Map(), zamenalar };
}

/** «Faqat zamena va qo'shimchalar» filtri: ish yoki uning resurslari zamena/qo'shimcha/almashtirilgan bo'lsa. */
export function ozgarishBor(ish: JurnalIsh, zamenalar?: ReadonlyMap<number, readonly number[]>): boolean {
  const bor = (q: JurnalQator) => q.zamena || q.qoshimcha || (q.almashtirilgan ?? 0) > 0 || (zamenalar?.has(q.id) ?? false);
  return bor(ish) || ish.resurslar.some(bor) || ish.avtomatik.some(bor);
}
