import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AMALLAR } from './amal';
import { AMAL_HALI_YOQ } from './amal-hali-yoq';
import { WRITE_COMMAND_POLICY, DINAMIK_BUYRUQLAR } from '../../../functions/_shared/write-command-policy';
import { PERMISSIONS } from '../company-authorization/effective-authorization';
import { SAHIFALAR } from './sahifa';

const API = join(__dirname, '../../../functions/api');

/** Maxsus gateway'lar: `yozishYuki(amal, so)` eksport qiladigan har fayl (tomon, loyihachi, laboratoriya, kelgusi: yuk-tashish, bozor, tender-p1 …). */
function gatewayYozuvlar(): string[] {
  const out: string[] = [];
  for (const f of readdirSync(API).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
    const s = readFileSync(join(API, f), 'utf8');
    const a = s.indexOf('export function yozishYuki');
    if (a < 0) continue;
    let b = s.indexOf('\nexport function', a + 10);
    if (b < 0) b = s.length;
    for (const m of s.slice(a, b).matchAll(/case '([a-z0-9_]+)'/g)) out.push(`${f.replace('.ts', '')}:${m[1]}`);
  }
  return out;
}

const hammasi = [...new Set([...Object.keys(WRITE_COMMAND_POLICY), ...DINAMIK_BUYRUQLAR, ...gatewayYozuvlar()])];
const qoplangan = new Set(AMALLAR.flatMap((a) => a.qoplaydi ?? []));

describe('amal reestri qamrovi (AI yuzasiz funksiya chiqmaydi)', () => {
  it('gateway yozuv amali yo Amal.qoplaydi da, yo AMAL_HALI_YOQ da (sabab bilan)', () => {
    const yoq = hammasi.filter((k) => !qoplangan.has(k) && !(k in AMAL_HALI_YOQ));
    expect(yoq, `Amal reestriga (lib/reestr/amal.ts qoplaydi) yoki sabab bilan amal-hali-yoq.ts ga yozing:\n${yoq.join('\n')}`).toEqual([]);
  });
  it('ikkalasida ham bo‘lmaydi; keraksiz (o‘chirilgan) yozuv qolmaydi', () => {
    expect(hammasi.filter((k) => qoplangan.has(k) && k in AMAL_HALI_YOQ)).toEqual([]);
    const bor = new Set(hammasi);
    expect(Object.keys(AMAL_HALI_YOQ).filter((k) => !bor.has(k)), 'AMAL_HALI_YOQ da endi mavjud bo‘lmagan kalit').toEqual([]);
    expect([...qoplangan].filter((k) => !bor.has(k)), 'Amal.qoplaydi da mavjud bo‘lmagan kalit (imlo?)').toEqual([]);
  });
  it('«hali yo‘q» jadvalida har kalitning sababi bor', () => {
    for (const [k, v] of Object.entries(AMAL_HALI_YOQ)) expect(v.length, k).toBeGreaterThan(10);
  });
  it('amal kaliti yagona; capability PERMISSIONS da; yo‘l reestrdagi sahifa; nom va sinonim bor', () => {
    const k = AMALLAR.map((a) => a.kalit);
    expect(new Set(k).size).toBe(k.length);
    const ruxsat = new Set<string>(PERMISSIONS);
    const yollar = new Set(SAHIFALAR.map((s) => s.yol));
    for (const a of AMALLAR) {
      expect(ruxsat.has(a.capability), `${a.kalit}: ${a.capability}`).toBe(true);
      if (a.yol) expect(yollar.has(a.yol), `${a.kalit}: ${a.yol}`).toBe(true);
      expect(a.nom, a.kalit).toBeTruthy();
      if (a.turi === 'yozish') { expect(a.sinonimlar?.length, a.kalit).toBeGreaterThan(0); expect(a.en?.length, `${a.kalit}: en`).toBeGreaterThan(0); expect(a.tasdiq, `${a.kalit}: tasdiq`).toBeTruthy(); }
    }
  });
  it('pul amali ikki tasdiqli', () => {
    for (const k of ['moliya.tolov', 'moliya.xarajat', 'arxiv.obyekt', 'f2.tasdiqlash', 'bux.provodka']) expect(AMALLAR.find((a) => a.kalit === k)?.tasdiq, k).toBe('ikkiTasdiq');
  });
  it('qamrov hisobi (hujjat uchun)', () => {
    expect(hammasi.length).toBeGreaterThan(200);
    expect(qoplangan.size + Object.keys(AMAL_HALI_YOQ).length).toBe(hammasi.length);
  });
});