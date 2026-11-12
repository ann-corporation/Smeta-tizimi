import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { menyuQur, menyuYollari, sahifaKorinadi, type NavKontekst } from './navFiltr';
import { NAV_GURUHLAR, NAV_SAHIFALAR, SHAXSIY_SAHIFALAR, faqatSuperadminYolmi } from './navReestr';
import { SOZLAMALAR, sozlamaFiltr } from '../sozlama/sozlamaReestr';
import { menyuRuxsati } from '../company-authorization/route-permission';
import { ROLE_PERMISSIONS } from '../company-authorization/effective-authorization';
import { MENYU_MODUL } from '../modullar';
import { ROUTE_SCOPE } from '../../umumiy/kontekst/routeScope';
import { menyuTekshir } from '../../umumiy/marshrutTekshir';
import { GENERATED_SITE_MAP } from '../sayt-xaritasi/generated';
import type { Modul } from '../../api/t2-modul';
import { LUGAT_EN, LUGAT_RU } from '../../i18n/lugat';

/* ── Server ko'zgusi: supabase t2_role_permissions_v2 (20261108010000 ekotizim + 20261110100000 buxgalter F2 yopiq) ── */
const KATALOG = ['company.read', 'company.profile.update', 'company.member.manage', 'control.company.read', 'control.company.write',
  'project.read', 'project.write', 'object.read', 'object.write', 'document.read', 'document.write', 'financial.read', 'financial.write',
  'f2.read', 'f2.import', 'f2.prepare', 'f2.approve', 'f2.cancel', 'f2.correct', 'smeta.read', 'smeta.write', 'fakt.read', 'fakt.write', 'narx.read', 'narx.write',
  'procurement.read', 'procurement.write', 'procurement.approve', 'supply.offer', 'supply.fulfil', 'logistics.read', 'logistics.dispatch', 'logistics.trip',
  'warehouse.read', 'warehouse.write', 'warehouse.receive', 'quality.read', 'quality.inspect', 'quality.decide', 'design.read', 'design.write', 'design.issue',
  'hr.read', 'hr.write', 'hr.pii.read', 'hr.pii.write', 'hr.tabel.write', 'payroll.read', 'payroll.write', 'machinery.read', 'machinery.write', 'machinery.log',
  'accounting.read', 'accounting.write', 'accounting.approve', 'self.work.read', 'self.work.write',
  'sales.read', 'sales.write', 'sales.price', 'sales.payment'];

function serverRuxsat(rol: string): string[] {
  if (['boss', 'admin', 'superadmin'].includes(rol)) return [...KATALOG, 'control.global.read'];
  const yangi: Record<string, string[]> = {
    omborchi: ['company.read', 'object.read', 'document.read', 'fakt.read', 'warehouse.read', 'warehouse.write', 'warehouse.receive', 'procurement.read', 'logistics.read'],
    usta: ['company.read', 'object.read', 'document.read', 'fakt.read', 'self.work.read', 'self.work.write'],
    brigadir: ['company.read', 'object.read', 'document.read', 'fakt.read', 'self.work.read', 'self.work.write', 'hr.tabel.write'],
    haydovchi: ['company.read', 'self.work.read', 'self.work.write', 'logistics.trip', 'machinery.log'],
    sotuvchi: ['company.read', 'project.read', 'object.read', 'sales.read', 'sales.write'],
  };
  if (yangi[rol]) return yangi[rol];
  const asos: Record<string, string[]> = {
    rahbar: ['company.read', 'control.company.read', 'project.read', 'object.read', 'document.read', 'financial.read'],
    bugalter: ['company.read', 'financial.read', 'financial.write', 'document.read'],
    pto: ['company.read', 'project.read', 'project.write', 'object.read', 'object.write', 'document.read', 'document.write', 'financial.read', 'financial.write'],
    prorab: ['company.read', 'project.read', 'project.write', 'object.read', 'object.write', 'document.read', 'document.write'],
    buyurtmachi: ['company.read', 'project.read', 'object.read', 'document.read', 'financial.read'],
  };
  let p = [...(asos[rol] ?? [])];
  if (p.includes('document.read')) p.push('f2.read', 'smeta.read', 'fakt.read', 'narx.read');
  if (['pto', 'prorab'].includes(rol)) p.push('f2.import', 'f2.prepare', 'f2.approve', 'f2.cancel', 'f2.correct');
  if (p.includes('object.write')) p.push('smeta.write', 'fakt.write', 'narx.write');
  p = p.concat(({
    rahbar: ['procurement.read', 'logistics.read', 'warehouse.read', 'quality.read', 'design.read', 'hr.read', 'payroll.read', 'machinery.read', 'sales.read'],
    bugalter: ['accounting.approve', 'payroll.read', 'payroll.write', 'procurement.read', 'warehouse.read', 'hr.read', 'sales.read', 'sales.payment'],
    pto: ['procurement.read', 'procurement.write', 'warehouse.read', 'logistics.read', 'quality.read', 'design.read', 'hr.read', 'machinery.read'],
    prorab: ['procurement.read', 'procurement.write', 'warehouse.read', 'warehouse.receive', 'logistics.read', 'quality.read', 'design.read', 'hr.read', 'hr.tabel.write', 'machinery.read'],
  } as Record<string, string[]>)[rol] ?? []);
  if (p.includes('financial.read')) p.push('accounting.read');
  if (p.includes('financial.write')) p.push('accounting.write');
  return [...new Set(p)];
}

