import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AMAL_ILOVA, ILOVALAR, ILOVA_KODLAR, ILOVA_MODUL_KODLARI, SORO_ILOVA, amalIlovasi, ilovaModuli, ilovaYoqiq, soroIlovasi } from './ilovalar';
import { NAV_SAHIFALAR } from '../nav/navReestr';
import { ilovalarRoyxati, menyuQur, menyuYollari, type NavKontekst } from '../nav/navFiltr';
import { menyuModulYoqilgan } from '../modullar';
import type { Modul } from '../../api/t2-modul';

const oqi = (yol: string) => readFileSync(new URL(yol, import.meta.url), 'utf8');
const m = (kod: string, holat: 'on' | 'off'): Modul => ({ kod, nom: kod, izoh: null, holat, manba: 'default', versiya: 1 });
const BOSS = ['project.read', 'project.write', 'object.read', 'object.write', 'smeta.read', 'smeta.write', 'narx.write', 'fakt.read', 'fakt.write', 'f2.read', 'f2.import', 'f2.prepare',
  'financial.read', 'financial.write', 'document.read', 'document.write', 'procurement.read', 'warehouse.read', 'warehouse.write', 'hr.read', 'machinery.read', 'quality.read',
  'control.company.read', 'logistics.read', 'sales.read', 'supply.offer', 'company.member.manage', 'company.profile.update'];
const k = (extra: Partial<NavKontekst> = {}): NavKontekst => ({ superadmin: false, rol: 'boss', permissions: BOSS, ...extra });

