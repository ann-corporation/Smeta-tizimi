/**
 * SAHIFA REESTRI (ekotizim V2, 1-qadam; docs/architecture/EKOTIZIM_ARXITEKTURA_V2.md §2) — SOF MA'LUMOT (React yo'q).
 *
 * Bitta sahifa = bitta yozuv. Menyu (lib/nav/navReestr.ts NAV_GURUHLAR) shu yerdan HOSILA bo'ladi; keyingi qadamlarda
 * himoya, route, rol boshi, sayt xaritasi, qidiruv ham shundan o'qiydi. 1-qadamda xulq O'ZGARMAYDI (golden test).
 *
 * `navGuruh` / `navBand` / `tartib` — eski menyu tuzilmasini aynan tiklash uchun (7 ish joyiga o'tishda `ishJoyi` asosiy bo'ladi).
 */
import type { RouteScope } from '../../umumiy/kontekst/routeScope';
import type { IlovaKod } from '../ilova/ilovalar';
import type { IshJoyi } from './ishJoyi';

export type NavQatlam = 'ish' | 'kompaniya' | 'shaxsiy' | 'platforma';

/** AdminShell dagi lucide ikonkalar kaliti (reestr toza ma'lumot bo'lib qolishi uchun satr). */
export type NavIkonka =
  | 'Building2' | 'Tags' | 'Calculator' | 'FileOutput' | 'HardHat' | 'ShieldAlert' | 'Settings' | 'FileText'
  | 'Link2' | 'FileStack' | 'Gauge' | 'FlaskConical' | 'LayoutDashboard' | 'BarChart' | 'ClipboardList'
  | 'Briefcase' | 'Box' | 'Users' | 'FolderKanban' | 'Crown' | 'ShieldCheck' | 'Map' | 'Inbox' | 'Truck' | 'User' | 'Trash2';

export type SahifaHolat = 'tayyor' | 'beta' | 'texnik';

export type Sahifa = {
  /** Barqaror kalit (yo'ldan hosila, nuqta bilan): 'f2-tarix'. Yagona. */
  kalit: string;
  yol: string;
  /** Eski/muqobil yo'llar (5-qadam: reestrdan route). */
  eskiYollar?: readonly string[];
  ishJoyi: IshJoyi;
  /** Ish joyi ichidagi tab kaliti (7-qadam). */
  tab?: string;
  /** Global tartib (eski NAV_GURUHLAR yurish tartibi). */
  tartib: number;
  ilova: IlovaKod;
  nom: string;
  /** Universal qidiruv uchun nomlar (uz + ru). */
  sinonimlar: readonly string[];
  /** Menyu ruxsati (navReestr semantikasi: [] hamma; 'a+b' ikkalasi). */
  ruxsat: readonly string[];
  scope?: RouteScope;
  /** Kontekst izohi (kelajak: obyekt/kompaniya tanlash talabi). */
  kontekst?: string;
  /** Modul (lib/modullar.ts) — o'chirilsa menyudan yashirinadi. */
  modul?: string;
  faqatSuperadmin?: true;
  /** Qo'shimcha bo'lim: yon menyuda "Qo'shimcha bo'limlar" ostiga yig'iladi (o'chirilmaydi). */
  qoshimcha?: true;
  holat: SahifaHolat;
  /** Rol bosh sahifasi bo'lishi mumkin (keyingi qadam). */
  bosh?: boolean;
  /** Mindmap/tomonlar/AI niyati — keyingi qadamlar. */
  tomonlar?: readonly string[];
  mindmap?: string;
  aiNiyat?: string;
  /** Eski sidebar tuzilmasi: guruh id va band nomi. */
  navGuruh: string;
  navBand: string;
};

export type NavGuruhMeta = {
  id: string; nom: string; ikonka: NavIkonka; qatlam: NavQatlam;
  bandlar: readonly { nom: string; ikonka: NavIkonka }[];
};

/** Rahbariyat (boss/admin/rahbar) capability'si — navReestr.ts dagi bilan bir xil. */
const RAHBARIYAT = 'control.company.read';
/** Ichki ishchi xodim (pto, prorab, boss/admin). */
const ICHKI_ISH = ['project.write', 'object.write'] as const;

