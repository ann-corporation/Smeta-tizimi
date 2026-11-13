/**
 * INDIVIDUAL YO‘L: foydalanuvchiga ko‘rinadigan darslar = rol + capability + (ixtiyoriy) tomon + sahifa ruxsati.
 * Alohida ruxsat jadvali yo‘q: dars qadamlarining sahifalari foydalanuvchi MENYUSIDA (navFiltr) bo‘lishi shart —
 * shu tufayli PTO ga buxgalteriya darsi, ustaga F2 darsi chiqmaydi va menyu o‘zgarsa yo‘l o‘zi moslashadi.
 */
import { ROLE_PERMISSIONS, type CompanyMembershipRole } from '../company-authorization/effective-authorization';
import { menyuQur, menyuYollari, type NavKontekst } from '../nav/navFiltr';
import { SAHIFALAR } from '../reestr/sahifa';
import { DARSLAR } from './darslar';
import type { Dars } from './model';

export type KursKontekst = {
  /** Kompaniyadagi effektiv rol ('' — noma'lum). */
  rol: string;
  superadmin?: boolean;
  /** Capability lar; berilmasa rolning frontend ko‘zgusi. */
  permissions?: readonly string[] | null;
  /** Kompaniya turi / tomon profili (`t2_yonalish`): 'subpudratchi' va h.k. */
  tomon?: string | null;
  modullar?: NavKontekst['modullar'];
};

export type KursYoli = { darslar: readonly Dars[]; jamiDaqiqa: number };

export const sahifaYoli = (kalit: string): string | undefined => SAHIFALAR.find((s) => s.kalit === kalit)?.yol;

function rolRuxsatlari(k: KursKontekst): readonly string[] {
  if (k.permissions) return k.permissions;
  return ROLE_PERMISSIONS[k.rol as CompanyMembershipRole] ?? [];
}

/** Dars shu foydalanuvchiga mosmi (yo‘lga kiradimi). */
export function darsMos(d: Dars, k: KursKontekst, ochiqYollar: ReadonlySet<string>, perms: ReadonlySet<string>): boolean {
  const rol = k.superadmin ? 'admin' : k.rol;
  if (!rol) return false;
  if (!d.rollar.includes('*') && !d.rollar.includes(rol)) return false;
  if (d.tomonlar && !(k.tomon && d.tomonlar.includes(k.tomon))) return false;
  if (!d.talab.every((c) => perms.has(c))) return false;
  return d.qadamlar.every((s) => { const y = sahifaYoli(s.sahifa); return !!y && ochiqYollar.has(y); });
}

/** Oldingi darslar (yo‘ldagilar) avval turadigan barqaror tartib. */
function tartibla(royxat: readonly Dars[]): Dars[] {
  const id = new Map(royxat.map((d) => [d.id, d]));
  const chiqdi = new Set<string>();
  const out: Dars[] = [];
  const kir = (d: Dars, yol: Set<string>) => {
    if (chiqdi.has(d.id) || yol.has(d.id)) return;
    yol.add(d.id);
    for (const o of d.oldin) { const x = id.get(o); if (x) kir(x, yol); }
    chiqdi.add(d.id); out.push(d);
  };
  for (const d of royxat) kir(d, new Set());
  return out;
}

export function kursYoli(k: KursKontekst, darslar: readonly Dars[] = DARSLAR): KursYoli {
  const rol = k.superadmin ? 'superadmin' : k.rol;
  const perms = rolRuxsatlari(k);
  const ochiq = new Set(menyuYollari(menyuQur({ superadmin: !!k.superadmin, rol, permissions: perms, modullar: k.modullar })));
  const permSet = new Set(perms);
  const mos = darslar.filter((d) => darsMos(d, k, ochiq, k.superadmin ? new Set([...permSet, ...d.talab]) : permSet));
  const t = tartibla(mos);
  return { darslar: t, jamiDaqiqa: t.reduce((s, d) => s + d.daqiqa, 0) };
}

/** Keyingi dars: bajarilmagan va oldingi (yo‘ldagi) darslari bajarilgan birinchisi. */
export function keyingiDars(yol: KursYoli, bajarilgan: ReadonlySet<string>): Dars | null {
  const yoldagi = new Set(yol.darslar.map((d) => d.id));
  return yol.darslar.find((d) => !bajarilgan.has(d.id) && d.oldin.every((o) => !yoldagi.has(o) || bajarilgan.has(o))) ?? null;
}

export function qolganDaqiqa(yol: KursYoli, bajarilgan: ReadonlySet<string>): number {
  return yol.darslar.filter((d) => !bajarilgan.has(d.id)).reduce((s, d) => s + d.daqiqa, 0);
}

/** Shu sahifa (yo‘l) uchun yo‘ldagi darslar — «?» yordami. */
export function sahifaDarslari(yol: KursYoli, pathname: string): Dars[] {
  const p = pathname.replace(/\/+$/, '');
  return yol.darslar.filter((d) => d.qadamlar.some((s) => sahifaYoli(s.sahifa) === p));
}
