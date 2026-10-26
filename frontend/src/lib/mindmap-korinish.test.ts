import { describe, expect, it } from 'vitest';
import type { MindmapGraf, MindmapTugun } from '../api/t2-mindmap';
import {
  daraxtQur, diqqatRoyxati, fokusYoli, foiz, hajmOlcham, klaviaturaQadam, markazlaKamera, mindmapJoyla,
  obyektHolati, qidiruvMoslari, radialJoyla, sigdirKamera, zumla, boglanganlar, entityId,
} from './mindmap-korinish';

const ob = (id: number, nom: string, meta: Partial<NonNullable<MindmapTugun['meta']>> | null, loyiha?: number): MindmapTugun => ({
  id: 'obyekt:' + id, tur: 'obyekt', nom, x: null, y: null,
  meta: meta === null ? null : { versiya: 1, loyiha_id: loyiha ?? null, belgi: [], fakt: 0, f2: 0, ...meta },
});

function graf(): MindmapGraf {
  return {
    tugunlar: [
      { id: 'kompaniya:1', tur: 'kompaniya', nom: 'Bosh kompaniya', meta: null, x: null, y: null },
      { id: 'loyiha:7', tur: 'loyiha', nom: 'Park', meta: { versiya: 1 }, x: null, y: null },
      { id: 'loyiha:8', tur: 'loyiha', nom: 'Maktab', meta: { versiya: 1 }, x: null, y: null },
      ob(1, 'Amfiteatr', { smeta: 1000, fakt: 600, f2: 400, fakt_foiz: 60, f2_foiz: 40 }, 7),
      ob(2, 'Ko‘l', { smeta: 4000, fakt: 100, f2: 0, fakt_foiz: 2.5, f2_foiz: 0, belgi: [{ tur: 'narx_yoq', daraja: 'ogoh', matn: '3 qatorda narx yo‘q', soni: 3 }], narxsiz: 3 }, 7),
      ob(3, 'Sport zal', { smeta: null, fakt: 0, f2: 0, fakt_foiz: null, f2_foiz: null, belgi: [{ tur: 'smeta_yoq', daraja: 'ogoh', matn: 'Smeta yuklanmagan' }] }, 8),
      ob(4, 'Ombor binosi', { smeta: 500, fakt: 520, f2: 0, fakt_foiz: 104, f2_foiz: 0, zayavka: 2, belgi: [{ tur: 'zayavka', daraja: 'info', matn: '2 ta zayavka kutilmoqda', soni: 2 }] }),
      ob(5, 'Noma’lum', null),
      { id: 'sklad:3', tur: 'sklad', nom: 'Markaziy sklad', meta: { versiya: 1 }, x: null, y: null },
      { id: 'texnika:9', tur: 'texnika', nom: 'Kran', meta: { versiya: 1 }, x: null, y: null },
      { id: 'shartnoma:2', tur: 'shartnoma', nom: '12/2026', meta: { versiya: 1 }, x: null, y: null },
    ],
    bogichlar: [
      { manba: 'kompaniya:1', maqsad: 'loyiha:7', tur: 'loyiha_kompaniya', uzsa_boladi: false },
      { manba: 'kompaniya:1', maqsad: 'loyiha:8', tur: 'loyiha_kompaniya', uzsa_boladi: false },
      { manba: 'loyiha:7', maqsad: 'obyekt:1', tur: 'obyekt_loyiha', uzsa_boladi: true },
      { manba: 'loyiha:7', maqsad: 'obyekt:2', tur: 'obyekt_loyiha', uzsa_boladi: true },
      { manba: 'loyiha:8', maqsad: 'obyekt:3', tur: 'obyekt_loyiha', uzsa_boladi: true },
      { manba: 'sklad:3', maqsad: 'obyekt:1', tur: 'sklad_obyekt', uzsa_boladi: true },
      { manba: 'shartnoma:2', maqsad: 'obyekt:1', tur: 'shartnoma_obyekt', uzsa_boladi: true },
    ],
    jamlanma: { obyekt_soni: 5, smeta_jami: 5500, fakt_jami: 1220, f2_jami: 400, zayavka_kutilmoqda: 2, narxsiz_obyekt: 1, smetasiz_obyekt: 1, kozgu_eskirgan: 0 },
  };
}

