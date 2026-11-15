import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QrSvg } from './ChopKorinish';

describe('ChopKorinish QR', () => {
  it('belgi yoqilganda markazda QURAI belgisi, o\'chirilganda yo\'q', () => {
    const url = 'https://example.test/t/' + 'T'.repeat(22);
    expect(renderToStaticMarkup(<QrSvg url={url} belgi />)).toContain('data-qr-belgi="1"');
    expect(renderToStaticMarkup(<QrSvg url={url} belgi={false} />)).not.toContain('data-qr-belgi');
  });
});
