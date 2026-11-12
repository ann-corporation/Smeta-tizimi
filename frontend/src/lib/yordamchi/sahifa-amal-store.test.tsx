// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { sahifaAmallariOl, sahifaAmaliniBajar, useYordamchiSahifaAmallari } from './sahifa-amal-store';

function Sahifa({ run }: { run: () => void }) {
  useYordamchiSahifaAmallari([{ id: 'studio.save', nom: 'Serverga saqlash', tasdiq: true, run }]);
  return null;
}
afterEach(cleanup);

it('sahifa amalini ro‘yxatdan o‘tkazadi, bajaradi va yopilganda o‘chiradi', () => {
  const run = vi.fn();
  const { unmount } = render(<Sahifa run={run} />);
  expect(sahifaAmallariOl()).toEqual([{ id: 'studio.save', nom: 'Serverga saqlash', tasdiq: true }]);
  expect(sahifaAmaliniBajar('studio.save')).toBe(true);
  expect(run).toHaveBeenCalledTimes(1);
  unmount();
  expect(sahifaAmallariOl()).toEqual([]);
  expect(sahifaAmaliniBajar('studio.save')).toBe(false);
});
