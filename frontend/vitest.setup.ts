import { beforeEach } from 'vitest';
import { configure } from '@testing-library/react';
import { hujjatDizaynTekshir, kitobKuzatuvchiniOrnat } from './src/lib/hujjat-yozuvchi';
import { vakolatKeshTozala } from './functions/_shared/role-authority';
import { LUGAT_EN, LUGAT_RU } from './src/i18n/lugat';
import { lugatHolat } from './src/i18n/lugat-holat';
import { sinovUlagichOrnat } from './src/umumiy/ui/tasdiq-yadro';

// ru/en lug'ati ilovada dinamik yuklanadi; testlarda `tilQoy('ru')` sinxron ishlashi uchun oldindan qo'yamiz.
lugatHolat.lugat = { ru: LUGAT_RU, en: LUGAT_EN };

// Dialog (tasdiqSora / matnSora): konteyner o'rnatilmagan testlarda javobni `window.confirm` / `window.prompt` spy'laridan oladi.
// Mahsulot kodida bloklovchi oynalar yo'q (qo'riqchi: src/umumiy/ui/bloklovchi-oyna.test.ts) — bu faqat test ulagichi.
sinovUlagichOrnat({
  tasdiq: (matn) => (typeof window !== 'undefined' && typeof window.confirm === 'function' ? !!window.confirm(matn) : false),
  matn: (matn, boshlangich) => (typeof window !== 'undefined' && typeof window.prompt === 'function' ? window.prompt(matn, boshlangich) : null),
});

// Vakolat keshi (60 s) bir testdagi DB javobini keyingi testga olib o'tmasin.
beforeEach(() => vakolatKeshTozala());

// Hujjat dizayni (egasi 2026-11-03): HAR generator chiqishi — Тип ustuni yashirin, daraja uslubi, ramka, son sig'ishi, o'rash.
// Buzilsa generatorning o'z testi yiqiladi (dizayn-tekshir.ts).
kitobKuzatuvchiniOrnat((bytes, dizayn, nomlar) => {
  const xato = hujjatDizaynTekshir(bytes, dizayn);
  if (xato.length) throw new Error('HUJJAT_DIZAYN [' + nomlar.join(', ') + ']: ' + xato.slice(0, 8).join('; '));
});


// findBy*/waitFor standart 1 s — to'liq to'plam parallel yurganda (CI, sovuq import) yolg'on yiqilardi; kutish chegarasi kattaroq,
// o'tgan test baribir birinchi muvaffaqiyatli tekshiruvda tugaydi (sekinlashmaydi).
configure({ asyncUtilTimeout: 8000 });

// Sanaga bog'liqlikni tekshirish: TEST_SANA=2026-01-01T00:00:00 bilan butun to'plam soxta tizim sanasida yuradi.
// Vaqt to'xtab qolmaydi (siljish — offset): faqat `new Date()` / `Date.now()` boshlang'ich nuqtasi siljiydi,
// taymerlar va kutish haqiqiy. Oddiy yurishda o'rnatilmaydi.
if (process.env.TEST_SANA) {
  const sana = new Date(process.env.TEST_SANA);
  if (!Number.isNaN(sana.getTime())) {
    const HaqiqiyDate = Date;
    const siljish = sana.getTime() - HaqiqiyDate.now();
    class SiljiganDate extends HaqiqiyDate {
      constructor(...a: unknown[]) {
        if (a.length === 0) super(HaqiqiyDate.now() + siljish);
        else super(...(a as [number]));
      }
      static now() { return HaqiqiyDate.now() + siljish; }
    }
    globalThis.Date = SiljiganDate as unknown as DateConstructor;
  }
}