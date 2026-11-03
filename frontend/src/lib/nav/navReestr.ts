/**
 * YAGONA NAVIGATSIYA REESTRI (tizim xaritasi tadqiqoti 03, S1; egasi qarori 2026-10-26).
 *
 * Sidebar (AdminShell), Ctrl+K (CommandPalette — AdminShell filtridan), sahifa tablari (BolimTablari),
 * kontekst sinfi (routeScope.ROUTE_SCOPE), modul xaritasi (modullar.MENYU_MODUL), menyu ruxsati
 * (route-permission.menyuRuxsati) va sayt xaritasi generatori (scripts/generate-site-map.mjs) — HAMMASI shu
 * fayldan o'qiydi. Yangi sahifa menyuga faqat shu yerga yozib qo'shiladi; ikkinchi ro'yxat yaratilmaydi.
 *
 * Uch qatlam (egasi: «tizim sozlamalari / bosh admin / foydalanuvchi / kompaniya nazoratlari aralash»):
 *   ish       — qurilish zanjiri: Obyektlar → Smeta → Fakt → F2 → Moliya → Hujjatlar → Ta'minot.
 *               Egasi (2026-10-26): «PTO qurilishda pulga aloqador hamma joyda bo'lishi kerak» — PTO bu qatlamning
 *               HAMMA bandini ko'radi (navFiltr.test.ts da qat'iy tekshiriladi). Muammo — tartibsizlik, son emas.
 *   kompaniya — «⚙ Kompaniya»: a'zolar/rollar, integratsiya/audit, sozlama, shablonlar, tokenlar, AI ishchilar, korzinka.
 *   shaxsiy   — ish joylarim, topshiriqlarim, xizmatlarim (avatar/akkaunt menyusiga ko'chishga tayyor).
 *   platforma — faqat platforma superadmini (`k.superadmin`, capability EMAS): boshqaruv, texnik.
 *
 * TIZIMGA OID HAMMA NARSA — FAQAT PLATFORMA SUPERADMINI (egasi 2026-10-27: «tizim uchun taaluqli hamma narsalar superadmindan
 * boshqada umuman chiqmasligi shart»). Yagona mexanizm: `faqatSuperadmin: true` (yoki «Platforma» guruhi) — navFiltr menyudan
 * yashiradi, RuxsatGuard (`faqatSuperadminYolmi`) to'g'ridan-to'g'ri URL ni ham yopadi. Menyuda yo'q tizim yo'llari —
 * `SUPERADMIN_YOLLAR_QOSHIMCHA`. Server baribir alohida tekshiradi (functions/_shared/tizim-maxfiy.ts).
 *
 * `ruxsat` — menyu ko'rinishi (xavfsizlik EMAS; sahifani server va RuxsatGuard qo'riqlaydi):
 *   [] — har kirgan foydalanuvchi;  ['a', 'b'] — kamida bittasi;  'a+b' — ikkalasi birga.
 *   Reestrda yo'q yo'l menyuda KO'RINMAYDI (avval `document.read` ga tushardi — usta/buyurtmachi «AI ishchilar»,
 *   «Sayt xaritasi», «Korzinka» ni ko'rardi).
 * Ro'yxatlar ikki katalogda ham ishlaydi: eski (20261017100629, prodda bo'lishi mumkin) va ekotizim (20261108010000):
 * eski katalogda `warehouse.*`/`hr.*` yo'q, shuning uchun ichki pudratchi xodimi `project.write` orqali ham tanib olinadi.
 *
 * Bu fayl SOF MA'LUMOT (React/ikonka importi yo'q) — testlar va node generatori uni bemalol o'qiydi.
 */
import type { RouteScope } from '../../umumiy/kontekst/routeScope';

export type NavQatlam = 'ish' | 'kompaniya' | 'shaxsiy' | 'platforma';

/** AdminShell dagi lucide ikonkalar kaliti (reestr toza ma'lumot bo'lib qolishi uchun satr). */
export type NavIkonka =
  | 'Building2' | 'Tags' | 'Calculator' | 'FileOutput' | 'HardHat' | 'ShieldAlert' | 'Settings' | 'FileText'
  | 'Link2' | 'FileStack' | 'Gauge' | 'FlaskConical' | 'LayoutDashboard' | 'BarChart' | 'ClipboardList'
  | 'Briefcase' | 'Box' | 'Users' | 'FolderKanban' | 'Crown' | 'ShieldCheck' | 'Map' | 'Inbox' | 'Truck' | 'User' | 'Trash2';

