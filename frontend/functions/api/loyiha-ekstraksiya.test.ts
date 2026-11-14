import { describe, expect, it } from 'vitest';
import { manbaR2 } from '../../src/lib/loyiha-smeta/ekstraksiya-kesh';
import { ekstraksiyaKaliti, MAX_BAYT } from './loyiha-ekstraksiya';
import { SCOPED_APIS, requestPermission } from '../_shared/permission-policy';

describe('loyiha-ekstraksiya shlyuzi', () => {
  it('kalit kompaniyaga bog‘langan (tenant), manba kaliti server kaliti bilan bir xil', () => {
    const sha = 'b'.repeat(64);
    expect(ekstraksiyaKaliti(5, sha)).toBe(`loyiha-ekstraksiya/k5/${sha}.json.gz`);
    expect(manbaR2(5, sha)).toBe('r2:' + ekstraksiyaKaliti(5, sha));
    expect(ekstraksiyaKaliti(5, sha)).not.toBe(ekstraksiyaKaliti(6, sha));
    expect(MAX_BAYT).toBe(12 * 1024 * 1024);
  });
  it('siyosat: o‘qish smeta.read, yozish smeta.write', () => {
    expect(SCOPED_APIS.has('loyiha-ekstraksiya')).toBe(true);
    expect(requestPermission('loyiha-ekstraksiya', 'GET', {}, new URLSearchParams())).toBe('smeta.read');
    expect(requestPermission('loyiha-ekstraksiya', 'PUT', {}, new URLSearchParams())).toBe('smeta.write');
  });
});
