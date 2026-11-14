/* Regressiya qo'riqchisi: emailsiz kirish / akkaunt / ish joyi fayllarida BLOKLOVCHI window.prompt/confirm/alert YO'Q
   (asosiy oqimni qotiradi; avtomatlashtirilgan brauzerda ~45 s). Sahifa ichidagi forma yoki tasdiqSora ishlatiladi. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FAYLLAR = [
  'src/kirish/KirishSahifa.tsx', 'src/kirish/TelegramKirish.tsx', 'src/kirish/TaklifSahifa.tsx',
  'src/admin/components/OdamTakliflari.tsx', 'src/admin/components/KompaniyaOching.tsx',
  'src/components/akkaunt/KirishUsullariKarta.tsx', 'src/components/akkaunt/BirlashtirKarta.tsx',
  'src/umumiy/kontekst/IshJoyiAmallari.tsx',
];
describe('bloklovchi dialoglar taqiqi', () => {
  for (const f of FAYLLAR) {
    it(f, () => {
      const kod = readFileSync(resolve(__dirname, '../../', f), 'utf8');
      expect(kod).not.toMatch(/window\.(prompt|confirm|alert)\s*\(/);
      expect(kod).not.toMatch(/(^|[^.\w])(prompt|confirm|alert)\s*\(/m);
    });
  }
});
