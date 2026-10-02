/**
 * TIL QO'RIQCHISI (egasi, 2026-10-02: "bundan keyin til masalasi ish davomida birato'la hal qilib borilsin").
 *
 * 1) Kodda `t('...')` bilan yozilgan HAR matnning rus va ingliz tarjimasi lug'atda bo'lishi shart.
 * 2) "Shotirak" (ratchet): har fayldagi tarjimaga o'tmagan interfeys matnlari soni `baza.json` dagidan OSHMASLIGI
 *    kerak; yangi faylda — 0. Matnni t() ga o'tkazgach bazani kamaytiring: `npm run i18n:baza` (faqat kamaytiradi).
 * Rasmiy hujjat generatorlari (lib/*-export, hujjat-yozuvchi — rus tilida) va testlar hisobga olinmaydi.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ru from './lugat/ru.json';
import en from './lugat/en.json';

const ILDIZ = join(__dirname, '..', '..');
const SRC = join(ILDIZ, 'src');
const BAZA_FAYL = join(__dirname, 'baza.json');

function fayllar(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'i18n' || n === 'node_modules' ? [] : fayllar(p);
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$|\.d\.ts$|\.fixture\.ts$/.test(n) ? [p] : [];
  });
}
const yol = (p: string) => relative(ILDIZ, p).replace(/\\/g, '/');
const HARF = /[A-Za-zА-Яа-яЎўҚқҒғҲҳ]{2,}/;

/** Tarjimaga o'tmagan interfeys matnlari: JSX matn tugunlari va placeholder/title/aria-label/alt atributlari. */
export function ochiqMatnlar(kod: string): string[] {
  const r: string[] = [];
  for (const m of kod.matchAll(/>([^<>{}`;=]*?)</g)) {
    const s = m[1].replace(/&[a-z]+;/g, ' ').trim();
    if (HARF.test(s)) r.push(s);
  }
  for (const m of kod.matchAll(/\b(?:placeholder|title|aria-label|alt)="([^"]*)"/g)) if (HARF.test(m[1])) r.push(m[1]);
  return r;
}

const tsxFayllar = fayllar(SRC).filter((p) => p.endsWith('.tsx'));
const sanoq = Object.fromEntries(tsxFayllar.map((p) => [yol(p), ochiqMatnlar(readFileSync(p, 'utf8')).length]).filter(([, n]) => (n as number) > 0));

describe('til qoidasi', () => {
  it("t('...') matnlarining rus va ingliz tarjimasi bor", () => {
    const yoq: string[] = [];
    for (const p of fayllar(SRC)) {
      for (const m of readFileSync(p, 'utf8').matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*?)\1/g)) {
        const k = m[2].replace(/\\(['"\\])/g, '$1');
        if (!(k in ru) || !(k in en)) yoq.push(`${yol(p)}: ${k}${k in ru ? '' : ' [ru]'}${k in en ? '' : ' [en]'}`);
      }
    }
    expect(yoq, `Tarjimasi yo'q matnlar — lugat/ru.json va lugat/en.json ga qo'shing:\n${yoq.join('\n')}`).toEqual([]);
  });

  it('tarjimaga o‘tmagan matnlar soni oshmaydi (yangi faylda — 0)', () => {
    const baza = JSON.parse(readFileSync(BAZA_FAYL, 'utf8')) as Record<string, number>;
    if (process.env.I18N_BAZA) {
      const yangi = Object.fromEntries(Object.entries(sanoq).map(([f, n]) => [f, process.env.I18N_BAZA === 'boshlash' ? n : Math.min(n as number, baza[f] ?? 0)]));
      writeFileSync(BAZA_FAYL, JSON.stringify(Object.fromEntries(Object.entries(yangi).sort()), null, 1) + '\n');
      return;
    }
    const oshgan = Object.entries(sanoq).filter(([f, n]) => (n as number) > (baza[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} (ruxsat ${baza[f] ?? 0}) — ${ochiqMatnlar(readFileSync(join(ILDIZ, f), 'utf8')).slice(0, 5).join(' | ')}`);
    expect(oshgan, `Interfeys matni t() siz yozilgan. Matnni t('...') ga o'rang va ru/en tarjimasini qo'shing:\n${oshgan.join('\n')}`).toEqual([]);
  });

  it('ru va en lug‘atlari bir xil kalitlarga ega', () => {
    expect(Object.keys(ru).filter((k) => !(k in en))).toEqual([]);
    expect(Object.keys(en).filter((k) => !(k in ru))).toEqual([]);
  });
});