export type NavSahifa = {
  yol: string;
  nom: string;
  ruxsat: readonly string[];
  /** Modul («Telegram modeli») — o'chirilsa sahifa menyudan yashiriladi (lib/modullar.ts). */
  modul?: string;
  /** Kontekst sinfi (RuxsatGuard). Faqat routeScope'da bor sahifalarga yoziladi — qo'riqchi xulqi o'zgarmaydi. */
  scope?: RouteScope;
  /** Tizimga oid sahifa: faqat platforma superadmini (menyu ham, marshrut ham). Capability EMAS — `k.superadmin`. */
  faqatSuperadmin?: true;
};

/** Sidebar bandi: bitta sahifa yoki bir nechta sahifa — tepada tablar (BolimTablari, App.tsx dagi layout). */
export type NavBand = { nom: string; ikonka: NavIkonka; sahifalar: readonly NavSahifa[] };

export type NavGuruh = { id: string; nom: string; ikonka: NavIkonka; qatlam: NavQatlam; bandlar: readonly NavBand[] };

/* ── Ruxsat to'plamlari (rol → capability: supabase t2_role_permissions_v2) ── */
/** Kompaniya rahbariyati: boss/admin (butun katalog) va rahbar (faqat o'qish). */
const RAHBARIYAT = 'control.company.read';
/** Ichki ishchi xodim (pto, prorab, boss/admin) — buyurtmachi/pudratchi/kuzatuvchida yo'q. */
const ICHKI_ISH = ['project.write', 'object.write'] as const;

