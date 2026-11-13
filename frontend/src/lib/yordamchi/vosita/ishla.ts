/** Vositani bajarish quvuri: ruxsat tekshiruvi -> slotlar (aniqlashtirish holati bilan) -> vosita. Xato har doim tushunarli javobga aylanadi. */
import type { KimMalumot } from '../kim';
import { vositaOl } from './reestr';
import type { Davom, VositaJavob, VositaKont } from './tur';

const BEKOR = /^\s*(yoq|yo'q|yo‘q|bekor|otmena|отмена|нет|не надо|cancel|stop|kerak emas|kerakmas)\s*[.!]?\s*$/i;
export const davomBekorMi = (matn: string) => BEKOR.test(matn);

/** Klient tomonidagi yengil tekshiruv: ruxsatlar ro'yxati bo'lsa va vosita ruxsati unda yo'q bo'lsa — rad. (Asosiy tekshiruv serverda.) */
export function ruxsatBormi(ruxsat: string | null, kim: KimMalumot): boolean {
  if (!ruxsat || kim.platformSuperadmin) return true;
  if (!kim.ruxsatlar.length) return true;
  return kim.ruxsatlar.includes(ruxsat);
}

export async function vositaIshla(id: string, xom: string, c: VositaKont, davom?: Davom | null): Promise<VositaJavob> {
  const v = vositaOl(id);
  if (!v) return { tur: 'javob', xato: true, matn: 'Bu vosita topilmadi.' };
  if (!ruxsatBormi(v.ruxsat, c.kim)) return { tur: 'javob', matn: `Bu amal (**${v.id}**) sizning rolingizda ruxsat etilmagan (kerakli ruxsat: \`${v.ruxsat}\`). Kerak bo‘lsa kompaniya administratoridan so‘rang.` };
  const davomda = !!davom && davom.id === id;
  const asl = davomda ? String(davom!.slotlar.__asl ?? '') || xom : xom;
  const slot = davomda ? { ...davom!.slotlar, __javob: xom, __kutilgan: davom!.kutilgan } : {};
  try {
    const r = await v.ishla(c, slot, asl);
    if (r.tur === 'savol') r.davom.slotlar = { ...r.davom.slotlar, __asl: asl };
    return r;
  } catch (e) { return { tur: 'javob', xato: true, matn: `Amal bajarilmadi: ${e instanceof Error ? e.message : String(e)}` }; }
}