import { describe, it, expect } from 'vitest';
import { SAHIFALAR, NAV_GURUH_META } from './sahifa';
import { ISH_JOYLARI } from './ishJoyi';
import { ILOVA_KODLAR } from '../ilova/ilovalar';
import { PERMISSIONS } from '../company-authorization/effective-authorization';

/** Bugungi menyu ruxsatlari orasida PERMISSIONS da yo'q kodlar bo'lsa, shu yerga sababi bilan yoziladi (hozircha bo'sh bo'lishi kerak). */
const MA_LUM_PERMISSIONS_TASHQARI: readonly string[] = [];

describe('reestr qo\'riqchi (1-qadam)', () => {
  it('kalit yagona', () => {
    const k = SAHIFALAR.map((s) => s.kalit);
    expect(k.filter((x, i) => k.indexOf(x) !== i)).toEqual([]);
  });
  it('yol yagona va /admin bilan boshlanadi', () => {
    const y = SAHIFALAR.map((s) => s.yol);
    expect(y.filter((x, i) => y.indexOf(x) !== i)).toEqual([]);
    expect(y.filter((x) => !x.startsWith('/admin/'))).toEqual([]);
  });
  it('tartib yagona', () => {
    const t = SAHIFALAR.map((s) => s.tartib);
    expect(new Set(t).size).toBe(t.length);
  });
  it('ruxsat qiymatlari PERMISSIONS da bor', () => {
    const ruxsat = new Set<string>(PERMISSIONS);
    const yoq = SAHIFALAR.flatMap((s) => s.ruxsat.flatMap((r) => r.split('+')))
      .filter((p) => !ruxsat.has(p) && !MA_LUM_PERMISSIONS_TASHQARI.includes(p));
    expect([...new Set(yoq)]).toEqual([]);
  });
  it('ishJoyi, ilova va navGuruh/navBand to\'g\'ri', () => {
    const guruhlar = new Map(NAV_GURUH_META.map((g) => [g.id, new Set(g.bandlar.map((b) => b.nom))]));
    for (const s of SAHIFALAR) {
      expect(ISH_JOYLARI).toContain(s.ishJoyi);
      expect(ILOVA_KODLAR).toContain(s.ilova);
      expect(guruhlar.get(s.navGuruh)?.has(s.navBand), s.yol).toBe(true);
    }
  });
  it('har "tayyor" sahifada >=1 sinonim', () => {
    expect(SAHIFALAR.filter((s) => s.holat === 'tayyor' && s.sinonimlar.length < 1).map((s) => s.yol)).toEqual([]);
  });
  it('"texnik" sahifa faqat superadmin yoki platforma qatlamida', () => {
    const plat = new Set(NAV_GURUH_META.filter((g) => g.qatlam === 'platforma').map((g) => g.id));
    expect(SAHIFALAR.filter((s) => s.holat === 'texnik' && !s.faqatSuperadmin && !plat.has(s.navGuruh)).map((s) => s.yol)).toEqual([]);
  });

  it.todo('har /admin/* route (App.tsx) reestrdan keladi (5-qadam)');
  it.todo('"tayyor" sahifada >=3 sinonim (uz+ru) va aiNiyat');
  it.todo('har sb-yoz amali va /api/sb soro uchun Amal bor (3-qadam)');
  it.todo('AI yozish amali dryRun bilan');
  it.todo('har TugunTur sahifa va yaratish amaliga ega');
  it.todo('`modul` maydoni boshqa joyda yo\'q (lib/modullar.ts MENYU_MODUL reestrdan)');
  it.todo('rol x sahifa matritsa snapshoti');
});
