/**
 * QO'RIQCHI: brauzerning bloklovchi oynalari (window.prompt / confirm / alert) mahsulot kodida (src, test fayllaridan tashqari) TAQIQ.
 * O'rniga sahifa ichidagi asinxron dialog: `tasdiqSora` (ha/yo'q) va `matnSora` (sabab / nom / miqdor kiritish) — umumiy/ui/Tasdiq.tsx.
 * Yangi chaqiruv qo'shilsa CI yiqiladi. (Test fayllari va vitest.setup.ts — src tashqarisida — istisno.)
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..');
const TEST_FAYL = /\.(test|spec)\.[jt]sx?$/;
const QIDIRILADI = /(?<![\w.$])(?:window\.|globalThis\.)?(prompt|confirm|alert)\s*\(/;

function fayllar(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== 'node_modules') fayllar(p, out); } else if (/\.[jt]sx?$/.test(n) && !TEST_FAYL.test(n)) out.push(p);
  }
  return out;
}
const izohmi = (q: string) => /^\s*(\/\/|\*|\/\*)/.test(q);

describe('bloklovchi brauzer oynalari yo‘q (prompt / confirm / alert)', () => {
  it('src ichida (test fayllaridan tashqari) bunday chaqiruv 0 ta', () => {
    const topildi: string[] = [];
    for (const f of fayllar(SRC)) {
      readFileSync(f, 'utf8').split(/\r?\n/).forEach((q, i) => { if (!izohmi(q) && QIDIRILADI.test(q)) topildi.push(`${relative(SRC, f)}:${i + 1}: ${q.trim().slice(0, 110)}`); });
    }
    expect(topildi, 'Bloklovchi oyna o‘rniga tasdiqSora / matnSora ishlating:\n' + topildi.join('\n')).toEqual([]);
  });
  it('qo‘riqchi o‘zi ishlaydi: namunalarni ushlaydi', () => {
    for (const s of ['window.prompt("a")', 'if (!window.confirm(x)) return', "alert('x')", 'const s = prompt (m)']) expect(QIDIRILADI.test(s), s).toBe(true);
    for (const s of ['await tasdiqSora({})', 'matnSora(x)', 'toast.alert(x)', 'confirmed(x)', 'onConfirm(x)']) expect(QIDIRILADI.test(s), s).toBe(false);
  });
});
