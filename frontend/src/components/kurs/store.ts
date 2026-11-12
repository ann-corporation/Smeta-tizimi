/** Kurs UI holati: faol yo‘l-yo‘riq (modul darajasida, sahifa almashganda saqlanadi) + progress bilan ulanish. Hech qachon ma’lumot yozmaydi. */
import { useMemo, useSyncExternalStore } from 'react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { useSessiya } from '../../api/hooks';
import { foydalanuvchiKaliti } from '../../lib/qollanma/korilgan';
import { darsOl } from '../../lib/kurs/darslar';
import { bajarilganlar, darsBajarildi, joriyOl, joriyniOchir, joriyniSaqla, kuzat } from '../../lib/kurs/progress';
import { yurishYangila, type YurishAmal, type YurishHolat } from '../../lib/kurs/yurish';
import type { KursKontekst } from '../../lib/kurs/yol';

let holat: YurishHolat = null;
let foydId: string | null = null;
const tinglovchi = new Set<() => void>();
const yoq = () => tinglovchi.forEach((f) => f());

export function yurishAmal(foyd: string | null, a: YurishAmal): { tugadi: boolean } {
  const joriyDars = a.tur === 'boshla' ? a.dars : holat?.dars;
  const d = joriyDars ? darsOl(joriyDars) : undefined;
  const r = yurishYangila(holat, a, d?.qadamlar.length ?? 0);
  holat = r.holat;
  foydId = foyd;
  if (foyd && d) {
    if (r.tugadi) darsBajarildi(foyd, d.id);
    else if (r.holat) joriyniSaqla(foyd, r.holat.dars, r.holat.qadam);
    else if (r.chiqdi) { /* chiqish: joyi saqlangan qoladi — keyin davom etish mumkin */ }
  }
  yoq();
  return { tugadi: r.tugadi };
}

/** Yarim qolgan darsni davom ettiradi (progressdan). */
export function yurishDavom(foyd: string | null): boolean {
  if (!foyd) return false;
  const j = joriyOl(foyd);
  if (!j || !darsOl(j.dars)) return false;
  yurishAmal(foyd, { tur: 'boshla', dars: j.dars, qadam: j.qadam });
  return true;
}

export function yurishTozala(foyd: string | null): void { if (foyd) joriyniOchir(foyd); }

export function useYurish(): YurishHolat {
  return useSyncExternalStore((f) => { tinglovchi.add(f); return () => { tinglovchi.delete(f); }; }, () => holat);
}

export function useProgress(foyd: string | null): ReadonlySet<string> {
  const belgi = useSyncExternalStore(kuzat, () => (foyd ? [...bajarilganlar(foyd)].sort().join('|') : ''));
  return useMemo(() => new Set(belgi ? belgi.split('|') : []), [belgi]);
}

/** Joriy foydalanuvchi + kompaniya konteksti (AdminShell dagi navK bilan bir xil manba). */
export function useKursKontekst(): { kontekst: KursKontekst; foyd: string | null } {
  const k = useKompaniya();
  const sess = useSessiya();
  const rol = k.superadmin ? 'superadmin' : (k.joriy?.rol ?? '');
  const foyd = foydalanuvchiKaliti(sess.data?.email);
  const perms = k.joriy?.permissions;
  const superadmin = !!k.superadmin;
  return useMemo(() => ({ kontekst: { rol, superadmin, permissions: perms }, foyd }), [rol, superadmin, perms, foyd]);
}

export const faolYurishFoyd = (): string | null => foydId;
