// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const holat = vi.fn((_faol: boolean) => ({ data: undefined }));
vi.mock('../../api/hooks', () => ({
  useF2JobHolat: (faol: boolean) => holat(faol),
  useF2JobTozala: () => ({ mutate: vi.fn() }),
}));

import F2NavbatChip from './F2NavbatChip';

describe('F2NavbatChip tezlik', () => {
  beforeEach(() => { vi.useFakeTimers(); holat.mockClear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('eski GAS holat so\'rovi sahifa yuklanishida emas, kechikib yoqiladi', () => {
    render(<F2NavbatChip />);
    expect(holat).toHaveBeenLastCalledWith(false);
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(holat).toHaveBeenLastCalledWith(true);
  });
});
