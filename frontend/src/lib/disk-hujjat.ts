/**
 * disk-hujjat.ts - tizim yasagan hujjatning Diskdagi shaxsi: barqaror KALIT (bir hujjat = bir kalit, qayta yasalsa yangi VERSIYA, yangi fayl emas),
 * MANBA (tur + id; «Tizimda ochish» uchun) va aniq NOM («F-2 №5 — Fast Food 1-qavat — 2026-11»).
 * Bitta joyda: server (hujjat-yarat avtoarxiv) ham, mijoz arxivlash ham shu funksiyalarni ishlatadi. Migratsiya backfill (20270113200000) kalit
 * shakliga mos: nakopitelniy/m29/slichitelniy/ostatka = `<tur>:<obyekt>:<oy|->`.
 */
export type DiskManba = {
  /** Manba turi (registry.manba_turi): f2 | forma3 | nakopitelniy | m29 | slichitelniy | ostatka ... */
  turi: string;
  /** Manba yozuvi id si (F-2 uchun akt_id; forma3 uchun f3_id). */
  id: number | null;
  /** Barqaror hujjat kaliti (registry.hujjat_kalit). */
  kalit: string;
  /** Ko'rinadigan nom (registry.korinish_nom). */
  nom: string;
  shartnomaId?: number | null;
};

const AYIRGICH = ' — ';
const oyMatni = (s: string | null | undefined) => (s && /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : null);
const qism = (...q: Array<string | null | undefined>) => q.map((x) => (x ?? '').toString().trim()).filter(Boolean).join(AYIRGICH);

export function f2Manba(p: { aktId: number; raqam: string | number | null; obyekt: string | null; oy: string | null }): DiskManba {
  return { turi: 'f2', id: p.aktId, kalit: `f2:${p.aktId}`, nom: qism(`F-2 №${p.raqam ?? p.aktId}`, p.obyekt, oyMatni(p.oy)) };
}

export function forma3Manba(p: { obyektId: number; shartnomaId: number | null; f3Id: number | null; raqam: string | number | null; obyekt: string | null; davr: string | null; shartnomaRaqam?: string | null }): DiskManba {
  return {
    turi: 'forma3', id: p.f3Id ?? null, kalit: `f3:${p.obyektId}:${oyMatni(p.davr) ?? '-'}`, shartnomaId: p.shartnomaId,
    nom: qism(p.raqam ?? p.f3Id ? `Forma № 3 №${p.raqam ?? p.f3Id}` : 'Forma № 3', p.obyekt, oyMatni(p.davr), p.shartnomaRaqam ? `shartnoma №${p.shartnomaRaqam}` : null),
  };
}

const OYLIK_NOM: Record<string, string> = { nakopitelniy: 'Nakopitelniy', m29: 'M-29', slichitelniy: 'Slichitelniy', ostatka: 'Ostatka' };

export function obyektHujjatManba(p: { tur: 'nakopitelniy' | 'm29' | 'slichitelniy' | 'ostatka'; obyektId: number; obyekt: string | null; oy: string | null }): DiskManba {
  const oy = oyMatni(p.oy);
  return { turi: p.tur, id: p.obyektId, kalit: `${p.tur}:${p.obyektId}:${oy ?? '-'}`, nom: qism(OYLIK_NOM[p.tur], p.obyekt, oy) };
}

/** Server hujjat turi -> registry document_type (mavjud arxiv turlari bilan bir xil). */
export const DISK_HUJJAT_TURI: Readonly<Record<string, string>> = { f2: 'f2_hujjat', forma3: 'f3', nakopitelniy: 'nakopitelniy', m29: 'm29', slichitelniy: 'slichitelniy', ostatka: 'ostatka' };
