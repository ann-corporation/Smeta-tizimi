import { describe, it, expect } from 'vitest';
import { SAHIFALAR } from './sahifa';
import { AMALLAR } from './amal';
import { ISH_JOYLARI, ASOSIY_ISH_JOYLARI, ISH_JOYI_META } from './ishJoyi';
import { ROL_PROFILLARI, UMUMIY_PROFIL, rolTugmalari } from './tomonProfil';
import { PERMISSIONS } from '../company-authorization/effective-authorization';
import { NAV_SAHIFALAR, navSahifa } from '../nav/navReestr';
import { ISH_JOYI_NAV, ishJoyiMenyu } from '../nav/ishJoyiMenyu';
import { ruxsatMatritsa } from '../nav/ruxsatMatritsa';
import { menyuRuxsati } from '../company-authorization/route-permission';

const korinadigan = (rol: string, superadmin = false) => ishJoyiMenyu({ superadmin, rol, permissions: null, tizimXaritasi: superadmin, ilova: 'hammasi' });
const yollar = (rol: string, superadmin = false) => korinadigan(rol, superadmin).flatMap((b) => [...b.bandlar, ...b.yana]).flatMap((b) => (b.tablar ? b.tablar.map((x) => x.yol) : [b.yol]));

describe('ish joylari menyusi (reestrdan hosila)', () => {
  it('YANGI SAHIFA ISH JOYISIZ QO‘SHILMAYDI: har sahifa ish joyiga ega va yangi menyuda bor', () => {
    const menyudagi = new Set(ISH_JOYI_NAV.flatMap((g) => g.bandlar.flatMap((b) => b.sahifalar.map((s) => s.yol))));
    for (const s of SAHIFALAR) {
      expect(ISH_JOYLARI, `${s.yol}: ishJoyi`).toContain(s.ishJoyi);
      expect(menyudagi.has(s.yol), `${s.yol}: ish joyi menyusida yo'q`).toBe(true);
    }
    expect(menyudagi.size).toBe(SAHIFALAR.length);
  });
  it('7 asosiy ish joyining har birida kamida bitta sahifa bor; yuqori daraja soni o‘smaydi', () => {
    for (const j of ASOSIY_ISH_JOYLARI) expect(SAHIFALAR.some((s) => s.ishJoyi === j), j).toBe(true);
    expect(ISH_JOYI_NAV.length).toBeLessThanOrEqual(ISH_JOYLARI.length);
  });
  it('har ish joyi meta ma‘lumotiga ega', () => {
    for (const j of ISH_JOYLARI) expect(ISH_JOYI_META[j].nom).toBeTruthy();
  });
  it('RUXSAT BIR MARTA E‘LON QILINADI: reestr = navReestr = menyuRuxsati', () => {
    expect(NAV_SAHIFALAR.length).toBe(SAHIFALAR.length);
    for (const s of SAHIFALAR) {
      expect(Array.isArray(s.ruxsat), s.yol).toBe(true);
      expect(navSahifa(s.yol)?.ruxsat, s.yol).toEqual(s.ruxsat);
      expect(menyuRuxsati(s.yol), s.yol).toEqual(s.ruxsat);
    }
  });
  it('eskiYollar boshqa sahifa yoli bilan to‘qnashmaydi va takrorlanmaydi', () => {
    const hamma = SAHIFALAR.map((s) => s.yol);
    const eski = SAHIFALAR.flatMap((s) => s.eskiYollar ?? []);
    expect(new Set(eski).size).toBe(eski.length);
    expect(eski.filter((y) => hamma.includes(y))).toEqual([]);
  });
  it('rol x sahifa matritsasi barcha sahifalarni qamraydi', () => {
    const m = ruxsatMatritsa();
    expect(m.qatorlar.length).toBe(SAHIFALAR.length);
    expect(m.rollar).toContain('superadmin');
    for (const q of m.qatorlar) expect(Object.keys(q.korinadi).sort()).toEqual([...m.rollar].sort());
  });
  it('rol x sahifa matritsa snapshoti (ruxsat o‘zgarsa diff ko‘rinadi, egasi tasdiqlaydi)', () => {
    const m = ruxsatMatritsa();
    const jadval = Object.fromEntries(m.rollar.map((r) => [r, m.qatorlar.filter((q) => q.korinadi[r]).map((q) => q.kalit)]));
    expect(jadval).toMatchSnapshot();
  });
  it('rollar o‘z ish joylarini ko‘radi, begona joyni emas', () => {
    const pto = korinadigan('pto').map((b) => b.id);
    expect(pto).toContain('obyekt');
    expect(pto).not.toContain('platforma');
    const buyurtmachi = korinadigan('buyurtmachi').map((b) => b.id);
    expect(buyurtmachi).not.toContain('platforma');
    expect(yollar('buyurtmachi')).not.toContain('/admin/ruxsatlar-jadvali');
    expect(korinadigan('', true).map((b) => b.id)).toContain('platforma');
    expect(yollar('boss')).toContain('/admin/ruxsatlar-jadvali');
  });
  it('«Yana…»: butun band yana bo‘lsa asosiy ro‘yxatda emas', () => {
    const boss = korinadigan('boss');
    const asosiy = boss.flatMap((b) => b.bandlar).flatMap((b) => (b.tablar ? b.tablar.map((x) => x.yol) : [b.yol]));
    const yana = boss.flatMap((b) => b.yana).flatMap((b) => (b.tablar ? b.tablar.map((x) => x.yol) : [b.yol]));
    expect(yana.filter((y) => asosiy.includes(y))).toEqual([]);
    expect(yana).toContain('/admin/korzinka');
  });
  it('hech bir sahifa yo‘qolmaydi: boss eski va yangi menyuda bir xil yo‘llarni ko‘radi', () => {
    const eski = new Set(NAV_SAHIFALAR.map((s) => s.yol));
    const yangi = new Set(yollar('boss', true));
    for (const y of yangi) expect(eski.has(y), y).toBe(true);
  });
});

