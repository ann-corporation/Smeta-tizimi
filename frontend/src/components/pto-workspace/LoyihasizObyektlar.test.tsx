import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoyihasizObyektlar } from './LoyihasizObyektlar';
import { YANGI_LOYIHA, YangiObyektMaydonlari } from './YangiObyektMaydonlari';

const m = vi.hoisted(() => ({ biriktir: vi.fn() }));
vi.mock('../../api/t2-loyiha', () => ({ sbObyektLoyihagaBiriktir: m.biriktir }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: vi.fn() }));

beforeEach(() => { m.biriktir.mockReset(); m.biriktir.mockResolvedValue({ ok: true }); });
afterEach(cleanup);

const loyihalar = [{ id: 1, nom: 'Loyiha 1' }, { id: 2, nom: 'Loyiha 2' }];

describe('LoyihasizObyektlar', () => {
  it('loyihasiz obyektni ko‘rsatadi va bitta bosishda RPC orqali biriktiradi', async () => {
    const onChanged = vi.fn();
    render(<LoyihasizObyektlar companyId={7} obyektlar={[{ id: 282, nom: 'Obyekt X' }]} loyihalar={loyihalar} onChanged={onChanged} />);
    expect(screen.getByTestId('loyihasiz-obyektlar').textContent).toContain('Obyekt X');
    const tugma = screen.getByRole('button', { name: /Loyihaga biriktirish/ }) as HTMLButtonElement;
    expect(tugma.disabled).toBe(true); // loyiha tanlanmaguncha
    fireEvent.change(screen.getByLabelText(/Obyekt X/), { target: { value: '2' } });
    expect(tugma.disabled).toBe(false);
    fireEvent.click(tugma);
    await waitFor(() => expect(m.biriktir).toHaveBeenCalledWith(282, 2));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
  it('tanlangan loyiha ichida bo‘lsa, shu loyiha oldindan tanlanadi', async () => {
    render(<LoyihasizObyektlar companyId={7} obyektlar={[{ id: 5, nom: 'Obyekt Y' }]} loyihalar={loyihalar} boshlangichLoyihaId={1} />);
    fireEvent.click(screen.getByRole('button', { name: /Loyihaga biriktirish/ }));
    await waitFor(() => expect(m.biriktir).toHaveBeenCalledWith(5, 1));
  });
  it('xato bo‘lsa onChanged chaqirilmaydi', async () => {
    m.biriktir.mockResolvedValue({ ok: false, error: 'xato' });
    const onChanged = vi.fn();
    render(<LoyihasizObyektlar companyId={7} obyektlar={[{ id: 5, nom: 'Obyekt Y' }]} loyihalar={loyihalar} boshlangichLoyihaId={1} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /Loyihaga biriktirish/ }));
    await waitFor(() => expect(m.biriktir).toHaveBeenCalled());
    expect(onChanged).not.toHaveBeenCalled();
  });
  it('loyihasiz obyekt bo‘lmasa hech narsa chizmaydi', () => {
    const { container } = render(<LoyihasizObyektlar companyId={7} obyektlar={[]} loyihalar={loyihalar} />);
    expect(container.innerHTML).toBe('');
  });
});

function Forma({ boshlang = '', mavjud = [] as Array<{ id: number; nom: string; kompaniya_id: number }> }) {
  const [nom, setNom] = useState('');
  const [loyiha, setLoyiha] = useState(boshlang);
  const [yangi, setYangi] = useState('');
  return <YangiObyektMaydonlari kompaniyaId={123} mavjud={mavjud} loyihalar={loyihalar} nom={nom} onNom={setNom}
    loyihaId={loyiha} onLoyiha={setLoyiha} yangiLoyihaNom={yangi} onYangiLoyihaNom={setYangi} />;
}

describe('YangiObyektMaydonlari', () => {
  it('loyiha bo‘sh bo‘lsa ogohlantiradi, tanlansa ogohlantirish yo‘qoladi; boshlang‘ich qiymat tanlangan loyiha', () => {
    render(<Forma />);
    expect(screen.getByTestId('obyekt-loyihasiz-ogoh')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Loyiha \(ixtiyoriy\)/), { target: { value: '1' } });
    expect(screen.queryByTestId('obyekt-loyihasiz-ogoh')).toBeNull();
    cleanup();
    render(<Forma boshlang="2" />);
    expect((screen.getByLabelText(/Loyiha \(ixtiyoriy\)/) as HTMLSelectElement).value).toBe('2');
    expect(screen.queryByTestId('obyekt-loyihasiz-ogoh')).toBeNull();
  });
  it('«yangi loyiha» varianti nom maydonini ochadi', () => {
    render(<Forma />);
    fireEvent.change(screen.getByLabelText(/Loyiha \(ixtiyoriy\)/), { target: { value: YANGI_LOYIHA } });
    expect(screen.getByPlaceholderText(/Parkent/)).toBeTruthy();
    expect(screen.queryByTestId('obyekt-loyihasiz-ogoh')).toBeNull();
  });
  it('normallashgan nomi bir xil obyekt bor bo‘lsa dublikat ogohlantiradi (defis atrofidagi bo‘shliq farq qilmaydi)', () => {
    render(<Forma mavjud={[{ id: 1, nom: 'Паркент 2-этап', kompaniya_id: 123 }, { id: 2, nom: 'Паркент 2-этап', kompaniya_id: 5 }]} />);
    expect(screen.queryByTestId('obyekt-dublikat')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/Amfiteatr/), { target: { value: 'паркент 2- этап' } });
    expect(screen.getByTestId('obyekt-dublikat').textContent).toContain('Паркент 2-этап');
    fireEvent.change(screen.getByPlaceholderText(/Amfiteatr/), { target: { value: 'Boshqa nom' } });
    expect(screen.queryByTestId('obyekt-dublikat')).toBeNull();
  });
});
