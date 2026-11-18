import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ yukla: vi.fn(), loyiha: vi.fn() }));
vi.mock('../../api/t2-loyiha', () => ({ sbLoyihaUmumiy: m.loyiha }));
vi.mock('../../api/t2-hujjat-canonical', () => ({ hujjatYukla: m.yukla, hujjatYuklabOlishUrl: () => '#' }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: vi.fn() }));
/* Disk oynasi alohida testlangan: bu yerda tugma Disk faylini File sifatida handlerga bergani tekshiriladi. */
vi.mock('../../hujjat-maydoni/DiskdanTanlash', () => ({
  DiskdanTanlashTugma: ({ onFayllar, accept }: { onFayllar: (f: File[]) => void; accept?: string }) => (
    <button type="button" data-accept={accept} onClick={() => onFayllar([new File(['x'], 'disk.png', { type: 'image/png' })])}>Diskdan tanlash</button>
  ),
}));
import { FotoYuklash } from './FotoYuklash';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('FotoYuklash: Diskdan tanlash', () => {
  it('Diskdan tanlangan rasm kompyuterdan yuklangandek hujjatYukla ga beriladi', async () => {
    m.loyiha.mockResolvedValue({ ok: true, id: 7 });
    m.yukla.mockResolvedValue({ ok: true, data: { document_id: 55 } });
    const onOzgardi = vi.fn();
    render(<FotoYuklash kompaniyaId={17} idlar={[1]} onOzgardi={onOzgardi} />);
    const tugma = screen.getByRole('button', { name: 'Diskdan tanlash' });
    expect(tugma.getAttribute('data-accept')).toBe('image/*');
    fireEvent.click(tugma);
    await waitFor(() => expect(onOzgardi).toHaveBeenCalledWith([1, 55]));
    expect(m.yukla.mock.calls[0][0]).toMatchObject({ kompaniyaId: 17, loyihaId: 7, documentType: 'tekshiruv_foto' });
    expect((m.yukla.mock.calls[0][0].file as File).name).toBe('disk.png');
  });
});
