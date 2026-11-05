import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../api/supabase', () => ({ sbT2AktReestrOl: vi.fn(async () => ({ ok: true, qatorlar: [
  { id: 714, tur: 'f2', raqam: '535-С', oy: '2026-11-01', holat: 'qoralama', lifecycle_status: 'draft', hujjat_jami: 10 },
  { id: 600, tur: 'f2', raqam: '530', oy: '2026-10-01', holat: 'tasdiqlangan', lifecycle_status: 'approved', hujjat_jami: 20 },
] })) }));
vi.mock('../../lib/f2-manba', () => ({ f2ImportQilinganmi: vi.fn(async () => false) }));
vi.mock('../zakazchik/ZakazchigaYuborish', () => ({ ZakazchigaYuborish: () => <span>yuborish</span> }));

import { TayyorlanganF2lar } from './TayyorlanganF2lar';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Shu obyektda tayyorlangan F2 lar', () => {
  it('qoralamada «Davom ettirish» (?akt=ID) va alohida «Tasdiqlash»; eski «avval tasdiqlang» matni yo‘q', async () => {
    render(<MemoryRouter><TayyorlanganF2lar kompaniyaId={1} obyektId={8} /></MemoryRouter>);
    const davom = await screen.findByTestId('f2-davom');
    expect(davom.getAttribute('href')).toBe('/admin/f2-tayyorlash?obyekt=8&akt=714');
    expect(screen.getByTestId('f2-tasdiqlash').getAttribute('href')).toBe('/admin/f2-tarix?obyekt=8');
    expect(screen.queryByText(/avval F2 tarixida tasdiqlang/)).toBeNull();
    expect(screen.getByText('yuborish')).toBeTruthy();
  });
});
