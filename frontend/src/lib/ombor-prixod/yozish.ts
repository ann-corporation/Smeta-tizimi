/**
 * C11 PR-B — «Приход» qatorlarini markaziy omborga yozish rejasi (sof mantiq, UI'siz).
 *
 * Server shartnomasi (`t2_sklad_markaziy_prixod_import_v1`, migratsiya 20261113810000):
 *  - bitta chaqiriq ≤ 1000 qator, butun bo'lak bitta tranzaksiya (birorta qator xato → hech narsa yozilmaydi);
 *  - bir xil `operation_id` + bir xil yuk → o'sha javob (takroriy yozuv yo'q), boshqa yuk → OPERATION_ID_CONFLICT;
 *  - (sklad, fayl sha256, varaq, qator №) bo'yicha takror qator yozilmaydi.
 * Shuning uchun: xato va takror qatorlar yuborilmaydi, bo'laklar va ularning operation_id si fayl mazmunidan
 * deterministik hisoblanadi — uzilgandan keyin aynan shu reja bilan davom ettiriladi.
 * Narx/summa yuborilmaydi (NULL, 0 emas).
 */
import type { PrixodKitob, PrixodQator } from './turlar';

export const BOLAK_HAJMI = 1000;
export const KIRIM_VARAQ = 'Приход' as const;

/** RPC ga ketadigan bitta qator (narx yo'q). */
export type KirimYukQator = {
  source_row: number; sana: string; nomi: string; birligi: string; obyomi: string;
  postavshik: string | null; manba_turi: string | null; sf_tasdiq: string | null;
};
export type KirimBolak = { tartib: number; operationId: string; qatorlar: KirimYukQator[] };
export type KirimReja = {
  versiya: 1; kompaniyaId: number; skladId: number; sha256: string; faylNomi: string;
  documentId: number | null; bolaklar: KirimBolak[]; bajarilgan: number[]; jamiQator: number;
};

/** Eksponentasiz o'nlik yozuv (server `^[0-9]+(\.[0-9]+)?$` ni talab qiladi). */
export function miqdorMatni(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  let s = String(n);
  if (/e/i.test(s)) s = n.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
  return /^[0-9]+(\.[0-9]+)?$/.test(s) ? s : null;
}

const bosh = (s: string): string | null => { const v = s.trim(); return v ? v : null; };

/** Yozishga tayyor qator → RPC yuki. Xato qator uchun null (u yuborilmaydi). */
export function yukQator(q: PrixodQator): KirimYukQator | null {
  if (q.holat !== 'yangi' || q.xatolar.length || !q.sana || q.miqdor == null) return null;
  const obyomi = miqdorMatni(q.miqdor);
  const nomi = q.nom.trim(); const birligi = q.birlik.trim();
  if (!obyomi || !nomi || !birligi || nomi.length > 500 || birligi.length > 100) return null;
  return { source_row: q.manbaQator, sana: q.sana, nomi, birligi, obyomi,
    postavshik: bosh(q.yetkazuvchi), manba_turi: bosh(q.tur), sf_tasdiq: bosh(q.hujjat) };
}

/** Omborda allaqachon yozilgan manba qatorlari (shu fayl sha256 + «Приход») — «takror» deb belgilanadi. */
export function takrorBelgila(kitob: PrixodKitob, yozilganQatorlar: ReadonlySet<number>): PrixodKitob {
  const qatorlar = kitob.qatorlar.map((q) => (q.holat !== 'xato' && yozilganQatorlar.has(q.manbaQator) ? { ...q, holat: 'takror' as const } : q));
  return { ...kitob, takrorTekshirildi: true, qatorlar,
    jami: { yangi: qatorlar.filter((q) => q.holat === 'yangi').length, takror: qatorlar.filter((q) => q.holat === 'takror').length,
      xato: qatorlar.filter((q) => q.holat === 'xato').length, ogohli: qatorlar.filter((q) => q.ogohlar.length > 0).length } };
}