describe('ilovalar katalogi', () => {
  it('har menyu sahifasi aniq bitta ma\'lum ilovaga biriktirilgan', () => {
    for (const s of NAV_SAHIFALAR) expect(ILOVA_KODLAR, s.yol).toContain(s.ilova);
  });
  it('ilovaning modul kodlari migratsiya 20261130000000 bilan bir xil (7 ta, sukut on)', () => {
    const sql = oqi('../../../../supabase/migrations/20261130000000_t2_ilova_modullar_v1.sql');
    const migr = [...sql.matchAll(/\('(module\.[a-z_]+)',/g)].map((x) => x[1]).sort();
    expect(migr).toEqual([...ILOVA_MODUL_KODLARI].sort());
    expect(migr).toHaveLength(7);
    expect(sql.match(/'module', 'on'/g)).toHaveLength(7);
    expect(ILOVALAR.filter((i) => i.modul === null).map((i) => i.kod)).toEqual(expect.arrayContaining(['pto', 'ff', 'yadro', 'platforma']));
  });
  it('PTO yadrosi (pto, ff) va yadro modulsiz — o\'chirib bo\'lmaydi', () => {
    for (const kod of ['pto', 'ff', 'yadro', 'platforma'] as const) expect(ilovaModuli(kod)).toBeNull();
    expect(ilovaYoqiq('ff', [m('module.moliya', 'off')])).toBe(true);
  });
});

describe('gateway xaritasi', () => {
  const yoz = oqi('../../../functions/api/sb-yoz.ts');
  const oqish = oqi('../../../functions/api/sb.ts');
  const amallar = new Set([...yoz.matchAll(/^\s*([A-Za-z0-9_]+):\s*\{\s*rpc:/gm)].map((x) => x[1]));
  it('AMAL_ILOVA dagi har amal sb-yoz AMALLAR da mavjud', () => {
    for (const a of Object.keys(AMAL_ILOVA)) expect(amallar.has(a), a).toBe(true);
  });
  it('SORO_ILOVA dagi har so\'rov sb.ts OQISH_RPC da mavjud', () => {
    for (const s of Object.keys(SORO_ILOVA)) expect(oqish.includes(s + ':'), s).toBe(true);
  });
  it('prefiks qoidalari: sotuv_*, tender_*, transport_* — barcha mavjud amallar xaritalangan', () => {
    for (const a of amallar) {
      if (a.startsWith('sotuv_')) expect(amalIlovasi(a), a).toBe('sotuv');
      if (a.startsWith('tender_')) expect(amalIlovasi(a), a).toBe('xarid');
      if (a.startsWith('transport_')) expect(amalIlovasi(a), a).toBe('logistika');
    }
    expect(soroIlovasi('sotuv_panel_v1')).toBe('sotuv');
    expect(soroIlovasi('tender_royxat_v1')).toBe('xarid');
    expect(soroIlovasi('transport_ol_v1')).toBe('logistika');
    expect(soroIlovasi('qarzdorlik_royxat_v1')).toBe('moliya');
  });
  it('YADRO amallari HECH QACHON ilovaga bog\'lanmaydi (token sotib olish, F2, fakt, smeta, shartnoma, hujjat biriktirish)', () => {
    for (const a of ['tolov_sorov_yarat_v1', 'token_sarfla_v1', 'token_toldir_v1', 'obuna_belgila_v1', 'hujjat_yoz', 'erp_amal', 'shartnoma_saqla', 'shartnoma_oylik_paket_saqla_v1',
      'akt_tasdiqlash', 'akt_yarat_v2', 'f2_reestr_yoz_v1', 'forma3_f2_bog_v1', 'fakt_yoz_v2', 'qator_tahrir', 'm29_bajar_v1', 'smeta_narxla_res_v3', 'obyekt_yarat', 'azolik_qosh']) {
      expect(amalIlovasi(a), a).toBeNull();
    }
    expect(soroIlovasi('modul_holat_v1')).toBeNull();
    expect(soroIlovasi('token_holat_v1')).toBeNull();
    expect(amalIlovasi(undefined)).toBeNull();
  });
});

describe('menyu: ilova va ishga tushirgich', () => {
  it('boss: ko\'rinadigan ilovalar tartib bilan, har birining birinchi sahifasi bor', () => {
    const l = ilovalarRoyxati(k());
    expect(l.map((i) => i.kod)).toEqual(['pto', 'ff', 'moliya', 'sotuv', 'xarid', 'hr', 'logistika', 'hujjat']);
    for (const i of l) expect(menyuYollari(menyuQur(k())), i.kod).toContain(i.yol);
  });
  it('ilova menyusi faqat shu ilova sahifalarini beradi, «Barcha bo\'limlar» (hammasi) — hammasini', () => {
    const faqatMoliya = menyuYollari(menyuQur(k({ ilova: 'moliya' })));
    expect(faqatMoliya.length).toBeGreaterThan(0);
    for (const y of faqatMoliya) expect(NAV_SAHIFALAR.find((s) => s.yol === y)?.ilova, y).toBe('moliya');
    expect(faqatMoliya).not.toContain('/admin/fakt');
    const hammasi = menyuYollari(menyuQur(k({ ilova: 'hammasi' })));
    expect(hammasi).toEqual(menyuYollari(menyuQur(k())));
    expect(hammasi).toEqual(expect.arrayContaining(['/admin/fakt', '/admin/qarzdorlik', '/admin/sotuv']));
  });
  it('o\'chirilgan ilova menyuda va ishga tushirgichda yo\'q; PTO yadrosi qoladi', () => {
    const modullar = [m('module.moliya', 'off'), m('module.sotuv', 'off')];
    const l = ilovalarRoyxati(k({ modullar })).map((i) => i.kod);
    expect(l).not.toContain('moliya'); expect(l).not.toContain('sotuv');
    expect(l).toEqual(expect.arrayContaining(['pto', 'ff']));
    const yollar = menyuYollari(menyuQur(k({ modullar })));
    expect(yollar).not.toContain('/admin/qarzdorlik'); expect(yollar).not.toContain('/admin/sotuv');
    expect(yollar).toContain('/admin/fakt');
    expect(menyuModulYoqilgan('/admin/sotuv', modullar)).toBe(false);
    expect(menyuModulYoqilgan('/admin/holat/12', modullar)).toBe(true);
  });
  it('usta (faqat fakt): bitta ilova — ishga tushirgichda ff', () => {
    const usta = k({ rol: 'usta', permissions: ['company.read', 'object.read', 'document.read', 'fakt.read', 'self.work.read', 'self.work.write'] });
    expect(ilovalarRoyxati(usta).map((i) => i.kod)).toEqual(['ff']);
  });
  it('holat noma\'lum (modullar kelmagan) — hech narsa yashirilmaydi', () => {
    expect(ilovalarRoyxati(k({ modullar: undefined })).length).toBe(8);
  });
});