const menyu = (rol: string, qosh: Partial<NavKontekst> = {}) =>
  menyuYollari(menyuQur({ superadmin: rol === 'superadmin', rol, permissions: serverRuxsat(rol), ...qosh }));
const a = (...s: string[]) => s.map((x) => `/admin/${x}`);
const bez = (xs: string[], ...yoq: string[]) => xs.filter((x) => !a(...yoq).includes(x));

/* ── Kutilgan menyular (tartib — sidebar tartibi) ── */
const OBYEKT = a('dashboard', 'obyektlar', 'loyiha', 'participants', 'mindmap');
const SMETA = a('smeta-studio', 'holat', 'smeta-narxlash', 'narx-dalil', 'narx-tekshiruv', 'nakrutka', 'narxlar', 'narx-manbalari', 'oferta');
const FAKT = a('fakt', 'm29');
const F2 = a('f2-tayyorlash', 'f2', 'f2-tarix', 'f2-reestr', 'nakopitelniy');
const HUJJAT = a('documents', 'hujjat-nazorat', 'aosr', 'storage', 'chizmalar', 'loyihachi', 'zakazchik', 'taqdimlar', 'murojaatlar', 'laboratoriya', 'hujjat-aylanish');
const MOLIYA = a('moliya', 'shartnoma-liniya', 'qarzdorlik', 'buxgalteriya', 'kontragentlar');
const TAMINOT = a('logistika', 'zayavka', 'tender', 'yuk-birjasi', 'yuk-chaqirish', 'haydovchi', 'erp', 'hr');
/* «Yetkazuvchi: bugun» — faqat yetkazuvchi roli (supply.*) va rahbariyat; ichki xodim (PTO, prorab) ko'rmaydi (egasi 2026-11-12). */
const TAMINOT_R = a('logistika', 'zayavka', 'tender', 'yuk-birjasi', 'yuk-chaqirish', 'haydovchi', 'yetkazuvchi', 'erp', 'hr');
const ISH = [...OBYEKT, ...SMETA, ...FAKT, ...F2, ...MOLIYA, ...HUJJAT, ...TAMINOT];
const ISH_R = [...OBYEKT, ...SMETA, ...FAKT, ...F2, ...MOLIYA, ...HUJJAT, ...TAMINOT_R];
/* Uy sotish (20261124000000): alohida domen — sales.* (PTO da yo'q). */
const SOTUV = a('sotuv');
/* Egasi 2026-10-27: «Integratsiyalar va audit» (tizim boshqaruv markazi) — faqat platforma superadmini. */
const KOMPANIYA_SA = a('kompaniya', 'system-control', 'tizim-sozlama', 'hujjat-dizayn', 'tokenlar', 'ai-agentlar', 'korzinka');
const KOMPANIYA = bez(KOMPANIYA_SA, 'system-control');
const SHAXSIY = a('ish-joylarim', 'topshiriqlar', 'mutaxassis', 'akkaunt', 'sozlamalar');
/* «Sayt xaritasi» menyudan butunlay olib tashlandi (superadmin uchun ham); sahifa faqat superadminga, Boshqaruv panelidan. */
const PLATFORMA = a('boshqaruv', 'fayl-boglash'); // «Sinov qobig'i» menyu bandi olib tashlandi (2026-11-11); /admin/test yo'li superadmin-only qoladi

