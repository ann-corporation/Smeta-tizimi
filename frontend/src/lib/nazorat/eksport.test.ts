import { describe, expect, it } from 'vitest';
import { kirishQatorlari, kirishXulosa } from './kirish-nazorat';
import { jurnalQatorlari, oyBoyichaSoni } from './tashrif-jurnali';

describe('kirish nazorati', () => {
  const r = [
    { nom: 'Арматура А500С d12', birlik: 'т', miqdor: 2.5, sertifikat: 'СЕРТ-17', sertifikatSana: '2026-09-02', natija: 'mos' as const },
    { nom: 'Цемент М400', birlik: 'т', miqdor: null },
    { nom: 'Кирпич', sertifikat: 'П-1', natija: 'mos_emas' as const },
  ];
  it('qatorlar ruscha, noma\'lum bo\'sh', () => {
    const q = kirishQatorlari(r);
    expect(q[0][6]).toBe('СЕРТ-17 от 02.09.2026');
    expect(q[0][7]).toBe('Соответствует');
    expect(q[1][3]).toBe('');
    expect(q[1][7]).toBe('Документ о качестве не представлен');
    expect(q[2][7]).toBe('Не соответствует');
  });
  it('hujjatsiz material "mos" hisoblanmaydi', () => {
    expect(kirishXulosa(r)).toEqual({ jami: 3, hujjatsiz: 1, mosEmas: 1, tugallanmagan: 0, hammasiMos: false });
    expect(kirishXulosa([r[0]]).hammasiMos).toBe(true);
    expect(kirishXulosa([]).hammasiMos).toBe(false);
  });
});

describe('tashrif jurnali', () => {
  const t = [
    { id: 2, sana: '2026-10-12', turi: 'gasn' as const, maqsad: 'Проверка', predpisaniyaRaqamlari: ['5', '6'] },
    { id: 1, sana: '2026-09-30', turi: 'texnadzor' as const, tashkilot: 'ООО Надзор', vakil: 'Иванов И.И.', natija: 'Замечаний нет' },
  ];
  it('sana bo\'yicha tartib va ruscha qatorlar', () => {
    const q = jurnalQatorlari(t);
    expect(q[0].slice(1, 3)).toEqual(['30.09.2026', 'ООО Надзор']);
    expect(q[1][2]).toBe('Инспекция государственного архитектурно-строительного контроля');
    expect(q[1][5]).toBe('Предписание № 5, 6');
  });
  it('oy bo\'yicha', () => {
    expect(oyBoyichaSoni(t)).toEqual({ '2026-09': 1, '2026-10': 1 });
  });
});
