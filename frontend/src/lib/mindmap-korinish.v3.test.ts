import { describe, expect, it } from 'vitest';
import type { MindmapGraf, MindmapTugun } from '../api/t2-mindmap';
import { daraxtQur, obyektHolati, obyektOshgan, topSignallarOl } from './mindmap-korinish';

/** Obyekt tuguni; `meta` ustiga yoziladi. */
const ob = (id: number, meta: Record<string, unknown> | null): MindmapTugun => ({
  id: 'obyekt:' + id, tur: 'obyekt', nom: 'Obyekt ' + id, x: null, y: null,
  meta: meta === null ? null : { versiya: 1, loyiha_id: null, belgi: [], fakt: 0, f2: 0, smeta: 1000, fakt_foiz: 0, f2_foiz: 0, ...meta },
});
const kompaniya: MindmapTugun = { id: 'kompaniya:1', tur: 'kompaniya', nom: 'K', meta: null, x: null, y: null };

describe('mindmap-korinish v3 holat qoidalari', () => {
  it('kritik signal — xavf; oddiy ochiq signal — e’tibor; signal soni null — hech narsa qo‘shmaydi', () => {
    expect(obyektHolati(ob(1, { signal_count: 2, critical_count: 1 }))).toBe('xavf');
    expect(obyektHolati(ob(2, { signal_count: 3, critical_count: 0 }))).toBe('etibor');
    expect(obyektHolati(ob(3, { signal_count: 0, critical_count: 0 }))).toBe('yaxshi');
    // eski shakl: signal maydonlari umuman yo‘q — 0 deb ham, signal deb ham olinmaydi
    expect(obyektHolati(ob(4, {}))).toBe('yaxshi');
    expect(obyektHolati(ob(5, { signal_count: null, critical_count: null }))).toBe('yaxshi');
  });

  it('ortiqcha: v3 da server belgisi (ortiqcha_soni), foiz > 100 hal qilmaydi', () => {
    // Server «ortiqcha yo‘q» desa — foiz 130% bo‘lsa ham (masalan qoralama aralashgan) oshgan emas.
    expect(obyektOshgan(ob(1, { ortiqcha_soni: 0, f2_foiz: 130, fakt_foiz: 130 }))).toBe(false);
    expect(obyektHolati(ob(1, { ortiqcha_soni: 0, f2_foiz: 130 }))).toBe('yaxshi');
    expect(obyektOshgan(ob(2, { ortiqcha_soni: 2, f2_foiz: 10 }))).toBe(true);
    expect(obyektHolati(ob(2, { ortiqcha_soni: 2, belgi: [{ tur: 'ortiqcha', daraja: 'info', matn: '2 qatorda F2 oshgan', soni: 2 }] }))).toBe('etibor');
  });

  it('eski RPC shakli (ortiqcha_soni yo‘q): foiz > 100 zaxira qoidasi ishlaydi', () => {
    expect(obyektOshgan(ob(1, { fakt_foiz: 104 }))).toBe(true);
    expect(obyektOshgan(ob(2, { f2_foiz: 100.5 }))).toBe(true);
    expect(obyektOshgan(ob(3, { f2_foiz: null, fakt_foiz: null }))).toBe(false);
  });

  it('resurs_yoq (info) — e’tibor, smeta_yoq (ogoh) — xavf', () => {
    expect(obyektHolati(ob(1, { belgi: [{ tur: 'resurs_yoq', daraja: 'info', matn: 'x' }] }))).toBe('etibor');
    expect(obyektHolati(ob(2, { belgi: [{ tur: 'smeta_yoq', daraja: 'ogoh', matn: 'x' }] }))).toBe('xavf');
  });

  it('top_signals: faqat yaroqli yozuvlar, ko‘pi bilan 3 ta', () => {
    const t = ob(1, { top_signals: [{ title: 'a', severity: 'critical' }, null, { title: 'b', severity: 'warning' }, { title: 'c' }, { title: 'd' }] });
    expect(topSignallarOl(t).map((s) => s.title)).toEqual(['a', 'b', 'c']);
    expect(topSignallarOl(ob(2, {}))).toEqual([]);
    expect(topSignallarOl(null)).toEqual([]);
  });
});