/** Eski menyu guruhlari va bandlari (tartib shu yerdan). */
export const NAV_GURUH_META: readonly NavGuruhMeta[] = [
  { id: 'obyekt', nom: 'Obyektlar', ikonka: 'Building2', qatlam: 'ish', bandlar: [{ nom: 'Rahbar paneli', ikonka: 'BarChart' }, { nom: 'Obyektlar va loyihalar', ikonka: 'FolderKanban' }] },
  { id: 'smeta', nom: 'Smeta', ikonka: 'Calculator', qatlam: 'ish', bandlar: [{ nom: 'Smeta studiyasi', ikonka: 'Calculator' }, { nom: 'Smeta va Fakt / LRV', ikonka: 'FileText' }, { nom: 'Narxlash', ikonka: 'Tags' }] },
  { id: 'fakt', nom: 'Fakt', ikonka: 'HardHat', qatlam: 'ish', bandlar: [{ nom: 'Fakt kiritish', ikonka: 'HardHat' }, { nom: 'Bugun (telefon)', ikonka: 'HardHat' }, { nom: 'M-29 (material sarfi)', ikonka: 'Box' }] },
  { id: 'f2', nom: 'F2 va Nakopitelniy', ikonka: 'FileOutput', qatlam: 'ish', bandlar: [{ nom: 'F2', ikonka: 'FileOutput' }] },
  { id: 'moliya', nom: 'Moliya va shartnomalar', ikonka: 'Briefcase', qatlam: 'ish', bandlar: [{ nom: 'Moliya (to‘lov, xarajat)', ikonka: 'Briefcase' }, { nom: 'Shartnomalar va tomonlar', ikonka: 'Users' }] },
  { id: 'hujjat', nom: 'Hujjatlar', ikonka: 'FileStack', qatlam: 'ish', bandlar: [{ nom: 'Hujjatlar', ikonka: 'FileStack' }, { nom: 'Texnik nazorat', ikonka: 'ShieldCheck' }, { nom: 'Chizmalar', ikonka: 'FileStack' }, { nom: 'Kiruvchi (tomonlar)', ikonka: 'Inbox' }] },
  { id: 'taminot', nom: 'Ta‘minot va resurslar', ikonka: 'Truck', qatlam: 'ish', bandlar: [{ nom: 'Ta‘minot va sklad', ikonka: 'Box' }, { nom: 'Zayavkalar', ikonka: 'ClipboardList' }, { nom: 'Tender (xarid)', ikonka: 'ClipboardList' }, { nom: 'Yuk birjasi', ikonka: 'Truck' }, { nom: 'Yetkazuvchi: bugun', ikonka: 'Truck' }, { nom: 'Kadrlar va texnika', ikonka: 'Users' }, { nom: 'Kadrlar, KPI va ish haqi', ikonka: 'Users' }] },
  { id: 'sotuv', nom: 'Uy sotish', ikonka: 'Building2', qatlam: 'ish', bandlar: [{ nom: 'Uy sotish', ikonka: 'Building2' }] },
  { id: 'kompaniya', nom: '⚙ Kompaniya', ikonka: 'Settings', qatlam: 'kompaniya', bandlar: [{ nom: 'Kompaniya, a‘zolar va modullar', ikonka: 'Settings' }, { nom: 'Integratsiyalar va audit', ikonka: 'ShieldCheck' }, { nom: 'Sozlamalar', ikonka: 'Settings' }, { nom: 'Hujjatlar dizayni', ikonka: 'FileText' }, { nom: 'Tokenlar va obuna', ikonka: 'Briefcase' }, { nom: 'AI ishchilar', ikonka: 'Box' }, { nom: 'Korzinka', ikonka: 'Trash2' }] },
  { id: 'shaxsiy', nom: 'Shaxsiy', ikonka: 'User', qatlam: 'shaxsiy', bandlar: [{ nom: 'Ish joylarim', ikonka: 'LayoutDashboard' }, { nom: 'Mening topshiriqlarim', ikonka: 'ClipboardList' }, { nom: 'Mening xizmatlarim', ikonka: 'Briefcase' }, { nom: 'Akkaunt markazi', ikonka: 'User' }, { nom: 'Sozlamalar markazi', ikonka: 'Settings' }] },
  { id: 'platforma', nom: 'Platforma', ikonka: 'Crown', qatlam: 'platforma', bandlar: [{ nom: 'Platforma boshqaruvi', ikonka: 'Crown' }, { nom: 'Tizim xaritasi', ikonka: 'Gauge' }, { nom: 'Fayl bog‘lash (texnik)', ikonka: 'Link2' }] },
];

