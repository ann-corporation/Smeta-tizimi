/**
 * F2 DUBLIKAT HIMOYASI (egasi 2026-10-25: «bitta F2 ni ikki marta yozib qo‘yishga himoya kerak»).
 * Yozishdan OLDIN tekshiruv. BLOK faqat aniq takrorda (shu fayl+varaq allaqachon aktga yozilgan; shu obyektda shu raqam bor),
 * qolgani — OGOHLANTIRISH va operator tasdig‘i. Baza ham shu raqam qoidasini trigger bilan ushlaydi (t2_akt_raqam_takror).
 * Hammasi sof funksiyalar: ma’lumotni sahifa o‘qiydi, bu yerda faqat qaror.
 */
import { t } from '../../i18n/til';

export type DAkt = { id: number; raqam: string | null; oy: string | null; holat: string; hujjat_jami?: number | null; manba?: string | null };
export type MasalaKodi = 'manba' | 'raqam' | 'oy_raqam' | 'summa' | 'pereraschet';
export type Masala = { daraja: 'blok' | 'ogoh'; kod: MasalaKodi; matn: string; aktIdlar: number[] };

/** Raqam solishtirish uchun: bo‘shliqsiz, kichik harf (baza trigger bilan bir xil: lower(btrim)). */
export const raqamKaliti = (r: string | null | undefined): string => String(r ?? '').trim().toLowerCase();
const faol = (a: DAkt) => a.holat !== 'bekor';
const yorliq = (a: DAkt) => `F2 №${a.raqam?.trim() || '—'} (${(a.oy ?? '').slice(0, 7)}, ${a.holat}, akt #${a.id})`;
const oyOnly = (oy: string | null | undefined) => String(oy ?? '').slice(0, 7);

/** Summalar ±0,5% ichida teng (ikkalasi ham ma’lum va 0 emas). */
export function summaYaqin(a: number | null | undefined, b: number | null | undefined, foiz = 0.5): boolean {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  const m = Math.max(Math.abs(a), Math.abs(b));
  if (m < 0.005) return false;
  return Math.abs(a - b) <= m * foiz / 100;
}

export type DublikatKirish = {
  /** Shu obyektning barcha F2 aktlari (bekor qilinganlari ham bo‘lishi mumkin — ular hisobga olinmaydi). */
  aktlar: readonly DAkt[];
  /** «YYYY-MM». */
  oy: string;
  raqam: string;
  /** Yoziladigan aktning hujjat jami (ma’lum bo‘lsa). */
  jami: number | null;
  /** Almashtirilayotgan/tahrirlanayotgan qoralama akt (o‘zi takror hisoblanmaydi). */
  ozAktId: number | null;
  /** Shu manba fayl+varaq avval yozilgan aktlar (id). */
  manbaAktIdlar: readonly number[];
  /** (iv) natijasi: `pereraschetBelgisi`. */
  pereraschet?: boolean;
};