export const NAV_GURUHLAR: readonly NavGuruh[] = [
  {
    id: 'obyekt', nom: 'Obyektlar', ikonka: 'Building2', qatlam: 'ish',
    bandlar: [
      { nom: 'Rahbar paneli', ikonka: 'BarChart', sahifalar: [
        { yol: '/admin/dashboard', nom: 'Rahbar paneli', ruxsat: [RAHBARIYAT, 'financial.write'], modul: 'module.erp', scope: 'COMPANY_SCOPED' },
      ] },
      { nom: 'Obyektlar va loyihalar', ikonka: 'FolderKanban', sahifalar: [
        { yol: '/admin/obyektlar', nom: 'Obyektlar va smeta yuklash', ruxsat: ['smeta.read'], scope: 'COMPANY_SCOPED' },
        { yol: '/admin/loyiha', nom: 'Loyihalar', ruxsat: ['project.read'], modul: 'module.loyiha', scope: 'COMPANY_SCOPED' },
        { yol: '/admin/participants', nom: 'Loyiha ishtirokchilari', ruxsat: ['project.read'], modul: 'module.loyiha', scope: 'PROJECT_SCOPED' },
        { yol: '/admin/mindmap', nom: 'Mindmap (xarita)', ruxsat: [RAHBARIYAT, ...ICHKI_ISH], modul: 'module.erp', scope: 'COMPANY_SCOPED' },
      ] },
    ],
  },
  {
    id: 'smeta', nom: 'Smeta', ikonka: 'Calculator', qatlam: 'ish',
    bandlar: [
      { nom: 'Smeta studiyasi', ikonka: 'Calculator', sahifalar: [
        { yol: '/admin/smeta-studio', nom: 'Smeta studiyasi', ruxsat: [RAHBARIYAT, 'smeta.write'] },
      ] },
      { nom: 'Smeta va Fakt / LRV', ikonka: 'FileText', sahifalar: [
        { yol: '/admin/holat', nom: 'Smeta va Fakt / LRV', ruxsat: ['smeta.read'], scope: 'OBJECT_SCOPED' },
      ] },
      /* Narxga oid 6 band → bitta «Narxlash» bandi, tepada tablar (tadqiqot M6/M7: «narx 6 ta»). */
      { nom: 'Narxlash', ikonka: 'Tags', sahifalar: [
        { yol: '/admin/smeta-narxlash', nom: 'Smetani narxlash (RES)', ruxsat: [RAHBARIYAT, 'narx.write'], modul: 'module.narx', scope: 'OBJECT_SCOPED' },
        { yol: '/admin/narx-dalil', nom: 'Narx dalili (Обоснование цен)', ruxsat: [RAHBARIYAT, 'narx.write'], modul: 'module.narx' },
        { yol: '/admin/nakrutka', nom: 'Nakrutka (ustama)', ruxsat: [RAHBARIYAT, 'narx.write'], modul: 'module.narx' },
        { yol: '/admin/narxlar', nom: 'Narxlar nazorati', ruxsat: [RAHBARIYAT, 'narx.write'], modul: 'module.narx', scope: 'OBJECT_SCOPED' },
        { yol: '/admin/narx-manbalari', nom: 'Narx manbalari (katalog, faktura, КП)', ruxsat: [RAHBARIYAT, 'narx.write'], modul: 'module.narx' },
        { yol: '/admin/oferta', nom: 'Tender oferta', ruxsat: [RAHBARIYAT, 'narx.write'], modul: 'module.narx' },
      ] },
    ],
  },
  {
    id: 'fakt', nom: 'Fakt', ikonka: 'HardHat', qatlam: 'ish',
    bandlar: [
      /* Avval menyuda yo'q edi (tadqiqot M4). Usta/brigadir: fakt.read + self.work.write (fakt.write ularda yo'q). */
      { nom: 'Fakt kiritish', ikonka: 'HardHat', sahifalar: [
        { yol: '/admin/fakt', nom: 'Fakt kiritish', ruxsat: [RAHBARIYAT, 'fakt.write', 'fakt.read+self.work.write'], scope: 'OBJECT_SCOPED' },
      ] },
      { nom: 'M-29 (material sarfi)', ikonka: 'Box', sahifalar: [
        { yol: '/admin/m29', nom: 'M-29 (material sarfi)', ruxsat: [RAHBARIYAT, 'smeta.write', 'warehouse.write'] },
      ] },
    ],
  },
  {
    id: 'f2', nom: 'F2 va Nakopitelniy', ikonka: 'FileOutput', qatlam: 'ish',
    bandlar: [
      /* 2026-10-25 (P1): F2 ga oid 5 band → bitta «F2» bandi, tepada tablar. Ruxsat — route-permission bilan bir xil. */
      { nom: 'F2', ikonka: 'FileOutput', sahifalar: [
        { yol: '/admin/f2-tayyorlash', nom: 'F2 tayyorlash', ruxsat: ['f2.prepare'], scope: 'OBJECT_SCOPED' },
        { yol: '/admin/f2', nom: 'F2 import (tayyor F2 faylidan)', ruxsat: ['f2.import'], scope: 'OBJECT_SCOPED' },
        { yol: '/admin/f2-tarix', nom: 'F2 tarixi va tasdiqlash', ruxsat: ['f2.read'], scope: 'OBJECT_SCOPED' },
        { yol: '/admin/f2-reestr', nom: 'F2 reestri', ruxsat: ['f2.read'], scope: 'COMPANY_SCOPED' },
        { yol: '/admin/nakopitelniy', nom: 'Nakopitelniy va F3', ruxsat: ['f2.read'], scope: 'OBJECT_SCOPED' },
      ] },
    ],
  },
  {
    id: 'moliya', nom: 'Moliya va shartnomalar', ikonka: 'Briefcase', qatlam: 'ish',
    bandlar: [
      { nom: 'Moliya (to‘lov, xarajat)', ikonka: 'Briefcase', sahifalar: [
        { yol: '/admin/moliya', nom: 'Moliya (to‘lov, xarajat)', ruxsat: [RAHBARIYAT, 'financial.write'], modul: 'module.erp' },
      ] },
      /* «Tomonlar 7 joyda» (M8) → shartnoma, kontragent va aloqa — bitta band, tablar. */
      { nom: 'Shartnomalar va tomonlar', ikonka: 'Users', sahifalar: [
        { yol: '/admin/shartnoma-liniya', nom: 'Shartnomalar va tomonlar', ruxsat: [RAHBARIYAT, 'financial.read', ...ICHKI_ISH], modul: 'module.loyiha' },
        { yol: '/admin/qarzdorlik', nom: 'Qarzdorlik (postavshik, subpudrat)', ruxsat: [RAHBARIYAT, 'financial.write'], modul: 'module.erp' },
        { yol: '/admin/crm', nom: 'Kontragentlar (CRM/EDO)', ruxsat: [RAHBARIYAT, 'financial.write', ...ICHKI_ISH], modul: 'module.loyiha' },
        { yol: '/admin/aloqalar', nom: 'Tomonlar aloqasi', ruxsat: [RAHBARIYAT, 'financial.write', ...ICHKI_ISH], modul: 'module.loyiha' },
      ] },
    ],
  },
  {
    id: 'hujjat', nom: 'Hujjatlar', ikonka: 'FileStack', qatlam: 'ish',
    bandlar: [
      { nom: 'Hujjatlar', ikonka: 'FileStack', sahifalar: [
        { yol: '/admin/documents', nom: 'Hujjatlar', ruxsat: [RAHBARIYAT, 'project.read', 'document.write', 'financial.write'], modul: 'module.loyiha', scope: 'COMPANY_SCOPED' },
        { yol: '/admin/hujjat-nazorat', nom: 'Hujjat nazorati', ruxsat: [RAHBARIYAT, 'project.read', 'document.write', 'financial.write'], modul: 'module.loyiha', scope: 'OBJECT_SCOPED' },
        { yol: '/admin/aosr', nom: 'АОСР va laboratoriya', ruxsat: [RAHBARIYAT, 'document.write', 'quality.read'], modul: 'module.aosr' },
        { yol: '/admin/storage', nom: 'Fayllar (saqlash)', ruxsat: [RAHBARIYAT, 'project.read', 'document.write', 'financial.write'], scope: 'OBJECT_SCOPED' },
      ] },
      /* Kiruvchi: buyurtmachi kabineti, tomonlar taqdimi va murojaatlar — bitta band. */
      { nom: 'Kiruvchi (tomonlar)', ikonka: 'Inbox', sahifalar: [
        { yol: '/admin/zakazchik', nom: 'Buyurtmachi kabineti', ruxsat: [RAHBARIYAT, 'project.read'], modul: 'module.loyiha' },
        { yol: '/admin/taqdimlar', nom: 'Tomonlar hujjatlari', ruxsat: [RAHBARIYAT, 'project.read'], modul: 'module.loyiha' },
        { yol: '/admin/murojaatlar', nom: 'Murojaatlar (remark, so‘rov)', ruxsat: [RAHBARIYAT, 'project.read'], modul: 'module.loyiha' },
      ] },
    ],
  },
  {
    id: 'taminot', nom: 'Ta‘minot va resurslar', ikonka: 'Truck', qatlam: 'ish',
    bandlar: [
      { nom: 'Ta‘minot va sklad', ikonka: 'Box', sahifalar: [
        { yol: '/admin/logistika', nom: 'Ta‘minot va sklad', ruxsat: [RAHBARIYAT, ...ICHKI_ISH, 'warehouse.read', 'procurement.read', 'logistics.read', 'logistics.trip'], modul: 'module.erp' },
      ] },
      { nom: 'Zayavkalar', ikonka: 'ClipboardList', sahifalar: [
        { yol: '/admin/zayavka', nom: 'Zayavkalar', ruxsat: [RAHBARIYAT, ...ICHKI_ISH, 'procurement.read', 'warehouse.write'], modul: 'module.erp' },
      ] },
      { nom: 'Kadrlar va texnika', ikonka: 'Users', sahifalar: [
        { yol: '/admin/erp', nom: 'Kadrlar va texnika', ruxsat: [RAHBARIYAT, ...ICHKI_ISH, 'hr.read', 'machinery.read', 'machinery.log'], modul: 'module.erp' },
      ] },
    ],
  },
  {
    /* Uy sotish (egasi 2026-11-03): ko'chmas mulk sotuvi — qurilish zanjiridan alohida domen (sales.*). PTO da sales.* yo'q,
     * shuning uchun «PTO ish qatlamining hammasini ko'radi» qoidasi bu guruhga taalluqli emas (navFiltr.test.ts). */
    id: 'sotuv', nom: 'Uy sotish', ikonka: 'Building2', qatlam: 'ish',
    bandlar: [
      { nom: 'Uy sotish', ikonka: 'Building2', sahifalar: [
        { yol: '/admin/sotuv', nom: 'Uy sotish', ruxsat: ['sales.read'], scope: 'COMPANY_SCOPED' },
      ] },
    ],
  },
  {
    id: 'kompaniya', nom: '⚙ Kompaniya', ikonka: 'Settings', qatlam: 'kompaniya',
    bandlar: [
      /* Sozlamalar 5 joyda, audit 4, AI 3 (M7) → bitta «Kompaniya» bandi, tepada tablar. */
      { nom: 'Kompaniya boshqaruvi', ikonka: 'Settings', sahifalar: [
        { yol: '/admin/kompaniya', nom: 'Kompaniya, a‘zolar va modullar', ruxsat: [RAHBARIYAT, 'company.member.manage', 'company.profile.update'], scope: 'GLOBAL' },
        /* Tizim sog'lig'i, integratsiyalar, fon ishlari, imkoniyat bayroqlari — tizimga oid (egasi 2026-10-27). Kompaniyaning
         * o'z audit jurnali «Kompaniya → Audit» tabida qoladi. */
        { yol: '/admin/system-control', nom: 'Integratsiyalar va audit', ruxsat: [RAHBARIYAT], scope: 'GLOBAL', faqatSuperadmin: true },
        { yol: '/admin/tizim-sozlama', nom: 'Sozlamalar', ruxsat: [RAHBARIYAT] },
        { yol: '/admin/hujjat-dizayn', nom: 'Hujjatlar dizayni', ruxsat: [RAHBARIYAT, 'company.profile.update'] },
        { yol: '/admin/tokenlar', nom: 'Tokenlar va obuna', ruxsat: [RAHBARIYAT, 'company.member.manage'] },
        { yol: '/admin/ai-agentlar', nom: 'AI ishchilar', ruxsat: [RAHBARIYAT] },
        { yol: '/admin/korzinka', nom: 'Korzinka', ruxsat: [RAHBARIYAT] },
      ] },
    ],
  },
  {
    id: 'shaxsiy', nom: 'Shaxsiy', ikonka: 'User', qatlam: 'shaxsiy',
    bandlar: [
      /* «Telegram modeli»: barcha ish joylari va ulardagi navbatingiz — bitta ekranda. Hamma kirgan foydalanuvchiga. */
      { nom: 'Ish joylarim', ikonka: 'LayoutDashboard', sahifalar: [{ yol: '/admin/ish-joylarim', nom: 'Ish joylarim', ruxsat: [] }] },
      { nom: 'Mening topshiriqlarim', ikonka: 'ClipboardList', sahifalar: [{ yol: '/admin/topshiriqlar', nom: 'Mening topshiriqlarim', ruxsat: [] }] },
      { nom: 'Mening xizmatlarim', ikonka: 'Briefcase', sahifalar: [{ yol: '/admin/mutaxassis', nom: 'Mening xizmatlarim', ruxsat: [] }] },
      /* Firuza (#150): o'ng yuqoridagi akkaunt menyusi ham shu sahifaga olib boradi (profil, til, bildirishnoma, ko'rinish). */
      { nom: 'Akkaunt markazi', ikonka: 'User', sahifalar: [{ yol: '/admin/akkaunt', nom: 'Akkaunt markazi', ruxsat: [] }] },
      /* Sozlamalar markazi (egasi 2026-10-26): akkaunt / kompaniya / tizim sozlamalarining yagona reestri — har kim o'z qatlamini ko'radi. */
      { nom: 'Sozlamalar markazi', ikonka: 'Settings', sahifalar: [{ yol: '/admin/sozlamalar', nom: 'Sozlamalar markazi', ruxsat: [] }] },
    ],
  },
  {
    id: 'platforma', nom: 'Platforma', ikonka: 'Crown', qatlam: 'platforma',
    bandlar: [
      /* Faqat platforma superadmini (`k.superadmin`). Kompaniya boss/admin `control.global.read` ni katalogdan olsa ham
       * bu guruhni ko'rmaydi (tadqiqot M3). Server baribir alohida tekshiradi. */
      { nom: 'Platforma boshqaruvi', ikonka: 'Crown', sahifalar: [{ yol: '/admin/boshqaruv', nom: 'Platforma boshqaruvi', ruxsat: [] }] },
      /* Egasi 2026-10-27: tizim darajasidagi jonli mindmap. Superadmin YOKI u ruxsat bergan odam — menyuda faqat server
       * tasdiqlasa (`NavKontekst.tizimXaritasi`, navFiltr); sahifa va RPC ham alohida tekshiradi. Kompaniya roli bilan EMAS. */
      { nom: 'Tizim xaritasi', ikonka: 'Gauge', sahifalar: [{ yol: '/admin/tizim-xaritasi', nom: 'Tizim xaritasi', ruxsat: [] }] },
      { nom: 'Fayl bog‘lash (texnik)', ikonka: 'Link2', sahifalar: [{ yol: '/admin/fayl-boglash', nom: 'Fayl bog‘lash (texnik)', ruxsat: [] }] },
      /* Eski SINOV qobig'i (/admin/test/*) — yo'llar o'chirilmagan, menyuda faqat superadmin uchun. _demo/* menyuda yo'q. */
      { nom: 'Sinov qobig‘i (eski)', ikonka: 'FlaskConical', sahifalar: [{ yol: '/admin/test', nom: 'Sinov qobig‘i (eski)', ruxsat: [] }] },
    ],
  },
];

