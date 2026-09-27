import { describe, expect, it } from 'vitest';
import { AI_KORSATMA, aiKontekstMatni, type AiKontekst } from './t2-ai';
import { jarvisSalomJavobi, jarvisSalommi } from '../lib/jarvis/intent';

const kontekst: AiKontekst = {
  ok: true,
  obyekt: { id: 1, nom: 'Sinov obyekt', kompaniya: 'Sinov MCHJ', loyiha: null },
  smeta: { jami: 1_000_000, resurs_qatori: 2, narxsiz_qator: 1, toliq: false },
  kategoriya: {},
  bajarish: { fakt_summa: 0, f2_summa: 0, f2_mumkin_summa: 0, fakt_foiz: 0, f2_foiz: 0 },
  eng_qimmat: [], narxsiz_royxat: [], kozgu: { holat: null, oxirgi_yozish: null },
  ogohlantirish: [{ tur: 'narx_yoq', matn: '1 qatorda narx yo\'q', soni: 1 }],
  izoh: 'Sinov dalili',
};

describe('Jarvis beta kontrakti', () => {
  it('raqam to\'qimaslik va ogohlantirishni aytish qoidasini saqlaydi', () => {
    expect(AI_KORSATMA).toContain('O\'ZINGDAN TO\'QIMA');
    expect(AI_KORSATMA).toContain('ALBATTA ayt');
  });

  it('to\'liq bo\'lmagan smeta va ogohlantirishni model kontekstiga kiritadi', () => {
    const matn = aiKontekstMatni(kontekst);
    expect(matn).toContain('TO\'LIQ EMAS');
    expect(matn).toContain('1 qatorda narx yo\'q');
  });

  it('kompaniya tanlanmagan bo‘lsa ham oddiy salomlashuvni kompaniya API’siga yubormaydi', () => {
    expect(jarvisSalommi('salom')).toBe(true);
    expect(jarvisSalommi('Salom!')).toBe(true);
    expect(jarvisSalommi('  ASSALOMU ALAYKUM  ')).toBe(true);
    expect(jarvisSalommi('Amfiteatrda fakt qancha?')).toBe(false);
    expect(jarvisSalomJavobi()).toContain('yuqoridan kompaniya kontekstini tanlang');
  });
});
