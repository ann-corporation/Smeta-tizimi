import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExportPreview } from './ExportPreview';

const model = {
  f2PeriodId: '2026-09',
  estimateRevisionId: 'rev-1',
  rows: [],
  totals: {
    previousQuantity: 0, currentQuantity: 0, cumulativeQuantity: 0, remainingQuantity: 0,
    previousValue: 0, currentValue: 0, cumulativeValue: 0, remainingValue: 0,
    previousCertifiedValue: 0, currentCertifiedValue: 0, cumulativeCertifiedValue: 0,
  },
  reconciliation: [], documents: [], projectName: 'Test loyiha', objectName: 'Test obyekt',
};

describe('ExportPreview hujjat xavfsizligi', () => {
  it('keeps the Forma-3 download closed until a named legal rule evidence is available', () => {
    render(<ExportPreview model={model} />);
    const forma3 = screen.getByRole('button', { name: 'Forma-3' });
    expect((forma3 as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/FORMA3_RULE_UNRESOLVED/)).toBeTruthy();
  });

  // Egasi (2026-09-25): eski slichitelniy prototipi olib tashlandi — rasmiy
  // Сличительная ведомость LRV sahifasida (lib/slichitelniy-vedomost.ts).
  it('offers Forma-2 and Nakopitelniy; old Slichitelniy prototype is removed', () => {
    render(<ExportPreview model={model} />);
    expect((screen.getByRole('button', { name: 'Nakopitelniy' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Forma-2' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Slichitelniy' })).toBeNull();
  });
});