/** Menyuda YO'Q, lekin tizimga oid marshrutlar (prefiks; ichki yo'llari ham) — faqat platforma superadmini.
 *  Sayt xaritasi menyudan olib tashlandi (egasi 2026-10-27); sahifa superadmin uchun Boshqaruv panelidan ochiladi.
 *  Diqqat: bu yerda `yol:` kaliti ishlatilmaydi — sayt xaritasi generatori uni menyu yo'li deb o'qiydi. */
export const SUPERADMIN_YOLLAR_QOSHIMCHA: readonly string[] = ['/admin/sayt-xaritasi', '/admin/_demo', '/admin/test', '/admin/fayl-boglash', '/admin/boshqaruv'];

/** Eski /admin/test/* ichidagi biznes sahifalar — hali production manzili yo'q, kompaniya ishlatadi (CRM «Batafsil» havolasi). */
/* `/admin/tizim-xaritasi` — superadmin YOKI u ruxsat bergan odam (server `t2_tizim_xaritasi_ruxsat` bilan hal qiladi; sahifa
 * va menyu o'z tekshiruvini qiladi), shuning uchun umumiy «faqat superadmin» qoidasidan istisno. */
export const SUPERADMIN_ISTISNO: readonly string[] = ['/admin/test/kontragent', '/admin/tizim-xaritasi'];

