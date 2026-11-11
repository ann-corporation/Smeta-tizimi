import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('kanonik LRV sahifasi kundalik native oqimni birlashtiradi', () => {
  const source = readFileSync(resolve(process.cwd(), 'src', 'admin', 'sahifalar', 'HolatNative.tsx'), 'utf8');

  it('faqat raqamli obyekt kontekstida mavjud native panellarni ulaydi', () => {
    expect(source).toContain("import SmetaYuklaNative from './SmetaYuklaNative';");
    expect(source).toContain("import ResursVedomostNative from './ResursVedomostNative';");
    expect(source).toContain("import NarxNazoratNative from './NarxNazoratNative';");
    expect(source).toContain('<SmetaYuklaNative obyektId={obyektId} onImportlandi={yuklash}');
    expect(source).toContain('<ResursVedomostNative obyektId={obyektId} />');
    expect(source).toContain('<NarxNazoratNative obyektId={obyektId} />');
  });

  it('yuklash ustasi yuklanish belgisi bilan unmount bo‘lmaydi (import natijasi yo‘qolmasin)', () => {
    expect(source).toContain('{panellar && daraxtKorinadi && !error && (');
    expect(source).not.toContain('{panellar && daraxtKorinadi && !loading && !error && (\n          <div key=');
    expect(source).toContain('onSmetaOchish=');
    expect(source).toContain('onVersiyaSaqla=');
  });

  it('eski GAS kompozit sahifani canonical LRV oqimiga qaytarmaydi', () => {
    expect(source).not.toContain("from './Holat'");
    expect(source).not.toContain('apiHolatOl');
  });

  it('owner: forma-asosli Qo‘shimcha/Zamena qo‘shgich olib tashlandi -- bu endi F2 import ikki oynali panelida (drag-drop) ishlaydi', () => {
    expect(source).not.toContain('AdditionalReplacementNative');
  });
});
