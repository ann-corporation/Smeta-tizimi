/**
 * disk-hujjat.ts - tizim hujjatining Diskdagi shaxsi: barqaror KALIT (bir hujjat = bir kalit, qayta yasalsa yangi VERSIYA, yangi fayl emas),
 * MANBA (tur + id) va aniq NOM («F-2 №5 — Fast Food 1-qavat — 2026-11»).
 *
 * KALIT FORMATI - yagona ta'rif (SQL: supabase/migrations/20270113200000_t2_disk_daraxt_a1_v1.sql `_t2_disk_kalit_v1` va hamrohlari;
 * ikkalasi disk-kalit-vektor.json dagi bir xil vektorlar bilan tekshiriladi - disk-hujjat.test.ts):
 *   F-2                    f2:<akt_id>
 *   F-3                    f3:<forma3_id>
 *   oylik/obyekt hujjati   <tur>:<obyekt_id>:<YYYY-MM | ->      (nakopitelniy, m29, slichitelniy, ostatka, aosr)
 *   VAQTINCHALIK           tmp:f2:<obyekt_id>:<raqam | ->:<YYYY-MM | ->  /  tmp:f3:<shartnoma_id | 0>:<YYYY-MM | ->
 * Vaqtinchalik kalitli fayl (backfill akt/forma3 ni aniqlay olmagan) haqiqiy kalit kelganda o'sha faylga ULANADI (t2_disk_tizim_yoz_v1).
 */
export type DiskManba = {
  /** Manba turi (t2_hm_fayl.manba_turi): f2 | forma3 | nakopitelniy | m29 | slichitelniy | ostatka ... */
  turi: string;
  /** Manba yozuvi id si (F-2 uchun akt_id; forma3 uchun forma3_id; oylik hujjatda obyekt_id). */
  id: number | null;
  /** Barqaror hujjat kaliti (t2_hm_fayl.hujjat_kalit). */
  kalit: string;
  /** Ko'rinadigan nom. */
  nom: string;
  shartnomaId?: number | null;
};

export const kalitF2 = (aktId: number): string => `f2:${aktId}`;
export const kalitF3 = (forma3Id: number): string => `f3:${forma3Id}`;
export const kalitOylik = (tur: string, obyektId: number, oy: string | null): string => `${tur}:${obyektId}:${oy ?? '-'}`;
export const kalitVaqtinchaF2 = (obyektId: number | null, raqam: string | null, oy: string | null): string => `tmp:f2:${obyektId ?? 0}:${raqam || '-'}:${oy ?? '-'}`;
export const kalitVaqtinchaF3 = (shartnomaId: number | null, oy: string | null): string => `tmp:f3:${shartnomaId ?? 0}:${oy ?? '-'}`;
/** Fayl nomidan F-2 akt raqami: `..._№36_2026-05.xlsx` -> '36' (SQL `_t2_disk_raqam_v1` bilan bir xil). */
export const aktRaqami = (faylNomi: string): string | null => /№([^_]+)_\d{4}-\d{2}\.[A-Za-z0-9]+$/.exec(faylNomi)?.[1] ?? null;

const AYIRGICH = ' — ';
const oyMatni = (s: string | null | undefined) => (s && /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : null);
const qism = (...q: Array<string | null | undefined>) => q.map((x) => (x ?? '').toString().trim()).filter(Boolean).join(AYIRGICH);

export function f2Manba(p: { aktId: number; raqam: string | number | null; obyekt: string | null; oy: string | null }): DiskManba {
  return { turi: 'f2', id: p.aktId, kalit: kalitF2(p.aktId), nom: qism(`F-2 №${p.raqam ?? p.aktId}`, p.obyekt, oyMatni(p.oy)) };
}

export function forma3Manba(p: { forma3Id: number; shartnomaId: number | null; raqam: string | number | null; shartnomaRaqam?: string | null; davr: string | null }): DiskManba {
  return {
    turi: 'forma3', id: p.forma3Id, kalit: kalitF3(p.forma3Id), shartnomaId: p.shartnomaId,
    nom: qism(`F-3 №${p.raqam ?? p.forma3Id}`, p.shartnomaRaqam ? `shartnoma №${p.shartnomaRaqam}` : null, oyMatni(p.davr)),
  };
}

const OYLIK_NOM: Record<string, string> = { nakopitelniy: 'Nakopitelniy', m29: 'M-29', slichitelniy: 'Slichitelniy', ostatka: 'Ostatka' };

export function obyektHujjatManba(p: { tur: 'nakopitelniy' | 'm29' | 'slichitelniy' | 'ostatka'; obyektId: number; obyekt: string | null; oy: string | null }): DiskManba {
  const oy = oyMatni(p.oy);
  return { turi: p.tur, id: p.obyektId, kalit: kalitOylik(p.tur, p.obyektId, oy), nom: qism(OYLIK_NOM[p.tur], p.obyekt, oy) };
}

/** Server hujjat turi -> registry document_type (mavjud arxiv turlari bilan bir xil). */
export const DISK_HUJJAT_TURI: Readonly<Record<string, string>> = { f2: 'f2_hujjat', forma3: 'f3', nakopitelniy: 'nakopitelniy', m29: 'm29', slichitelniy: 'slichitelniy', ostatka: 'ostatka' };
