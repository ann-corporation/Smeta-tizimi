import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { T2Qator } from '../../api/supabase';

// Sintetik ma'lumot (repo PUBLIC): real summa/nom yo'q.
const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.yoz }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../api/t2-bajarilmadi', async (orig) => ({ ...(await orig<typeof import('../../api/t2-bajarilmadi')>()), bajarilmadiRoyxatOl: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
const abc = vi.hoisted(() => ({ saqla: vi.fn(), resursQidir: vi.fn(async () => [] as unknown[]) }));
vi.mock('../../api/t2-ish-abc', async (orig) => ({
  ...(await orig<typeof import('../../api/t2-ish-abc')>()),
  ishTuriQidir: vi.fn(async () => []), resursQidir: abc.resursQidir, narxTakliflari: vi.fn(async () => []),
  ishAbcSaqla: abc.saqla, ishAbcTahrir: vi.fn(), ishAbcOchir: vi.fn(),
}));
vi.mock('../../api/t2-holat-qisman', () => ({ sbT2QatorHolatQisman: vi.fn(async () => ({ ok: true, qatorlar: [] })), sbT2DaraxtQisman: vi.fn() }));
vi.mock('../../api/t2-additional-replacement', () => ({ sbT2ZamenaAlmashtirishBelgila: vi.fn(async () => ({ ok: true })) }));
const zb = vi.hoisted(() => ({ ol: vi.fn(async () => ({ almashtiradi: new Map<number, number>(), almashtirilgan: new Map<number, number>() })) }));
vi.mock('../../lib/fakt-zamena-boglanish', () => ({ zamenaBoglanishOl: zb.ol }));

