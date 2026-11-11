import type { PermissionCode } from './effective-authorization';
import { navSahifa } from '../nav/navReestr';

/**
 * SAHIFA qo'riqchisi (RuxsatGuard) va bosh sahifa tanlovi uchun — o'zgarmagan. Noma'lum yo'l `document.read`:
 * sahifa himoyasining yakuniy qarori serverda (t2_effective_authorization_v1), bu funksiya faqat oldindan tekshiruv.
 * MENYU uchun bu funksiya ishlatilmaydi — `menyuRuxsati` ga qarang.
 */
export function routePermission(path:string):PermissionCode {
  const p=path.replace(/^\/admin\//,'').split('/')[0];
  if(p==='boshqaruv') return 'control.global.read';
  if(p==='system-control') return 'control.company.read';
  if(p==='f2') return 'f2.import';
  if(p==='f2-tayyorlash') return 'f2.prepare';
  if(['f2-tarix','f2-reestr','nakopitelniy'].includes(p)) return 'f2.read';
  if(['holat','smeta-studio','obyektlar','narx-tekshiruv'].includes(p)) return 'smeta.read';
  if(p==='fakt'||p==='foto') return 'fakt.read';
  if(['narxlar','narx-dalil','narx-manbalari','narx-katalog','smeta-narxlash','nakrutka'].includes(p)) return 'narx.read';
  if(['dashboard','moliya'].includes(p)) return 'financial.read';
  // «Ish joylarim» — har a'zoning o'z ish joylari markazi (ma'lumot faqat o'z a'zoliklaridan, bazada).
  if(p==='kompaniya'||p==='tokenlar'||p==='tizim-sozlama'||p==='ish-joylarim'||p==='mutaxassis') return 'company.read';
  if(p==='loyiha'||p==='participants') return 'project.read';
  if(p==='sotuv') return 'sales.read';
  return 'document.read';
}

/**
 * MENYU ruxsati (sidebar, tablar, Ctrl+K) — yagona navigatsiya reestridan (lib/nav/navReestr.ts).
 * «Standart yopiq» (tizim xaritasi tadqiqoti M2, qoida 5): reestrda yo'q yo'l → `null` → menyuda KO'RINMAYDI.
 * Avval noma'lum yo'l `document.read` ga tushardi va usta/buyurtmachi «AI ishchilar», «Sayt xaritasi», «Korzinka» ni
 * ko'rardi. Qaytgan ro'yxat: [] — hamma; kamida bittasi kerak; 'a+b' — ikkalasi birga (navReestr.ruxsatMos).
 */
export function menyuRuxsati(path: string): readonly string[] | null {
  return navSahifa(path)?.ruxsat ?? null;
}
