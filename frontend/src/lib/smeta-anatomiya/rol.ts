/**
 * SMETA YADROSI — yagona varaq roli (nom + ichki tuzilma). Oferta, smeta yuklash, manba tahlili, studiya — HAMMASI shu
 * funksiyani chaqiradi (egasi 2026-10-09: "bitta model qil, hamma joyda o'sha chaqirilsin, o'qitilsa hamma joyga birday
 * ta'sir qilsin"). Yangi nom/shakl qoidasi faqat shu yerda (nom-rol.ts / varaq.ts) qo'shiladi.
 */
import { varaqRoli } from './yuklash';
import type { Katak } from './turlar';
import { varaqNomiRoli, type VaraqRol, type VaraqRolXulosa } from './nom-rol';

export { varaqNomiRoli, nomTokenlari, type VaraqRol, type VaraqRolXulosa } from './nom-rol';

/** Nom + ichki tuzilma. `rows` — varaq qatorlari (xom). */
export function varaqRoliniAniqla(nom: string, rows: readonly (readonly Katak[])[]): VaraqRolXulosa {
  const n = varaqNomiRoli(nom);
  let tuzilma: VaraqRol = 'nomalum';
  const tDalil: string[] = [];
  try {
    const x = varaqRoli(nom, rows);
    tDalil.push(...x.dalil.slice(0, 2));
    const a = x.anatomiya.rol;
    tuzilma = x.rol === 'lrv' ? 'lrv' : x.rol === 'res' ? 'res' : a === 'svod' ? 'svod' : a === 'transport' ? 'transport' : 'nomalum';
  } catch { /* tuzilma o'qilmadi — faqat nom */ }
  if (n) {
    if (tuzilma === n.rol) return { rol: n.rol, ishonch: 'yuqori', manba: 'nom+tuzilma', dalil: [`varaq nomi «${n.token}» va ichki tuzilma bir xil: ${n.rol.toUpperCase()}`, ...tDalil] };
    if (tuzilma === 'nomalum') return { rol: n.rol, ishonch: 'yuqori', manba: 'nom', dalil: [`varaq nomi «${n.token}» → ${n.rol.toUpperCase()}`, ...tDalil] };
    return { rol: n.rol, ishonch: 'orta', manba: 'nom', dalil: [`varaq nomi «${n.token}» → ${n.rol.toUpperCase()}, lekin tuzilma ${tuzilma.toUpperCase()} ga o‘xshaydi — tekshiring`, ...tDalil] };
  }
  if (tuzilma !== 'nomalum') return { rol: tuzilma, ishonch: 'orta', manba: 'tuzilma', dalil: [`nomdan aniqlanmadi; ichki tuzilma: ${tuzilma.toUpperCase()}`, ...tDalil] };
  return { rol: 'nomalum', ishonch: 'past', manba: 'yoq', dalil: ['nom ham, tuzilma ham rolni aniqlamadi — qo‘lda tanlang', ...tDalil] };
}
