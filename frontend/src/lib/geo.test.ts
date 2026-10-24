import { describe, expect, it } from 'vitest';
import { koordinataniOqi, masofaKm, togriKoordinata, koordinataMatni } from './geo';

describe('koordinataniOqi', () => {
  it('oddiy juftlik', () => {
    expect(koordinataniOqi('41.2995, 69.2401')).toEqual([41.2995, 69.2401]);
    expect(koordinataniOqi('41.2995 69.2401')).toEqual([41.2995, 69.2401]);
    expect(koordinataniOqi('41.2995,69.2401')).toEqual([41.2995, 69.2401]);
  });
  it('vergulli o\'nlik', () => {
    expect(koordinataniOqi('41,2995; 69,2401')).toEqual([41.2995, 69.2401]);
  });
  it('yarimshar harflari', () => {
    expect(koordinataniOqi('41.2995N 69.2401E')).toEqual([41.2995, 69.2401]);
    expect(koordinataniOqi('10.5 S, 20.5 W')).toEqual([-10.5, -20.5]);
  });
  it('Google havolasi', () => {
    expect(koordinataniOqi('https://www.google.com/maps/@41.31,69.28,15z')).toEqual([41.31, 69.28]);
  });
  it('noto\'g\'ri kirish', () => {
    expect(koordinataniOqi('')).toBeNull();
    expect(koordinataniOqi('Toshkent')).toBeNull();
    expect(koordinataniOqi('91, 69')).toBeNull();
    expect(koordinataniOqi('41, 181')).toBeNull();
    expect(koordinataniOqi('1 2 3')).toBeNull();
  });
});

describe('masofaKm', () => {
  it('Toshkent-Samarqand taxminan 270 km', () => {
    const d = masofaKm([41.2995, 69.2401], [39.6542, 66.9597]);
    expect(d).toBeGreaterThan(260);
    expect(d).toBeLessThan(280);
  });
  it('bir nuqta = 0', () => expect(masofaKm([41, 69], [41, 69])).toBe(0));
});

describe('togriKoordinata/koordinataMatni', () => {
  it('0,0 va NaN rad', () => {
    expect(togriKoordinata(0, 0)).toBe(false);
    expect(togriKoordinata(NaN, 1)).toBe(false);
    expect(togriKoordinata(41, 69)).toBe(true);
  });
  it('matn', () => expect(koordinataMatni([41.2995, 69.2401])).toBe('41.29950, 69.24010'));
});
