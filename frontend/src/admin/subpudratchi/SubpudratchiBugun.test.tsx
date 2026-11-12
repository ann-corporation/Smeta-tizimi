import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => ({ joriy: { id: 7, nom: 'Sub MChJ', rol: 'pto' } }) }));
vi.mock('../../umumiy/kontekst/KompaniyaKerak', () => ({ KompaniyaKerak: () => <div>kompaniya kerak</div> }));
vi.mock('../../api/t2-tomon', () => ({
  aloqalarOl: async () => ({ ok: true, natija: [{ id: 1, holat: 'faol', men_rol: 'subpudratchi', qarshi_rol: 'pudratchi', qarshi_nom: 'GC' }] }),
}));
vi.mock('../../api/t2-sub', () => ({
  subIshlarimOl: async () => ({ ok: true, natija: { ishlar: [
    { id: 11, aloqa_id: 1, gc_kompaniya_id: 2, gc_nom: 'GC', obyekt_id: 3, obyekt_nom: 'Obyekt', tartib: 1, kod: 'K-1', nom: 'Gidroizolyatsiya', birlik: 'm2', hajm: 100, narx: 800, qqs_foiz: 12, qabul_hajm: 40, kutilayotgan_hajm: 0, qoralama_hajm: 0 },
    { id: 12, aloqa_id: 1, gc_kompaniya_id: 2, gc_nom: 'GC', obyekt_id: 3, obyekt_nom: 'Obyekt', tartib: 2, kod: 'K-2', nom: 'Stяжка', birlik: 'm2', hajm: 10, narx: null, qqs_foiz: 12, qabul_hajm: 0, kutilayotgan_hajm: 0, qoralama_hajm: 0 },
  ] } }),
  subAktlarOl: async () => ({ ok: true, natija: { aktlar: [] } }),
  subTolovOl: async () => ({ ok: true, natija: { aktlar: [] } }),
  subAktTafsilotOl: async () => ({ ok: false, error: 'x' }),
  subAktYoz: async () => ({ ok: true, natija: { id: 1 } }),
  subAktYubor: async () => ({ ok: true, natija: { id: 1, holat: 'yuborilgan' } }),
  subAktQaytar: async () => ({ ok: true, natija: { id: 1, holat: 'qoralama' } }),
}));

import SubpudratchiBugun from './SubpudratchiBugun';

afterEach(cleanup);

describe('SubpudratchiBugun', () => {
  it('5 katta tugma, topshirilgan ishlar; narxsiz qator «kelishilmagan», qoldiq to‘g‘ri; smeta narxi yo‘q', async () => {
    render(<MemoryRouter><SubpudratchiBugun /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText('Gidroizolyatsiya').length).toBeGreaterThan(0));
    for (const nom of ['Shartnomalarim', 'Menga topshirilgan ishlar', 'Faktim va aktim', 'Yuborilgan aktlarim', 'To‘lov holati']) expect(screen.getAllByLabelText(nom).length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain('kelishilmagan');
    expect(document.body.textContent).toContain('60'); // qoldiq: 100 - 40 qabul
    expect(document.body.textContent).not.toMatch(/smeta narxi/i);
  });
});
