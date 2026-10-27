import { describe, expect, it } from 'vitest';
import type { MindmapGraf } from '../api/t2-mindmap';
import { JAMOA_ID, bosharflar, daraxtQur, fokusYoli, jamoaGuruhi, klaviaturaQadam, mindmapJoyla, qidiruvMoslari } from './mindmap-korinish';
import { mindmapMasulRuxsati } from './mindmap-ruxsat';

const odam = (id: number, nom: string, rol: string, rollar?: string[]) => ({ id: 'foydalanuvchi:' + id, tur: 'foydalanuvchi' as const, nom, x: null, y: null, meta: { rol, rollar: rollar ?? [rol], login: nom.toLowerCase().replace(/\s/g, '') } });

function graf(extra?: Partial<MindmapGraf>): MindmapGraf {
  return {
    tugunlar: [
      { id: 'kompaniya:1', tur: 'kompaniya', nom: 'Bosh kompaniya', meta: null, x: null, y: null },
      { id: 'loyiha:7', tur: 'loyiha', nom: 'Park', meta: { versiya: 1 }, x: null, y: null },
      { id: 'obyekt:5', tur: 'obyekt', nom: 'Amfiteatr', x: null, y: null, meta: { versiya: 1, loyiha_id: 7, smeta: 1000, fakt: 600, f2: 400, belgi: [] } },
      { id: 'obyekt:6', tur: 'obyekt', nom: 'Sport zal', x: null, y: null, meta: { versiya: 1, loyiha_id: 7, smeta: 500, fakt: 0, f2: 0, belgi: [] } },
      odam(11, 'Anvar Ahatqulov', 'boss'),
      odam(12, 'Bekzod Karimov', 'pto'),
      odam(13, 'Dilshod Yusupov', 'prorab'),
      odam(14, 'Gulnora Aliyeva', 'bugalter'),
      odam(15, 'Eldor Rasulov', 'usta'),
    ],
    bogichlar: [
      { manba: 'kompaniya:1', maqsad: 'loyiha:7', tur: 'loyiha_kompaniya', uzsa_boladi: false },
      { manba: 'loyiha:7', maqsad: 'obyekt:5', tur: 'obyekt_loyiha', uzsa_boladi: true },
      { manba: 'loyiha:7', maqsad: 'obyekt:6', tur: 'obyekt_loyiha', uzsa_boladi: true },
      ...[11, 12, 13, 14, 15].map((i) => ({ manba: 'kompaniya:1', maqsad: 'foydalanuvchi:' + i, tur: 'azo_kompaniya' as const, uzsa_boladi: false })),
      { manba: 'foydalanuvchi:13', maqsad: 'obyekt:5', tur: 'masul_obyekt', uzsa_boladi: true, ruxsat: 'manage', rol: 'prorab' },
      { manba: 'foydalanuvchi:12', maqsad: 'obyekt:5', tur: 'masul_obyekt', uzsa_boladi: true, ruxsat: 'read', rol: 'pto' },
      { manba: 'foydalanuvchi:13', maqsad: 'obyekt:6', tur: 'masul_obyekt', uzsa_boladi: true, ruxsat: 'write', rol: 'prorab' },
      { manba: 'foydalanuvchi:12', maqsad: 'loyiha:7', tur: 'masul_loyiha', uzsa_boladi: true, ruxsat: 'write', rol: 'pto' },
    ],
    korinish: { toliq: true, pul: true, rol: 'boss', yashirin_obyekt: 0 },
    ...extra,
  };
}

