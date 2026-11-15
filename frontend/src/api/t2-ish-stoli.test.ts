import { describe, expect, it } from 'vitest';
import { amalYoli, ishStoliParse } from './t2-ish-stoli';

const toza = {
  ok: true, versiya: 1, joriy: '1:prorab', kompaniya_id: 1, tomon: 'prorab', tomon_nom: 'Prorab / usta (dala)', rejim: 'dala', dala: { katta_tugma: true, oflayn: true, ovoz: true, foto: true },
  kabinetlar: [{ id: '1:prorab', kompaniya_id: 1, nom: 'Sinov MChJ', tomon: 'prorab', tomon_nom: 'Prorab', manba: 'azolik', joriy: true }],
  amallar: [{ id: 'fakt_yoz', nom: 'Fakt yozish', ikonka: 'fakt', maqsad: { tur: 'native', kod: 'fakt' }, birlamchi: true }, { id: 'material_sorov', nom: 'Material', ikonka: 'zayavka', maqsad: { tur: 'web', kod: 'zayavka', yol: '/admin/zayavka' } }],
  bolimlar: [
    { id: 'dala', tur: 'amallar', nom: 'Dalada', katta: true, amallar: ['fakt_yoz', 'yoq_amal', 'material_sorov'] },
    { id: 'kelajak', tur: 'xarita_3d', nom: 'Noma\'lum tur' },
    { id: 'bugun', tur: 'royxat', nom: 'Bugun', manba: 'bugun.ishlar', amal: 'fakt_yoz' },
  ],
  birlamchi_amal: 'fakt_yoz',
};

describe('ishStoliParse', () => {
  it('toza javobni o\'qiydi, noma\'lum bo\'lim turini va mavjud bo\'lmagan amalni tashlaydi (oldinga moslik)', () => {
    const r = ishStoliParse(toza)!;
    expect(r.bolimlar.map((b) => b.id)).toEqual(['dala', 'bugun']);
    expect(r.bolimlar[0].amallar).toEqual(['fakt_yoz', 'material_sorov']);
    expect(r.rejim).toBe('dala');
    expect(r.birlamchi_amal).toBe('fakt_yoz');
  });
  it('buzuq / xato javob — null', () => {
    expect(ishStoliParse(null)).toBeNull();
    expect(ishStoliParse({ ok: false })).toBeNull();
    expect(ishStoliParse({ ...toza, bolimlar: 'x' })).toBeNull();
  });
  it('amalYoli: server yo\'li ustun, aks holda native kod -> veb sahifa, noma\'lum -> null', () => {
    const r = ishStoliParse(toza)!;
    expect(amalYoli(r.amallar[1])).toBe('/admin/zayavka');
    expect(amalYoli(r.amallar[0])).toBe('/admin/fakt');
    expect(amalYoli({ id: 'x', nom: 'x', ikonka: 'x', maqsad: { tur: 'native', kod: 'yangi' } })).toBeNull();
  });
});