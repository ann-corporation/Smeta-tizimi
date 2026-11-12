import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { qabulQiluvchilar, ZakazchigaYuborish } from './ZakazchigaYuborish';
import { aosrTaqdimHolatlari } from '../../lib/aosr-yuborilgan';
import { taqdimQabulRollari } from '../../lib/hujjat-dvigatel';

const st = vi.hoisted(() => ({ aloqalar: [] as any[], yuborildi: [] as any[] }));
vi.mock('../../api/t2-tomon', () => ({
  aloqalarOl: async () => ({ ok: true, natija: st.aloqalar }),
  taqdimYubor: async (...a: unknown[]) => { st.yuborildi.push(a); return { ok: true, natija: {} }; },
}));
vi.mock('./taqdim-holat-hook', () => ({ useYuborilganTaqdim: () => ({ taqdim: null, yangila: async () => {} }) }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: vi.fn() }));

const al = (id: number, rol: string, holat = 'faol') => ({ id, holat, qarshi_rol: rol, qarshi_nom: `Kompaniya ${id}` });
const HAMMASI = [al(1, 'zakazchik'), al(2, 'texnadzor'), al(3, 'loyihachi'), al(4, 'laboratoriya'), al(5, 'taminotchi'), al(6, 'subpudratchi'), al(7, 'investor'), al(8, 'bank')];

afterEach(() => { cleanup(); st.yuborildi = []; });

describe('T10: «Kimga» ro‘yxati hujjat turiga mos tomonlar bilan cheklanadi (reestrdan)', () => {
  it('reestr: F2 — buyurtmachi/texnadzor; АОСР — qo‘shimcha loyihachi; noma‘lum resurs — filtr yo‘q', () => {
    expect(taqdimQabulRollari('f2')).toEqual(['zakazchik', 'texnadzor']);
    expect(taqdimQabulRollari('aosr')).toEqual(['zakazchik', 'texnadzor', 'loyihachi']);
    expect(taqdimQabulRollari('nomalum')).toBeNull();
  });
  it('8 kompaniyadan F2 uchun faqat 2 tasi, АОСР uchun 3 tasi; nofaol aloqa chiqmaydi', () => {
    expect(qabulQiluvchilar(HAMMASI as any, 'f2').map((a) => a.id)).toEqual([1, 2]);
    expect(qabulQiluvchilar(HAMMASI as any, 'aosr').map((a) => a.id)).toEqual([1, 2, 3]);
    expect(qabulQiluvchilar([al(1, 'zakazchik', 'toxtatilgan')] as any, 'f2')).toEqual([]);
  });
  it('dialogda faqat mos kompaniyalar ko‘rinadi', async () => {
    st.aloqalar = HAMMASI;
    render(<ZakazchigaYuborish kompaniyaId={5} aktId={11} />);
    fireEvent.click(screen.getByRole('button', { name: /Zakazchikka yuborish/ }));
    await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['— tanlang —', 'Kompaniya 1 (zakazchik)', 'Kompaniya 2 (texnadzor)']);
  });
});

describe('T10: kamchilik bilan yuborishda aniq ogohlantirish va ongli tasdiq', () => {
  it('kamchilik bor — «Yuborish» tasdiqsiz yopiq; belgilangach yuboriladi va onYuborildi chaqiriladi', async () => {
    st.aloqalar = [al(1, 'zakazchik')];
    const tayyor = vi.fn();
    render(<ZakazchigaYuborish kompaniyaId={5} aktId={11} resurs="aosr" kamchiliklar={['a', 'b', 'c', 'd']} onYuborildi={tayyor} />);
    fireEvent.click(screen.getByRole('button', { name: /Zakazchikka yuborish/ }));
    const ogoh = await screen.findByTestId('yuborish-kamchilik');
    expect(ogoh.textContent).toContain('4');
    const yubor = screen.getByRole('button', { name: 'Yuborish' }) as HTMLButtonElement;
    expect(yubor.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(yubor.disabled).toBe(false);
    fireEvent.click(yubor);
    await waitFor(() => expect(tayyor).toHaveBeenCalledTimes(1));
    expect(st.yuborildi).toHaveLength(1);
  });
  it('kamchilik yo‘q — ogohlantirish ham, tasdiq ham yo‘q', async () => {
    st.aloqalar = [al(1, 'zakazchik')];
    render(<ZakazchigaYuborish kompaniyaId={5} aktId={11} />);
    fireEvent.click(screen.getByRole('button', { name: /Zakazchikka yuborish/ }));
    await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
    expect(screen.queryByTestId('yuborish-kamchilik')).toBeNull();
  });
});

describe('T10: yuborilgan АОСР ro‘yxatda «Qoralama» bo‘lib qolmaydi', () => {
  const x = (id: number, manba: number | undefined, holat: string, resurs = 'aosr') => ({ id, resurs, manba_id: manba, holat }) as any;
  it('oxirgi taqdim holati olinadi; qaytarilgan — yana qoralama; F2 va manbasizlar e‘tiborga olinmaydi', () => {
    const m = aosrTaqdimHolatlari([x(1, 10, 'rad'), x(2, 10, 'yuborilgan'), x(3, 11, 'qaytarilgan'), x(4, 12, 'qabul', 'f2'), x(5, undefined, 'qabul')]);
    expect(m.get(10)).toBe('yuborilgan');
    expect(m.has(11)).toBe(false);
    expect(m.has(12)).toBe(false);
    expect(m.size).toBe(1);
  });
});
