import { beforeEach } from 'vitest';
import { vakolatKeshTozala } from './functions/_shared/role-authority';
import { LUGAT_EN, LUGAT_RU } from './src/i18n/lugat';
import { lugatHolat } from './src/i18n/lugat-holat';

// ru/en lug'ati ilovada dinamik yuklanadi; testlarda `tilQoy('ru')` sinxron ishlashi uchun oldindan qo'yamiz.
lugatHolat.lugat = { ru: LUGAT_RU, en: LUGAT_EN };

// Vakolat keshi (60 s) bir testdagi DB javobini keyingi testga olib o'tmasin.
beforeEach(() => vakolatKeshTozala());
