import { describe, expect, it } from 'vitest';
import { javobniTekshir, keshKaliti, LOYIHA_AI_SCHEMA } from './loyiha-ai-oqish';
import { SCOPED_APIS, requestPermission } from '../_shared/permission-policy';

describe('loyiha-ai-oqish: tekshiruv va ro‘yxatga olish', () => {
  it('siyosatda ro‘yxatga olingan (smeta.write)', () => {
    expect(SCOPED_APIS.has('loyiha-ai-oqish')).toBe(true);
    expect(requestPermission('loyiha-ai-oqish', 'POST', {}, new URLSearchParams())).toBe('smeta.write');
  });
  it('noma‘lum miqdor null qoladi; noto‘g‘ri javob butunlay rad (fail-closed)', () => {
    const ok = javobniTekshir(JSON.stringify({ items: [{ nom: 'Бетон', belgi: null, birlik: 'м3', miqdor: null, tur: 'beton' }, { nom: 'X', belgi: 'P1', birlik: 'т', miqdor: 1.5, tur: 'zzz' }] }));
    expect(ok.ok && ok.items.map((i) => [i.miqdor, i.tur])).toEqual([[null, 'beton'], [1.5, 'boshqa']]);
    expect(javobniTekshir('{"items":[{"nom":"A","birlik":"м3","miqdor":-1,"tur":"beton"}]}')).toEqual({ ok: false, kod: 'QATOR' });
    expect(javobniTekshir('{"items":[{"nom":"","birlik":"м3","miqdor":1,"tur":"beton"}]}')).toEqual({ ok: false, kod: 'QATOR' });
    expect(javobniTekshir('yo‘q')).toEqual({ ok: false, kod: 'JSON' });
  });
  it('kesh kaliti kompaniya + fayl + sahifa + hudud bilan; sxema miqdorni null qila oladi', () => {
    expect(keshKaliti(7, 'a'.repeat(64), 3, 'r10x20')).toBe(`loyiha-ai-kesh/k7/${'a'.repeat(64)}/s3.r10x20.lm-ai-1.json`);
    expect(JSON.stringify(LOYIHA_AI_SCHEMA)).toContain('"miqdor":{"type":["number","null"]}');
  });
});
