import { describe, expect, it } from 'vitest';
import type { MindmapGraf } from '../api/t2-mindmap';
import { daraxtQur, mindmapJoyla, type Joy } from './mindmap-korinish';
import { shartnomaliDaraxt, shartnomasizmi } from './mindmap-xarita-shartnoma';

/** 2 loyiha, 15 obyekt, 4 shartnoma (+ shartnomasiz obyektlar), nomlar uzun. */
function katta(): MindmapGraf {
  const tugunlar: MindmapGraf['tugunlar'] = [{ id: 'kompaniya:1', tur: 'kompaniya', nom: 'Kompaniya', meta: null, x: null, y: null }];
  const bogichlar: MindmapGraf['bogichlar'] = [];
  for (const l of [1, 2]) {
    tugunlar.push({ id: 'loyiha:' + l, tur: 'loyiha', nom: 'Loyiha ' + l, meta: { versiya: 1 }, x: null, y: null });
    bogichlar.push({ manba: 'kompaniya:1', maqsad: 'loyiha:' + l, tur: 'loyiha_kompaniya', uzsa_boladi: false });
  }
  for (let s = 1; s <= 4; s++) {
    const l = s <= 2 ? 1 : 2;
    tugunlar.push({ id: 'shartnoma:' + s, tur: 'shartnoma', nom: '№' + s, meta: { versiya: 1, loyiha_id: l, summa: s % 2 ? 1000 * s : null }, x: null, y: null });
    bogichlar.push({ manba: 'loyiha:' + l, maqsad: 'shartnoma:' + s, tur: 'shartnoma_loyiha', uzsa_boladi: true });
  }
  for (let o = 1; o <= 15; o++) {
    const l = o <= 8 ? 1 : 2;
    tugunlar.push({ id: 'obyekt:' + o, tur: 'obyekt', nom: 'Obyekt ' + o, x: null, y: null, meta: { versiya: 1, loyiha_id: l, smeta: 100 * o, fakt: 10, f2: 5, belgi: [] } });
    bogichlar.push({ manba: 'loyiha:' + l, maqsad: 'obyekt:' + o, tur: 'obyekt_loyiha', uzsa_boladi: true });
    if (o % 5 !== 0) bogichlar.push({ manba: 'shartnoma:' + (o % 2 ? (l === 1 ? 1 : 3) : (l === 1 ? 2 : 4)), maqsad: 'obyekt:' + o, tur: 'shartnoma_obyekt', uzsa_boladi: true });
  }
  return { tugunlar, bogichlar };
}

const kesishadi = (a: Joy, b: Joy) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;

describe('Vizual xarita: shartnomali daraxt va joylashuv', () => {
  const g = katta();
  const d = daraxtQur(g);
  const x = shartnomaliDaraxt(g, d);

  it('obyektlar shartnoma ostida; shartnomasiz obyektlar «Shartnomasiz» guruhda', () => {
    expect(x.tugunlar.get('obyekt:1')!.ota).toBe('shartnoma:1');
    expect(x.tugunlar.get('obyekt:5')!.ota).toBe('shartnomasiz:loyiha:1');
    expect(shartnomasizmi('shartnomasiz:loyiha:1')).toBe(true);
    expect(x.tugunlar.get('loyiha:1')!.bolalar).toEqual(expect.arrayContaining(['shartnoma:1', 'shartnoma:2', 'shartnomasiz:loyiha:1']));
    expect(d.tugunlar.get('obyekt:1')!.ota).toBe('loyiha:1'); // asl daraxt o‘zgarmaydi
  });

  it('shartnoma jamlanmasi: obyekt soni va smeta yig‘indisi', () => {
    const s = x.tugunlar.get('shartnoma:1')!;
    expect(s.obyektSoni).toBe(s.bolalar.length);
    expect(s.smeta).toBe(s.bolalar.reduce((n, id) => n + x.tugunlar.get(id)!.smeta!, 0));
  });

  it('shartnoma umuman bo‘lmasa — asl daraxtning o‘zi', () => {
    const g2 = { ...g, tugunlar: g.tugunlar.filter((t) => t.tur !== 'shartnoma') };
    const d2 = daraxtQur(g2);
    expect(shartnomaliDaraxt(g2, d2)).toBe(d2);
  });

  it('hech bir tugun ustma-ust tushmaydi (15 obyekt, 4 shartnoma)', () => {
    for (const yig of [new Set<string>(), new Set(['shartnoma:1', 'loyiha:2'])]) {
      const j = mindmapJoyla(x, yig);
      const royxat = [...j.joylar.entries()];
      for (let i = 0; i < royxat.length; i++) for (let k = i + 1; k < royxat.length; k++) {
        expect(kesishadi(royxat[i][1], royxat[k][1]), royxat[i][0] + ' ↔ ' + royxat[k][0]).toBe(false);
      }
    }
  });

  it('shartnoma tugunlari loyiha va obyekt ustunlari orasida', () => {
    const j = mindmapJoyla(x);
    const sx = Math.abs(j.joylar.get('shartnoma:1')!.x), lx = Math.abs(j.joylar.get('loyiha:1')!.x), ox = Math.abs(j.joylar.get('obyekt:1')!.x);
    expect(lx).toBeLessThan(sx);
    expect(sx).toBeLessThan(ox);
  });
});