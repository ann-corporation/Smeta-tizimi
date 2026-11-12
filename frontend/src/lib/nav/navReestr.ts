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
import type { IlovaKod } from '../ilova/ilovalar';
import { NAV_GURUH_META, SAHIFALAR } from '../reestr/sahifa';
import type { NavIkonka, NavQatlam } from '../reestr/sahifa';

export type { NavQatlam, NavIkonka };

export type NavSahifa = {
  yol: string;
  /** Ilova (ekotizim P1): sahifa qaysi ilovaga tegishli — ilova ishga tushirgich va ilova menyusi shundan quriladi. Majburiy. */
  ilova: IlovaKod;
  nom: string;
  ruxsat: readonly string[];
  /** Modul («Telegram modeli») — o'chirilsa sahifa menyudan yashiriladi (lib/modullar.ts). */
  modul?: string;
  /** Kontekst sinfi (RuxsatGuard). Faqat routeScope'da bor sahifalarga yoziladi — qo'riqchi xulqi o'zgarmaydi. */
  scope?: RouteScope;
  /** Tizimga oid sahifa: faqat platforma superadmini (menyu ham, marshrut ham). Capability EMAS — `k.superadmin`. */
  faqatSuperadmin?: true;
  /** Qo'shimcha bo'lim: hali ma'lumot/ishchi oqim yo'q yoki kundalik ishda ishlatilmaydi — yon menyuda asosiy ro'yxatdan chiqarilib Qo'shimcha bo'limlar ostiga yig'iladi (o'chirilmaydi; Ctrl+K va to'g'ridan-to'g'ri havola ishlaydi). */
  qoshimcha?: true;
};

/** Sidebar bandi: bitta sahifa yoki bir nechta sahifa — tepada tablar (BolimTablari, App.tsx dagi layout). */
export type NavBand = { nom: string; ikonka: NavIkonka; sahifalar: readonly NavSahifa[] };

export type NavGuruh = { id: string; nom: string; ikonka: NavIkonka; qatlam: NavQatlam; bandlar: readonly NavBand[] };

/* ── Hosila (ekotizim V2, 1-qadam) ──────────────────────────────────────────────────────────────────────────────
 * NAV_GURUHLAR endi qo'lda yozilmaydi: yagona sahifa reestridan (lib/reestr/sahifa.ts SAHIFALAR + NAV_GURUH_META) yig'iladi.
 * Chiqish eski literal bilan aynan bir xil (lib/reestr/reestr.golden.test.ts, __fixtures__/nav-guruhlar.json).
 * Yangi sahifa menyuga — reestrga bitta `Sahifa` yozuvi bilan. Ruxsat konstantalari (RAHBARIYAT, ICHKI_ISH) ham o'sha yerda. */
function navSahifaDan(s: (typeof SAHIFALAR)[number]): NavSahifa {
  const r: NavSahifa = { yol: s.yol, ilova: s.ilova, nom: s.nom, ruxsat: s.ruxsat };
  if (s.modul) r.modul = s.modul;
  if (s.scope) r.scope = s.scope;
  if (s.faqatSuperadmin) r.faqatSuperadmin = true;
  if (s.qoshimcha) r.qoshimcha = true;
  return r;
}

export const NAV_GURUHLAR: readonly NavGuruh[] = NAV_GURUH_META.map((g) => ({
  id: g.id, nom: g.nom, ikonka: g.ikonka, qatlam: g.qatlam,
  bandlar: g.bandlar.map((b) => ({
    nom: b.nom, ikonka: b.ikonka,
    sahifalar: SAHIFALAR.filter((s) => s.navGuruh === g.id && s.navBand === b.nom).slice().sort((x, y) => x.tartib - y.tartib).map(navSahifaDan),
  })),
}));

/**
 * KUNDALIK ISHLAR (navigatsiya oqimi, 2026-11-11: «PlayStation pulti»): yon menyuning eng tepasidagi qisqa ro'yxat — xodim
 * har kuni qiladigan 7 ish, har biri o'z ISHI nomi bilan (bo'lim nomi bilan emas). Yangi sahifa YO'Q: har band mavjud reestr
 * sahifasiga olib boradi; ko'rinishi navFiltr.kundalikIshlar orqali boshqa menyu bilan bir xil rol/ruxsat/modul filtridan o'tadi.
 */
export const KUNDALIK_ISHLAR: ReadonlyArray<{ yol: string; nom: string; ikonka: NavIkonka }> = [
  { yol: '/admin/fakt', nom: 'Fakt kiritish', ikonka: 'HardHat' },
  { yol: '/admin/f2-tayyorlash', nom: 'F2 tayyorlash', ikonka: 'FileOutput' },
  { yol: '/admin/f2', nom: 'F2 faylni yuklash (Excel)', ikonka: 'FileOutput' },
  { yol: '/admin/nakopitelniy', nom: 'Forma 3 va nakopitelniy', ikonka: 'FileStack' },
  { yol: '/admin/holat', nom: 'Qancha bajarildi', ikonka: 'Gauge' },
  { yol: '/admin/aosr', nom: 'Yashirin ish akti', ikonka: 'ShieldCheck' },
  { yol: '/admin/logistika', nom: 'Ombor (kirim, chiqim)', ikonka: 'Box' },
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
  .map(({ yol, nom, ruxsat, ilova }) => ({ yol, nom, ruxsat, ilova }));

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