async function sha256Hex(matn: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(matn));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Bo'lak mazmunidan deterministik UUID (v4 ko'rinishida): bir xil bo'lak → bir xil operation_id. */
export async function bolakOperationId(kompaniyaId: number, skladId: number, sha256: string, qatorlar: readonly KirimYukQator[]): Promise<string> {
  const h = await sha256Hex(JSON.stringify(['c11-kirim-v1', kompaniyaId, skladId, sha256, KIRIM_VARAQ, qatorlar]));
  const v = '89ab'[parseInt(h[16], 16) % 4];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Yangi qatorlardan ≤1000 lik bo'laklar rejasi. */
export async function kirimRejaQur(p: {
  kompaniyaId: number; skladId: number; sha256: string; faylNomi: string; qatorlar: readonly PrixodQator[]; bolakHajmi?: number;
}): Promise<KirimReja> {
  const hajm = Math.min(BOLAK_HAJMI, Math.max(1, p.bolakHajmi ?? BOLAK_HAJMI));
  const yuk = p.qatorlar.map(yukQator).filter((x): x is KirimYukQator => x != null).sort((a, b) => a.source_row - b.source_row);
  const bolaklar: KirimBolak[] = [];
  for (let i = 0; i < yuk.length; i += hajm) {
    const qatorlar = yuk.slice(i, i + hajm);
    bolaklar.push({ tartib: bolaklar.length, operationId: await bolakOperationId(p.kompaniyaId, p.skladId, p.sha256, qatorlar), qatorlar });
  }
  return { versiya: 1, kompaniyaId: p.kompaniyaId, skladId: p.skladId, sha256: p.sha256, faylNomi: p.faylNomi,
    documentId: null, bolaklar, bajarilgan: [], jamiQator: yuk.length };
}

export const yozilganSoni = (r: KirimReja): number =>
  r.bolaklar.filter((b) => r.bajarilgan.includes(b.tartib)).reduce((s, b) => s + b.qatorlar.length, 0);

export type ImportJavob = { ok: boolean; code?: string; error?: string; qator_soni?: number };
export type ImportChaqir = (p: { documentId: number; bolak: KirimBolak }) => Promise<ImportJavob>;
export type YozishNatija =
  | { holat: 'tugadi'; reja: KirimReja; yozildi: number; takrorOtkazildi: number }
  | { holat: 'uzildi'; reja: KirimReja; xato: string; code?: string }
  | { holat: 'toxtatildi'; reja: KirimReja };

/**
 * Rejani bajaradi: bajarilmagan bo'laklarni tartib bilan yuboradi. Har muvaffaqiyatdan keyin `saqla` (localStorage)
 * chaqiriladi — sahifa yopilsa ham shu operation_id lar bilan davom etadi. Bo'lak boshqa yo'l bilan allaqachon yozilgan
 * bo'lsa (SOURCE_ROW_ALREADY_POSTED), `yozilganlarniOl` bilan qolgan qatorlar ajratiladi va yangi deterministik ID bilan
 * bir marta qayta yuboriladi.
 */
export async function kirimRejaBajar(p: {
  reja: KirimReja; chaqir: ImportChaqir;
  yozilganlarniOl?: () => Promise<ReadonlySet<number>>;
  progress?: (yozildi: number, jami: number) => void;
  saqla?: (r: KirimReja) => void;
  toxtat?: () => boolean;
}): Promise<YozishNatija> {
  let reja: KirimReja = { ...p.reja, bajarilgan: [...p.reja.bajarilgan], bolaklar: [...p.reja.bolaklar] };
  if (reja.documentId == null) return { holat: 'uzildi', reja, xato: 'SOURCE_DOCUMENT_REQUIRED', code: 'SOURCE_DOCUMENT_REQUIRED' };
  const documentId = reja.documentId;
  let takror = 0;
  p.progress?.(yozilganSoni(reja), reja.jamiQator);
  for (let i = 0; i < reja.bolaklar.length; i++) {
    let bolak = reja.bolaklar[i];
    if (reja.bajarilgan.includes(bolak.tartib)) continue;
    if (p.toxtat?.()) { p.saqla?.(reja); return { holat: 'toxtatildi', reja }; }
    let j: ImportJavob;
    try { j = await p.chaqir({ documentId, bolak }); }
    catch (e) { p.saqla?.(reja); return { holat: 'uzildi', reja, xato: e instanceof Error ? e.message : 'NETWORK' }; }
    if (!j.ok && j.code === 'SOURCE_ROW_ALREADY_POSTED' && p.yozilganlarniOl) {
      const bor = await p.yozilganlarniOl().catch(() => null);
      if (bor) {
        const qolgan = bolak.qatorlar.filter((q) => !bor.has(q.source_row));
        takror += bolak.qatorlar.length - qolgan.length;
        reja = { ...reja, jamiQator: reja.jamiQator - (bolak.qatorlar.length - qolgan.length) };
        bolak = { ...bolak, qatorlar: qolgan, operationId: await bolakOperationId(reja.kompaniyaId, reja.skladId, reja.sha256, qolgan) };
        reja.bolaklar[i] = bolak;
        if (!qolgan.length) j = { ok: true, qator_soni: 0 };
        else {
          try { j = await p.chaqir({ documentId, bolak }); }
          catch (e) { p.saqla?.(reja); return { holat: 'uzildi', reja, xato: e instanceof Error ? e.message : 'NETWORK' }; }
        }
      }
    }
    if (!j.ok) { p.saqla?.(reja); return { holat: 'uzildi', reja, xato: j.error || j.code || 'IMPORT_FAILED', code: j.code }; }
    reja = { ...reja, bajarilgan: [...reja.bajarilgan, bolak.tartib] };
    p.saqla?.(reja);
    p.progress?.(yozilganSoni(reja), reja.jamiQator);
  }
  return { holat: 'tugadi', reja, yozildi: yozilganSoni(reja), takrorOtkazildi: takror };
}

/** Ekran ruxsatlari server ruxsatlari bilan bir xil: ko'rish — document.read, yozish/storno — document.write. */
export function kirimRuxsat(permissions: readonly string[] | null | undefined): { korish: boolean; yozish: boolean } {
  // Ruxsatlar ro'yxati kelmagan eski sessiya — tugmalar ko'rinadi, qarorni server (gateway + RPC) beradi.
  if (permissions == null) return { korish: true, yozish: true };
  const p = permissions;
  const yozish = p.includes('document.write');
  return { korish: yozish || p.includes('document.read'), yozish };
}

/** Storno faqat 24 soat ichida (server STORNO_WINDOW_EXPIRED bilan ham to'sadi). */
export function stornoMumkin(q: { storno: boolean; yaratildi: string }, hozir = Date.now()): boolean {
  const t = Date.parse(q.yaratildi);
  return !q.storno && Number.isFinite(t) && t <= hozir + 60_000 && hozir - t < 24 * 3600_000;
}

/** Reja saqlash kaliti — bitta kompaniya/ombor/fayl uchun bitta. */
export const rejaKaliti = (kompaniyaId: number, skladId: number, sha256: string) => `c11-kirim-reja:${kompaniyaId}:${skladId}:${sha256}`;

export function rejaOqi(kalit: string): KirimReja | null {
  try {
    const raw = globalThis.localStorage?.getItem(kalit);
    if (!raw) return null;
    const r = JSON.parse(raw) as KirimReja;
    return r && r.versiya === 1 && Array.isArray(r.bolaklar) && Array.isArray(r.bajarilgan) ? r : null;
  } catch { return null; }
}
export function rejaYoz(kalit: string, r: KirimReja | null): void {
  try {
    if (r == null) globalThis.localStorage?.removeItem(kalit);
    else globalThis.localStorage?.setItem(kalit, JSON.stringify(r));
  } catch { /* xotira to'la / yopiq — reja faqat shu sahifada qoladi */ }
}
