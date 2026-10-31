import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FaktF2Izoh } from './FaktStudioBar';

afterEach(cleanup);

// Narx qoidasi izohi: F2 narxida hisoblangan pozitsiyalar soni; yo'q — hech narsa.
it('F2 narxida hisoblangan pozitsiyalar — izoh; yo‘q — bo‘sh', () => {
  const { container } = render(<FaktF2Izoh f2Narxda={0} />);
  expect(container.textContent).toBe('');
  render(<FaktF2Izoh f2Narxda={2} />);
  expect(screen.getByTestId('fakt-f2-izoh').textContent).toContain('2');
});