describe('rol profili (Bugun)', () => {
  it('profil kalitlari mavjud sahifalar va 3–6 tugma', () => {
    const kalitlar = new Set(SAHIFALAR.map((s) => s.kalit));
    for (const p of [...ROL_PROFILLARI, { rol: 'umumiy', tugmalar: UMUMIY_PROFIL }]) {
      expect(p.tugmalar.length, p.rol).toBeGreaterThanOrEqual(3);
      expect(p.tugmalar.length, p.rol).toBeLessThanOrEqual(6);
      for (const k of p.tugmalar) expect(kalitlar.has(k), `${p.rol}: ${k}`).toBe(true);
    }
    expect(rolTugmalari('yoq-rol')).toBe(UMUMIY_PROFIL);
  });
  it('rol takrorlanmaydi', () => {
    const r = ROL_PROFILLARI.map((p) => p.rol);
    expect(new Set(r).size).toBe(r.length);
  });
});

describe('amal reestri', () => {
  it('kalit yagona; capability PERMISSIONS da; sahifa va yo‘l mavjud', () => {
    const k = AMALLAR.map((a) => a.kalit);
    expect(new Set(k).size).toBe(k.length);
    const ruxsat = new Set<string>(PERMISSIONS);
    for (const a of AMALLAR) {
      expect(ruxsat.has(a.capability), `${a.kalit}: ${a.capability}`).toBe(true);
      expect(SAHIFALAR.some((x) => x.kalit === a.sahifa), `${a.kalit}: sahifa`).toBe(true);
      expect(SAHIFALAR.some((x) => x.yol === a.yol), `${a.kalit}: yol`).toBe(true);
      expect(a.nom, a.kalit).toBeTruthy();
    }
  });
});