export function dublikatTekshiruv(k: DublikatKirish): Masala[] {
  const out: Masala[] = [];
  const faolAktlar = k.aktlar.filter((a) => faol(a) && a.id !== k.ozAktId);
  const byId = new Map(k.aktlar.map((a) => [a.id, a]));
  // (i) manba fayl+varaq allaqachon boshqa aktga yozilgan — BLOK.
  const manba = [...new Set(k.manbaAktIdlar)].map((id) => byId.get(id)).filter((a): a is DAkt => !!a && faol(a) && a.id !== k.ozAktId);
  if (manba.length) out.push({ daraja: 'blok', kod: 'manba', aktIdlar: manba.map((a) => a.id),
    matn: t('Bu fayl varag‘i allaqachon F2 ga yozilgan: {akt}. Ikkinchi marta yozilmaydi — mavjud F2 ni yangilang.', { akt: manba.map(yorliq).join('; ') }) });
  const raqamK = raqamKaliti(k.raqam);
  if (raqamK) {
    // (ii) shu obyekt + raqam (oy bir xil) — BLOK; boshqa oyda shu raqam — baza ham rad etadi, BLOK.
    const bir = faolAktlar.filter((a) => raqamKaliti(a.raqam) === raqamK);
    const birOy = bir.filter((a) => oyOnly(a.oy) === k.oy);
    if (birOy.length) out.push({ daraja: 'blok', kod: 'oy_raqam', aktIdlar: birOy.map((a) => a.id),
      matn: t('Shu obyekt, oy va raqam uchun F2 bor: {akt}. Boshqa F2 bo‘lsa — boshqa raqam kiriting.', { akt: birOy.map(yorliq).join('; ') }) });
    const boshqaOy = bir.filter((a) => oyOnly(a.oy) !== k.oy);
    if (boshqaOy.length) out.push({ daraja: 'blok', kod: 'raqam', aktIdlar: boshqaOy.map((a) => a.id),
      matn: t('Shu obyektda №{raqam} raqamli F2 allaqachon bor: {akt}. Bir raqam ikki marta berilmaydi — yangi raqam kiriting.', { raqam: k.raqam.trim(), akt: boshqaOy.map(yorliq).join('; ') }) });
  } else {
    // (ii-b) raqamsiz: baza kaliti (obyekt+tur+oy+coalesce(raqam,'')) shu oyda ikkinchi raqamsiz faol F2 ni rad etadi (23505) — oldindan BLOK.
    const raqamsiz = faolAktlar.filter((a) => !raqamKaliti(a.raqam) && oyOnly(a.oy) === k.oy);
    if (raqamsiz.length) out.push({ daraja: 'blok', kod: 'oy_raqam', aktIdlar: raqamsiz.map((a) => a.id),
      matn: t('Shu oyda raqamsiz F2 allaqachon bor: {akt}. Ikkinchi raqamsiz F2 yozilmaydi — F2 raqamini kiriting.', { akt: raqamsiz.map(yorliq).join('; ') }) });
  }
  // (iii) shu obyektda summasi ±0,5% teng boshqa F2 — OGOHLANTIRISH.
  const yaqin = faolAktlar.filter((a) => summaYaqin(a.hujjat_jami, k.jami) && a.manba !== 'tuzatish');
  if (yaqin.length) out.push({ daraja: 'ogoh', kod: 'summa', aktIdlar: yaqin.map((a) => a.id),
    matn: t('Shu obyektda summasi deyarli bir xil (±0,5%) F2 bor: {akt}. Bu bir F2 ikki marta kiritilishi bo‘lishi mumkin — tekshiring.', { akt: yaqin.map(yorliq).join('; ') }) });
  // (iv) ekspertizagacha smeta qatorlari + yangi smeta bo‘limlari — OGOHLANTIRISH.
  if (k.pereraschet) out.push({ daraja: 'ogoh', kod: 'pereraschet', aktIdlar: [],
    matn: t('Akt qatorlari «(ekspertizagacha)» smeta bo‘limiga bog‘langan, obyektda esa yangi smeta bo‘limlari ham bor — pereraschet bo‘lishi mumkin: shu hajm yangi smeta bo‘yicha ham hisoblangan bo‘lsa ikki marta sanaladi.') });
  return out;
}

export const bloklarmi = (m: readonly Masala[]) => m.some((x) => x.daraja === 'blok');

/** Bo‘lim nomi «ekspertizagacha» (eski smeta) belgisiga egami. */
export const ESKI_SMETA = /ekspertiza\s*(gacha|dan\s*oldin)|до\s+экспертиз/i;

type SQ = { id: number; ota_id: number | null; tur?: string | null; nom?: string | null };

/**
 * (iv): akt qatorlaridan kamida biri «(ekspertizagacha)» belgili bo‘lim (yoki uning ostidagi qator) ga tegishli VA smetada
 * shu belgisiz yuqori darajali bo‘lim (yangi smeta) ham bor.
 */
export function pereraschetBelgisi(smeta: readonly SQ[], aktQatorIdlar: readonly number[]): boolean {
  if (!smeta.length || !aktQatorIdlar.length) return false;
  const byId = new Map(smeta.map((q) => [q.id, q]));
  const eskiMi = new Map<number, boolean>();
  const eski = (id: number, qadam = 0): boolean => {
    const c = eskiMi.get(id);
    if (c != null) return c;
    const q = byId.get(id);
    let r = false;
    if (q && qadam < 64) r = ESKI_SMETA.test(String(q.nom ?? '')) || (q.ota_id != null && eski(q.ota_id, qadam + 1));
    eskiMi.set(id, r);
    return r;
  };
  if (!aktQatorIdlar.some((id) => eski(id))) return false;
  // Yangi bo‘lim: ildiz darajadagi bo‘lim, o‘zi ham, ostidagi qator ham eski belgisiz (ostida eski bo‘lmagan).
  const eskiOstida = new Set<number>();
  for (const q of smeta) if (eski(q.id)) { let p: number | null = q.id; let n = 0; while (p != null && n++ < 64) { eskiOstida.add(p); p = byId.get(p)?.ota_id ?? null; } }
  return smeta.some((q) => q.ota_id == null && (q.tur == null || q.tur === 'rz') && !eskiOstida.has(q.id));
}