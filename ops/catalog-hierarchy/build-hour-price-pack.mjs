import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { maximumMachinePrices } from './machine-price-max.mjs';

// Paired prices checked against rendered source pages. OCR is NOT approval.
const pairs = [
 ['Автогидроподъемники высотой подъема 12 м',118630,118501],
 ['Автогидроподъемники высотой подъема 18 м',124095,123960],
 ['Автогидроподъемники высотой подъема 22 м',157885,157713],
 ['Автогидроподъемники высотой подъема 28 м',163568,163389],
 ['Автогидроподъемники высотой подъема свыше 35 м',178216,178022],
 ['Автогрейдеры среднего типа 99 (135) КВТ (Л.С.)',323035,319423],
 ['Автогудронаторы 3500 л',177618,175632],
 ['Автоматы сварочные с номинальным сварочным током 450-1250 А',27770,29461],
 ['Автомобиль бортовой г/п до 5 тн',107733,107615],
 ['Автомобиль бортовой г/п до 8 тн',140361,140208],
 ['Автомобиль бортовой г/п до 10 тн',146729,146569],
 ['Автомобиль-самосвал г/п до 10 тн',151969,159476],
 ['Автомобиль-самосвал г/п до 8 тн',140361,147295],
 ['Автопогрузчики 5 т',143063,148613],
 ['Автопогрузчики 3 т',132886,139345],
 ['Автоцистерна',133766,132402],
 ['Агрегат для подачи грунтовки',17636,18710],
 ['Агрегат для сварки полиэтиленовых труб',15574,16522],
 ['Агрегаты опрессовочные',47248,50126],
 ['Агрегаты окрасочные 1 кВт',6083,6453],
 ['Агрегаты сварочные передвижные с номинальным сварочным током 250-400 А с бензиновым двигателем',45780,45775],
 ['Агрегаты сварочные передвижные с номинальным сварочным током 250-400 А с дизельным двигателем',54725,54720],
 ['Агрегаты для приготовления рабочих жидкостей — ядохимикатов (без трактора)',3946,4186],
 ['Агрегаты сварочные однопостовые для ручной электродуговой сварки',72714,77143],
 ...[['0,25',162268,162203,8,179,178],['0,4',201233,201152,8,180,179],
 ['0,5',232426,232333,8,181,180],['0,65',247550,247451,8,182,181],
 ['1',336530,326098,9,183,182],['1,25',347466,336695,9,184,183]].map(([cap,a,b,page,serialA,serialB]) => [
 `Экскаваторы одноковшовые дизельные на ${cap === '0,25' ? 'пневмоколесном' : 'гусеничном'} ходу при работе на других видах строительства ${cap} м3`,a,b,page,serialA,serialB]),
];
const [sourcesPath, labourPath, target] = process.argv.slice(2);
if (!target || fs.existsSync(target)) throw new Error('NEW_OUTPUT_DIRECTORY_REQUIRED');
const sources = JSON.parse(fs.readFileSync(sourcesPath,'utf8'));
const labour = JSON.parse(fs.readFileSync(labourPath,'utf8'));
const observations = pairs.flatMap(([name,a,b,page,serialA,serialB],i) => [a,b].map((price,j) => ({
 sourceKey: `${sources[j].sha256}:page:${j === 0 ? page ?? 1 : page ? 8 : 1}:serial:${j === 0 ? serialA ?? i+1 : serialB ?? i+1}`,
 name,price:String(price),unit:'маш-ч',currency:'UZS',vat:'EXCLUDED',readingVerified:true,
 sourceSha256:sources[j].sha256,page:j === 0 ? page ?? 1 : page ? 8 : 1,
 sourceDate:j === 0 ? '2023-01-01' : '2025-01-01',
 readingMethod:'RENDERED_PAGE_VISUAL_VERIFICATION',
} )));
const selected = maximumMachinePrices(observations);
const data = {schema:'hour-price-catalog-v1',machineCoverage:'PARTIAL_VERIFIED_SUBSET',
 purpose:'REFERENCE_OFFERS_NOT_CERTIFIED_F2',machines:selected.offers,
 labour:labour.rows,unavailableLabour:labour.unavailable,
 sourceEvidence:{machines:observations,labour:labour.evidence},
 unresolved:['REMAINING_MACHINE_ROWS_READING_REVIEW','MACHINE_NAME_VARIANTS_REQUIRE_OPERATOR_CONFIRMATION','LABOUR_SCOPE_CONSTRUCTION_WORKERS_ONLY'],
};
const bytes=Buffer.from(JSON.stringify(data));
const sha=createHash('sha256').update(bytes).digest('hex');
const revision=sha.slice(0,16);
fs.mkdirSync(target,{recursive:true});
fs.writeFileSync(path.join(target,'catalog.json'),bytes);
fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify({schema:data.schema,revision,
 files:{'catalog.json':{sha256:sha,bytes:bytes.length}},
 machineCoverage:data.machineCoverage,machineOffers:data.machines.length,labourOffers:data.labour.length,
 sourceFiles:[...sources.map(s=>({name:path.basename(s.source),sha256:s.sha256})),{name:'Иш хаки 2026 йил.xls',sha256:labour.sourceSha256 ?? labour.source?.sha256}],
},null,2));
process.stdout.write(JSON.stringify({revision,sha256:sha,machines:data.machines.length,labour:data.labour.length,unavailable:data.unavailableLabour.length}));