const KUTILGAN: Record<string, string[]> = {
  superadmin: [...ISH_R, ...SOTUV, ...KOMPANIYA_SA, ...SHAXSIY, ...PLATFORMA],
  boss: [...ISH_R, ...SOTUV, ...KOMPANIYA, ...SHAXSIY],
  admin: [...ISH_R, ...SOTUV, ...KOMPANIYA, ...SHAXSIY],
  pto: [...ISH, ...SHAXSIY],
  bugalter: [...a('dashboard', 'obyektlar', 'holat', 'f2-tarix', 'f2-reestr', 'nakopitelniy', 'moliya', 'shartnoma-liniya', 'qarzdorlik', 'buxgalteriya', 'kontragentlar',
    'documents', 'hujjat-nazorat', 'storage', 'logistika', 'zayavka', 'tender', 'yuk-birjasi', 'yuk-chaqirish', 'haydovchi', 'erp', 'hr', 'sotuv'), ...SHAXSIY],
  prorab: [...bez(ISH, 'dashboard', 'moliya', 'buxgalteriya', 'qarzdorlik'), ...SHAXSIY],
  usta: [...a('fakt'), ...SHAXSIY],
  buyurtmachi: [...a('obyektlar', 'loyiha', 'participants', 'holat', 'f2-tarix', 'f2-reestr', 'nakopitelniy', 'shartnoma-liniya',
    'documents', 'hujjat-nazorat', 'storage', 'zakazchik', 'taqdimlar', 'murojaatlar', 'laboratoriya', 'hujjat-aylanish'), ...SHAXSIY],
  omborchi: [...a('m29', 'logistika', 'zayavka', 'tender', 'yuk-birjasi', 'yuk-chaqirish', 'haydovchi'), ...SHAXSIY],
  haydovchi: [...a('logistika', 'erp'), ...SHAXSIY],
  /* sotuvchi: project.read (S1 rol ta'rifi) tufayli loyiha/hujjat/kiruvchi bandlari ham ko'rinadi — rol ko'lami alohida qaror. */
  sotuvchi: [...a('loyiha', 'participants', 'documents', 'hujjat-nazorat', 'storage', 'zakazchik', 'taqdimlar', 'murojaatlar', 'laboratoriya', 'hujjat-aylanish', 'sotuv'), ...SHAXSIY],
};

describe('rol menyusi — snapshot (yagona navigatsiya reestri)', () => {
  for (const [rol, kutilgan] of Object.entries(KUTILGAN)) {
    it(`${rol}: kutilgan bandlar`, () => {
      expect(menyu(rol)).toEqual(kutilgan);
    });
  }

  it('rahbar: ish qatlami (F2 yozishsiz) + ⚙ Kompaniya, platformasiz', () => {
    expect(menyu('rahbar')).toEqual([...bez(ISH_R, 'f2-tayyorlash', 'f2'), ...SOTUV, ...KOMPANIYA, ...SHAXSIY]);
  });
});

