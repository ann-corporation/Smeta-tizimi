import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  faylExplorerOl: vi.fn(), faylBaytlari: vi.fn(), f2AktlarniOqiFonda: vi.fn(), fetch: vi.fn(),
}));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: { id: 5, nom: 'NTB' }, yuklanmoqda: false }) }));
vi.mock('../../umumiy/kontekst/PTOWorkspaceContext', () => ({ usePTOWorkspace: () => ({ scope: { objectId: null }, setObjectId: vi.fn() }) }));
vi.mock('../../api/supabase', async (asl) => ({
  ...(await asl<typeof import('../../api/supabase')>()),
  sbT2ObyektlarOlKomp: vi.fn(async () => ({ ok: true, qatorlar: [{ id: 3, nom: 'Fast Food', loyiha_id: 1 }] })),
  sbT2DaraxtOl: vi.fn(async () => ({ ok: true, qatorlar: [] })),
  sbOqi: vi.fn(async () => ({ ok: true, qatorlar: [] })),
}));
vi.mock('../../api/t2-nakopitelniy', async (asl) => ({ ...(await asl<typeof import('../../api/t2-nakopitelniy')>()), t2NakopitelniyToliq: vi.fn(async () => ({ ok: false })) }));
vi.mock('../../api/t2-fayl', () => ({ faylExplorerOl: m.faylExplorerOl, faylBaytlari: m.faylBaytlari }));
vi.mock('../../lib/f2-moslash-v3/fonda', () => ({ f2AktlarniOqiFonda: m.f2AktlarniOqiFonda, f2MoslashV3Fonda: vi.fn() }));

import F2ImportV3 from './F2ImportV3';

const fayl = (o: Record<string, unknown>) => ({ id: 1, nom: 'F2.xlsx', tur: 'f2_akt', versiya: 1, mime: 'application/octet-stream', hajm: 10, sha256: 'a', sana: '2026-10-01T00:00:00Z', kim: null, loyiha_id: 1, loyiha: 'L', obyekt_id: 3, obyekt: 'Fast Food', ...o });

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  vi.stubGlobal('fetch', m.fetch);
  m.faylExplorerOl.mockResolvedValue({ ok: true, rol: 'boss', kompaniya_id: 5, kompaniya: 'NTB', fayllar: [
    fayl({ id: 11, nom: 'F2 sentabr.xlsx', versiya: 2, davr: '2026-09' }),
    fayl({ id: 12, nom: 'LRV.xlsx', tur: 'smeta_lrv' }),                       // F2 emas — ko'rinmaydi
    fayl({ id: 13, nom: 'Boshqa obyekt.xlsx', obyekt_id: 99 }),                 // boshqa obyekt — ko'rinmaydi
  ] });
  m.faylBaytlari.mockResolvedValue(new Uint8Array([1, 2, 3]));
  m.f2AktlarniOqiFonda.mockResolvedValue([{ fayl: 'F2 sentabr.xlsx', varaq: 'Akt', davr: '2026-09', davrMatn: 'сентябрь 2026', daraxt: [], jami: { pryamye: null, ranee: null }, qatorlarJami: 0, ishlarSoni: 0, barglarSoni: 0, ogohlantirishlar: [] }]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('F2 import — tizimdagi F2 fayldan tanlash', () => {
  it('faqat shu obyektning F2 fayllari ko‘rinadi; tanlanganda R2 dan olinadi va QAYTA YUKLANMAYDI', async () => {
    render(<F2ImportV3 />);
    fireEvent.change(await screen.findByLabelText('Obyekt'), { target: { value: '3' } });
    const sel = await screen.findByLabelText('Tizimdagi F2 fayl');
    const variantlar = Array.from((sel as HTMLSelectElement).options).map((o) => o.textContent);
    expect(variantlar.some((x) => x?.includes('F2 sentabr.xlsx'))).toBe(true);
    expect(variantlar.some((x) => x?.includes('LRV.xlsx') || x?.includes('Boshqa obyekt'))).toBe(false);
    fireEvent.change(sel, { target: { value: '11' } });
    await waitFor(() => expect(m.faylBaytlari).toHaveBeenCalledWith(11));
    await waitFor(() => expect(m.f2AktlarniOqiFonda).toHaveBeenCalledTimes(1));
    expect(m.f2AktlarniOqiFonda.mock.calls[0][0]).toBe('F2 sentabr.xlsx');
    // Hech qanday yuklash so'rovi yo'q (R2 ga yangi nusxa yozilmaydi).
    expect(m.fetch).not.toHaveBeenCalledWith('/api/hujjat-yukla', expect.anything());
  });

  it('tizimda F2 fayl bo‘lmasa tanlov ko‘rsatilmaydi', async () => {
    m.faylExplorerOl.mockResolvedValue({ ok: true, rol: 'boss', kompaniya_id: 5, kompaniya: 'NTB', fayllar: [] });
    render(<F2ImportV3 />);
    fireEvent.change(await screen.findByLabelText('Obyekt'), { target: { value: '3' } });
    await waitFor(() => expect(m.faylExplorerOl).toHaveBeenCalled());
    expect(screen.queryByLabelText('Tizimdagi F2 fayl')).toBeNull();
  });
});
