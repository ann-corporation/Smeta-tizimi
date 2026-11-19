import { describe, expect, it } from 'vitest';
import { toolChaqir } from '../src/tool';
import { hujjatPaket } from '../src/tools/hujjat-paket';
import { mockMuhit, type Javobchi } from './mock';

const N = (o: Record<string, unknown>) => ({
  kalit: 'f2:1', tur: 'f2', sarlavha: 'F-2 №1', holat: 'tasdiqlangan', loyiha_id: 1, loyiha_nom: 'L', shartnoma_id: 2, shartnoma_raqam: '5', obyekt_id: 10, obyekt_nom: 'O', oy: '2031-03',
  akt_id: 1, forma3_id: null, taxminiy: false, takror: false, qator_soni: 20, fayl_id: 9, versiya: 2, bayt: 100, yasash: false, ...o,
});
const javobchi = (nomzodlar: unknown[]): Javobchi => (sql) => (/select public\."t2_hujjat_paket_nomzod_v1"\(/.test(sql) ? [{ r: { ok: true, jami: nomzodlar.length, kesilgan: false, nomzodlar } }] : []);

describe('hujjat_paket (preview)', () => {
  it('Disk bepul / yasaladi / rad etilgan; hech narsa yozilmaydi; takror va taxminiy rad', async () => {
    const { mu, h } = mockMuhit(javobchi([
      N({}), N({ kalit: 'f2:2', akt_id: 2, holat: 'qoralama', yasash: true, fayl_id: null, versiya: null }),
      N({ kalit: 'f2:3', akt_id: 3, taxminiy: true }), N({ kalit: 'f2:4', akt_id: 4, takror: true }),
      N({ kalit: 'aosr:10:2031-04', tur: 'aosr', holat: 'joriy', akt_id: null, yasash: true, fayl_id: null }),
    ]));
    const j = JSON.parse((await toolChaqir(hujjatPaket, mu, { kompaniya_id: 17 })).content[0].text);
    expect(j.rejim).toContain('preview');
    expect(j.reja).toMatchObject({ tanlangan: 2, diskdan_bepul: 1, yasaladi: 1, olinmaydi: 1, taxminiy_katak: 100 });
    expect(j.rad_etilgan.map((x: { kalit: string; sabab: string }) => `${x.kalit}:${x.sabab}`)).toEqual(['f2:3:taxminiy', 'f2:4:takror']);
    const sorov = h.sorovlar.find((s) => s.sql.includes('t2_hujjat_paket_nomzod_v1'))!;
    expect(sorov.params).toEqual([7, 17, '{}']);
    expect(h.sorovlar.some((s) => /t2_token_sarfla_v1/.test(s.sql))).toBe(false);
  });
  it('filtr RPC ga o\'tadi; kalitlar tanlovni toraytiradi', async () => {
    const { mu, h } = mockMuhit(javobchi([N({}), N({ kalit: 'f2:2', akt_id: 2 })]));
    const j = JSON.parse((await toolChaqir(hujjatPaket, mu, { kompaniya_id: 17, obyekt_ids: [10], oy_dan: '2031-03', turlar: ['f2'], kalitlar: ['f2:2'] })).content[0].text);
    expect(j.reja.tanlangan).toBe(1);
    expect(JSON.parse(String(h.sorovlar.find((s) => s.sql.includes('t2_hujjat_paket_nomzod_v1'))!.params[2]))).toEqual({ obyekt_ids: [10], oy_dan: '2031-03', turlar: ['f2'] });
  });
  it('RUXSAT_YOQ javobi xato bo\'ladi', async () => {
    const { mu } = mockMuhit((sql) => (sql.includes('t2_hujjat_paket_nomzod_v1') ? [{ r: { ok: false, code: 'RUXSAT_YOQ' } }] : []));
    const r = await toolChaqir(hujjatPaket, mu, { kompaniya_id: 17 });
    expect(JSON.stringify(r)).toContain('RUXSAT_YOQ');
  });
});