describe('egasi qarori 2026-10-26: PTO qurilishdagi pulga aloqador HAMMA joyni ko‘radi', () => {
  /* «Uy sotish» — qurilish zanjiri emas (sales.* domeni, PTO roliga berilmagan): bu qoidaga kirmaydi. */
  const ishYollari = NAV_SAHIFALAR.filter((s) => s.guruh.qatlam === 'ish' && s.guruh.id !== 'sotuv' && s.yol !== '/admin/yetkazuvchi').map((s) => s.yol);

  it('ish qatlamining har bandi PTO menyusida (ekotizim katalogi)', () => {
    const m = menyu('pto');
    expect(ishYollari.filter((y) => !m.includes(y))).toEqual([]);
  });

  it('eski katalogda ham (prodda ekotizim migratsiyasi bo‘lmasa) — frontend ROLE_PERMISSIONS ko‘zgusi', () => {
    const eski = menyuYollari(menyuQur({ superadmin: false, rol: 'pto', permissions: ROLE_PERMISSIONS.pto }));
    const kapsiz = menyuYollari(menyuQur({ superadmin: false, rol: 'pto', permissions: null }));
    expect(ishYollari.filter((y) => !eski.includes(y))).toEqual([]);
    expect(kapsiz).toEqual(eski);
  });

  it('pulga oid asosiy bo‘limlar ro‘yxati qat‘iy (smeta, narx, fakt, F2, nakopitelniy, moliya, shartnoma, ta‘minot)', () => {
    const m = menyu('pto');
    for (const y of a('smeta-studio', 'holat', 'smeta-narxlash', 'nakrutka', 'narx-dalil', 'narxlar', 'narx-manbalari', 'oferta', 'fakt', 'm29',
      'f2-tayyorlash', 'f2', 'f2-tarix', 'f2-reestr', 'nakopitelniy', 'moliya', 'dashboard', 'shartnoma-liniya', 'kontragentlar', 'logistika', 'zayavka', 'erp', 'aosr')) {
      expect(m, y).toContain(y);
    }
  });

  it('PTO menyusida platforma va kompaniya boshqaruvi yo‘q (aralashmaydi)', () => {
    const m = menyu('pto');
    for (const y of [...PLATFORMA, ...KOMPANIYA]) expect(m).not.toContain(y);
  });
});

describe('Tizim xaritasi — faqat server ruxsati bilan (superadmin yoki berilgan grant)', () => {
  const TX = '/admin/tizim-xaritasi';
  it('server ruxsat bermagan — hech kimda yo‘q (boss, admin, hatto superadmin javobi kelmaguncha)', () => {
    for (const rol of ['boss', 'admin', 'rahbar', 'pto', 'superadmin']) expect(menyu(rol)).not.toContain(TX);
    expect(menyu('boss', { tizimXaritasi: false })).not.toContain(TX);
  });
  it('server ruxsat bergan — ko‘rinadi (grant olgan oddiy a’zo ham), Platforma guruhida', () => {
    expect(menyu('superadmin', { tizimXaritasi: true })).toContain(TX);
    const m = menyuQur({ superadmin: false, rol: 'pto', permissions: serverRuxsat('pto'), tizimXaritasi: true });
    expect(menyuYollari(m)).toContain(TX);
    expect(m.find((g) => g.bandlar.some((b) => b.yol === TX))?.id).toBe('platforma');
    // Grant faqat shu sahifani ochadi — boshqa platforma sahifalari superadminniki bo'lib qoladi.
    expect(menyuYollari(m)).not.toContain('/admin/boshqaruv');
  });
});

describe('qatlamlar', () => {
  it('Platforma — faqat platforma superadmini; boss/admin `control.global.read` bo‘lsa ham ko‘rmaydi', () => {
    for (const rol of ['boss', 'admin']) {
      const m = menyuQur({ superadmin: false, rol, permissions: serverRuxsat(rol) });
      expect(m.map((g) => g.qatlam)).not.toContain('platforma');
    }
    expect(menyuQur({ superadmin: true, rol: 'superadmin', permissions: null }).at(-1)?.id).toBe('platforma');
  });

  it('guruh tartibi: qurilish zanjiri → ⚙ Kompaniya → Shaxsiy → Platforma', () => {
    expect(NAV_GURUHLAR.map((g) => g.id)).toEqual(['obyekt', 'smeta', 'fakt', 'f2', 'moliya', 'hujjat', 'taminot', 'sotuv', 'kompaniya', 'shaxsiy', 'platforma']);
    expect(NAV_GURUHLAR.map((g) => g.qatlam)).toEqual(['ish', 'ish', 'ish', 'ish', 'ish', 'ish', 'ish', 'ish', 'kompaniya', 'shaxsiy', 'platforma']);
  });

  it('usta/haydovchi/omborchi/buyurtmachi «AI ishchilar», «Korzinka», «Sayt xaritasi», «Tokenlar» ni ko‘rmaydi', () => {
    for (const rol of ['usta', 'haydovchi', 'omborchi', 'buyurtmachi', 'brigadir']) {
      const m = menyu(rol);
      for (const y of a('ai-agentlar', 'korzinka', 'sayt-xaritasi', 'tokenlar', 'boshqaruv', 'test', 'nakrutka', 'narx-manbalari')) expect(m, `${rol} ${y}`).not.toContain(y);
    }
  });

  it('brigadir — usta kabi Fakt kiritishni ko‘radi', () => {
    expect(menyu('brigadir')).toEqual([...a('fakt', 'hr'), ...SHAXSIY]);
  });

  it('kompaniya tanlanmagan (rol yo‘q) — faqat shaxsiy bandlar', () => {
    expect(menyuYollari(menyuQur({ superadmin: false, rol: '', permissions: null }))).toEqual(SHAXSIY);
  });

  it('buxgalter: F2 yozish a‘zolik konstruktori orqali berilsa ham menyuda yo‘q', () => {
    const m = menyu('bugalter', { permissions: [...serverRuxsat('bugalter'), 'f2.import', 'f2.prepare'] });
    expect(m).not.toContain('/admin/f2');
    expect(m).not.toContain('/admin/f2-tayyorlash');
  });

  it('modul o‘chirilsa uning bandlari yo‘q, PTO yadrosi qoladi', () => {
    const modullar: Modul[] = [{ kod: 'module.narx', nom: 'n', izoh: null, holat: 'off', manba: 'company', versiya: 1 }];
    const m = menyu('pto', { modullar });
    expect(m).not.toContain('/admin/smeta-narxlash');
    expect(m).toContain('/admin/f2-tarix');
  });
});

