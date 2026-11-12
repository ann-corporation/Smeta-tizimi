// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ yoz: vi.fn(), tasdiq: vi.fn(), toast: vi.fn(), joriy: { current: { id: 17, nom: 'K', kod: 'k', rol: 'pto', is_director: false, mavqe: null, permissions: ['document.write'] } as Record<string, unknown> | null } }));
vi.mock('../../api/supabase', () => ({ yozAmali: m.yoz }));
vi.mock('../../api/obyektlar-kesh-belgi', () => ({ obyektlarEskirdi: vi.fn() }));
vi.mock('../../umumiy/ui/Tasdiq', () => ({ tasdiqSora: m.tasdiq }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: m.joriy.current }) }));

import { ArxivTugma } from './ArxivTugma';

afterEach(() => { cleanup(); vi.clearAllMocks(); m.joriy.current = { id: 17, nom: 'K', kod: 'k', rol: 'pto', is_director: false, mavqe: null, permissions: ['document.write'] }; });

describe('ArxivTugma', () => {
  it('tasdiqsiz hech narsa yozilmaydi', async () => {
    m.tasdiq.mockResolvedValue(false);
    render(<ArxivTugma tur="shartnoma" id={5} nom="№ 1" />);
    fireEvent.click(screen.getByTestId('arxiv-shartnoma-5'));
    await waitFor(() => expect(m.tasdiq).toHaveBeenCalled());
    expect(m.yoz).not.toHaveBeenCalled();
  });
  it('tasdiqdan keyin arxivla_v1 yuboriladi va onDone chaqiriladi', async () => {
    m.tasdiq.mockResolvedValue(true); m.yoz.mockResolvedValue({ ok: true });
    const onDone = vi.fn();
    render(<ArxivTugma tur="loyiha" id={9} nom="Bog" onDone={onDone} />);
    fireEvent.click(screen.getByTestId('arxiv-loyiha-9'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(m.yoz).toHaveBeenCalledWith({ amal: 'arxivla_v1', tur: 'loyiha', id: 9 });
  });
  it('tasdiqlangan hujjat bor — server sababi ko‘rsatiladi, onDone chaqirilmaydi', async () => {
    m.tasdiq.mockResolvedValue(true);
    m.yoz.mockResolvedValue({ ok: false, code: 'TASDIQLANGAN_BOR', xabar: 'Obyektda 2 ta tasdiqlangan hujjat bor' });
    const onDone = vi.fn();
    render(<ArxivTugma tur="obyekt" id={3} nom="Ob" onDone={onDone} />);
    fireEvent.click(screen.getByTestId('arxiv-obyekt-3'));
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith('Obyektda 2 ta tasdiqlangan hujjat bor', 'danger'));
    expect(onDone).not.toHaveBeenCalled();
  });
  it('ruxsati yo‘q (document.write yo‘q) yoki rahbar roli — tugma ko‘rinmaydi', () => {
    m.joriy.current = { id: 17, rol: 'pto', permissions: ['document.read'] };
    const a = render(<ArxivTugma tur="akt" id={1} nom="F2" />);
    expect(a.container.querySelector('button')).toBeNull();
    cleanup();
    m.joriy.current = { id: 17, rol: 'rahbar', permissions: ['document.write'] };
    const b = render(<ArxivTugma tur="akt" id={1} nom="F2" />);
    expect(b.container.querySelector('button')).toBeNull();
  });
});
