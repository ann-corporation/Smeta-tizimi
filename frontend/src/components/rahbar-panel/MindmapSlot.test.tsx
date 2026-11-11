import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MindmapSlot } from './MindmapSlot';

vi.mock('../../test02/TestXarita', () => ({ default: () => <div data-testid="xarita-yuklandi" /> }));

describe('MindmapSlot tezlik: og‘ir xarita ko‘ringanda yuklanadi', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('ko‘rinmaguncha xarita (18 s so‘rov) boshlanmaydi', () => {
    const observe = vi.fn();
    vi.stubGlobal('IntersectionObserver', class { observe = observe; disconnect = vi.fn(); });
    render(<MemoryRouter><MindmapSlot kompaniyaId={17} /></MemoryRouter>);
    expect(observe).toHaveBeenCalled();
    expect(screen.queryByTestId('xarita-yuklandi')).toBeNull();
  });
  it('kuzatuvchi yo‘q muhitda darhol ochiladi', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<MemoryRouter><MindmapSlot kompaniyaId={17} /></MemoryRouter>);
    expect(await screen.findByTestId('xarita-yuklandi')).toBeTruthy();
  });
});