describe('«standart yopiq» menyu ruxsati (route-permission.menyuRuxsati)', () => {
  it('reestrda yo‘q yo‘l — null (menyuda ko‘rinmaydi), document.read ga tushmaydi', () => {
    expect(menyuRuxsati('/admin/_demo/documents')).toBeNull();
    expect(menyuRuxsati('/admin/noma-lum')).toBeNull();
    expect(menyuRuxsati('/admin/test/portfel')).toBeNull(); // menyuda yo'q (superadmin-only yo'l, /admin/loyiha ga yo'naltiriladi)
    expect(menyuRuxsati('/admin/holat/12')).toEqual(['smeta.read']);
  });
});

describe('yagona manba — boshqa iste‘molchilar o‘zgarmagan', () => {
  it('har guruh, band va tab nomining rus/ingliz tarjimasi bor (t(m.nom) dinamik — qorovul ko‘rmaydi)', () => {
    const nomlar = new Set<string>();
    for (const g of NAV_GURUHLAR) { nomlar.add(g.nom); for (const b of g.bandlar) nomlar.add(b.nom); }
    for (const s of NAV_SAHIFALAR) nomlar.add(s.nom);
    expect([...nomlar].filter((n) => !(n in LUGAT_RU) || !(n in LUGAT_EN))).toEqual([]);
  });

  it('akkaunt menyusi uchun «Shaxsiy» qatlam ro‘yxati reestrdan', () => {
    expect(SHAXSIY_SAHIFALAR.map((s) => s.yol)).toEqual(SHAXSIY);
  });

  it('har yo‘l reestrda faqat bir marta', () => {
    const yollar = NAV_SAHIFALAR.map((s) => s.yol);
    expect(new Set(yollar).size).toBe(yollar.length);
  });

  it('har reestr yo‘li App.tsx da marshrut sifatida bor (menyu havolasi kirishga otmaydi)', () => {
    const segment = new Set<string>(GENERATED_SITE_MAP.appRouteSegments);
    expect(NAV_SAHIFALAR.map((s) => s.yol.replace('/admin/', '')).filter((y) => !segment.has(y))).toEqual([]);
    expect(menyuTekshir(NAV_SAHIFALAR.map((s) => s.yol))).toEqual([]);
  });

  it('tabli bandlarning sahifalari App.tsx dagi BolimTablari layout ichida', () => {
    const app = readFileSync(join(__dirname, '..', '..', 'App.tsx'), 'utf8');
    const bosh = app.indexOf('<Route element={<BolimTablari />}>');
    const blok = app.slice(bosh, app.indexOf('\n          </Route>', bosh));
    const tabli = NAV_SAHIFALAR.filter((s) => s.band.sahifalar.length > 1).map((s) => s.yol.replace('/admin/', ''));
    expect(tabli.filter((y) => !blok.includes(`path="${y}"`))).toEqual([]);
  });

  it('ROUTE_SCOPE (RuxsatGuard) avvalgi xarita bilan aynan bir xil', () => {
    expect(ROUTE_SCOPE).toEqual({
      '/': 'USER_SCOPED', '/admin/kompaniya': 'GLOBAL', '/admin/system-control': 'GLOBAL',
      '/admin/dashboard': 'COMPANY_SCOPED', '/admin/documents': 'COMPANY_SCOPED', '/admin/loyiha': 'COMPANY_SCOPED', '/admin/obyektlar': 'COMPANY_SCOPED',
      '/admin/f2-reestr': 'COMPANY_SCOPED', '/admin/mindmap': 'COMPANY_SCOPED', '/admin/sotuv': 'COMPANY_SCOPED', '/admin/test/portfel': 'COMPANY_SCOPED', '/admin/test/moliya': 'COMPANY_SCOPED',
      '/admin/test/logistika': 'COMPANY_SCOPED', '/admin/test/crm': 'COMPANY_SCOPED', '/admin/test/smeta': 'COMPANY_SCOPED', '/admin/test/zayavka': 'COMPANY_SCOPED',
      '/admin/test/erp': 'COMPANY_SCOPED', '/admin/test/xarita': 'COMPANY_SCOPED', '/admin/test/kontragent': 'COMPANY_SCOPED', '/admin/test/sozlama': 'COMPANY_SCOPED',
      '/admin/participants': 'PROJECT_SCOPED', '/admin/test/aosr': 'PROJECT_SCOPED',
      '/admin/holat': 'OBJECT_SCOPED', '/admin/f2': 'OBJECT_SCOPED', '/admin/f2-tayyorlash': 'OBJECT_SCOPED', '/admin/f2-tarix': 'OBJECT_SCOPED',
      '/admin/fakt': 'OBJECT_SCOPED', '/admin/nakopitelniy': 'OBJECT_SCOPED', '/admin/narxlar': 'OBJECT_SCOPED', '/admin/smeta-narxlash': 'OBJECT_SCOPED',
      '/admin/hujjat-nazorat': 'OBJECT_SCOPED', '/admin/storage': 'OBJECT_SCOPED', '/admin/test/obyektlar': 'OBJECT_SCOPED', '/admin/test/saqlash': 'OBJECT_SCOPED',
    });
  });

  it('MENYU_MODUL avvalgi xarita bilan aynan bir xil', () => {
    expect(MENYU_MODUL).toEqual({
      '/admin/aosr': 'module.aosr',
      '/admin/smeta-narxlash': 'module.narx', '/admin/oferta': 'module.narx', '/admin/narx-manbalari': 'module.narx',
      '/admin/narx-dalil': 'module.narx', '/admin/nakrutka': 'module.narx', '/admin/narxlar': 'module.narx',
      '/admin/loyiha': 'module.loyiha', '/admin/shartnoma-liniya': 'module.loyiha', '/admin/qarzdorlik': 'module.erp', '/admin/buxgalteriya': 'module.erp', '/admin/documents': 'module.loyiha',
      '/admin/hujjat-nazorat': 'module.loyiha', '/admin/participants': 'module.loyiha', '/admin/kontragentlar': 'module.loyiha',
      '/admin/zakazchik': 'module.loyiha', '/admin/taqdimlar': 'module.loyiha', '/admin/murojaatlar': 'module.loyiha', '/admin/laboratoriya': 'module.loyiha', '/admin/hujjat-aylanish': 'module.loyiha',
      '/admin/dashboard': 'module.erp', '/admin/moliya': 'module.erp', '/admin/logistika': 'module.erp', '/admin/zayavka': 'module.erp', '/admin/tender': 'module.erp', '/admin/yuk-birjasi': 'module.erp', '/admin/yuk-chaqirish': 'module.erp', '/admin/haydovchi': 'module.erp',
      '/admin/erp': 'module.erp', '/admin/hr': 'module.erp', '/admin/mindmap': 'module.erp',
    });
  });
});

