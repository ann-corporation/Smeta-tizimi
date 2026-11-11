import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { F2MoslashHisoboti } from './F2MoslashHisoboti';
import type { HisobotQator, MoslashHisoboti } from '../../lib/f2-moslash-v3/moslashHisoboti';

const q = (uid: string, o: Partial<HisobotQator>): HisobotQator => ({
  uid, manzil: `V!${uid}`, tur: 'bl', kod: 'E1', nom: `ISH ${uid}`, birlik: 'М2', hajm: 1, manbaYol: 'ТИП 1', qatorId: 1,
  smeta: 'E1 ISH', smetaYol: 'ТИП 1', ishonch: 'aniq', usul: 'ball', sabablar: [], shubhali: false, xato: false, ...o,
});

describe('F2MoslashHisoboti', () => {
  it('standart — faqat muammoli qatorlar; «barchasi» bilan hammasi', () => {
    const h: MoslashHisoboti = {
      qatorlar: [q('1', {}), q('2', { ishonch: 'ehtimol', shubhali: true, sabablar: ['modifikator farqli'] }), q('3', { xato: true, sabablar: ['qo‘shni ish'] })],
      stat: { aniq: 2, ehtimol: 1, topilmadi: 0, otkazildi: 0, shubhali: 1, xato: 1 },
    };
    const { container } = render(<F2MoslashHisoboti hisobot={h} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(screen.getByText(/modifikator farqli/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
  });
});
