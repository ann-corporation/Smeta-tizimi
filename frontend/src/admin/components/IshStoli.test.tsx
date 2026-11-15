import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IshStoli from './IshStoli';
import { ishStoliParse } from '../../api/t2-ish-stoli';

const javob = (tomon: string, rejim: 'dala' | 'standart') => ishStoliParse({
  ok: true, versiya: 1, joriy: `1:${tomon}`, kompaniya_id: 1, tomon, tomon_nom: tomon === 'prorab' ? 'Prorab / usta (dala)' : 'Texnadzor / buyurtmachi', rejim, dala: null,
  kabinetlar: [{ id: '1:prorab', kompaniya_id: 1, nom: 'Sinov MChJ', tomon: 'prorab', tomon_nom: 'Prorab', manba: 'azolik', joriy: tomon === 'prorab' }, { id: '1:texnadzor', kompaniya_id: 1, nom: 'Sinov MChJ', tomon: 'texnadzor', tomon_nom: 'Texnadzor', manba: 'aloqa', joriy: tomon !== 'prorab' }],
  amallar: [{ id: 'fakt_yoz', nom: 'Fakt yozish', ikonka: 'fakt', maqsad: { tur: 'native', kod: 'fakt' }, birlamchi: true }, { id: 'tasdiqlash', nom: 'Tasdiqlash', ikonka: 'tasdiq', maqsad: { tur: 'native', kod: 'tasdiq' } }],
  bolimlar: tomon === 'prorab'
    ? [{ id: 'dala', tur: 'amallar', nom: 'Dalada', katta: true, amallar: ['fakt_yoz'] }, { id: 'tasdiq', tur: 'royxat', nom: 'Tasdiqlash', manba: 'tasdiq.navbat', amal: 'tasdiqlash' }]
    : [{ id: 'tez', tur: 'amallar', nom: 'Nazorat', amallar: ['tasdiqlash'] }],
  birlamchi_amal: 'fakt_yoz',
})!;

afterEach(cleanup);

describe('IshStoli (server-driven chizish)', () => {
  it('prorab: katta tugma, kabinet almashtirgich, royxat uchun «Ochish»', () => {
    const onK = vi.fn();
    render(<MemoryRouter><IshStoli d={javob('prorab', 'dala')} onKabinet={onK} /></MemoryRouter>);
    expect(screen.getByTestId('ish-stoli').getAttribute('data-rejim')).toBe('dala');
    expect(document.querySelector('[data-amal="fakt_yoz"]')?.getAttribute('href')).toBe('/admin/fakt');
    expect(screen.getByText('Ochish').getAttribute('href')).toBe('/admin/bugun');
    fireEvent.change(screen.getByLabelText('Kabinetni almashtirish'), { target: { value: '1:texnadzor' } });
    expect(onK).toHaveBeenCalledWith('1:texnadzor');
  });
  it('texnadzor: yozish tugmasi yo\'q, tasdiqlash bor', () => {
    render(<MemoryRouter><IshStoli d={javob('texnadzor', 'standart')} onKabinet={() => {}} /></MemoryRouter>);
    expect(document.querySelector('[data-amal="fakt_yoz"]')).toBeNull();
    expect(document.querySelector('[data-amal="tasdiqlash"]')).not.toBeNull();
  });
});