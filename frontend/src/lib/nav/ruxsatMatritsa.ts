/**
 * ROL x SAHIFA MATRITSASI (ekotizim V2, 2-qadam) — yagona reestrdan HOSILA, faqat o'qish uchun (Kompaniya -> Ruxsatlar jadvali).
 * Ruxsat xulqi o'zgarmaydi: bu navFiltr.sahifaKorinadi ning (menyu ko'rinishi) rol bo'yicha jadvali. Egasi «kim nima ko'radi»ni
 * shu yerda ko'radi; ruxsat o'zgarsa jadval o'zgaradi (reestr.ruxsat.test.ts snapshot).
 */
import { MEMBERSHIP_ROLES, ROLE_PERMISSIONS } from '../company-authorization/effective-authorization';
import { ISH_JOYI_META, type IshJoyi } from '../reestr/ishJoyi';
import { SAHIFALAR } from '../reestr/sahifa';
import { sahifaKorinadi } from './navFiltr';

export type RuxsatQator = {
  kalit: string; yol: string; nom: string; ishJoyi: IshJoyi; ishJoyiNom: string; ruxsat: readonly string[];
  /** rol -> menyuda ko'rinadimi (ruxsat + rol yopiq + qatlam qoidalari bilan). */
  korinadi: Readonly<Record<string, boolean>>;
};

/** Platforma superadmini ham alohida ustun (kompaniya roli emas). */
export const SUPERADMIN_USTUN = 'superadmin';

export function ruxsatMatritsa(): { rollar: string[]; qatorlar: RuxsatQator[] } {
  const rollar = (MEMBERSHIP_ROLES as readonly string[]).filter((r) => r !== SUPERADMIN_USTUN);
  const qatorlar = SAHIFALAR.slice().sort((a, b) => ISH_JOYI_META[a.ishJoyi].tartib - ISH_JOYI_META[b.ishJoyi].tartib || a.tartib - b.tartib).map((s): RuxsatQator => {
    const guruh = { qatlam: s.ishJoyi === 'platforma' ? 'platforma' as const : 'ish' as const };
    const korinadi: Record<string, boolean> = {};
    for (const rol of rollar) korinadi[rol] = sahifaKorinadi(guruh, s.yol, { superadmin: false, rol, permissions: ROLE_PERMISSIONS[rol as keyof typeof ROLE_PERMISSIONS] ?? [] });
    korinadi[SUPERADMIN_USTUN] = sahifaKorinadi(guruh, s.yol, { superadmin: true, rol: '', permissions: [], tizimXaritasi: true });
    return { kalit: s.kalit, yol: s.yol, nom: s.nom, ishJoyi: s.ishJoyi, ishJoyiNom: ISH_JOYI_META[s.ishJoyi].nom, ruxsat: s.ruxsat, korinadi };
  });
  return { rollar: [...rollar, SUPERADMIN_USTUN], qatorlar };
}