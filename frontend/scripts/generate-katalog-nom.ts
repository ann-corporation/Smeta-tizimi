/**
 * Mobil modul katalogi uchun ixcham tarjima jadvali (uz -> ru/en) — functions/_shared/katalog-nom.json.
 * Worker butun ru/en lug'atini (0,5 MB+) yuklamasligi uchun faqat sahifa/band/guruh nomlari olinadi.
 * Manba: lib/reestr/sahifa.ts (nomlar) + i18n/lugat. Ishga tushirish:  npx vite-node scripts/generate-katalog-nom.ts [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import { LUGAT_RU, LUGAT_EN } from '../src/i18n/lugat';
import { katalogNomlari } from '../src/lib/reestr/katalog-nomlar';

const out = path.resolve(__dirname, '../functions/_shared/katalog-nom.json');
const jadval: Record<string, { ru?: string; en?: string }> = {};
for (const uz of [...katalogNomlari()].sort()) {
  const ru = LUGAT_RU[uz]; const en = LUGAT_EN[uz];
  if (ru || en) jadval[uz] = { ...(ru ? { ru } : {}), ...(en ? { en } : {}) };
}
const matn = JSON.stringify(jadval, null, 1) + '\n';
if (process.argv.includes('--check')) {
  const eski = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (eski !== matn) { console.error('katalog-nom.json eskirgan: npx vite-node scripts/generate-katalog-nom.ts'); process.exit(1); }
  console.log('katalog-nom.json yangi');
} else {
  fs.writeFileSync(out, matn, 'utf8');
  console.log(`yozildi: ${Object.keys(jadval).length} nom`);
}