/** Reestrdagi barcha sahifalar (guruh va band bilan). */
export const NAV_SAHIFALAR: ReadonlyArray<NavSahifa & { guruh: NavGuruh; band: NavBand }> =
  NAV_GURUHLAR.flatMap((guruh) => guruh.bandlar.flatMap((band) => band.sahifalar.map((s) => ({ ...s, guruh, band }))));

/** «Shaxsiy» qatlam sahifalari — akkaunt menyusi (components/akkaunt/AkkauntTugmasi) shu ro'yxatni o'qishi uchun.
 *  Sidebar pastida ham qoladi (egasi javobi kelguncha ikkala joyda). */
export const SHAXSIY_SAHIFALAR: readonly NavSahifa[] = NAV_SAHIFALAR.filter((s) => s.guruh.qatlam === 'shaxsiy')
  .map(({ yol, nom, ruxsat }) => ({ yol, nom, ruxsat }));

/** Yo'l (aniq yoki uning ichki yo'li, masalan `/admin/holat/12`) reestrdagi qaysi sahifa. */
export function navSahifa(yol: string): (NavSahifa & { guruh: NavGuruh; band: NavBand }) | null {
  return NAV_SAHIFALAR.find((s) => s.yol === yol) ?? NAV_SAHIFALAR.find((s) => yol.startsWith(s.yol + '/')) ?? null;
}

