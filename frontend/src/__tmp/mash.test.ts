import { test } from 'vitest';
import fs from 'node:fs';
import { mashView } from '../lib/smeta-studio/mash-katalog';
import { matchResource } from '../lib/smeta-studio/resource-match';
const names = ['АВТОГРЕЙДЕРЫ СРЕДНЕГО ТИПА 99 (135) КВТ (Л.С.)','АВТОМОБИЛИ-САМОСВАЛЫ ГРУЗОПОДЪЕМНОСТЬЮ ДО 7 Т','АВТОМОБИЛИ-САМОСВАЛЫ ГРУЗОПОДЪЕМНОСТЬЮ ДО 10 Т','БУЛЬДОЗЕРЫ ПРИ РАБОТЕ НА ДРУГИХ ВИДАХ СТРОИТЕЛЬСТВА (КРОМЕ ВОДОХОЗЯЙСТВЕННОГО) 79 (108) КВТ (Л.С.)','КОМПРЕССОРЫ ПЕРЕДВИЖНЫЕ С ДВИГАТЕЛЕМ ВНУТРЕННЕГО СГОРАНИЯ ДАВЛЕНИЕМ ДО 686 КПА (7 АТ) 5 М3/МИН','КРАНЫ НА ГУСЕНИЧНОМ ХОДУ ПРИ РАБОТЕ НА ДРУГИХ ВИДАХ СТРОИТЕЛЬСТВА (КРОМЕ МАГИСТРАЛЬНЫХ ТРУБОПРОВОДОВ) 10 Т','КОНВЕЙЕРЫ ЛЕНТОЧНЫЕ ПЕРЕДВИЖНЫЕ 15 М','КОНВЕЙЕРЫ ЛЕНТОЧНЫЕ ПЕРЕДВИЖНЫЕ, ВЫСОТОЙ 5 М','ТРАМБОВКИ ПНЕВМАТИЧЕСКИЕ','ЭКСКАВАТОРЫ ОДНОКОВШОВЫЕ ДИЗЕЛЬНЫЕ НА ГУСЕНИЧНОМ ХОДУ ПРИ РАБОТЕ НА ДРУГИХ ВИДАХ СТРОИТЕЛЬСТВА 0,65 М3','АВТОМОБИЛИ БОРТОВЫЕ ГРУЗОПОДЪЕМНОСТЬЮ ДО 5 Т'];
test('mash', () => {
  const k = JSON.parse(fs.readFileSync('C:/Temp/t2-studio-kat/mash/cc9d1a878dd6a835.json', 'utf8'));
  const v = mashView(k);
  for (const n of names) { const m = matchResource(v, n, 'маш-ч', null, 3); fs.appendFileSync('C:/Temp/mash-out.txt', [m.confidence, '|', n.slice(0,60), '=>', m.best?.row.nom.slice(0,70), m.best?.row.narx, '| alt:', m.candidates?.slice(0,3).map((c: any) => c.row.nom.slice(0,50)).join(' ;; ')].join(' ') + String.fromCharCode(10)); }
});
