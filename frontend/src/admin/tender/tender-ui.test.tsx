import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HolatBelgi, isoDanLokal, lokaldanIso, TenderPul, tenderXato } from './tender-ui';

describe('tender ui', () => {
  it('pul: asosiy QQS bilan, pastida QQS siz', () => {
    render(<TenderPul ndsSiz={1000000} foiz={12} />);
    expect(screen.getByText(/QQS bilan/)).toBeTruthy();
    expect(screen.getByText(/QQS siz/)).toBeTruthy();
    expect(document.body.textContent).toContain('1 120 000');
  });
  it('pul: noma\'lum — «kiritilmagan», 0 emas', () => {
    render(<TenderPul ndsSiz={null} foiz={12} />);
    expect(screen.getByText('kiritilmagan')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\b0\b/);
  });
  it('pul: stavka noma\'lum bo\'lsa QQS bilan summa chiqmaydi', () => {
    render(<TenderPul ndsSiz={500} foiz={null} />);
    expect(screen.getByText(/stavkasi noma/)).toBeTruthy();
  });
  it('holat belgisi va xato xabari', () => {
    render(<HolatBelgi holat="baholash" />);
    expect(screen.getByText('Baholash')).toBeTruthy();
    expect(tenderXato({ code: 'ASOS_KERAK' })).toContain('asos');
    expect(tenderXato({ error: 'Boshqa xato' })).toBe('Boshqa xato');
  });
  it('sana ⇄ datetime-local', () => {
    expect(lokaldanIso('')).toBeNull();
    const iso = '2026-12-01T10:30:00.000Z';
    expect(lokaldanIso(isoDanLokal(iso))).toBe(iso);
  });
});
