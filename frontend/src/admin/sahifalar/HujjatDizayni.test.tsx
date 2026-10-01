import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { unzipSync, strFromU8 } from 'fflate';
import { HujjatDizayni } from './HujjatDizayni';
import { MAVZU_HEX, RasmiyVaraq, hujjatMavzusi, rasmiyKitob } from '../../lib/hujjat-yozuvchi';

afterEach(() => { cleanup(); localStorage.clear(); });

const fillRangi = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)['xl/styles.xml']);
const kitob = () => rasmiyKitob([new RasmiyVaraq({ nom: 'Лист', sarlavha: 'ТЕСТ', ustunlar: [{ sarlavha: 'А', kenglik: 10, tur: 'matn' }] })], { tur: 'f2' }).bytes;

describe('Hujjatlar dizayni', () => {
  it('sukut — kulrang; tanlangan mavzu saqlanadi va shu turdagi hujjatga qo‘llanadi', () => {
    expect(hujjatMavzusi('f2')).toBe('kulrang');
    expect(fillRangi(kitob())).toContain(`FF${MAVZU_HEX.kulrang.bolim}`);
    render(<HujjatDizayni />);
    fireEvent.click(screen.getByRole('radio', { name: /Акт Ф-2 \(форма № 2\) va resurs vedomosti: Ko‘k/ }));
    expect(hujjatMavzusi('f2')).toBe('kok');
    expect(hujjatMavzusi('f3')).toBe('kulrang');                                    // boshqa tur o'zgarmaydi
    expect(fillRangi(kitob())).toContain(`FF${MAVZU_HEX.kok.bolim}`);
    fireEvent.click(screen.getByRole('button', { name: 'Rangsiz' }));                 // hammasiga
    expect(hujjatMavzusi('f3')).toBe('rangsiz');
    expect(fillRangi(kitob())).not.toContain('patternType="solid"');
  });
});