describe('egasi 2026-10-27: tizimga oid hamma narsa — faqat platforma superadmini (yagona mexanizm)', () => {
  const TIZIM = [...PLATFORMA, ...a('system-control', 'sayt-xaritasi', '_demo/documents', '_demo/system-control', 'test/tizim', 'test/portfel')];

  it('«Sayt xaritasi» hech kimning menyusida yo‘q (superadmin ham), reestrda ham yo‘q', () => {
    for (const rol of Object.keys(KUTILGAN)) expect(menyu(rol), rol).not.toContain('/admin/sayt-xaritasi');
    expect(NAV_SAHIFALAR.map((s) => s.yol)).not.toContain('/admin/sayt-xaritasi');
    expect(GENERATED_SITE_MAP.menuRoutes).not.toContain('/admin/sayt-xaritasi');
  });

  it('kompaniya bossi/admini/rahbari: tizim bandlari menyuda yo‘q, `control.global.read` bo‘lsa ham', () => {
    for (const rol of ['boss', 'admin', 'rahbar', 'pto', 'bugalter']) {
      const m = menyu(rol, { permissions: [...serverRuxsat(rol), 'control.global.read', 'control.global.write'] });
      expect(m.filter((y) => faqatSuperadminYolmi(y)), rol).toEqual([]);
      for (const y of TIZIM) expect(m, `${rol} ${y}`).not.toContain(y);
    }
  });

  it('marshrut qo‘riqchisi o‘qiydigan funksiya: tizim yo‘llari (ichki yo‘l va so‘rov satri bilan) — superadmin; biznes yo‘llari — yo‘q', () => {
    for (const y of [...TIZIM, '/admin/system-control?tab=x', '/admin/boshqaruv/', '/admin/sayt-xaritasi#a']) expect(faqatSuperadminYolmi(y), y).toBe(true);
    for (const y of a('kompaniya', 'tokenlar', 'ai-agentlar', 'korzinka', 'tizim-sozlama', 'hujjat-dizayn', 'sozlamalar', 'holat/12', 'test/kontragent', 'testlar'))
      expect(faqatSuperadminYolmi(y), y).toBe(false);
  });

  it('tizim xaritasi umumiy «faqat superadmin» qoidasidan istisno — ruxsat berilgan odam ham ochadi; menyuda faqat server ruxsati bilan', () => {
    expect(faqatSuperadminYolmi('/admin/tizim-xaritasi')).toBe(false);
    const g = NAV_GURUHLAR.find((x) => x.qatlam === 'platforma')!;
    const ctx = { rol: 'pto', superadmin: false, modullar: null } as unknown as NavKontekst;
    expect(sahifaKorinadi(g, '/admin/tizim-xaritasi', { ...ctx, tizimXaritasi: true })).toBe(true);
    expect(sahifaKorinadi(g, '/admin/tizim-xaritasi', { ...ctx, tizimXaritasi: false })).toBe(false);
    expect(sahifaKorinadi(g, '/admin/boshqaruv', { ...ctx, tizimXaritasi: true })).toBe(false);
  });

  it('superadmin hamon hammasini ko‘radi (tizim boshqaruv markazi, platforma bandlari)', () => {
    const m = menyu('superadmin');
    for (const y of [...PLATFORMA, '/admin/system-control']) expect(m).toContain(y);
  });

  it('Sozlamalar markazi: tizim yo‘lidagi yoki tizimga oid sozlama kompaniya bossiga ko‘rinmaydi, superadminga ko‘rinadi', () => {
    const boss = sozlamaFiltr({ superadmin: false, permissions: [...serverRuxsat('boss'), 'control.global.read'] });
    expect(boss.filter((s) => s.qatlam === 'tizim')).toEqual([]);
    expect(boss.filter((s) => faqatSuperadminYolmi(s.yol))).toEqual([]);
    for (const id of ['kompaniya.tizim_nazorat', 'kompaniya.integratsiya', 'kompaniya.gas_sinx', 'tizim.ai_modellar'])
      expect(boss.map((s) => s.id)).not.toContain(id);
    // Egasi 2026-10-27 (2-javob): AI model tanlovi va model siyosati — kompaniya qatlamida (katalog/ustama — Tizimda).
    expect(boss.map((s) => s.id)).toEqual(expect.arrayContaining(['kompaniya.tokenlar', 'kompaniya.ai_yoqish', 'kompaniya.audit', 'kompaniya.korzinka', 'kompaniya.ai_modellar', 'kompaniya.ai_model_siyosati']));
    expect(sozlamaFiltr({ superadmin: true, permissions: [] })).toHaveLength(SOZLAMALAR.length);
  });
});
