#!/usr/bin/env node
/**
 * Saytning tarjima lug'atini (src/i18n/lugat: ru.json, en.json, qism/*.json) Kotlin ilovalari (Windows/Android, :shared) uchun
 * `android-native/shared/src/main/resources/site-i18n/{ru,en}.json` ga yozadi. Kalit = o'zbek lotin matn (sayt `t('...')` bilan BIR XIL),
 * qiymat = tarjima. Birlashtirish qoidasi `lugat/index.ts` bilan bir xil: avval qism/*.json (fayl nomi tartibida), keyin asosiy lug'at ustun.
 *
 *   node scripts/site-i18n.mjs          -> fayllarni yozadi
 *   node scripts/site-i18n.mjs --check  -> fayllar lug'atga mos emas bo'lsa 1 bilan chiqadi (CI: src/i18n/site-i18n-sync.test.ts)
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lugat = join(root, 'src', 'i18n', 'lugat');
const out = resolve(root, '..', 'android-native', 'shared', 'src', 'main', 'resources', 'site-i18n');

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function yig() {
  const ru = {}; const en = {};
  const qism = join(lugat, 'qism');
  for (const f of readdirSync(qism).filter((x) => x.endsWith('.json')).sort()) {
    for (const [k, v] of Object.entries(read(join(qism, f)))) {
      if (v?.ru != null) ru[k] = v.ru;
      if (v?.en != null) en[k] = v.en;
    }
  }
  return { ru: { ...ru, ...read(join(lugat, 'ru.json')) }, en: { ...en, ...read(join(lugat, 'en.json')) } };
}

/** Barqaror ko'rinish: kalitlar tartiblangan, har kalit bir qatorda (diff o'qiladigan). */
export function yozuv(obj) {
  const keys = Object.keys(obj).sort();
  return '{\n' + keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(obj[k])}`).join(',\n') + '\n}\n';
}

export function kutilgan() { const { ru, en } = yig(); return { 'ru.json': yozuv(ru), 'en.json': yozuv(en) }; }

export function nomuvofiq() {
  const exp = kutilgan();
  return Object.entries(exp).filter(([f, s]) => !existsSync(join(out, f)) || readFileSync(join(out, f), 'utf8') !== s).map(([f]) => f);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const bad = nomuvofiq();
    if (bad.length) { console.error(`site-i18n: ${bad.join(', ')} eskirgan. Ishga tushiring: node scripts/site-i18n.mjs`); process.exit(1); }
    console.log('site-i18n: mos');
  } else {
    mkdirSync(out, { recursive: true });
    for (const [f, s] of Object.entries(kutilgan())) writeFileSync(join(out, f), s, 'utf8');
    console.log('site-i18n: yozildi ->', out);
  }
}
