import { yolNaqshi } from '../../../lib/agent-faoliyat';
import type { KimMalumot } from '../../../lib/yordamchi/kim';

/** KompaniyaKontekst (useMen -> t2_men_v1, sessiya aktori) qiymatidan Jarvis «kim» ma'lumotini quradi. Matndan hech narsa olinmaydi. */
type Kk = {
  joriy?: { id: number; nom: string; rol: string; turi?: string | null; mavqe?: string | null; permissions?: string[] } | null;
  foydalanuvchi?: { ism?: string | null; login?: string | null; email?: string | null } | null;
  superadmin?: boolean;
  kompaniyalar?: readonly unknown[];
};

export function kimMalumoti(kk: Kk, yol: string, obyektNomi: string | null, obyektId: number | null, til: string | null = null): KimMalumot {
  const j = kk.joriy ?? null;
  return {
    ism: kk.foydalanuvchi?.ism ?? null,
    login: kk.foydalanuvchi?.login ?? kk.foydalanuvchi?.email ?? null,
    rol: j?.rol ?? (kk.superadmin ? 'superadmin' : null),
    platformSuperadmin: kk.superadmin === true,
    kompaniya: j ? { id: j.id, nom: j.nom, turi: j.turi ?? null, mavqe: j.mavqe ?? null } : null,
    kompaniyalarSoni: kk.kompaniyalar?.length ?? 0,
    ruxsatlar: j?.permissions ?? [],
    til,
    sahifa: yolNaqshi(yol),
    obyekt: obyektNomi ? { id: obyektId, nom: obyektNomi } : null,
  };
}
