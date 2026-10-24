import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AdditionalReplacementNative from './AdditionalReplacementNative';

const mocks = vi.hoisted(() => ({
  additional: vi.fn(), replacement: vi.fn(), resource: vi.fn(),
  company: { joriy: { id: 1 }, yuklanmoqda: false },
}));
vi.mock('../../umumiy/kontekst/KompaniyaKontekst', () => ({ useKompaniya: () => mocks.company }));
vi.mock('../../api/supabase', () => ({
  sbT2ObyektlarOlKomp: async () => ({ ok: true, qatorlar: [{ id: 8, nom: 'Sinov obyekt' }] }),
  sbT2DaraxtOl: async () => ({
    ok: true,
    qatorlar: [
      { id: 1, ota_id: null, daraja: 0, tur: 'rz', kod: null, nom: 'Razdel 1', birlik: null, versiya: 3 },
      { id: 2, ota_id: 1, daraja: 1, tur: 'bl', kod: 'BL1', nom: 'Ish 1', birlik: 'm3', versiya: 5 },
    ],
  }),
  yangiOperationId: () => 'test-operation',
}));
vi.mock('../../api/t2-additional-replacement', () => ({
  sbT2QoshimchaIshYarat: mocks.additional,
  sbT2ZamenaIshYarat: mocks.replacement,
  sbT2ResursBolaQosh: mocks.resource,
}));
afterEach(() => {
  cleanup();
  mocks.additional.mockReset(); mocks.replacement.mockReset(); mocks.resource.mockReset();
});

it('qo‘shimcha ish uchun ota versiyasini va operation_id ni to‘g‘ri yuboradi', async () => {
  mocks.additional.mockResolvedValue({ ok: true, qator_id: 99 });
  render(<AdditionalReplacementNative />);
  fireEvent.change(await screen.findByLabelText('Obyekt'), { target: { value: '8' } });
  await screen.findByLabelText('Ota qator');
  fireEvent.change(screen.getByLabelText('Ota qator'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Yangi ish' } });
  fireEvent.change(screen.getByLabelText('Birlik'), { target: { value: 'm2' } });
  fireEvent.change(screen.getByLabelText('Hajm'), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText('Sabab'), { target: { value: 'Loyiha o‘zgardi' } });
  fireEvent.click(screen.getByText('Yaratish'));
  await screen.findByText('O‘zgarish muvaffaqiyatli yaratildi.');
  expect(mocks.additional).toHaveBeenCalledWith(expect.objectContaining({
    obyektId: 8, otaQatorId: 1, expectedVersion: 3, operationId: 'test-operation',
    nom: 'Yangi ish', birlik: 'm2', hajm: 12, sabab: 'Loyiha o‘zgardi',
  }));
});

it('zamena uchun eski qator faqat tanlangan ota ostidagi qatorlardan chiqadi, eski qator o‘zgartirilmaydi', async () => {
  mocks.replacement.mockResolvedValue({ ok: true, qator_id: 100 });
  render(<AdditionalReplacementNative />);
  fireEvent.change(await screen.findByLabelText('Obyekt'), { target: { value: '8' } });
  await screen.findByLabelText('Amal');
  fireEvent.change(screen.getByLabelText('Amal'), { target: { value: 'replacement' } });
  fireEvent.change(screen.getByLabelText('Ota qator'), { target: { value: '1' } });
  expect(screen.getByLabelText('Almashtiriladigan qator')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Almashtiriladigan qator'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Yangi versiya' } });
  fireEvent.change(screen.getByLabelText('Birlik'), { target: { value: 'm3' } });
  fireEvent.change(screen.getByLabelText('Hajm'), { target: { value: '7' } });
  fireEvent.change(screen.getByLabelText('Sabab'), { target: { value: 'Xato o‘lchov' } });
  fireEvent.click(screen.getByText('Yaratish'));
  await screen.findByText('O‘zgarish muvaffaqiyatli yaratildi.');
  expect(mocks.replacement).toHaveBeenCalledWith(expect.objectContaining({
    almashtirilayotganQatorId: 2, otaQatorId: 1, expectedVersion: 3,
  }));
  expect(mocks.additional).not.toHaveBeenCalled();
});

it('ota qator tanlanmaguncha yaratish tugmasi bosilmaydi', async () => {
  render(<AdditionalReplacementNative />);
  fireEvent.change(await screen.findByLabelText('Obyekt'), { target: { value: '8' } });
  await screen.findByLabelText('Ota qator');
  expect((screen.getByText('Yaratish') as HTMLButtonElement).disabled).toBe(true);
});

it('server xatosini xabar sifatida ko‘rsatadi, forma tozalanmaydi', async () => {
  mocks.additional.mockResolvedValue({ ok: false, xabar: 'Ma’lumot yangilangan.' });
  render(<AdditionalReplacementNative />);
  fireEvent.change(await screen.findByLabelText('Obyekt'), { target: { value: '8' } });
  await screen.findByLabelText('Ota qator');
  fireEvent.change(screen.getByLabelText('Ota qator'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'X' } });
  fireEvent.change(screen.getByLabelText('Birlik'), { target: { value: 'm2' } });
  fireEvent.change(screen.getByLabelText('Hajm'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Sabab'), { target: { value: 'sabab' } });
  fireEvent.click(screen.getByText('Yaratish'));
  await screen.findByText('Ma’lumot yangilangan.');
  expect((screen.getByLabelText('Nom') as HTMLInputElement).value).toBe('X');
});

it('norma tuzatuvchi qo‘shimcha ish: MINUS hajm qabul qilinadi, 0 esa yo‘q (egasi 2026-10-24)', async () => {
  mocks.additional.mockResolvedValue({ ok: true, qator_id: 101 });
  render(<AdditionalReplacementNative />);
  fireEvent.change(await screen.findByLabelText('Obyekt'), { target: { value: '8' } });
  await screen.findByLabelText('Ota qator');
  fireEvent.change(screen.getByLabelText('Ota qator'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'НА КАЖДЫЙ ММ ИЗМЕНЕНИЯ ТОЛЩИНЫ' } });
  fireEvent.change(screen.getByLabelText('Birlik'), { target: { value: '100М2' } });
  fireEvent.change(screen.getByLabelText('Sabab'), { target: { value: 'Loyihada 7 mm' } });
  fireEvent.change(screen.getByLabelText('Hajm'), { target: { value: '0' } });
  fireEvent.click(screen.getByText('Yaratish'));
  await screen.findByText(/0 dan farqli son/);
  expect(mocks.additional).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Hajm'), { target: { value: '-11.16' } });
  fireEvent.click(screen.getByText('Yaratish'));
  await screen.findByText('O‘zgarish muvaffaqiyatli yaratildi.');
  expect(mocks.additional).toHaveBeenCalledWith(expect.objectContaining({ hajm: -11.16 }));
});