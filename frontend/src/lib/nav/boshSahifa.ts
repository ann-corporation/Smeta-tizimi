/**
 * Rol → o'z ishchi bosh sahifasi (tizim xaritasi tadqiqoti 03, P3 / M9).
 *
 * YAGONA manba: kirish sahifasi (parol va Google) hamda `/admin` indeksi shu funksiyani chaqiradi.
 * Avval kirish PTO/admin/buxgalter/prorabni `/admin/test/obyektlar` («SINOV» qobig'i) ga, boss/rahbarni
 * `/boss` redirectiga yuborardi, buyurtmachi/pudratchi/usta/omborchi esa hech qayerga yo'naltirilmasdi.
 *
 * Yo'llar — haqiqiy (redirect emas) production sahifalar. Rol bu yerda yo'q bo'lsa yoki uning ruxsatlari
 * bosh sahifani ochmasa — `ZAXIRA_BOSH_SAHIFA` (Ish joylarim: hamma a'zoda `company.read` bor).
 */
import { routePermission } from '../company-authorization/route-permission';

export const ZAXIRA_BOSH_SAHIFA = '/admin/ish-joylarim';

const ROL_BOSH_SAHIFA: Readonly<Record<string, string>> = {
  superadmin: '/admin/obyektlar',
  admin: '/admin/obyektlar',
  pto: '/admin/obyektlar',
  bugalter: '/admin/obyektlar',
  prorab: '/admin/obyektlar',
  boss: '/admin/dashboard',
  rahbar: '/admin/dashboard',
  buyurtmachi: '/admin/zakazchik',
  usta: '/admin/fakt',
  brigadir: '/admin/fakt',
  omborchi: '/admin/logistika',
  taminotchi: '/admin/logistika',
  mexanik: '/admin/erp',
  kadr: '/admin/erp',
  inspektor: '/admin/aosr',
  loyihachi: '/admin/documents',
};

/**
 * @param rol          kompaniyadagi (yoki kirishdagi) rol
 * @param permissions  joriy kompaniyadagi capability ro'yxati; berilsa, bosh sahifa ruxsati tekshiriladi
 */
export function rolBoshSahifasi(rol?: string | null, permissions?: readonly string[] | null): string {
  const yol = (rol && ROL_BOSH_SAHIFA[rol]) || ZAXIRA_BOSH_SAHIFA;
  if (permissions && !permissions.includes(routePermission(yol))) return ZAXIRA_BOSH_SAHIFA;
  return yol;
}
