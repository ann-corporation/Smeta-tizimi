import { expect, it } from 'vitest';
import { jarvisToolNames, parseJarvisToolCall, type JarvisToolName } from '../../../src/lib/jarvis/tool-registry';
import { firstReadTool } from './read-tools';

const cases: Array<[JarvisToolName, string[], unknown]> = [
  ['object_search', ['Obyektni top Sinov bino', 'Объектни топ Синов бино', 'Найди объект Синтетический корпус'], null],
  ['estimate_row', ['Smeta qatori E06-01-001-1', 'Смета қатори Е06-01-001-1', 'Найди позицию Е06-01-001-1'], 'E06-01-001-1'],
  ['estimate_price', ['Smetada M200 beton narxi?', 'Сметада М200 бетон нархи?', 'Сколько стоит бетон М200 в смете?'], expect.arrayContaining(['М200', 'БЕТОН'])],
  ['material_prices', ['Obyektlar bo‘yicha M200 beton narxlari', 'Объектлар бўйича М200 бетон нархлари', 'Цены бетона М200 по объектам'], expect.arrayContaining(['М200', 'БЕТОН'])],
  ['norm_reference', ['ShNQ 4.02.06-04', 'ШНҚ 4.02.06-04', 'Покажи ШНК 4.02.06-04'], '4.02.06-04'],
  ['catalog_price', ['Katalogdagi #50 narxi?', 'Каталогдаги #50 нархи?', 'Цена каталога №50'], 50],
  ['f2_register', ['F2 № S-1 holati', 'Ф2 № S-1 ҳолати', 'Статус КС-2 № S-1'], expect.objectContaining({ number: 's-1' })],
  ['cumulative', ['Nakopitelniy 2026-06', 'Накопителний 2026-06', 'Накопительная ведомость 2026-06'], expect.objectContaining({ month: '2026-06' })],
  ['discrepancy', ['Slichitelniy vedomost', 'Сличителная ведомост', 'Сличительная ведомость'], true],
  ['warehouse_balance', ['Ombor #7 qoldig‘i: sement', 'Омбор #7 қолдиғи: цемент', 'Остатки склада №7: цемент'],
    expect.objectContaining({ warehouse: 7 })],
  ['document_search', ['Hujjat №50 ni och', 'Ҳужжат №50 ни кўрсат', 'Открой документ №50'], { id: 50 }],
];
const languages = ['uz-Latn', 'uz-Cyrl', 'ru'];
it.each(cases.flatMap(([name, queries, expected]) => queries.map((query, index) => ({
  label: `${languages[index]}/${name}`, name, query, expected: expected ?? query,
}))))('tool/routing $label', ({ name, query, expected }) => {
  expect(firstReadTool(jarvisToolNames, query)).toEqual({ name, args: expected });
  expect(parseJarvisToolCall({ name, arguments: { query } })).toEqual({ name, query });
});

it('rejects an arbitrary operation or arguments that try to override server context', () => {
  expect(parseJarvisToolCall({ name: 'f2_update', arguments: { query: 'F2 №1' } })).toBeNull();
  expect(parseJarvisToolCall({ name: 'f2_register', arguments: { query: 'F2 №1', actor: 88, company: 9 } })).toBeNull();
});