describe('Jamoa: odamlar daraxti', () => {
  const d = daraxtQur(graf());
  it('rollar bo‘yicha guruhlanadi: Rahbariyat / PTO / Prorab / Bugalter / Boshqa (bo‘sh guruhlar yo‘q)', () => {
    expect(d.jamoa!.guruhlar.map((g) => g.kalit)).toEqual(['rahbariyat', 'pto', 'prorab', 'bugalter', 'boshqa']);
    expect(d.jamoa!.guruhlar.find((g) => g.kalit === 'boshqa')!.odamlar).toEqual(['foydalanuvchi:15']);
    expect(jamoaGuruhi('admin')).toBe('rahbariyat');
    expect(jamoaGuruhi('haydovchi')).toBe('boshqa');
    expect(jamoaGuruhi(null)).toBe('boshqa');
  });
  it('har odamda bosh harflar va mas‘ul obyektlar soni; Jamoa tuguni loyihalar qatoriga aralashmaydi', () => {
    const p = d.tugunlar.get('foydalanuvchi:13')!;
    expect(p.odam!.initsial).toBe('DY');
    expect(p.odam!.obyektlar.map((o) => o.id)).toEqual(['obyekt:5', 'obyekt:6']);
    expect(d.tugunlar.get('foydalanuvchi:12')!.odam!.loyihalar).toEqual([{ id: 'loyiha:7', ruxsat: 'write' }]);
    expect(d.tugunlar.get(d.ildiz)!.bolalar).toEqual(['loyiha:7']);
    expect(d.tugunlar.get(JAMOA_ID)!.ota).toBe(d.ildiz);
    expect(d.tartib).toContain(JAMOA_ID);
    expect(bosharflar('')).toBe('?');
  });
  it('obyektda mas‘ullar ruxsat tartibida (manage → write → read)', () => {
    expect(d.tugunlar.get('obyekt:5')!.masullar.map((m) => [m.nom, m.ruxsat])).toEqual([['Dilshod Yusupov', 'manage'], ['Bekzod Karimov', 'read']]);
    expect(d.tugunlar.get('loyiha:7')!.masullar.map((m) => m.nom)).toEqual(['Bekzod Karimov']);
    expect(d.tugunlar.get('obyekt:6')!.masullar).toHaveLength(1);
  });
  it('odamlarsiz (eski RPC) graf — jamoa null, hisob o‘zgarmaydi', () => {
    const eski = daraxtQur({ ...graf(), tugunlar: graf().tugunlar.filter((t) => t.tur !== 'foydalanuvchi'), bogichlar: graf().bogichlar.filter((b) => b.tur !== 'azo_kompaniya' && !b.tur.startsWith('masul_')), korinish: undefined });
    expect(eski.jamoa).toBeNull();
    expect(eski.pulYoq).toBe(false);
    expect(eski.doiraCheklangan).toBe(false);
    expect(eski.tugunlar.get('obyekt:5')!.masullar).toEqual([]);
  });
  it('Jamoa kompaniya ostida pastda joylashadi, odamlar qator-qator, guruh yorliqlari bilan', () => {
    const j = mindmapJoyla(d);
    const ildiz = j.joylar.get(d.ildiz)!, jamoa = j.joylar.get(JAMOA_ID)!;
    expect(jamoa.y).toBeGreaterThan(ildiz.y + ildiz.h / 2);
    expect(j.joylar.get('foydalanuvchi:11')!.y).toBeGreaterThan(jamoa.y);
    expect(j.yorliqlar.map((y) => y.kalit)).toEqual(['rahbariyat', 'pto', 'prorab', 'bugalter', 'boshqa']);
    // Yig‘ilganda odamlar yashiriladi, Jamoa tuguni qoladi.
    const y = mindmapJoyla(d, new Set([JAMOA_ID]));
    expect(y.joylar.has(JAMOA_ID)).toBe(true);
    expect(y.joylar.has('foydalanuvchi:11')).toBe(false);
  });
  it('fokus: obyekt tanlansa mas‘ullar yoritiladi; odam tanlansa uning obyektlari', () => {
    expect(fokusYoli(d, 'obyekt:5').has('foydalanuvchi:13')).toBe(true);
    expect(fokusYoli(d, 'obyekt:5').has('foydalanuvchi:14')).toBe(false);
    expect(fokusYoli(d, 'foydalanuvchi:13').has('obyekt:6')).toBe(true);
  });
  it('klaviatura: kompaniya ↓ jamoa ↓ odam, odamlar orasida ← →', () => {
    const j = mindmapJoyla(d);
    expect(klaviaturaQadam(d, j, d.ildiz, 'ArrowDown')).toBe(JAMOA_ID);
    expect(klaviaturaQadam(d, j, JAMOA_ID, 'ArrowDown')).toBe('foydalanuvchi:11');
    expect(klaviaturaQadam(d, j, 'foydalanuvchi:11', 'ArrowRight')).toBe('foydalanuvchi:12');
    expect(klaviaturaQadam(d, j, 'foydalanuvchi:12', 'ArrowUp')).toBe(JAMOA_ID);
  });
  it('qidiruv odam ismini topadi', () => {
    const q = qidiruvMoslari(d, 'dilshod');
    expect(q!.mos.has('foydalanuvchi:13')).toBe(true);
    expect(q!.korinadi.has(JAMOA_ID)).toBe(true);
  });
});

describe('Ko‘rinish doirasi va pul', () => {
  it('toliq=false → doiraCheklangan; pul=false → pulYoq (summalar null, 0 emas)', () => {
    const g = graf({ korinish: { toliq: false, pul: false, rol: 'prorab', yashirin_obyekt: 3 } });
    for (const t of g.tugunlar) if (t.tur === 'obyekt' && t.meta) for (const k of ['smeta', 'fakt', 'f2']) delete (t.meta as Record<string, unknown>)[k];
    delete g.jamlanma;
    const d = daraxtQur(g);
    expect(d.doiraCheklangan).toBe(true);
    expect(d.pulYoq).toBe(true);
    const o = d.tugunlar.get('obyekt:5')!;
    expect(o.smeta).toBeNull();
    expect(o.fakt).toBeNull();
    expect(o.f2).toBeNull();
    expect(d.tugunlar.get(d.ildiz)!.smeta).toBeNull();
  });
});

describe('mindmapMasulRuxsati', () => {
  const joriy = (permissions?: string[], rol = 'pto') => ({ id: 17, rol, permissions });
  it('company.member.manage yoki control.company.write bo‘lsa — mumkin', () => {
    expect(mindmapMasulRuxsati({ joriy: joriy(['company.member.manage']), kompaniyaId: 17 })).toBe(true);
    expect(mindmapMasulRuxsati({ joriy: joriy(['control.company.write']) })).toBe(true);
  });
  it('ruxsat yo‘q, ruxsatlar noma’lum, rahbar, boshqa kompaniya — mumkin emas', () => {
    expect(mindmapMasulRuxsati({ joriy: joriy(['document.write']) })).toBe(false);
    expect(mindmapMasulRuxsati({ joriy: joriy(undefined) })).toBe(false);
    expect(mindmapMasulRuxsati({ joriy: joriy(['company.member.manage'], 'rahbar') })).toBe(false);
    expect(mindmapMasulRuxsati({ joriy: joriy(['company.member.manage']), kompaniyaId: 18 })).toBe(false);
    expect(mindmapMasulRuxsati({ joriy: null })).toBe(false);
  });
  it('superadmin — mumkin', () => {
    expect(mindmapMasulRuxsati({ superadmin: true, joriy: joriy([]) })).toBe(true);
  });
});