describe('mindmap-korinish', () => {
  it('foiz: noma’lum yoki 0 maxraj — null (yolg‘on 0% yo‘q)', () => {
    expect(foiz(50, 200)).toBe(25);
    expect(foiz(50, 0)).toBeNull();
    expect(foiz(null, 100)).toBeNull();
    expect(foiz(10, null)).toBeNull();
  });

  it('obyekt holati faqat real belgilardan', () => {
    const g = graf();
    const h = (id: string) => obyektHolati(g.tugunlar.find((t) => t.id === id)!);
    expect(h('obyekt:1')).toBe('yaxshi');
    expect(h('obyekt:2')).toBe('xavf');
    expect(h('obyekt:4')).toBe('etibor');
    expect(h('obyekt:5')).toBe('nomalum');
  });

  it('daraxt: kompaniya → loyiha → obyekt, loyihasiz obyektlar alohida guruhda', () => {
    const d = daraxtQur(graf());
    const root = d.tugunlar.get('kompaniya:1')!;
    expect(root.bolalar).toEqual(['loyiha:7', 'loyiha:8', 'guruh:loyihasiz']);
    const park = d.tugunlar.get('loyiha:7')!;
    expect(park.bolalar).toEqual(['obyekt:2', 'obyekt:1']); // xavf birinchi
    expect(park.smeta).toBe(5000);
    expect(park.smetaToliq).toBe(true);
    expect(park.f2Foiz).toBe(8);
    expect(park.holat).toBe('xavf');
    expect(d.tugunlar.get('guruh:loyihasiz')!.bolalar.sort()).toEqual(['obyekt:4', 'obyekt:5']);
  });

  it('smetasiz loyiha jamlanmasi null, 0 emas; qisman bo‘lsa to‘liq emas', () => {
    const d = daraxtQur(graf());
    const maktab = d.tugunlar.get('loyiha:8')!;
    expect(maktab.smeta).toBeNull();
    expect(maktab.f2Foiz).toBeNull();
    const guruh = d.tugunlar.get('guruh:loyihasiz')!;
    expect(guruh.smeta).toBe(500);
    expect(guruh.smetaToliq).toBe(false);
  });

  it('kompaniya jamlanmasi server jamlanmasidan; smetasiz obyekt bo‘lsa to‘liq emas', () => {
    const root = daraxtQur(graf()).tugunlar.get('kompaniya:1')!;
    expect(root.smeta).toBe(5500);
    expect(root.smetaToliq).toBe(false);
    expect(root.holatSanoq).toEqual({ xavf: 2, etibor: 1, yaxshi: 1, nomalum: 1 });
    expect(root.resurs).toMatchObject({ sklad: 1, texnika: 1, shartnoma: 1 });
  });

  it('resurslar obyektga sanaladi, biriktirilmaganlar alohida', () => {
    const d = daraxtQur(graf());
    expect(d.tugunlar.get('obyekt:1')!.resurs).toMatchObject({ sklad: 1, shartnoma: 1 });
    expect(d.biriktirilmagan).toMatchObject({ texnika: 1, sklad: 0 });
  });

  it('oshgan: fakt smetadan oshsa belgilanadi', () => {
    expect(daraxtQur(graf()).tugunlar.get('obyekt:4')!.oshgan).toBe(true);
  });

  it('mindmap joylashuvi: ikki tomon, tugunlar ustma-ust tushmaydi', () => {
    const d = daraxtQur(graf());
    const j = mindmapJoyla(d);
    expect(j.joylar.get('kompaniya:1')).toMatchObject({ x: 0, y: 0 });
    const tomonlar = new Set(['loyiha:7', 'loyiha:8', 'guruh:loyihasiz'].map((id) => Math.sign(j.joylar.get(id)!.x)));
    expect(tomonlar).toEqual(new Set([1, -1]));
    const obyektlar = [...j.joylar.entries()].filter(([id]) => id.startsWith('obyekt:')).map(([, p]) => p);
    for (let a = 0; a < obyektlar.length; a++) for (let b = a + 1; b < obyektlar.length; b++) {
      const p = obyektlar[a], q = obyektlar[b];
      const kesishadi = Math.abs(p.x - q.x) < p.w && Math.abs(p.y - q.y) < p.h;
      expect(kesishadi).toBe(false);
    }
  });

  it('yig‘ilgan loyiha bolalari joylashmaydi', () => {
    const d = daraxtQur(graf());
    const j = mindmapJoyla(d, new Set(['loyiha:7']));
    expect(j.joylar.has('obyekt:1')).toBe(false);
    expect(j.joylar.has('loyiha:7')).toBe(true);
  });

  it('radial joylashuv: har obyekt 2-halqada', () => {
    const d = daraxtQur(graf());
    const r = radialJoyla(d, 50, 100);
    const p = r.get('obyekt:1')!;
    expect(Math.round(Math.hypot(p.x, p.y))).toBe(100);
    expect(r.size).toBe(d.tugunlar.size);
  });

  it('qidiruv: lotin/kirill farqisiz, ajdodlar ham ko‘rinadi', () => {
    const d = daraxtQur(graf());
    const q = qidiruvMoslari(d, 'амфи')!;
    expect([...q.mos]).toEqual(['obyekt:1']);
    expect(q.korinadi.has('loyiha:7')).toBe(true);
    expect(q.korinadi.has('kompaniya:1')).toBe(true);
    expect(qidiruvMoslari(d, '  ')).toBeNull();
  });

  it('fokus yo‘li: ajdod + avlodlar', () => {
    const d = daraxtQur(graf());
    expect([...fokusYoli(d, 'loyiha:7')].sort()).toEqual(['kompaniya:1', 'loyiha:7', 'obyekt:1', 'obyekt:2'].sort());
  });

  it('klaviatura: tashqariga — bola, ichkariga — ota, past — qo‘shni', () => {
    const d = daraxtQur(graf());
    const j = mindmapJoyla(d);
    const s = j.tomon.get('loyiha:7')!;
    const tashqari = s === 1 ? 'ArrowRight' : 'ArrowLeft';
    const ichkari = s === 1 ? 'ArrowLeft' : 'ArrowRight';
    expect(klaviaturaQadam(d, j, 'loyiha:7', tashqari)).toBe('obyekt:2');
    expect(klaviaturaQadam(d, j, 'obyekt:2', ichkari)).toBe('loyiha:7');
    expect(klaviaturaQadam(d, j, 'obyekt:2', 'ArrowDown')).toBe('obyekt:1');
    expect(klaviaturaQadam(d, j, 'obyekt:1', 'ArrowDown')).toBeNull();
    expect(klaviaturaQadam(d, j, 'kompaniya:1', tashqari)).toBe('loyiha:7');
  });

  it('kamera: sig‘dirish va markazlash, zum kursor ostida', () => {
    const k = sigdirKamera({ x1: -100, y1: -50, x2: 100, y2: 50 }, 400, 200, 0, 5);
    expect(k.k).toBe(2);
    expect(k.x).toBe(200);
    const m = markazlaKamera({ x: 10, y: 0 }, 400, 200, 1);
    expect(m.x).toBe(190);
    const z = zumla({ x: 0, y: 0, k: 1 }, 2, 100, 100);
    expect(z).toEqual({ x: -100, y: -100, k: 2 });
  });

  it('hajm: smetaga mutanosib, noma’lumda eng kichik', () => {
    expect(hajmOlcham(null, 100)).toBe(5);
    expect(hajmOlcham(100, 100)).toBe(12);
    expect(hajmOlcham(25, 100)).toBeCloseTo(8.5);
  });

  it('diqqat ro‘yxati va bog‘langan yozuvlar', () => {
    const g = graf();
    const d = daraxtQur(g);
    expect(diqqatRoyxati(d).map((x) => x.id)).toEqual(['obyekt:2', 'obyekt:3', 'obyekt:4']);
    expect(boglanganlar(g, 'obyekt:1').map((t) => t.id).sort()).toEqual(['shartnoma:2', 'sklad:3']);
    expect(entityId('obyekt:12')).toBe(12);
    expect(entityId('guruh:loyihasiz')).toBeNull();
  });
});