describe('mindmap-korinish v3 daraxt: yangi va eski RPC shakli', () => {
  const yangi = (): MindmapGraf => ({
    tugunlar: [
      kompaniya,
      ob(1, { smeta: 1000, f2: 300, f2_asos: 'tasdiqlangan', f2_qoralama: 200, f2_foiz: 30, fakt: 500, fakt_foiz: 50, signal_count: 2, critical_count: 1, ortiqcha_soni: 0,
        top_signals: [{ title: 'Kritik signal', severity: 'critical' }, { title: 'Ogohlantirish', severity: 'warning' }] }),
      ob(2, { smeta: 2000, f2: 0, f2_asos: 'tasdiqlangan', f2_qoralama: 0, f2_foiz: 0, fakt: 0, fakt_foiz: 0, signal_count: 0, critical_count: 0, ortiqcha_soni: 3 }),
    ],
    bogichlar: [],
    jamlanma: { obyekt_soni: 2, smeta_jami: 3000, fakt_jami: 500, f2_jami: 300, f2_asos: 'tasdiqlangan', f2_qoralama_jami: 200, zayavka_kutilmoqda: 0, narxsiz_obyekt: 0, smetasiz_obyekt: 0, kozgu_eskirgan: 0 },
  });
  const eski = (): MindmapGraf => ({
    tugunlar: [kompaniya, ob(1, { smeta: 1000, f2: 300, f2_foiz: 30, fakt: 500, fakt_foiz: 50 }), ob(2, { smeta: 2000, f2: 0, f2_foiz: 0, fakt: 0, fakt_foiz: 0 })],
    bogichlar: [],
    jamlanma: { obyekt_soni: 2, smeta_jami: 3000, fakt_jami: 500, f2_jami: 300, zayavka_kutilmoqda: 0, narxsiz_obyekt: 0, smetasiz_obyekt: 0, kozgu_eskirgan: 0 },
  });

  it('yangi shakl: F2 asosi tasdiqlangan, qoralama alohida, signallar yig‘iladi', () => {
    const d = daraxtQur(yangi());
    const o1 = d.tugunlar.get('obyekt:1')!;
    expect(o1.f2).toBe(300);
    expect(o1.f2Qoralama).toBe(200);
    expect(o1.f2Tasdiqlangan).toBe(true);
    expect(o1.signalSoni).toBe(2);
    expect(o1.kritikSoni).toBe(1);
    expect(o1.topSignallar.map((s) => s.title)).toEqual(['Kritik signal', 'Ogohlantirish']);
    expect(o1.holat).toBe('xavf');
    expect(d.tugunlar.get('obyekt:2')!.oshgan).toBe(true);
    const root = d.tugunlar.get(d.ildiz)!;
    expect(root.f2).toBe(300);
    expect(root.f2Qoralama).toBe(200);
    expect(root.f2Tasdiqlangan).toBe(true);
    expect(root.signalSoni).toBe(2);
    expect(root.kritikSoni).toBe(1);
  });

  it('eski shakl: yiqilmaydi, qoralama/signal null (0 emas), F2 asosi tasdiqlanmagan deb belgilanadi', () => {
    const d = daraxtQur(eski());
    const o1 = d.tugunlar.get('obyekt:1')!;
    expect(o1.f2).toBe(300);
    expect(o1.f2Qoralama).toBeNull();
    expect(o1.f2Tasdiqlangan).toBe(false);
    expect(o1.signalSoni).toBeNull();
    expect(o1.topSignallar).toEqual([]);
    expect(o1.holat).toBe('yaxshi');
    const root = d.tugunlar.get(d.ildiz)!;
    expect(root.f2Qoralama).toBeNull();
    expect(root.f2Tasdiqlangan).toBe(false);
    expect(root.signalSoni).toBeNull();
  });

  it('aralash (bir obyekt eski, boshqasi yangi): jami qoralama va asos to‘liq deb aytilmaydi', () => {
    const g = yangi();
    g.tugunlar[2] = ob(2, { smeta: 2000, f2: 0, f2_foiz: 0, fakt: 0, fakt_foiz: 0 });
    delete g.jamlanma;
    const d = daraxtQur(g);
    const guruh = d.tugunlar.get('guruh:loyihasiz')!;
    expect(guruh.f2Qoralama).toBeNull();
    expect(guruh.f2Tasdiqlangan).toBe(false);
    expect(guruh.signalSoni).toBe(2);
  });
});
