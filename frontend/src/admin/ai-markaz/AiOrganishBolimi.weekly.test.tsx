import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ report: vi.fn(), signals: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/t2-agent-ish', () => ({ rivojlanishTahlil: mocks.report, signallarOl: mocks.signals }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: mocks.toast }));
import { AiOrganishBolimi } from './AiOrganishBolimi';
beforeEach(() => { vi.clearAllMocks(); mocks.signals.mockResolvedValue({ ok: true, natija: { natija: [] } }); });
afterEach(cleanup);
it.each([
  [{ ok: true, yaratildi: true, taklif_id: '9007199254740993' }, 'Haftalik Jarvis hisoboti ko‘rib chiqish uchun tayyorlandi', 'ok', true],
  [{ ok: true, yaratildi: false, taklif_id: '9007199254740993' }, 'Haftalik Jarvis hisoboti avval tayyorlangan', 'ok', false],
  [{ ok: true, yaratildi: false, sabab: 'NO_ELIGIBLE_FAILURES' }, 'Haftalik hisobot uchun yetarli anonim signal yo‘q', 'ok', false],
  [{ ok: false, code: 'WEEKLY_UNAVAILABLE' }, 'Haftalik Jarvis hisobotini hozir tayyorlab bo‘lmadi', 'warn', false],
] as const)('checks weekly status with an empty signal list %#', async (week, message, tone, shouldOpen) => {
  mocks.report.mockResolvedValue({ ok: true, natija: { takliflar: [], jarvis_hafta: week } });
  const open = vi.fn(); render(<AiOrganishBolimi taklifgaOt={open} />);
  const button = await screen.findByRole('button', { name: 'Signallardan taklif tayyorlash' });
  expect(button.hasAttribute('disabled')).toBe(false); fireEvent.click(button);
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(message, tone));
  expect(open).toHaveBeenCalledTimes(shouldOpen ? 1 : 0);
});
it('shows the completed report and opens review even if legacy analysis later fails', async () => {
  mocks.report.mockResolvedValue({ ok: false, error: 'Synthetic legacy failure',
    jarvis_hafta: { ok: true, yaratildi: true, taklif_id: '9007199254740993' } });
  const open = vi.fn(); render(<AiOrganishBolimi taklifgaOt={open} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Signallardan taklif tayyorlash' }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('Haftalik hisobot mavjud, lekin umumiy tahlil tugamadi', 'warn'));
  expect(open).toHaveBeenCalledTimes(1);
});
it('keeps a failure without a report receipt as a failure', async () => {
  mocks.report.mockResolvedValue({ ok: false, error: 'Synthetic failure' });
  const open = vi.fn(); render(<AiOrganishBolimi taklifgaOt={open} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Signallardan taklif tayyorlash' }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('Synthetic failure', 'danger'));
  expect(open).not.toHaveBeenCalled(); expect(mocks.signals).toHaveBeenCalledTimes(1);
});