export const SAHIFALAR: readonly Sahifa[] = [
  { kalit: 'pult', yol: '/admin/pult', ishJoyi: 'bugun', tartib: 0, ilova: 'yadro', nom: 'Direktor pulti', sinonimlar: ['direktor pulti'], ruxsat: [RAHBARIYAT, 'financial.write'], scope: 'COMPANY_SCOPED', modul: 'module.erp', holat: 'tayyor', navGuruh: 'obyekt', navBand: 'Rahbar paneli' },
  { kalit: 'dashboard', yol: '/admin/dashboard', ishJoyi: 'bugun', tartib: 1, ilova: 'yadro', nom: 'Rahbar paneli', sinonimlar: ['rahbar paneli'], ruxsat: [RAHBARIYAT, 'financial.write'], scope: 'COMPANY_SCOPED', modul: 'module.erp', holat: 'tayyor', navGuruh: 'obyekt', navBand: 'Rahbar paneli' },
  { kalit: 'obyektlar', yol: '/admin/obyektlar', ishJoyi: 'obyekt', tartib: 2, ilova: 'pto', nom: 'Obyektlar va smeta yuklash', sinonimlar: ['obyektlar va smeta yuklash'], ruxsat: ['smeta.read'], scope: 'COMPANY_SCOPED', holat: 'tayyor', navGuruh: 'obyekt', navBand: 'Obyektlar va loyihalar' },
  { kalit: 'loyiha', yol: '/admin/loyiha', ishJoyi: 'obyekt', tartib: 3, ilova: 'pto', nom: 'Loyihalar', sinonimlar: ['loyihalar'], ruxsat: ['project.read'], scope: 'COMPANY_SCOPED', modul: 'module.loyiha', holat: 'tayyor', navGuruh: 'obyekt', navBand: 'Obyektlar va loyihalar' },
  { kalit: 'participants', yol: '/admin/participants', ishJoyi: 'tomonlar', tartib: 4, ilova: 'hujjat', nom: 'Loyiha ishtirokchilari', sinonimlar: ['loyiha ishtirokchilari'], ruxsat: ['project.read'], scope: 'PROJECT_SCOPED', modul: 'module.loyiha', holat: 'tayyor', navGuruh: 'obyekt', navBand: 'Obyektlar va loyihalar' },
  { kalit: 'mindmap', yol: '/admin/mindmap', ishJoyi: 'obyekt', tartib: 5, ilova: 'pto', nom: 'Mindmap (xarita)', sinonimlar: ['mindmap (xarita)'], ruxsat: [RAHBARIYAT, ...ICHKI_ISH], scope: 'COMPANY_SCOPED', modul: 'module.erp', holat: 'beta', navGuruh: 'obyekt', navBand: 'Obyektlar va loyihalar' },
  { kalit: 'smeta-studio', yol: '/admin/smeta-studio', ishJoyi: 'obyekt', tartib: 6, ilova: 'pto', nom: 'Smeta studiyasi', sinonimlar: ['smeta studiyasi'], ruxsat: [RAHBARIYAT, 'smeta.write'], holat: 'tayyor', navGuruh: 'smeta', navBand: 'Smeta studiyasi' },
  { kalit: 'holat', yol: '/admin/holat', ishJoyi: 'obyekt', tartib: 7, ilova: 'pto', nom: 'Smeta va Fakt / LRV', sinonimlar: ['smeta va fakt / lrv'], ruxsat: ['smeta.read'], scope: 'OBJECT_SCOPED', holat: 'tayyor', navGuruh: 'smeta', navBand: 'Smeta va Fakt / LRV' },
  { kalit: 'smeta-narxlash', yol: '/admin/smeta-narxlash', ishJoyi: 'obyekt', tartib: 8, ilova: 'pto', nom: 'Smetani narxlash (RES)', sinonimlar: ['smetani narxlash (res)'], ruxsat: [RAHBARIYAT, 'narx.write'], scope: 'OBJECT_SCOPED', modul: 'module.narx', holat: 'tayyor', navGuruh: 'smeta', navBand: 'Narxlash' },
  { kalit: 'narx-dalil', yol: '/admin/narx-dalil', ishJoyi: 'obyekt', tartib: 9, ilova: 'pto', nom: 'Narx dalili (Обоснование цен)', sinonimlar: ['narx dalili (обоснование цен)'], ruxsat: [RAHBARIYAT, 'narx.write'], modul: 'module.narx', holat: 'tayyor', navGuruh: 'smeta', navBand: 'Narxlash' },
  { kalit: 'narx-tekshiruv', yol: '/admin/narx-tekshiruv', ishJoyi: 'obyekt', tartib: 10, ilova: 'pto', nom: 'Narx tekshiruvi (usta narxi)', sinonimlar: ['narx tekshiruvi (usta narxi)'], ruxsat: [RAHBARIYAT, 'smeta.write', 'narx.write'], holat: 'beta', navGuruh: 'smeta', navBand: 'Narxlash' },
  { kalit: 'nakrutka', yol: '/admin/nakrutka', ishJoyi: 'obyekt', tartib: 11, ilova: 'pto', nom: 'Nakrutka (ustama)', sinonimlar: ['nakrutka (ustama)'], ruxsat: [RAHBARIYAT, 'narx.write'], modul: 'module.narx', holat: 'tayyor', navGuruh: 'smeta', navBand: 'Narxlash' },
  { kalit: 'narxlar', yol: '/admin/narxlar', ishJoyi: 'obyekt', tartib: 12, ilova: 'pto', nom: 'Narxlar nazorati', sinonimlar: ['narxlar nazorati'], ruxsat: [RAHBARIYAT, 'narx.write'], scope: 'OBJECT_SCOPED', modul: 'module.narx', holat: 'tayyor', navGuruh: 'smeta', navBand: 'Narxlash' },
  { kalit: 'narx-manbalari', yol: '/admin/narx-manbalari', ishJoyi: 'obyekt', tartib: 13, ilova: 'pto', nom: 'Narx manbalari (katalog, faktura, КП)', sinonimlar: ['narx manbalari (katalog, faktura, кп)'], ruxsat: [RAHBARIYAT, 'narx.write'], modul: 'module.narx', holat: 'tayyor', navGuruh: 'smeta', navBand: 'Narxlash' },
  { kalit: 'oferta', yol: '/admin/oferta', ishJoyi: 'obyekt', tartib: 14, ilova: 'pto', nom: 'Tender oferta', sinonimlar: ['tender oferta'], ruxsat: [RAHBARIYAT, 'narx.write'], modul: 'module.narx', holat: 'beta', navGuruh: 'smeta', navBand: 'Narxlash' },
  { kalit: 'fakt', yol: '/admin/fakt', ishJoyi: 'obyekt', tartib: 15, ilova: 'ff', nom: 'Fakt kiritish', sinonimlar: ['fakt kiritish'], ruxsat: [RAHBARIYAT, 'fakt.write', 'fakt.read+self.work.write'], scope: 'OBJECT_SCOPED', holat: 'tayyor', navGuruh: 'fakt', navBand: 'Fakt kiritish' },
  { kalit: 'foto', yol: '/admin/foto', ishJoyi: 'obyekt', tartib: 15.6, ilova: 'ff', nom: 'Foto-dalil', sinonimlar: ['foto', 'foto dalil', 'rasm', 'suratlar', 'foto hisobot', 'foto lenta', 'фото', 'фотофиксация', 'фотоотчет'], ruxsat: [RAHBARIYAT, 'fakt.write', 'fakt.read+self.work.write'], holat: 'tayyor', navGuruh: 'fakt', navBand: 'Fakt kiritish' },
  { kalit: 'bugun', yol: '/admin/bugun', ishJoyi: 'bugun', tartib: 15.5, ilova: 'ff', nom: 'Bugun (usta, telefon)', sinonimlar: ['bugun', 'usta', 'telefondan fakt', 'bugungi ishlar'], ruxsat: [RAHBARIYAT, 'fakt.write', 'fakt.read+self.work.write'], holat: 'tayyor', navGuruh: 'fakt', navBand: 'Bugun (telefon)' },
  { kalit: 'm29', yol: '/admin/m29', ishJoyi: 'obyekt', tartib: 16, ilova: 'ff', nom: 'M-29 (material sarfi)', sinonimlar: ['m-29 (material sarfi)'], ruxsat: [RAHBARIYAT, 'smeta.write', 'warehouse.write'], holat: 'tayyor', navGuruh: 'fakt', navBand: 'M-29 (material sarfi)' },
  { kalit: 'f2-tayyorlash', yol: '/admin/f2-tayyorlash', ishJoyi: 'obyekt', tartib: 17, ilova: 'ff', nom: 'F2 tayyorlash', sinonimlar: ['f2 tayyorlash'], ruxsat: ['f2.prepare'], scope: 'OBJECT_SCOPED', holat: 'tayyor', navGuruh: 'f2', navBand: 'F2' },
  { kalit: 'f2', yol: '/admin/f2', ishJoyi: 'obyekt', tartib: 18, ilova: 'ff', nom: 'F2 import (tayyor F2 faylidan)', sinonimlar: ['f2 import (tayyor f2 faylidan)'], ruxsat: ['f2.import'], scope: 'OBJECT_SCOPED', holat: 'tayyor', navGuruh: 'f2', navBand: 'F2' },
  { kalit: 'f2-tarix', yol: '/admin/f2-tarix', ishJoyi: 'obyekt', tartib: 19, ilova: 'ff', nom: 'F2 tarixi va tasdiqlash', sinonimlar: ['f2 tarixi va tasdiqlash'], ruxsat: ['f2.read'], scope: 'OBJECT_SCOPED', holat: 'tayyor', navGuruh: 'f2', navBand: 'F2' },
  { kalit: 'f2-reestr', yol: '/admin/f2-reestr', ishJoyi: 'obyekt', tartib: 20, ilova: 'ff', nom: 'F2 reestri', sinonimlar: ['f2 reestri'], ruxsat: ['f2.read'], scope: 'COMPANY_SCOPED', holat: 'tayyor', navGuruh: 'f2', navBand: 'F2' },
  { kalit: 'nakopitelniy', yol: '/admin/nakopitelniy', ishJoyi: 'obyekt', tartib: 21, ilova: 'ff', nom: 'Nakopitelniy va F3', sinonimlar: ['nakopitelniy va f3'], ruxsat: ['f2.read'], scope: 'OBJECT_SCOPED', holat: 'tayyor', navGuruh: 'f2', navBand: 'F2' },
  { kalit: 'moliya', yol: '/admin/moliya', ishJoyi: 'moliya', tartib: 22, ilova: 'moliya', nom: 'Moliya (to‘lov, xarajat)', sinonimlar: ['moliya (to‘lov, xarajat)'], ruxsat: [RAHBARIYAT, 'financial.write'], modul: 'module.erp', holat: 'tayyor', navGuruh: 'moliya', navBand: 'Moliya (to‘lov, xarajat)' },
  { kalit: 'shartnoma-liniya', yol: '/admin/shartnoma-liniya', ishJoyi: 'moliya', tartib: 23, ilova: 'moliya', nom: 'Shartnomalar va tomonlar', sinonimlar: ['shartnomalar va tomonlar'], ruxsat: [RAHBARIYAT, 'financial.read', ...ICHKI_ISH], modul: 'module.loyiha', holat: 'tayyor', navGuruh: 'moliya', navBand: 'Shartnomalar va tomonlar' },
  { kalit: 'qarzdorlik', yol: '/admin/qarzdorlik', ishJoyi: 'moliya', tartib: 24, ilova: 'moliya', nom: 'Qarzdorlik (postavshik, subpudrat)', sinonimlar: ['qarzdorlik (postavshik, subpudrat)'], ruxsat: [RAHBARIYAT, 'financial.write'], modul: 'module.erp', qoshimcha: true, holat: 'beta', navGuruh: 'moliya', navBand: 'Shartnomalar va tomonlar' },
  { kalit: 'buxgalteriya', yol: '/admin/buxgalteriya', ishJoyi: 'moliya', tartib: 25, ilova: 'moliya', nom: 'Buxgalteriya (provodka, hisob-kitob)', sinonimlar: ['buxgalteriya (provodka, hisob-kitob)'], ruxsat: [RAHBARIYAT, 'accounting.write'], modul: 'module.erp', qoshimcha: true, holat: 'beta', navGuruh: 'moliya', navBand: 'Shartnomalar va tomonlar' },
  /* Tomonlar -> Kontragentlar: CRM + Logistika kontragentlari + Aloqalar BITTA sahifa (ekotizim V3). Eski yo'llar yo'naltiriladi. */
  { kalit: 'kontragentlar', yol: '/admin/kontragentlar', eskiYollar: ['/admin/crm', '/admin/aloqalar'], ishJoyi: 'tomonlar', tartib: 26, ilova: 'moliya', nom: 'Kontragentlar', sinonimlar: ['kontragentlar', 'kontragent', 'tomonlar aloqasi', 'hamkorlar', 'РєРѕРЅС‚СЂР°РіРµРЅС‚С‹', 'РїР°СЂС‚РЅС‘СЂС‹'], ruxsat: [RAHBARIYAT, 'financial.write', ...ICHKI_ISH], modul: 'module.loyiha', qoshimcha: true, holat: 'tayyor', navGuruh: 'moliya', navBand: 'Shartnomalar va tomonlar', aiNiyat: 'kontragent_royxat' },
  /* Yetkazuvchi tomoni В«BugunВ»: kelgan so'rovlar, takliflar natijasi, buyurtma qadamlari, transport. Faqat yetkazuvchi roli + rahbariyat. */
  { kalit: 'yetkazuvchi', yol: '/admin/yetkazuvchi', ishJoyi: 'bugun', tartib: 59, ilova: 'logistika', nom: 'Yetkazuvchi: bugun', sinonimlar: ['yetkazuvchi bugun', 'yetkazuvchi', 'postavshik', 'kelgan so‘rovlar', 'РїРѕСЃС‚Р°РІС‰РёРє', 'РІС…РѕРґСЏС‰РёРµ Р·Р°РїСЂРѕСЃС‹'], ruxsat: [RAHBARIYAT, 'supply.offer', 'supply.fulfil'], holat: 'tayyor', bosh: true, navGuruh: 'taminot', navBand: 'Yetkazuvchi: bugun', aiNiyat: 'yetkazuvchi_bugun' },
  /* Subpudratchi tomoni (ekotizim): «Bugun» (subpudratchi kompaniya) va boshqaruv (bosh pudratchi). Begona sahifa emas - t2_tomon_aloqa + grant orqali o'sha ma'lumot. */
  { kalit: 'subpudratchi', yol: '/admin/subpudratchi', ishJoyi: 'bugun', tartib: 59.1, ilova: 'hujjat', nom: 'Subpudratchi: bugun', sinonimlar: ['subpudratchi bugun', 'subpudratchi', 'sub akti', 'subpudrat', 'субподрядчик', 'акт субподрядчика', 'subcontractor'], ruxsat: [RAHBARIYAT, 'f2.prepare', 'fakt.write'], holat: 'tayyor', bosh: true, navGuruh: 'hujjat', navBand: 'Kiruvchi (tomonlar)', aiNiyat: 'subpudratchi_bugun' },
  { kalit: 'subpudrat', yol: '/admin/subpudrat', ishJoyi: 'tomonlar', tartib: 32.5, ilova: 'hujjat', nom: 'Subpudrat boshqaruvi', sinonimlar: ['subpudrat boshqaruvi', 'subpudratga topshirish', 'sub akti qabul', 'субподряд', 'передать субподрядчику', 'subcontract'], ruxsat: [RAHBARIYAT, 'f2.prepare', ...ICHKI_ISH], scope: 'OBJECT_SCOPED', holat: 'tayyor', navGuruh: 'hujjat', navBand: 'Kiruvchi (tomonlar)', aiNiyat: 'subpudrat_boshqaruv' },
  { kalit: 'documents', yol: '/admin/documents', ishJoyi: 'hujjatlar', tartib: 28, ilova: 'hujjat', nom: 'Hujjatlar', sinonimlar: ['hujjatlar'], ruxsat: [RAHBARIYAT, 'project.read', 'document.write', 'financial.write'], scope: 'COMPANY_SCOPED', modul: 'module.loyiha', holat: 'tayyor', navGuruh: 'hujjat', navBand: 'Hujjatlar' },
  { kalit: 'hujjat-nazorat', yol: '/admin/hujjat-nazorat', ishJoyi: 'hujjatlar', tartib: 29, ilova: 'hujjat', nom: 'Hujjat nazorati', sinonimlar: ['hujjat nazorati'], ruxsat: [RAHBARIYAT, 'project.read', 'document.write', 'financial.write'], scope: 'OBJECT_SCOPED', modul: 'module.loyiha', holat: 'tayyor', navGuruh: 'hujjat', navBand: 'Hujjatlar' },
  { kalit: 'aosr', yol: '/admin/aosr', ishJoyi: 'hujjatlar', tartib: 30, ilova: 'hujjat', nom: 'АОСР va laboratoriya', sinonimlar: ['аоср va laboratoriya'], ruxsat: [RAHBARIYAT, 'document.write', 'quality.read'], modul: 'module.aosr', holat: 'tayyor', navGuruh: 'hujjat', navBand: 'Hujjatlar' },
  { kalit: 'storage', yol: '/admin/storage', ishJoyi: 'hujjatlar', tartib: 31, ilova: 'hujjat', nom: 'Fayllar (saqlash)', sinonimlar: ['fayllar (saqlash)'], ruxsat: [RAHBARIYAT, 'project.read', 'document.write', 'financial.write'], scope: 'OBJECT_SCOPED', holat: 'tayyor', navGuruh: 'hujjat', navBand: 'Hujjatlar' },
  { kalit: 'nazorat', yol: '/admin/nazorat', ishJoyi: 'hujjatlar', tartib: 31.1, ilova: 'hujjat', nom: 'Texnik nazorat', sinonimlar: ['texnik nazorat', 'texnadzor', 'технадзор'], ruxsat: [RAHBARIYAT, ...ICHKI_ISH, 'quality.inspect'], modul: 'module.loyiha', qoshimcha: true, holat: 'beta', navGuruh: 'hujjat', navBand: 'Texnik nazorat' },
  { kalit: 'nazorat/tekshiruv', yol: '/admin/nazorat/tekshiruv', ishJoyi: 'hujjatlar', tartib: 31.2, ilova: 'hujjat', nom: 'Yangi tekshiruv (sayt)', sinonimlar: ['yangi tekshiruv (sayt)', 'tekshiruv', 'новая проверка'], ruxsat: [RAHBARIYAT, ...ICHKI_ISH, 'quality.inspect'], modul: 'module.loyiha', qoshimcha: true, holat: 'beta', navGuruh: 'hujjat', navBand: 'Texnik nazorat' },
  { kalit: 'nazorat/jurnal', yol: '/admin/nazorat/jurnal', ishJoyi: 'hujjatlar', tartib: 31.3, ilova: 'hujjat', nom: 'Tekshiruvlar jurnali', sinonimlar: ['tekshiruvlar jurnali', 'журнал проверок'], ruxsat: [RAHBARIYAT, ...ICHKI_ISH, 'quality.inspect'], modul: 'module.loyiha', qoshimcha: true, holat: 'beta', navGuruh: 'hujjat', navBand: 'Texnik nazorat' },
  { kalit: 'zakazchik', yol: '/admin/zakazchik', ishJoyi: 'tomonlar', tartib: 32, ilova: 'hujjat', nom: 'Buyurtmachi kabineti', sinonimlar: ['buyurtmachi kabineti'], ruxsat: [RAHBARIYAT, 'project.read', 'quality.inspect'], modul: 'module.loyiha', qoshimcha: true, holat: 'beta', navGuruh: 'hujjat', navBand: 'Kiruvchi (tomonlar)' },
  { kalit: 'taqdimlar', yol: '/admin/taqdimlar', ishJoyi: 'tomonlar', tartib: 33, ilova: 'hujjat', nom: 'Tomonlar hujjatlari', sinonimlar: ['tomonlar hujjatlari'], ruxsat: [RAHBARIYAT, 'project.read', 'design.read', 'quality.inspect'], modul: 'module.loyiha', qoshimcha: true, holat: 'beta', navGuruh: 'hujjat', navBand: 'Kiruvchi (tomonlar)' },
  { kalit: 'murojaatlar', yol: '/admin/murojaatlar', ishJoyi: 'tomonlar', tartib: 34, ilova: 'hujjat', nom: 'Murojaatlar (remark, so‘rov)', sinonimlar: ['murojaatlar (remark, so‘rov)'], ruxsat: [RAHBARIYAT, 'project.read', 'design.read', 'quality.inspect'], modul: 'module.loyiha', qoshimcha: true, holat: 'beta', navGuruh: 'hujjat', navBand: 'Kiruvchi (tomonlar)' },
  { kalit: 'chizmalar', yol: '/admin/chizmalar', ishJoyi: 'hujjatlar', tartib: 31.4, ilova: 'hujjat', nom: 'Chizmalar va revizyalar', sinonimlar: ['chizmalar', 'chizma', 'revizya'], ruxsat: [RAHBARIYAT, 'design.read', 'design.write', 'document.write'], holat: 'beta', navGuruh: 'hujjat', navBand: 'Chizmalar' },
  { kalit: 'loyihachi', yol: '/admin/loyihachi', ishJoyi: 'bugun', tartib: 31.5, ilova: 'hujjat', nom: 'Loyihachi: bugun', sinonimlar: ['loyihachi bugun', 'mualliflik nazorati'], ruxsat: ['design.write', 'design.issue', RAHBARIYAT, ...ICHKI_ISH], holat: 'beta', bosh: true, navGuruh: 'hujjat', navBand: 'Chizmalar' },
  { kalit: 'laboratoriya', yol: '/admin/laboratoriya', ishJoyi: 'tomonlar', tartib: 34.5, ilova: 'hujjat', nom: 'Laboratoriya (sinov so‘rovlari)', sinonimlar: ['sinov so‘rovi', 'sinov sorovi', 'laboratoriya kabineti', 'sinov protokoli'], ruxsat: [RAHBARIYAT, 'project.read', 'quality.read'], modul: 'module.loyiha', qoshimcha: true, holat: 'beta', navGuruh: 'hujjat', navBand: 'Kiruvchi (tomonlar)' },
  { kalit: 'hujjat-aylanish', yol: '/admin/hujjat-aylanish', ishJoyi: 'hujjatlar', tartib: 35, ilova: 'hujjat', nom: 'Hujjat aylanishi (kiruvchi, xat, tasdiq)', sinonimlar: ['hujjat aylanishi (kiruvchi, xat, tasdiq)'], ruxsat: [RAHBARIYAT, 'project.read', 'quality.read'], modul: 'module.loyiha', qoshimcha: true, holat: 'beta', navGuruh: 'hujjat', navBand: 'Kiruvchi (tomonlar)' },
  { kalit: 'logistika', yol: '/admin/logistika', ishJoyi: 'taminot', tartib: 36, ilova: 'logistika', nom: 'Ta‘minot va sklad', sinonimlar: ['ta‘minot va sklad'], ruxsat: [RAHBARIYAT, ...ICHKI_ISH, 'warehouse.read', 'procurement.read', 'logistics.read', 'logistics.trip'], modul: 'module.erp', holat: 'tayyor', navGuruh: 'taminot', navBand: 'Ta‘minot va sklad' },
  { kalit: 'zayavka', yol: '/admin/zayavka', ishJoyi: 'taminot', tartib: 37, ilova: 'xarid', nom: 'Zayavkalar', sinonimlar: ['zayavkalar'], ruxsat: [RAHBARIYAT, ...ICHKI_ISH, 'procurement.read', 'warehouse.write'], modul: 'module.erp', qoshimcha: true, holat: 'beta', navGuruh: 'taminot', navBand: 'Zayavkalar' },
  { kalit: 'tender', yol: '/admin/tender', ishJoyi: 'taminot', tartib: 38, ilova: 'xarid', nom: 'Tender / xarid', sinonimlar: ['tender / xarid'], ruxsat: [RAHBARIYAT, ...ICHKI_ISH, 'procurement.read', 'supply.offer'], modul: 'module.erp', qoshimcha: true, holat: 'beta', navGuruh: 'taminot', navBand: 'Tender (xarid)' },
  { kalit: 'yuk-birjasi', yol: '/admin/yuk-birjasi', ishJoyi: 'taminot', tartib: 39, ilova: 'logistika', nom: 'Yuk birjasi', sinonimlar: ['yuk birjasi'], ruxsat: [RAHBARIYAT, ...ICHKI_ISH, 'procurement.read'], modul: 'module.erp', qoshimcha: true, holat: 'beta', navGuruh: 'taminot', navBand: 'Yuk birjasi' },
  { kalit: 'erp', yol: '/admin/erp', ishJoyi: 'taminot', tartib: 40, ilova: 'hr', nom: 'Kadrlar va texnika', sinonimlar: ['kadrlar va texnika'], ruxsat: [RAHBARIYAT, ...ICHKI_ISH, 'hr.read', 'machinery.read', 'machinery.log'], modul: 'module.erp', qoshimcha: true, holat: 'beta', navGuruh: 'taminot', navBand: 'Kadrlar va texnika' },
  { kalit: 'hr', yol: '/admin/hr', ishJoyi: 'taminot', tartib: 41, ilova: 'hr', nom: 'Kadrlar, KPI va ish haqi', sinonimlar: ['kadrlar, kpi va ish haqi'], ruxsat: ['hr.read', 'hr.tabel.write', 'payroll.read'], modul: 'module.erp', qoshimcha: true, holat: 'beta', navGuruh: 'taminot', navBand: 'Kadrlar, KPI va ish haqi' },
  { kalit: 'sotuv', yol: '/admin/sotuv', ishJoyi: 'sotuv', tartib: 42, ilova: 'sotuv', nom: 'Uy sotish', sinonimlar: ['uy sotish'], ruxsat: ['sales.read'], scope: 'COMPANY_SCOPED', holat: 'tayyor', navGuruh: 'sotuv', navBand: 'Uy sotish' },
  { kalit: 'kompaniya', yol: '/admin/kompaniya', ishJoyi: 'kompaniya', tartib: 43, ilova: 'yadro', nom: 'Kompaniya, a‘zolar va modullar', sinonimlar: ['kompaniya, a‘zolar va modullar'], ruxsat: [RAHBARIYAT, 'company.member.manage', 'company.profile.update'], scope: 'GLOBAL', holat: 'tayyor', navGuruh: 'kompaniya', navBand: 'Kompaniya, a‘zolar va modullar' },
  { kalit: 'system-control', yol: '/admin/system-control', ishJoyi: 'platforma', tartib: 44, ilova: 'platforma', nom: 'Integratsiyalar va audit', sinonimlar: ['integratsiyalar va audit'], ruxsat: [RAHBARIYAT], scope: 'GLOBAL', faqatSuperadmin: true, holat: 'texnik', navGuruh: 'kompaniya', navBand: 'Integratsiyalar va audit' },
  { kalit: 'tizim-sozlama', yol: '/admin/tizim-sozlama', ishJoyi: 'kompaniya', tartib: 45, ilova: 'yadro', nom: 'Sozlamalar', sinonimlar: ['sozlamalar'], ruxsat: [RAHBARIYAT], holat: 'tayyor', navGuruh: 'kompaniya', navBand: 'Sozlamalar' },
  { kalit: 'hujjat-dizayn', yol: '/admin/hujjat-dizayn', ishJoyi: 'kompaniya', tartib: 46, ilova: 'yadro', nom: 'Hujjatlar dizayni', sinonimlar: ['hujjatlar dizayni'], ruxsat: [RAHBARIYAT, 'company.profile.update'], holat: 'tayyor', navGuruh: 'kompaniya', navBand: 'Hujjatlar dizayni' },
  { kalit: 'tokenlar', yol: '/admin/tokenlar', ishJoyi: 'kompaniya', tartib: 47, ilova: 'yadro', nom: 'Tokenlar va obuna', sinonimlar: ['tokenlar va obuna'], ruxsat: [RAHBARIYAT, 'company.member.manage'], holat: 'tayyor', navGuruh: 'kompaniya', navBand: 'Tokenlar va obuna' },
  { kalit: 'ai-agentlar', yol: '/admin/ai-agentlar', ishJoyi: 'kompaniya', tartib: 48, ilova: 'yadro', nom: 'AI ishchilar', sinonimlar: ['ai ishchilar'], ruxsat: [RAHBARIYAT], holat: 'tayyor', navGuruh: 'kompaniya', navBand: 'AI ishchilar' },
  { kalit: 'korzinka', yol: '/admin/korzinka', ishJoyi: 'kompaniya', tartib: 49, ilova: 'yadro', nom: 'Korzinka', sinonimlar: ['korzinka'], ruxsat: [RAHBARIYAT], holat: 'tayyor', navGuruh: 'kompaniya', navBand: 'Korzinka' },
  { kalit: 'ish-joylarim', yol: '/admin/ish-joylarim', ishJoyi: 'bugun', tartib: 50, ilova: 'yadro', nom: 'Ish joylarim', sinonimlar: ['ish joylarim'], ruxsat: [], holat: 'tayyor', navGuruh: 'shaxsiy', navBand: 'Ish joylarim' },
  { kalit: 'topshiriqlar', yol: '/admin/topshiriqlar', ishJoyi: 'bugun', tartib: 51, ilova: 'yadro', nom: 'Mening topshiriqlarim', sinonimlar: ['mening topshiriqlarim'], ruxsat: [], qoshimcha: true, holat: 'beta', navGuruh: 'shaxsiy', navBand: 'Mening topshiriqlarim' },
  { kalit: 'mutaxassis', yol: '/admin/mutaxassis', ishJoyi: 'bugun', tartib: 52, ilova: 'yadro', nom: 'Mening xizmatlarim', sinonimlar: ['mening xizmatlarim'], ruxsat: [], holat: 'tayyor', navGuruh: 'shaxsiy', navBand: 'Mening xizmatlarim' },
  { kalit: 'akkaunt', yol: '/admin/akkaunt', ishJoyi: 'kompaniya', tartib: 53, ilova: 'yadro', nom: 'Akkaunt markazi', sinonimlar: ['akkaunt markazi'], ruxsat: [], holat: 'tayyor', navGuruh: 'shaxsiy', navBand: 'Akkaunt markazi' },
  { kalit: 'sozlamalar', yol: '/admin/sozlamalar', ishJoyi: 'kompaniya', tartib: 54, ilova: 'yadro', nom: 'Sozlamalar markazi', sinonimlar: ['sozlamalar markazi'], ruxsat: [], holat: 'tayyor', navGuruh: 'shaxsiy', navBand: 'Sozlamalar markazi' },
  { kalit: 'boshqaruv', yol: '/admin/boshqaruv', ishJoyi: 'platforma', tartib: 55, ilova: 'platforma', nom: 'Platforma boshqaruvi', sinonimlar: ['platforma boshqaruvi'], ruxsat: [], holat: 'texnik', navGuruh: 'platforma', navBand: 'Platforma boshqaruvi' },
  { kalit: 'tizim-xaritasi', yol: '/admin/tizim-xaritasi', ishJoyi: 'platforma', tartib: 56, ilova: 'platforma', nom: 'Tizim xaritasi', sinonimlar: ['tizim xaritasi'], ruxsat: [], holat: 'texnik', navGuruh: 'platforma', navBand: 'Tizim xaritasi' },
  { kalit: 'fayl-boglash', yol: '/admin/fayl-boglash', ishJoyi: 'platforma', tartib: 57, ilova: 'platforma', nom: 'Fayl bog‘lash (texnik)', sinonimlar: ['fayl bog‘lash (texnik)'], ruxsat: [], holat: 'texnik', navGuruh: 'platforma', navBand: 'Fayl bog‘lash (texnik)' },
];
