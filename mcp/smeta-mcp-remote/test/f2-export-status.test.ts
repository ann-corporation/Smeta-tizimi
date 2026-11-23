import { expect, it } from 'vitest';
import { f2ExportStatus } from '../src/fayl';

it('rejects incomplete manifests and keeps failed or queued exports out of current', () => {
  const ready = { ok: true, fayl_id: 1, versiya: 2, eskirgan: false };
  expect(f2ExportStatus(ready)).toBe('current');
  expect(f2ExportStatus({ ...ready, navbat_holat: 'kutmoqda' })).toBe('stale');
  expect(f2ExportStatus({ ...ready, navbat_holat: 'ishlanmoqda' })).toBe('generating');
  expect(f2ExportStatus({ ...ready, navbat_holat: 'xato' })).toBe('failed');
  expect(f2ExportStatus({ ...ready, versiya: null })).toBe('failed');
  expect(f2ExportStatus({ ...ready, eskirgan: undefined })).toBe('stale');
});
