import { describe, expect, it } from 'vitest';
import { APP_TITLE, titleForPath } from './pageTitle';
describe('browser page identity', () => {
  it.each([['/admin','Rahbar paneli | QURAI'],['/admin/dashboard','Rahbar paneli | QURAI'],['/admin/documents','Hujjatlar | QURAI'],['/admin/storage','Fayl saqlash | QURAI'],['/admin/test/saqlash','Fayl saqlash | QURAI'],['/admin/mindmap','Mindmap | QURAI'],['/admin/participants','Loyiha ishtirokchilari | QURAI'],['/admin/system-control','Tizim boshqaruv markazi | QURAI']])('maps %s', (path, expected) => expect(titleForPath(path)).toBe(expected));
  it('uses product title for unknown routes', () => expect(titleForPath('/')).toBe(APP_TITLE));
});
