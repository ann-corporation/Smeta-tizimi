/**
 * foto-dalil.ts — FOTO-DALIL sof yordamchilari (React/DOM'siz — test qilinadi).
 * Fayl baytlari kanonik yo'ldan (t2_document_registry -> R2) o'tadi; bu yerda faqat hisob-kitob:
 * o'lcham (<= 1600 px), sana/razdel bo'yicha guruhlash, davr filtri, foto-hisobot qatorlari.
 */
export const FOTO_MAX_TOMON = 1600;
export const FOTO_DOCUMENT_TURI = 'foto_dalil';

export type FotoManbaTuri = 'qator' | 'fakt' | 'aosr' | 'predpisaniya' | 'umumiy' | (string & {});

export type FotoElement = {
  id: number; document_id: number; manba_turi: FotoManbaTuri; manba_id: number | null;
  razdel_id: number | null; razdel_nom: string | null; sana: string; lat: number | null; lng: number | null;
  izoh: string | null; ai_izoh: string | null; ai_taklif: FotoTaklif | null; ai_tasdiq: boolean;
  actor_id: number; yaratildi: string; original_filename: string | null; size_bytes: number | null; mime_type: string | null;
  manba_nom: string | null;
};
export type FotoTaklif = { manba_turi: string; manba_id: number; nom: string; ishonch: number };

/** Eng uzun tomoni maxTomon dan oshmasin (kattalashtirilmaydi). */
export function olchamHisobla(w: number, h: number, maxTomon = FOTO_MAX_TOMON): { w: number; h: number; ozgardi: boolean } {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0, ozgardi: false };
  const k = Math.max(w, h) / maxTomon;
  if (k <= 1) return { w: Math.round(w), h: Math.round(h), ozgardi: false };
  return { w: Math.max(1, Math.round(w / k)), h: Math.max(1, Math.round(h / k)), ozgardi: true };
}

const p2 = (n: number) => String(n).padStart(2, '0');
export const sanaMatni = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
/** Fayl sanasi (lastModified, ms) -> YYYY-MM-DD; noto'g'ri bo'lsa bugun. */
export function faylSanasi(lastModified: number | null | undefined, hozir = new Date()): string {
  if (!lastModified || !Number.isFinite(lastModified) || lastModified <= 0) return sanaMatni(hozir);
  const d = new Date(lastModified);
  return d.getTime() > hozir.getTime() + 864e5 ? sanaMatni(hozir) : sanaMatni(d);
}

export const fotoUrl = (documentId: number) => '/api/hujjat-ol?id=' + Number(documentId);

export type FotoGuruh = { kalit: string; sarlavha: string; fotolar: FotoElement[] };

/** Lentani guruhlash: sana (yangisi tepada) yoki razdel (razdelsiz oxirida). */
export function fotoGuruhla(fotolar: readonly FotoElement[], rejim: 'sana' | 'razdel'): FotoGuruh[] {
  const m = new Map<string, FotoGuruh>();
  for (const f of fotolar) {
    const kalit = rejim === 'sana' ? f.sana : (f.razdel_id != null ? 'r' + f.razdel_id : '_yoq');
    const sar = rejim === 'sana' ? f.sana : (f.razdel_nom || 'Razdelsiz');
    const g = m.get(kalit) ?? { kalit, sarlavha: sar, fotolar: [] };
    g.fotolar.push(f); m.set(kalit, g);
  }
  const l = [...m.values()];
  if (rejim === 'sana') l.sort((a, b) => b.kalit.localeCompare(a.kalit));
  else l.sort((a, b) => (a.kalit === '_yoq' ? 1 : b.kalit === '_yoq' ? -1 : a.sarlavha.localeCompare(b.sarlavha, 'ru')));
  return l;
}

export const MANBA_NOMI: Record<string, string> = { qator: 'Smeta qatori', fakt: 'Fakt yozuvi', aosr: 'АОСР', predpisaniya: 'Predpisaniya', murojaat: 'Murojaat', umumiy: 'Umumiy' };
export const manbaNomi = (t: string) => MANBA_NOMI[t] ?? t;

/** Foto sarlavhasi: foydalanuvchi izohi, bo'lmasa tasdiqlangan AI izohi. AI izohi tasdiqsiz «taklif» belgisi bilan alohida ko'rsatiladi. */
export const fotoIzohi = (f: Pick<FotoElement, 'izoh' | 'ai_izoh'>): string => f.izoh || f.ai_izoh || '';

export type HisobotQator = { sana: string; razdel: string; manba: string; izoh: string; fotoId: number; documentId: number };
export function hisobotQatorlari(fotolar: readonly FotoElement[], dan: string | null, gacha: string | null): HisobotQator[] {
  return fotolar
    .filter((f) => (!dan || f.sana >= dan) && (!gacha || f.sana <= gacha))
    .slice().sort((a, b) => a.sana.localeCompare(b.sana) || (a.razdel_nom ?? '').localeCompare(b.razdel_nom ?? '', 'ru') || a.id - b.id)
    .map((f) => ({ sana: f.sana, razdel: f.razdel_nom || '—', manba: f.manba_id != null ? `${manbaNomi(f.manba_turi)}${f.manba_nom ? ': ' + f.manba_nom : ''}` : manbaNomi(f.manba_turi),
      izoh: fotoIzohi(f), fotoId: f.id, documentId: f.document_id }));
}

/** Davr: 'YYYY-MM' -> [dan, gacha] */
export function oyOraligi(oy: string): [string, string] | null {
  const m = /^(\d{4})-(\d{2})$/.exec(oy); if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]); if (mo < 1 || mo > 12) return null;
  const oxirgi = new Date(y, mo, 0).getDate();
  return [`${m[1]}-${m[2]}-01`, `${m[1]}-${m[2]}-${p2(oxirgi)}`];
}
