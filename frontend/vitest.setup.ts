import { beforeEach } from 'vitest';
import { hujjatDizaynTekshir, kitobKuzatuvchiniOrnat } from './src/lib/hujjat-yozuvchi';
import { vakolatKeshTozala } from './functions/_shared/role-authority';
import { LUGAT_EN, LUGAT_RU } from './src/i18n/lugat';
import { lugatHolat } from './src/i18n/lugat-holat';

// ru/en lug'ati ilovada dinamik yuklanadi; testlarda `tilQoy('ru')` sinxron ishlashi uchun oldindan qo'yamiz.
lugatHolat.lugat = { ru: LUGAT_RU, en: LUGAT_EN };

// Vakolat keshi (60 s) bir testdagi DB javobini keyingi testga olib o'tmasin.
beforeEach(() => vakolatKeshTozala());

// Hujjat dizayni (egasi 2026-11-03): HAR generator chiqishi — Тип ustuni yashirin, daraja uslubi, ramka, son sig'ishi, o'rash.
// Buzilsa generatorning o'z testi yiqiladi (dizayn-tekshir.ts).
kitobKuzatuvchiniOrnat((bytes, dizayn, nomlar) => {
  const xato = hujjatDizaynTekshir(bytes, dizayn);
  if (xato.length) throw new Error('HUJJAT_DIZAYN [' + nomlar.join(', ') + ']: ' + xato.slice(0, 8).join('; '));
});
