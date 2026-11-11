import { describe, expect, it } from 'vitest';
import { labTalablari, labYetishmaydi } from './ijro-qoida';

describe('ijro-qoida: laboratoriya talabi', () => {
  it('beton, grunt zichlash va payvand kalit so‘zlari (RU/UZ)', () => {
    expect(labTalablari('Устройство монолитной плиты')).toEqual(['beton']);
    expect(labTalablari('Beton quyish ishlari')).toEqual(['beton']);
    expect(labTalablari('Послойное уплотнение грунта')).toEqual(['grunt']);
    expect(labTalablari('Обратная засыпка пазух')).toEqual(['grunt']);
    expect(labTalablari('Сварка закладных деталей')).toEqual(['payvand']);
    expect(labTalablari('Payvand ishlari')).toEqual(['payvand']);
  });

  it('bir nechta talab va talab yo‘q holat', () => {
    expect(labTalablari('Монолитный каркас', 'сварные соединения арматуры')).toEqual(['beton', 'payvand']);
    expect(labTalablari('Штукатурка стен', null, undefined)).toEqual([]);
    expect(labTalablari('', null)).toEqual([]);
  });

  it('bog‘langan protokol turi talabni yopadi', () => {
    const akt = { ish_nomi: 'Бетонирование фундамента', ish_tavsifi: null, materiallar: null };
    expect(labYetishmaydi(akt, [])).toEqual(['beton']);
    expect(labYetishmaydi(akt, ['grunt'])).toEqual(['beton']);
    expect(labYetishmaydi(akt, ['beton'])).toEqual([]);
  });
});
