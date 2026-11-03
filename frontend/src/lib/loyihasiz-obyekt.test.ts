import { describe, expect, it } from 'vitest';
import { loyihaBoyichaObyektlar, loyihasizObyektlar, nomiBirXilObyektlar, obyektNomNormalla } from './loyihasiz-obyekt';

const obyektlar = [
  { id: 1, nom: 'Obyekt A', loyiha_id: 5, kompaniya_id: 1 },
  { id: 2, nom: 'Obyekt B', loyiha_id: null, kompaniya_id: 1 },
  { id: 3, nom: 'Obyekt C', loyiha_id: 6, kompaniya_id: 1 },
  { id: 4, nom: 'Obyekt D', kompaniya_id: 1 },
];

describe('loyihasiz obyektlar', () => {
  it('loyiha_id NULL yoki yo‘q obyekt loyihasiz hisoblanadi', () => {
    expect(loyihasizObyektlar(obyektlar).map((o) => o.id)).toEqual([2, 4]);
  });
  it('loyiha tanlanganda loyihasizlar yashirilmaydi, alohida guruhda qoladi', () => {
    const g = loyihaBoyichaObyektlar(obyektlar, 5);
    expect(g.loyihali.map((o) => o.id)).toEqual([1]);
    expect(g.loyihasiz.map((o) => o.id)).toEqual([2, 4]);
  });
  it('loyiha tanlanmaganda hamma obyekt ro‘yxatda', () => {
    const g = loyihaBoyichaObyektlar(obyektlar, null);
    expect(g.loyihali).toHaveLength(4);
    expect(g.loyihasiz).toEqual([]);
  });
});

describe('obyekt nomini normallash va dublikat', () => {
  it('kichik harf, ortiqcha bo‘shliq va defis atrofidagi bo‘shliq', () => {
    expect(obyektNomNormalla('Паркент 2-этап')).toBe(obyektNomNormalla('Паркент 2- этап'));
    expect(obyektNomNormalla('  ПАРКЕНТ   2 - этап ')).toBe('паркент 2-этап');
    expect(obyektNomNormalla(null)).toBe('');
  });
  it('xuddi shu kompaniyada bir xil nomni topadi, boshqa kompaniyani va o‘zini emas', () => {
    const mavjud = [
      { id: 10, nom: 'Паркент 2-этап', kompaniya_id: 123 },
      { id: 11, nom: 'Паркент 2-этап', kompaniya_id: 99 },
      { id: 12, nom: 'Boshqa', kompaniya_id: 123 },
    ];
    expect(nomiBirXilObyektlar(mavjud, 'Паркент 2- этап', 123).map((o) => o.id)).toEqual([10]);
    expect(nomiBirXilObyektlar(mavjud, 'Паркент 2- этап', 123, 10)).toEqual([]);
    expect(nomiBirXilObyektlar(mavjud, '   ', 123)).toEqual([]);
  });
});
