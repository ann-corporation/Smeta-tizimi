import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * YAGONA SAQLASH QORIQCHISI (egasi qarori: asl yuklangan hamma narsa R2 da; Postgres'da fayl baytlari yo'q).
 *  1) R2 ga yozish faqat functions/_shared/r2-saqlash.ts (r2Yoz) orqali.
 *  2) type="file" kiritishi bor har yangi komponent asl faylni t2-asl-fayl / hujjatYukla orqali R2 ga saqlashi shart.
 *  3) Yangi migratsiyada bytea / base64 fayl ustuni yo'q.
 */
const FRONT = process.cwd();
const ILDIZ = join(FRONT, '..');
const yur = (d: string, ok: (f: string) => boolean, out: string[] = []): string[] => {
  for (const n of readdirSync(d)) {
    if (n === 'node_modules' || n === 'dist' || n.startsWith('.')) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) yur(p, ok, out); else if (ok(p)) out.push(p);
  }
  return out;
};
const nisbiy = (p: string) => relative(FRONT, p).split('\\').join('/');

describe('yagona R2 saqlash qoriqchisi', () => {
  it('R2 put faqat _shared/r2-saqlash.ts da (boshqa joyda r2Yoz ishlatilsin)', () => {
    const buzilgan: string[] = [];
    for (const f of yur(join(FRONT, 'functions'), (p) => /\.ts$/.test(p) && !/\.test\.ts$/.test(p))) {
      if (nisbiy(f) === 'functions/_shared/r2-saqlash.ts') continue;
      const matn = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      if (/(R2_[A-Z_]+|NORMATIV_R2|\bbucket)!?\.put\(/.test(matn)) buzilgan.push(nisbiy(f));
    }
    expect(buzilgan, 'R2 ga yozish uchun r2Yoz (functions/_shared/r2-saqlash.ts) ishlating:\n' + buzilgan.join('\n')).toEqual([]);
  });

  // Bo'shliq ro'yxati BO'SH: har type=\"file\" komponenti asl faylni R2 ga saqlaydi (egasi qarori 2026-11-15). Yangi element QO'SHILMAYDI.
  const BOSHLIQ = new Set<string>();
  const SAQLAYDI = /t2-asl-fayl|hujjat-yukla|t2-hujjat-canonical|t2-hujjat-arxiv|hujjatYukla|aslFaylSaqla|fotoYukla|t2-yuk-tashish|HujjatYuklash|bzRasmYukla/;

  it('type="file" komponentlari asl faylni R2 ga saqlaydi (yoki ma\'lum bo\'shliq ro\'yxatida)', () => {
    const yangi: string[] = []; const tuzalgan: string[] = [];
    for (const f of yur(join(FRONT, 'src'), (p) => /\.tsx$/.test(p) && !/\.test\.tsx$/.test(p))) {
      const matn = readFileSync(f, 'utf8');
      if (!/type=("file"|\{?['"]file['"]\}?)|showOpenFilePicker/.test(matn)) continue;
      const r = nisbiy(f); const saqlaydi = SAQLAYDI.test(matn);
      if (!saqlaydi && !BOSHLIQ.has(r)) yangi.push(r);
      if (saqlaydi && BOSHLIQ.has(r)) tuzalgan.push(r);
    }
    expect(yangi, 'Asl faylni aslFaylSaqla (src/api/t2-asl-fayl.ts) orqali R2 ga saqlang:\n' + yangi.join('\n')).toEqual([]);
    expect(tuzalgan, 'Bu fayllar endi R2 ga saqlaydi - BOSHLIQ ro\'yxatidan olib tashlang:\n' + tuzalgan.join('\n')).toEqual([]);
  });

  it('ASOS (20261224100000) dan keyingi migratsiyalarda bytea / base64 fayl ustuni yo\'q', () => {
    const mig = join(ILDIZ, 'supabase', 'migrations');
    const buzilgan: string[] = [];
    for (const f of readdirSync(mig).filter((x) => x.endsWith('.sql') && !/\.(rollback|acceptance)\.sql$/.test(x) && x > '20261224100000')) {
      const sql = readFileSync(join(mig, f), 'utf8').replace(/--.*$/gm, '');
      if (/\bbytea\b|_base64\b|fayl_baytlar/i.test(sql)) buzilgan.push(f);
    }
    expect(buzilgan, 'Fayl baytlari Postgres\'da saqlanmaydi - R2 + reyestr (t2_document_registry) ishlating:\n' + buzilgan.join('\n')).toEqual([]);
  });
});
