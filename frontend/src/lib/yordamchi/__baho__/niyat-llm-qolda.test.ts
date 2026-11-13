/**
 * QO'LDA yurgiziladigan LLM niyat baholash (CI da O'TKAZIB YUBORILADI): `node scripts/jarvis-niyat-baho.cjs` yoki
 *   JARVIS_BAHO_LLM=1 OPENROUTER_API_KEY=... npx vitest run src/lib/yordamchi/__baho__/niyat-llm-qolda.test.ts
 * Mahalliy qatlam tushunmaydigan gaplarni jarvis_niyat promptidan (niyat-llm.ts) o'tkazadi: model qayta yozgan kanonik buyruq
 * mahalliy niyatdan o'tkaziladi va kutilgan niyat turi bilan solishtiriladi. Kalit faqat env'dan, hech qayerga chop etilmaydi.
 */
import { describe, expect, it } from 'vitest';
import { NAV_SAHIFALAR } from '../../nav/navReestr';
import { kimMendan, kimPromptBloki } from '../kim';
import { niyatAniqla, type NiyatKontekst } from '../niyat';
import { NIYAT_SXEMA, niyatLlmTekshir, niyatTizimi } from '../niyat-llm';
import { BAHO } from './niyat-baho.test';

const HAMMA = NAV_SAHIFALAR.map((s) => ({ yol: s.yol, nom: s.nom, guruh: s.guruh.nom }));
const OBYEKTLAR = [{ id: 12, nom: 'Yevropa 1' }, { id: 13, nom: 'Amfiteatr' }];
const ctx: NiyatKontekst = { sahifalar: HAMMA, obyektlar: OBYEKTLAR, joriyObyekt: OBYEKTLAR[0], bugun: new Date(2026, 10, 11) };

/** Qo'shimcha «ko'cha tili» gaplari: mahalliy qatlam ko'pincha tushunmaydi (kutilgan — qayta yozishdan keyingi mahalliy tur). */
const QOSHIMCHA: Array<{ m: string; tur: string }> = [
  { m: 'oktabrdagi f2ni tasdiqlab yubor ukam', tur: 'vosita' }, { m: 'ф2 октябрьский утверждай', tur: 'vosita' }, { m: 'shu f2 ni otmena qilib tashla xato ekan', tur: 'vosita' },
  { m: 'bugun nimalar kutib turibdi menga', tur: 'vosita' }, { m: 'что у меня горит сегодня', tur: 'vosita' }, { m: 'bugun nimalarim bor ish boyicha', tur: 'vosita' },
  { m: 'rasxod 12 mln material uchun kiritib qoy', tur: 'vosita' }, { m: 'оплату 50 млн по договору 12-А проведи', tur: 'vosita' }, { m: 'texnadzorga xat yozib yubor beton haqida', tur: 'vosita' },
  { m: 'f2 ni texnadzorga jonatib yubor', tur: 'vosita' }, { m: 'farqlar bormi shu yerda sverka', tur: 'vosita' },
  { m: 'betonga 8 kub qoshdim shuni yozib qoy', tur: 'yozuv' }, { m: 'armaturadan 3 tonna keldi kirit', tur: 'yozuv' }, { m: 'сегодня залили 15 кубов бетона запиши', tur: 'yozuv' },
  { m: 'narxi yoq qatorlar qaysilar', tur: 'oqish' }, { m: 'цены нет в каких строках', tur: 'oqish' }, { m: 'nimasi qolgan sementdan', tur: 'oqish' },
  { m: 'f2 ni tayyorlab ber noyabr uchun', tur: 'f2Qoralama' }, { m: 'aosr larni yaratib qoy', tur: 'aosrQoralama' },
  { m: 'kim bolib kirganman men', tur: 'kim' }, { m: 'я под каким аккаунтом', tur: 'kim' },
  { m: 'майндмап дегани оч', tur: 'navigatsiya' }, { m: 'qarzdorliklarni bir korib chiqay', tur: 'navigatsiya' },
];

const KALIT = process.env.OPENROUTER_API_KEY;
const YOQILGAN = process.env.JARVIS_BAHO_LLM === '1' && !!KALIT;
const MODEL = process.env.JARVIS_BAHO_MODEL || 'google/gemini-2.5-flash-lite';
const kim = kimPromptBloki(kimMendan({ foydalanuvchi: { login: 'sinov', ism: 'Sinov' }, context_kompaniyalar: [{ kompaniya_id: 5, nom: 'Sinov MChJ', effective_role: 'boss', permissions: [] }], azoliklar: [] }, 5, { obyektNomi: 'Yevropa 1' }));

async function niyatLlm(m: string) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${KALIT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: 300, messages: [{ role: 'system', content: niyatTizimi(kim) }, { role: 'user', content: `<foydalanuvchi-gapi>\n${m}\n</foydalanuvchi-gapi>` }], response_format: { type: 'json_schema', json_schema: { name: NIYAT_SXEMA.name, strict: true, schema: NIYAT_SXEMA.schema } } }),
  });
  const j = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
  return niyatLlmTekshir(j.choices?.[0]?.message?.content ?? '');
}

describe.skipIf(!YOQILGAN)('LLM niyat baholash (qo‘lda)', () => {
  it('mahalliy qatlam tushunmaganlar + ko‘cha tili gaplari: aniqlik hisoboti', async () => {
    const tushunilmagan = BAHO.filter((q) => niyatAniqla(q.m, ctx).tur !== q.tur).map((q) => ({ m: q.m, tur: q.tur }));
    const hammasi = [...tushunilmagan, ...QOSHIMCHA];
    let togri = 0; let mahalliyOldin = 0; const xato: string[] = [];
    for (const q of hammasi) {
      if (niyatAniqla(q.m, ctx).tur === q.tur) mahalliyOldin++;
      const r = await niyatLlm(q.m);
      const tur = r.tur === 'buyruq' && r.qayta ? niyatAniqla(r.qayta, ctx).tur : r.tur === 'noaniq' ? 'noaniq' : 'suhbat';
      if (tur === q.tur) togri++; else xato.push(`${q.m} -> ${r.qayta ?? r.tur} (${tur}, kutilgan ${q.tur})`);
    }
    // eslint-disable-next-line no-console
    console.log(`JARVIS-NIYAT-LLM [${MODEL}]: mahalliy ${mahalliyOldin}/${hammasi.length}; LLM+mahalliy ${togri}/${hammasi.length} = ${((togri / hammasi.length) * 100).toFixed(1)}%\nXATOLAR:\n${xato.join('\n')}`);
    expect(hammasi.length).toBeGreaterThan(20);
  }, 600_000);
});
