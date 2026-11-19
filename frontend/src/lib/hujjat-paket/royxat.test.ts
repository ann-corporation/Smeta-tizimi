import { describe, expect, it } from 'vitest';
import { BOSH_FILTR, filtrBosh, filtrdanServerga, filtrniTozala, obyektQidir, oldin, oyOraligi, tanlanganlar, yangilikMatni, yuklashBahosi, type RoyxatQator } from './royxat';

const Q = (o: Partial<RoyxatQator> = {}): RoyxatQator => ({
  kalit: 'f2:1', tur: 'f2', sarlavha: 'F-2 №1', holat: 'tasdiqlangan', loyiha_id: null, loyiha_nom: null, shartnoma_id: 7, shartnoma_raqam: '1', obyekt_id: 10, obyekt_nom: 'A', oy: '2031-03',
  akt_id: 1, forma3_id: null, taxminiy: false, takror: false, qator_soni: 10, fayl_id: 5, versiya: 5, bayt: 1, yasash: false, ...o,
});

describe('filtr', () => {
  it('UI holati -> server filtri; bo‘sh filtr bo‘sh', () => {
    expect(filtrdanServerga(BOSH_FILTR)).toEqual({});
    expect(filtrBosh(BOSH_FILTR)).toBe(true);
    expect(filtrdanServerga({ shartnomaId: 7, obyektIds: [1, 2], oyDan: '2031-01', oyGacha: '2031-03', turlar: ['f2'], holatlar: ['tasdiqlangan'] }))
      .toEqual({ shartnomaIds: [7], obyektIds: [1, 2], oyDan: '2031-01', oyGacha: '2031-03', turlar: ['f2'], holatlar: ['tasdiqlangan'] });
  });
  it('saqlangan filtrni tozalash: yaroqsiz qiymatlar tashlanadi, teskari oy almashtiriladi', () => {
    const f = filtrniTozala({ shartnoma_ids: [7, 9], obyekt_ids: [3, 'x', -1], turlar: ['f2', 'zzz'], holatlar: ['qoralama', 'joriy'], oy_dan: '2031-05', oy_gacha: '2031-02', yaroqsiz: 1 });
    expect(f).toEqual({ shartnomaId: 7, obyektIds: [3], oyDan: '2031-02', oyGacha: '2031-05', turlar: ['f2'], holatlar: ['qoralama'] });
    expect(filtrniTozala(null)).toEqual(BOSH_FILTR);
    expect(oyOraligi('2031-09', '2031-01')).toEqual({ dan: '2031-01', gacha: '2031-09' });
    expect(oyOraligi('bad', '2031-01')).toEqual({ dan: null, gacha: '2031-01' });
  });
  it('obyekt qidiruvi: registrga befarq, tanlanganlar chiqmaydi', () => {
    const o = [{ id: 1, nom: 'Fast Food' }, { id: 2, nom: 'Suniy ko‘l' }, { id: 3, nom: 'FASTER' }];
    expect(obyektQidir(o, 'fast').map((x) => x.id)).toEqual([1, 3]);
    expect(obyektQidir(o, 'fast', [1]).map((x) => x.id)).toEqual([3]);
    expect(obyektQidir(o, '  ')).toEqual([]);
  });
});

describe('yangilik matni va tanlov', () => {
  const hozir = Date.parse('2031-03-10T12:00:00Z');
  it('«Excel tayyor · v5 · 2 daqiqa oldin» / yangilanmoqda / yo‘q / xato', () => {
    expect(yangilikMatni(Q({ yangilandi: '2031-03-10T11:58:00Z' }), hozir)).toBe('Excel tayyor · v5 · 2 daqiqa oldin');
    expect(yangilikMatni(Q({ yangilandi: '2031-03-10T11:58:00Z', yangilanmoqda: true }), hozir)).toBe('Eski versiya · v5 · 2 daqiqa oldin');
    expect(yangilikMatni(Q({ fayl_id: null, versiya: null, yangilanmoqda: true }), hozir)).toBe('Yangilanmoqda');
    expect(yangilikMatni(Q({ fayl_id: null, versiya: null }), hozir)).toBe('Diskda yo\'q');
    expect(yangilikMatni(Q({ navbat_holat: 'xato' }), hozir)).toContain('Yangilanmadi');
    expect(oldin(30_000)).toBe('hozirgina'); expect(oldin(3 * 3600_000)).toBe('3 soat oldin'); expect(oldin(50 * 3600_000)).toBe('2 kun oldin');
  });
  it('tanlangan: takror va taxminiy tanlanmaydi', () => {
    const q = [Q(), Q({ kalit: 'f2:2', takror: true }), Q({ kalit: 'f2:3', taxminiy: true })];
    expect(tanlanganlar(q, new Set(['f2:1', 'f2:2', 'f2:3'])).map((x) => x.kalit)).toEqual(['f2:1']);
  });
});

describe('token bahosi: faqat to‘lanmagan hujjatlar', () => {
  const narx = (k: number) => k;
  it('to‘langan F-2 bepul; to‘lanmagan F-2 katak bahosi bilan; Diskdagi boshqa tur bepul', () => {
    const q = [Q({ tolangan: true }), Q({ kalit: 'f2:2', tolangan: false, qator_soni: 10 }), Q({ kalit: 'nakopitelniy:1:2031-03', tur: 'nakopitelniy', fayl_id: 9, tolangan: false })];
    const b = yuklashBahosi(q, narx);
    expect(b).toEqual({ tolanadigan: 1, bepul: 2, token: 50 });
  });
  it('hammasi to‘langan - 0; narx noma‘lum - null', () => {
    expect(yuklashBahosi([Q({ tolangan: true })], narx)).toEqual({ tolanadigan: 0, bepul: 1, token: 0 });
    expect(yuklashBahosi([Q({ tolangan: false })], null).token).toBeNull();
  });
});