import { FaktJurnal } from './FaktJurnal';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);
const rows = [
  q({ id: 1, tur: 'rz', kod: '1', nom: 'Bo‘lim A', versiya: 3 }),
  q({ id: 2, tur: 'bl', ota_id: 1, daraja: 1, kod: 'E1-01', nom: 'Ish A', hajm: 100 }),
  q({ id: 3, tur: 'mat', ota_id: 2, daraja: 2, nom: 'Material A', hajm: 10, kat: 'МАТ', birlik: 'т' }),
  q({ id: 4, tur: 'rz', kod: '2', nom: 'Bo‘lim B', versiya: 5 }),
  q({ id: 5, tur: 'bl', ota_id: 4, daraja: 1, nom: 'Ish B', hajm: 30 }),
];
const states = [{ qator_id: 2, smeta_hajm: 100, fakt_hajm: 40 }, { qator_id: 3, smeta_hajm: 10, fakt_hajm: 0 }, { qator_id: 5, smeta_hajm: 30, fakt_hajm: 0 }];
const props = () => ({ kompaniyaId: 1, obyektId: 8, rows, states, holatniYangila: vi.fn(), tuzilmaniYangila: vi.fn() });
const panel = () => screen.getByTestId('fakt-inline-amal');
const maydon = (nom: string | RegExp) => within(panel()).getByLabelText(nom) as HTMLInputElement;

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Fakt jurnali — inline zamena / qo‘shimcha (oynasiz)', () => {
  it('qator tugmasi panelni shu qator OSTIDA ochadi: 3 ta tab, asl qator va natija izohi; oyna (dialog) yo‘q', () => {
    render(<FaktJurnal {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zamena: Ish A' }));
    const p = panel();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('ish-2').parentElement?.contains(p)).toBe(true); // qator bilan bir konteynerda, uning ostida
    expect(within(p).getAllByRole('tab').map((x) => x.textContent)).toEqual([
      expect.stringMatching(/Boshqasi bilan almashtirildi \(zamena\)/), expect.stringMatching(/Qo‘shimcha ish/), expect.stringMatching(/Qo‘shimcha material/)]);
    expect(within(p).getByTestId('inline-asl').textContent).toMatch(/Asl qator:.*E1-01.*Ish A/);
    expect(within(p).getByTestId('inline-natija-izoh').textContent).toMatch(/o‘rniga yangi qator fakti yoziladi/);
    expect(document.activeElement).toBe(maydon('Ish nomi yoki shifri (qidirish)')); // fokus darhol nom maydonida
  });

  it('ish zamenasi: mavjud ish_abc_saqla_v1 «replacement» to‘g‘ri argumentlar bilan; Ctrl+Enter saqlaydi', async () => {
    abc.saqla.mockResolvedValue({ ok: true, qator_id: 90 });
    const p = props();
    render(<FaktJurnal {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zamena: Ish A' }));
    fireEvent.change(maydon('Ish nomi yoki shifri (qidirish)'), { target: { value: 'Ish A (boshqa usul)' } });
    expect(maydon('Birlik').value).toBe('м3'); // asl birligi oldindan
    fireEvent.change(maydon('Hajm'), { target: { value: '30' } });
    fireEvent.change(maydon('Sabab / izoh'), { target: { value: 'xat № 1' } });
    fireEvent.keyDown(maydon('Sabab / izoh'), { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(abc.saqla).toHaveBeenCalledTimes(1));
    expect(abc.saqla).toHaveBeenCalledWith(expect.objectContaining({
      kompaniyaId: 1, obyektId: 8, command: 'replacement', almashtirilayotganQatorId: 2, otaQatorId: 1, kutilganVersiya: 3,
      ish: { kod: null, nom: 'Ish A (boshqa usul)', birlik: 'м3', hajm: 30 }, resurslar: [], faktHajm: null, sabab: 'xat № 1',
    }));
    await waitFor(() => expect(p.tuzilmaniYangila).toHaveBeenCalled());
    expect(screen.queryByTestId('fakt-inline-amal')).toBeNull();
    expect(m.toast).toHaveBeenCalledWith(expect.stringMatching(/Zamena saqlandi: «Ish A» → «Ish A \(boshqa usul\)»\. Narxsiz/), 'ok');
  });

  it('klaviatura: Alt+Z fakt katagida resurs zamenasini ochadi, Esc yopadi va fokus katakka qaytadi; z / q / m katakdan tashqarida', async () => {
    render(<FaktJurnal {...props()} />);
    const katak = screen.getByLabelText('Bugun bajarildi: Material A') as HTMLInputElement;
    act(() => { katak.focus(); });
    fireEvent.keyDown(katak, { key: 'z', code: 'KeyZ' }); // yozayotganda oddiy «z» panel ochmaydi
    expect(screen.queryByTestId('fakt-inline-amal')).toBeNull();
    fireEvent.keyDown(katak, { key: 'z', code: 'KeyZ', altKey: true });
    expect(screen.getByTestId('inline-tab-zamena').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('resurs-3').parentElement?.contains(panel())).toBe(true);
    expect(within(panel()).queryByLabelText('Bugun bajarildi (fakt)')).toBeNull(); // resurs zamenasida fakt ish orqali
    fireEvent.keyDown(maydon('Material / resurs nomi yoki shifri (qidirish)'), { key: 'Escape' });
    expect(screen.queryByTestId('fakt-inline-amal')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Bugun bajarildi: Material A')));
    act(() => { (document.activeElement as HTMLElement).blur(); });
    fireEvent.keyDown(window, { key: 'q', code: 'KeyQ' });
    expect(screen.getByTestId('inline-tab-qoshimcha_ish').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(window, { key: 'ь', code: 'KeyM' }); // kirill sxemasida ham jismoniy M (fokus panelda emas — ochiladi)
    expect(screen.getByTestId('inline-tab-qoshimcha_material').getAttribute('aria-selected')).toBe('true');
    // Tab ↔ tab: o'q tugmalari
    fireEvent.keyDown(screen.getByTestId('inline-tab-qoshimcha_material'), { key: 'ArrowRight' });
    expect(screen.getByTestId('inline-tab-zamena').getAttribute('aria-selected')).toBe('true');
  });

  it('resurs zamenasi: «resurs_zamena», narxsiz — NULL (0 emas)', async () => {
    abc.saqla.mockResolvedValue({ ok: true, qator_id: 91 });
    render(<FaktJurnal {...props()} />);
    const katak = screen.getByLabelText('Bugun bajarildi: Material A'); act(() => { katak.focus(); });
    fireEvent.keyDown(katak, { key: 'z', code: 'KeyZ', altKey: true });
    fireEvent.change(maydon('Material / resurs nomi yoki shifri (qidirish)'), { target: { value: 'Material A2' } });
    fireEvent.change(maydon('Hajm'), { target: { value: '8' } });
    fireEvent.change(maydon('Sabab / izoh'), { target: { value: 'yetkazilmadi' } });
    expect(within(panel()).getByTestId('inline-narxsiz')).toBeTruthy();
    fireEvent.click(within(panel()).getByTestId('inline-saqla'));
    await waitFor(() => expect(abc.saqla).toHaveBeenCalledWith(expect.objectContaining({
      command: 'resurs_zamena', almashtirilayotganQatorId: 3, ish: null, faktHajm: null,
      resurslar: [{ kat: 'МАТ', kod: null, nom: 'Material A2', birlik: 'т', norma: null, hajm: 8, narx: null, narx_manba: 'qolda' }],
    })));
  });

  it('qo‘shimcha material: katalogdan qidiruv narxni to‘ldiradi; shu bo‘limga (versiya bilan) — ish + bitta МАТ (norma 1)', async () => {
    abc.saqla.mockResolvedValue({ ok: true, qator_id: 92 });
    abc.resursQidir.mockResolvedValue([{ manba: 'smeta', kat: 'МАТ', kod: 'M-01', nom: 'Material C', birlik: 'т', narx: 7000, narx_manba: 'smeta_obyekt', soni: 1 }]);
    render(<FaktJurnal {...props()} />);
    const katak = screen.getByLabelText('Bugun bajarildi: Ish A'); act(() => { katak.focus(); });
    fireEvent.keyDown(katak, { key: 'm', code: 'KeyM', altKey: true });
    fireEvent.change(maydon('Material / resurs nomi yoki shifri (qidirish)'), { target: { value: 'Mat' } });
    const variant = within(await within(panel()).findByRole('listbox', {}, { timeout: 2000 })).getByRole('option');
    fireEvent.mouseDown(variant);
    expect(maydon('Birlik').value).toBe('т');
    expect(maydon('Birlik narxi').value).toBe('7000');
    expect((within(panel()).getByLabelText('Qayerga qo‘shiladi') as HTMLSelectElement).value).toBe('shu');
    fireEvent.change(maydon('Hajm'), { target: { value: '2' } });
    fireEvent.change(maydon('Bugun bajarildi (fakt)'), { target: { value: '2' } });
    fireEvent.change(maydon('Sabab / izoh'), { target: { value: 'buyurtmachi' } });
    fireEvent.click(within(panel()).getByTestId('inline-saqla'));
    await waitFor(() => expect(abc.saqla).toHaveBeenCalledWith(expect.objectContaining({
      command: 'additional', otaQatorId: 1, kutilganVersiya: 3, almashtirilayotganQatorId: null, faktHajm: 2,
      ish: { kod: 'M-01', nom: 'Material C', birlik: 'т', hajm: 2 },
      resurslar: [{ kat: 'МАТ', kod: 'M-01', nom: 'Material C', birlik: 'т', norma: 1, hajm: null, narx: 7000, narx_manba: 'smeta_obyekt' }],
    })));
  });

  it('qo‘shimcha ish: «СМЕТАДАН ТАШҚАРИ ИШЛАР» tanlansa — ota yo‘q (server avtomatik bo‘lim); bo‘sh forma — oddiy xatolar, server chaqirilmaydi', async () => {
    abc.saqla.mockResolvedValue({ ok: true, qator_id: 93 });
    render(<FaktJurnal {...props()} />);
    const katak = screen.getByLabelText('Bugun bajarildi: Ish A'); act(() => { katak.focus(); });
    fireEvent.keyDown(katak, { key: 'q', code: 'KeyQ', altKey: true });
    fireEvent.click(within(panel()).getByTestId('inline-saqla'));
    expect(within(panel()).getByTestId('inline-xatolar').textContent).toMatch(/Nomini yozing.*Hajm 0 dan katta.*Sababini yozing/);
    expect(abc.saqla).not.toHaveBeenCalled();
    fireEvent.change(maydon('Ish nomi yoki shifri (qidirish)'), { target: { value: 'Ish D' } });
    fireEvent.change(maydon('Birlik'), { target: { value: 'м2' } });
    fireEvent.change(maydon('Hajm'), { target: { value: '12' } });
    fireEvent.change(within(panel()).getByLabelText('Qayerga qo‘shiladi'), { target: { value: 'tashqari' } });
    fireEvent.change(maydon('Sabab / izoh'), { target: { value: 'akt' } });
    fireEvent.keyDown(maydon('Sabab / izoh'), { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(abc.saqla).toHaveBeenCalledWith(expect.objectContaining({
      command: 'additional', otaQatorId: null, kutilganVersiya: null, ish: { kod: null, nom: 'Ish D', birlik: 'м2', hajm: 12 }, resurslar: [], faktHajm: null,
    })));
  });

  it('server xatosi oddiy so‘z bilan panel ichida ko‘rinadi (panel yopilmaydi)', async () => {
    abc.saqla.mockResolvedValueOnce({ ok: false, code: 'F2_DA' }).mockResolvedValueOnce({ ok: false, code: 'SABAB_REQUIRED' });
    render(<FaktJurnal {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zamena: Ish A' }));
    fireEvent.change(maydon('Ish nomi yoki shifri (qidirish)'), { target: { value: 'Ish E' } });
    fireEvent.change(maydon('Hajm'), { target: { value: '5' } });
    fireEvent.change(maydon('Sabab / izoh'), { target: { value: 'x' } });
    fireEvent.click(within(panel()).getByTestId('inline-saqla'));
    expect((await within(panel()).findByTestId('inline-server-xato')).textContent).toBe('Bu qator F2 aktida — avval F2 ni bekor qiling.');
    fireEvent.click(within(panel()).getByTestId('inline-saqla'));
    await waitFor(() => expect(within(panel()).getByTestId('inline-server-xato').textContent).toMatch(/Sababini yozing/));
    // Takroriy bosish — bir xil operation_id (dublikat yaratilmaydi).
    expect(abc.saqla.mock.calls[0][0].operationId).toBe(abc.saqla.mock.calls[1][0].operationId);
  });

  it('zamena juftligi: aslda «zamena →», zamenada «← o‘rniga»; bosilsa juft qator katagiga o‘tadi; «Faqat zamena va qo‘shimchalar» filtri', async () => {
    zb.ol.mockResolvedValue({ almashtiradi: new Map([[40, 2]]), almashtirilgan: new Map([[2, 30]]) });
    const r2 = [...rows, q({ id: 40, tur: 'bl', ota_id: 1, daraja: 1, nom: 'Ish A zamenasi', hajm: 30, zamena: true, qoshimcha: true })];
    render(<FaktJurnal {...props()} rows={r2} states={[...states, { qator_id: 40, smeta_hajm: 30, fakt_hajm: 0 }]} />);
    const oriniga = await screen.findByTestId('juft-asl-2');
    expect(oriniga.textContent).toBe('← o‘rniga');
    expect(screen.getByTestId('ish-40').contains(oriniga)).toBe(true);
    const zamena = screen.getByTestId('juft-zamena-40');
    expect(zamena.textContent).toBe('zamena →');
    expect(screen.getByTestId('ish-2').contains(zamena)).toBe(true);
    fireEvent.click(oriniga);
    expect(document.activeElement).toBe(screen.getByLabelText('Bugun bajarildi: Ish A'));
    fireEvent.click(zamena);
    expect(document.activeElement).toBe(screen.getByLabelText('Bugun bajarildi: Ish A zamenasi'));
    // Filtr: butun obyekt bo'yicha faqat zamena/almashtirilgan/qo'shimcha.
    expect(screen.queryByTestId('ish-5')).toBeNull(); // boshqa bo'lim — hozir ko'rinmaydi
    fireEvent.click(screen.getByTestId('faqat-ozgarish'));
    expect(screen.getByTestId('ish-2')).toBeTruthy();
    expect(screen.getByTestId('ish-40')).toBeTruthy();
    expect(screen.queryByTestId('ish-5')).toBeNull();
    expect(screen.queryByTestId('resurs-3')).toBeTruthy(); // ish ichidagi resurslar o'z ishi bilan
  });
});
