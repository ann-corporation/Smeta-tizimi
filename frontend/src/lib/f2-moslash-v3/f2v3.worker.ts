/**
 * Web Worker: F2 V3 og'ir bosqichlari asosiy oqimdan tashqarida (egasi 2026-09-28:
 * "30 000 qatorli smetada … sayt qotib Chrome otib yuborardi"; Codex tekshiruvi:
 * anatomiya va moslashtirish asosiy oqimda edi).
 *   - 'oqi'  : XLSX → F2 aktlari (anatomiya)
 *   - 'mosla': F2 daraxti × smeta → qavatma-qavat natija
 * Natija — oddiy ma'lumot (Map ham structured clone bilan o'tadi).
 */
import { readXlsx } from '../f2-import-parse/xlsxReader';
import { f2AktlarniOqi } from '../smeta-anatomiya/f2';
import { f2MoslashV3 } from './index';
import type { F2IshchiKirish } from './fonda';

self.onmessage = async (e: MessageEvent<F2IshchiKirish>) => {
  const d = e.data;
  const javob = (x: Record<string, unknown>) => (self as unknown as Worker).postMessage({ id: d.id, ...x });
  try {
    if (d.tur === 'oqi') {
      const wb = await readXlsx(d.bytes);
      const aktlar = f2AktlarniOqi({ fayl: d.fayl, varaqlar: wb.sheets.map((s) => ({ nom: s.name, rows: s.rows, merges: s.merges })) });
      javob({ ok: true, aktlar });
    } else {
      javob({ ok: true, natija: f2MoslashV3(d.daraxt, d.smeta, d.opts) });
    }
  } catch (err) {
    javob({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
