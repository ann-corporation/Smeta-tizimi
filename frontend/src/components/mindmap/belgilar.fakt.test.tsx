import { afterEach, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Bajarilish } from './belgilar';

afterEach(cleanup);

// 2 — progress: fakt yozilganidek (F2 bilan MAX yo'q). Fakt < F2 — «F2 siz bajarilgan» bo'lagi yo'q; fakt > F2 — farqi.
it('fakt < F2 — fakt bo‘lagi 0%; fakt > F2 — farqi', () => {
  const a = render(<Bajarilish faktFoiz={30} f2Foiz={50} />);
  expect((a.container.querySelector('.fz-meter__shu') as HTMLElement).style.width).toBe('50%');
  expect((a.container.querySelector('.fz-meter__fakt') as HTMLElement).style.width).toBe('0%');
  cleanup();
  const b = render(<Bajarilish faktFoiz={70} f2Foiz={50} />);
  expect((b.container.querySelector('.fz-meter__fakt') as HTMLElement).style.width).toBe('20%');
});