/** Capability ro'yxati `ruxsat` ga mosmi ([] — hamma; 'a+b' — ikkalasi). */
export function ruxsatMos(ruxsat: readonly string[], permissions: readonly string[]): boolean {
  if (ruxsat.length === 0) return true;
  return ruxsat.some((r) => r.split('+').every((p) => permissions.includes(p)));
}

const yolOstimi = (yol: string, asos: string) => yol === asos || yol.startsWith(asos + '/');

/** Yo'l (yoki uning ichki yo'li) faqat platforma superadminigami — menyu (navFiltr) va marshrut qo'riqchisi (RuxsatGuard) shu
 *  bitta funksiyani o'qiydi. Manba: «Platforma» guruhi, `faqatSuperadmin: true` sahifalar va SUPERADMIN_YOLLAR_QOSHIMCHA. */
export function faqatSuperadminYolmi(yol: string): boolean {
  const toza = yol.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (SUPERADMIN_ISTISNO.some((x) => yolOstimi(toza, x))) return false;
  if (SUPERADMIN_YOLLAR_QOSHIMCHA.some((x) => yolOstimi(toza, x))) return true;
  return NAV_SAHIFALAR.some((s) => (s.faqatSuperadmin || s.guruh.qatlam === 'platforma') && yolOstimi(toza, s.yol));
}
