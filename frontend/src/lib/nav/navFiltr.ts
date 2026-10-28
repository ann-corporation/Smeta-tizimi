/**
 * Menyu filtri — sidebar, sahifa tablari (BolimTablari) va Ctrl+K uchun BITTA sof funksiya (AdminShell chaqiradi).
 * Manba — yagona navigatsiya reestri (navReestr.ts). Bu ko'rinish, xavfsizlik EMAS: sahifani server tekshiradi.
 *
 * Tartib:
 *   1) modul o'chirilgan → yo'q (lib/modullar);
 *   2) tizimga oid sahifa («Platforma» qatlami yoki `faqatSuperadmin`, navReestr.faqatSuperadminYolmi) → faqat platforma
 *      superadmini (`k.superadmin`, capability emas). Marshrut qo'riqchisi (RuxsatGuard) AYNAN shu funksiyani o'qiydi;
 *   3) superadmin → qolgan hammasi;
 *   4) rolga yopiq capability (buxgalter F2 yozmaydi — menyuRolYopiq) → yo'q;
 *   5) reestr ruxsati (menyuRuxsati; reestrda yo'q → yo'q) joriy kompaniya capability lariga mosmi.
 * Kompaniya capability lari kelmagan (eski DB javobi) bo'lsa — rolning frontend ko'zgusi (ROLE_PERMISSIONS).
 */
import type { Modul } from '../../api/t2-modul';
import { ROLE_PERMISSIONS, type CompanyMembershipRole } from '../company-authorization/effective-authorization';
import { menyuRuxsati } from '../company-authorization/route-permission';
import { menyuModulYoqilgan } from '../modullar';
import { menyuRolYopiq } from './menyuRolYopiq';
import { NAV_GURUHLAR, faqatSuperadminYolmi, ruxsatMos, type NavGuruh, type NavIkonka, type NavQatlam } from './navReestr';

export type NavKontekst = {
  superadmin: boolean;
  /** Joriy kompaniyadagi effektiv rol ('' — kompaniya tanlanmagan). */
  rol: string;
  /** Joriy kompaniyadagi capability lar (t2_men_v1); null/undefined — eski javob. */
  permissions?: readonly string[] | null;
  modullar?: readonly Modul[];
};

export type MenyuTab = { yol: string; nom: string };
/** Sidebar bandi: `yol` — birinchi ko'ringan sahifa; `tablar` — 2+ sahifa bo'lsa (BolimTablari). */
export type MenyuBand = { yol: string; nom: string; ikonka: NavIkonka; tablar?: MenyuTab[] };
export type MenyuGuruh = { id: string; nom: string; ikonka: NavIkonka; qatlam: NavQatlam; bandlar: MenyuBand[] };

function ruxsatlar(k: NavKontekst): readonly string[] {
  if (k.permissions) return k.permissions;
  return ROLE_PERMISSIONS[k.rol as CompanyMembershipRole] ?? [];
}

/** Bitta sahifa (yo'l) shu kontekstda menyuda ko'rinadimi. */
export function sahifaKorinadi(guruh: Pick<NavGuruh, 'qatlam'>, yol: string, k: NavKontekst): boolean {
  if (!menyuModulYoqilgan(yol, k.modullar)) return false;
  if (guruh.qatlam === 'platforma' || faqatSuperadminYolmi(yol)) return k.superadmin;
  if (k.superadmin) return true;
  if (menyuRolYopiq(k.rol, yol)) return false;
  const r = menyuRuxsati(yol);
  return r != null && ruxsatMos(r, ruxsatlar(k));
}

/** Kontekst bo'yicha filtrlangan menyu (bo'sh band va guruhlar tushib qoladi). */
export function menyuQur(k: NavKontekst, guruhlar: readonly NavGuruh[] = NAV_GURUHLAR): MenyuGuruh[] {
  return guruhlar.map((g) => ({
    id: g.id, nom: g.nom, ikonka: g.ikonka, qatlam: g.qatlam,
    bandlar: g.bandlar.flatMap((b): MenyuBand[] => {
      const sahifalar = b.sahifalar.filter((s) => sahifaKorinadi(g, s.yol, k));
      if (!sahifalar.length) return [];
      const band: MenyuBand = { yol: sahifalar[0].yol, nom: b.sahifalar.length > 1 ? b.nom : sahifalar[0].nom, ikonka: b.ikonka };
      /* Tabli band: tablar faqat ko'ringan sahifalardan; bittasi qolsa ham tab-guruh saqlanadi (BolimTablari 2+ da chizadi). */
      if (b.sahifalar.length > 1) band.tablar = sahifalar.map((s) => ({ yol: s.yol, nom: s.nom }));
      return [band];
    }),
  })).filter((g) => g.bandlar.length > 0);
}

/** Test/hisobot uchun: menyudagi barcha ko'ringan yo'llar (tablar bilan). */
export function menyuYollari(menyu: readonly MenyuGuruh[]): string[] {
  return menyu.flatMap((g) => g.bandlar.flatMap((b) => (b.tablar ? b.tablar.map((t) => t.yol) : [b.yol])));
}
