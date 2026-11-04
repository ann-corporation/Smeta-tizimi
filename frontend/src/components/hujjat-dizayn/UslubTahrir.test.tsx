import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { UslubTahrir } from './UslubTahrir';
import { DIZAYN_PRESETLAR, joriyHujjatDizayni, type HujjatDizayn } from '../../lib/hujjat-yozuvchi';
import { HujjatDizayni } from '../../admin/sahifalar/HujjatDizayni';
import { tilQoy } from '../../i18n/til';

afterEach(() => { cleanup(); localStorage.clear(); tilQoy('uz'); });

function Quti({ boshi = DIZAYN_PRESETLAR.kontrastli, onOzgardi }: { boshi?: HujjatDizayn; onOzgardi?: (d: HujjatDizayn) => void }) {
  const [d, setD] = useState(boshi);
  return <UslubTahrir dizayn={d} onChange={(x) => { setD(x); onOzgardi?.(x); }} />;
}

describe('UslubTahrir — Hujjat dizayni', () => {
  it('sukut «Kontrastli»: Тип ustuni namunada ko‘rinmaydi; yoqilsa namuna va dizayn o‘zgaradi', () => {
    let oxirgi: HujjatDizayn | null = null;
    render(<Quti onOzgardi={(d) => { oxirgi = d; }} />);
    const namuna = screen.getByTestId('dizayn-namuna');
    expect(within(namuna).queryByText('Тип')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Тип|Tip belgisi/ }));
    expect(within(screen.getByTestId('dizayn-namuna')).getByText('Тип')).toBeTruthy();
    expect(oxirgi!.tipKorsat).toBe(true);
    expect(oxirgi!.preset).toBe('maxsus');
  });

  it('daraja uslubi o‘zgarishi jonli namunada ko‘rinadi (RS qalin, BL otstup)', () => {
    render(<Quti />);
    const rs = () => screen.getAllByText('Затраты труда рабочих')[0] as HTMLElement;
    expect(rs().style.fontStyle).toBe('italic');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Resurs (RS): Kursiv' }));
    expect(rs().style.fontStyle).toBe('normal');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Resurs (RS): Otstup' }), { target: { value: '4' } });
    expect(rs().style.paddingLeft).toBe(`${5 + 4 * 9}px`);
  });

  it('andozalar almashadi: Minimal — ingichka (nuqtali) chegara; Klassik — fonsiz', () => {
    render(<Quti />);
    fireEvent.click(screen.getByRole('button', { name: 'Minimal' }));
    expect((screen.getAllByText('Затраты труда рабочих')[0] as HTMLElement).style.borderLeft).toContain('dotted');
    fireEvent.click(screen.getByRole('button', { name: 'Klassik' }));
    expect((screen.getByText('БЕТОН ТЯЖЁЛЫЙ') as HTMLElement).style.background).toBe('rgb(255, 255, 255)');
  });

  it('ru tilida yorliqlar tarjima qilinadi', () => {
    tilQoy('ru');
    render(<Quti />);
    expect(screen.getByRole('button', { name: 'Минимальный' })).toBeTruthy();
    expect(screen.getByText('Предпросмотр')).toBeTruthy();
  });
});

describe('Hujjatlar dizayni sahifasi — dizayn saqlanadi', () => {
  it('o‘zgartirish brauzerga yoziladi va generatorlar (joriyHujjatDizayni) shuni oladi', () => {
    render(<HujjatDizayni />);
    expect(joriyHujjatDizayni().preset).toBe('kontrastli');
    fireEvent.click(screen.getByRole('button', { name: 'Minimal' }));
    expect(joriyHujjatDizayni().preset).toBe('minimal');
    expect(joriyHujjatDizayni().chegara).toBe('hair');
  });
});
