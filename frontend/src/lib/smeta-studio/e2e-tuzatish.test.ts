/** Regressions found in the 2026-10-15 production end-to-end run (one estimate from chat to RES). */
import { describe, expect, it } from 'vitest';
import { characteristics, gateFailure, matchResource, priceUnitFactor } from './resource-match';
import { resursGuruhlari, talabMateriali } from './narx-yigish';
import { kpSarlavhasi } from './kompaniya-manbalari';
import { applyCommand, type StudioCommand } from './commands';
import { emptyDoc, type RecipeSnapshot } from './model';
import { calcDoc } from './calc';
import { includedWorkReviews } from '../smeta-ai/included-work';
import { mashView } from './mash-katalog';

describe('«по проекту» resurs — ishning materiali bo‘yicha (B7,5 va B20 bitta narx emas)', () => {
  it('materialdan shu resursga tegishli qismi olinadi', () => {
    expect(talabMateriali('Бетон B20', 'БЕТОН (КЛАСС ПО ПРОЕКТУ)')).toBe('Бетон B20');
    expect(talabMateriali('Раствор цементный М100, кирпич глиняный обыкновенный', 'КИРПИЧ КЕРАМИЧЕСКИЙ, РАЗМЕР И МАРКА ПО ПРОЕКТУ')).toBe('кирпич глиняный обыкновенный');
    expect(talabMateriali('Бетон B20', 'ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ')).toBeNull();
    expect(talabMateriali('Арматура A500C', 'БЕТОН (КЛАСС ПО ПРОЕКТУ)')).toBeNull();
  });
  it('ikki ishdagi bir xil «БЕТОН (КЛАСС ПО ПРОЕКТУ)» ikki guruh bo‘ladi', () => {
    const recipe: RecipeSnapshot[] = [{ recipeId: 'r', status: 'EXACT', resource: { id: '1', code: 'С1', resourceIdCode: '045027', name: 'БЕТОН (КЛАСС ПО ПРОЕКТУ)', unitCode: '005', type: 'M' },
      norm: '102', candidates: [], candidateCount: 1, prices: [], priceCount: 0 }];
    const occ = (id: string, material: string): StudioCommand => ({ type: 'ADD_OCCURRENCE', occurrenceId: id, sectionId: 's', recipe, quantity: '10', material,
      source: { catalogRevision: 'r', workId: id, code: 'E6-1-1-1', name: 'УСТРОЙСТВО', unitCode: '021', tableLabel: null }, basis: { scale: '100', unitLabel: 'м3', evidence: '100 м3', origin: 'OBSERVED' } });
    const d = ([{ type: 'ADD_SECTION', sectionId: 's', parentId: null, name: 'A' }, occ('a', 'Бетон B7,5'), occ('b', 'Бетон B20')] as StudioCommand[]).reduce(applyCommand, emptyDoc('d'));
    const g = resursGuruhlari(d, calcDoc(d), c => (c === '005' ? 'м3' : null));
    expect(g.map(x => x.talab).sort()).toEqual(['Бетон B20', 'Бетон B7,5']);
    expect(applyCommand(d, { type: 'SET_MATERIAL', occurrenceId: 'a', material: null }).occurrences.a.material).toBeUndefined();
  });
});

describe('xarakteristika darvozasi', () => {
  it('qalinlik farq qilsa rad etiladi (25 ≠ 50 mm), setka materiali farq qilsa ham', () => {
    expect(gateFailure(characteristics('ЩИТЫ ИЗ ДОСОК ТОЛЩИНОЙ 25 ММ'), characteristics('Щиты опалубки толщиной 50 мм'), 'м2', 'м2')).toBe('THICKNESS');
    expect(gateFailure(characteristics('ЩИТЫ ИЗ ДОСОК ТОЛЩИНОЙ 25 ММ'), characteristics('Щиты из досок толщиной 25 мм'), 'м2', 'м2')).toBeNull();
    expect(gateFailure(characteristics('СЕТКА ПРОВОЛОЧНАЯ'), characteristics('Сетка стеклокомпозитная 50х50 СК-д.3 мм'), 'м2', 'м2')).toBe('FAMILY');
  });
  it('шт ↔ 1000 шт aniq; mashina "до 5 тн" = "до 5 т"', () => {
    expect(priceUnitFactor('шт', '1000 шт')).toBe(1000);
    expect(priceUnitFactor('тыс. шт', 'шт')).toBe(0.001);
    const v = mashView({ schema: 'mash-katalog-v1', manba: { nom: 'Перечень', sana: '2026-01-01', fayl: 'x.pdf', sha256: 'x' }, rows: [{ n: 9, nom: 'Автомобиль бортовой г/п до 5 тн', narx: 110305, sahifa: 1 }] });
    expect(matchResource(v, 'АВТОМОБИЛИ БОРТОВЫЕ ГРУЗОПОДЪЕМНОСТЬЮ ДО 5 Т', 'маш-ч').confidence).toBe('HIGH');
  });
});

describe('KP va takrorlanish', () => {
  it('Excel KP sarlavhasidan yetkazuvchi, raqam, sana, INN', () => {
    expect(kpSarlavhasi('Коммерческое предложение ООО «Строй Снаб» № 45 от 10.10.2026 ИНН 305123456 Цены с НДС'))
      .toEqual({ yetkazuvchi: 'ООО «Строй Снаб»', raqam: '45', sana: '2026-10-10', inn: '305123456' });
  });
  it('tasdiqlangan alohida armatura ishi endi bloklanmaydi', () => {
    const p = (id: string, tavsif: string, kod: string, takrorTasdiq?: boolean) => ({ id, bolim: 'A', tavsif, tanlangan: { kod, nom: tavsif }, takrorTasdiq });
    const foundation = p('f', 'Lentali poydevor', 'E6-1-1-22'), rebar = p('a', 'Armatura o‘rnatish', 'E6-1-97-1');
    expect(includedWorkReviews([foundation, rebar]).size).toBe(2);
    expect(includedWorkReviews([foundation, { ...rebar, takrorTasdiq: true }]).size).toBe(0);
  });
});
