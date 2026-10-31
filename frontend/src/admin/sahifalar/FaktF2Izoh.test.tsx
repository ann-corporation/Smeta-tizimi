import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FaktF2Izoh } from './FaktStudioBar';

afterEach(cleanup);

// Fakt ↔ F2 izohi (yadro faktF2Qoida): ishora har xil — fakt o'zgarmaydi va ogohlantirish ko'rinadi.
it('ishora har xil va F2 dan olingan pozitsiyalar — izoh; hech biri yo‘q — hech narsa', () => {
  const { container } = render(<FaktF2Izoh f2dan={0} aralash={0} />);
  expect(container.textContent).toBe('');
  render(<FaktF2Izoh f2dan={2} aralash={1} />);
  expect(screen.getByTestId('fakt-f2-izoh').textContent).toContain('2');
  expect(screen.getByTestId('fakt-f2-aralash').textContent).toContain('1');
});
