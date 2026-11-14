/**
 * Telefon qobig'i: pastki tab-panel tarkibi (sof funksiya, rolga mos).
 *
 * Tablar: Bosh sahifa · Obyektlar · rolning asosiy ishi · Jarvis (AI) · Menyu (to'liq menyu — drawer).
 * Faqat foydalanuvchiga ko'rinadigan (rol/ruxsat/modul filtridan o'tgan) sahifalar tabga chiqadi — filtr yagona manba:
 * AdminShell menyudagi ko'ringan yo'llarni beradi (lib/nav/navFiltr), bu yerda ruxsat mantiqi takrorlanmaydi.
 * Pul hisobi YO'Q: faqat navigatsiya.
 */
export type MobilTabIkonka = 'Home' | 'Building2' | 'HardHat' | 'FileText' | 'ClipboardCheck' | 'Calculator' | 'Users' | 'ShieldCheck' | 'Truck' | 'Bot' | 'Menu';

export type MobilTab =
  | { id: string; tur: 'yol'; yol: string; nom: string; ikonka: MobilTabIkonka }
  | { id: 'jarvis'; tur: 'jarvis'; nom: string; ikonka: 'Bot' }
  | { id: 'menyu'; tur: 'menyu'; nom: string; ikonka: 'Menu' };

type Nomzod = { yol: string; nom: string; ikonka: MobilTabIkonka };

const FAKT: Nomzod = { yol: '/admin/fakt', nom: 'Fakt', ikonka: 'HardHat' };
const HUJJAT: Nomzod = { yol: '/admin/documents', nom: 'Hujjatlar', ikonka: 'FileText' };
const TASDIQ: Nomzod = { yol: '/admin/hujjat-aylanish', nom: 'Tasdiqlar', ikonka: 'ClipboardCheck' };
const OBYEKT: Nomzod = { yol: '/admin/obyektlar', nom: 'Obyektlar', ikonka: 'Building2' };

/** Rol → [2-tab (obyekt/holat) nomzodlari, 3-tab (asosiy ish) nomzodlari]; birinchi ko'rinadigani olinadi. */
const ROL_NOMZOD: Readonly<Record<string, readonly [readonly Nomzod[], readonly Nomzod[]]>> = {
  pto: [[OBYEKT], [FAKT, HUJJAT]],
  prorab: [[OBYEKT], [FAKT, HUJJAT]],
  usta: [[{ yol: '/admin/bugun', nom: 'Bugun', ikonka: 'ClipboardCheck' }, OBYEKT], [FAKT]],
  brigadir: [[{ yol: '/admin/bugun', nom: 'Bugun', ikonka: 'ClipboardCheck' }, OBYEKT], [FAKT]],
  bugalter: [[OBYEKT], [{ yol: '/admin/buxgalteriya', nom: 'Buxgalteriya', ikonka: 'Calculator' }, HUJJAT]],
  kadr: [[OBYEKT], [{ yol: '/admin/hr', nom: 'Kadrlar', ikonka: 'Users' }, HUJJAT]],
  inspektor: [[OBYEKT], [{ yol: '/admin/nazorat', nom: 'Nazorat', ikonka: 'ShieldCheck' }, TASDIQ]],
  boss: [[OBYEKT], [TASDIQ, HUJJAT]],
  rahbar: [[OBYEKT], [TASDIQ, HUJJAT]],
  admin: [[OBYEKT], [TASDIQ, HUJJAT]],
  superadmin: [[OBYEKT], [TASDIQ, HUJJAT]],
  buyurtmachi: [[{ yol: '/admin/zakazchik', nom: 'Kabinet', ikonka: 'Building2' }], [TASDIQ, HUJJAT]],
  omborchi: [[{ yol: '/admin/logistika', nom: 'Ombor', ikonka: 'Truck' }], [HUJJAT]],
  taminotchi: [[{ yol: '/admin/logistika', nom: 'Taminot', ikonka: 'Truck' }], [HUJJAT]],
};
const UMUMIY: readonly [readonly Nomzod[], readonly Nomzod[]] = [[OBYEKT], [FAKT, HUJJAT]];

/**
 * @param rol        joriy kompaniyadagi effektiv rol ('' — noma'lum)
 * @param korinadi   menyuda ko'rinadigan yo'llar (rol/ruxsat/modul filtridan o'tgan)
 */
export function mobilTablar(rol: string, korinadi: ReadonlySet<string>): MobilTab[] {
  const [obyekt, ish] = ROL_NOMZOD[rol] ?? UMUMIY;
  const ko = (n: readonly Nomzod[], ishlatilgan: Set<string>) => n.find((x) => korinadi.has(x.yol) && !ishlatilgan.has(x.yol));
  const olingan = new Set<string>(['/admin']);
  const tablar: MobilTab[] = [{ id: 'bosh', tur: 'yol', yol: '/admin', nom: 'Bosh sahifa', ikonka: 'Home' }];
  for (const guruh of [obyekt, ish]) {
    const x = ko(guruh, olingan);
    if (x) { olingan.add(x.yol); tablar.push({ id: x.yol, tur: 'yol', yol: x.yol, nom: x.nom, ikonka: x.ikonka }); }
  }
  tablar.push({ id: 'jarvis', tur: 'jarvis', nom: 'Jarvis', ikonka: 'Bot' }, { id: 'menyu', tur: 'menyu', nom: 'Menyu', ikonka: 'Menu' });
  return tablar;
}

/** Tab faolmi: «Bosh sahifa» faqat /admin, /admin/bugun, /admin/dashboard, /admin/pult da; qolganlari prefiks bo'yicha. */
export function mobilTabFaol(tab: MobilTab, pathname: string): boolean {
  if (tab.tur !== 'yol') return false;
  if (tab.yol === '/admin') return ['/admin', '/admin/bugun', '/admin/dashboard', '/admin/pult', '/admin/ish-joylarim'].includes(pathname.replace(/\/$/, ''));
  return pathname === tab.yol || pathname.startsWith(tab.yol + '/') || (tab.yol === '/admin/obyektlar' && pathname.startsWith('/admin/holat/'));
}