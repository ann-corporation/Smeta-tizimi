import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NormSmetaWorkbench from './NormSmetaWorkbench';
vi.mock('../../i18n/til', () => ({ t: (s: string) => s }));
class FakeWorker {
  static last: FakeWorker;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror = null;
  messages: Array<Record<string, unknown>> = [];
  terminate = vi.fn();
  constructor() { FakeWorker.last = this; }
  postMessage(m: Record<string, unknown>) { this.messages.push(m); }
  respond(command: string, result: unknown) { const message = this.messages.findLast(m => m.command === command)!; act(() => this.onmessage?.({ data: { id: message.id, result } })); }
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function start() { vi.stubGlobal('Worker', FakeWorker); render(<NormSmetaWorkbench />); fireEvent.change(screen.getByLabelText('Normativ katalog fayllari'), { target: { files: ['basis','basisres','material','bprice'].map(n => new File(['{}'], n+'.jsonl')) } }); return FakeWorker.last; }
it('large source sent to worker, never network or main-thread full-file read', () => {
  const fetch = vi.spyOn(globalThis, 'fetch'); const worker = start();
  expect(worker.messages[0].command).toBe('load'); expect((worker.messages[0].files as File[]).length).toBe(4); expect(fetch).not.toHaveBeenCalled();
});
it('stale search response cannot overwrite newer query', async () => {
  const worker = start(); worker.respond('load', { counts: { basis: 54013 } });
  await waitFor(() => expect(worker.messages.some(m => m.command === 'search')).toBe(true));
  const oldId = worker.messages.findLast(m => m.command === 'search')!.id;
  fireEvent.change(screen.getByLabelText('Normativ ish qidirish'), { target: { value: 'new' } });
  act(() => worker.onmessage?.({ data: { id: oldId, result: { rows: [{id:'1',code:'OLD',name:'Stale work'}], total:1 } } }));
  expect(screen.queryByText(/Stale work/)).toBeNull();
});
it('worker disposed on unmount', () => { const worker = start(); cleanup(); expect(worker.terminate).toHaveBeenCalled(); });
it('hierarchy click scopes both work search and next branch request', async () => {
  const worker=start(); worker.respond('load',{counts:{basis:54013}});
  worker.respond('branches',{nodes:[{code:'E6',workCount:12}],total:1});
  fireEvent.click(screen.getByRole('button',{name:/E6.*12/}));
  expect(worker.messages.findLast(m=>m.command==='branches')?.path).toEqual(['E6']);
  await waitFor(()=>expect(worker.messages.findLast(m=>m.command==='search')?.path).toEqual(['E6']));
});
it('estimate workspace is present on right before selecting work', () => {
  const worker=start(); worker.respond('load',{counts:{basis:1}});
  expect(screen.getByLabelText('Smeta obyekti')).toBeTruthy();
  expect(screen.getByLabelText('Smeta razdeli')).toBeTruthy();
  expect(screen.getByLabelText('Smeta podrazdeli')).toBeTruthy();
  expect(screen.getByRole('button',{name:'Qoralama paketini saqlash'}).hasAttribute('disabled')).toBe(true);
});
