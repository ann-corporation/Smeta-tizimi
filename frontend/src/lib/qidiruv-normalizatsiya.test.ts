import { describe, expect, it } from 'vitest';
import { lotinKirill, qidiruvTayyorla } from './qidiruv-normalizatsiya';

describe('qidiruv normalizatsiya', () => {
  it('lotin beton kirill BETON ni topadi', () => {
    expect(lotinKirill('beton')).toBe('бетон');
    expect(qidiruvTayyorla('beton')('УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ')).toBe(true);
  });
  it('kirill qidiruv ham ishlaydi', () => { expect(qidiruvTayyorla('бетон')('БЕТОН М200')).toBe(true); });
  it('uz -> ru sinonim: kanal tubi -> дно канала', () => {
    expect(qidiruvTayyorla('kanal tubi')('УСТРОЙСТВО ДНА КАНАЛА')).toBe(true);
    expect(qidiruvTayyorla('kanal')('УСТРОЙСТВО ДНА КАНАЛА')).toBe(true);
  });
  it('sh/ch/yu juftliklari', () => { expect(lotinKirill('shag\'al')).toBe('шагал'); expect(lotinKirill('chiroq')).toBe('чирок'); });
  it('har so\'z majburiy', () => { expect(qidiruvTayyorla('beton kabel')('БЕТОН М200')).toBe(false); });
  it('bo\'sh qidiruv hammasini o\'tkazadi', () => { expect(qidiruvTayyorla('  ')('x')).toBe(true); });
});
