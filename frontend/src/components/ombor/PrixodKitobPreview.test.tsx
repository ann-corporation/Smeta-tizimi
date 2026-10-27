import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrixodKitobPreview } from './PrixodKitobPreview';
import type { PrixodKitob, PrixodQator } from '../../lib/ombor-prixod/turlar';

const mocks = vi.hoisted(() => ({ read: vi.fn(), excel: vi.fn(), download: vi.fn() }));
vi.mock('../../lib/ombor-prixod/read-fonda', () => ({ prixodKitobFonda: mocks.read }));
vi.mock('../../lib/ombor-prixod/davr-eksport', () => ({ omborDavrExcel: mocks.excel }));
vi.mock('../../lib/construction-document-control/export/download-helper', () => ({ downloadBlob: mocks.download }));

afterEach(() => { cleanup(); mocks.read.mockReset(); mocks.excel.mockReset(); mocks.download.mockReset(); });

function qator(i: number, holat: PrixodQator['holat'] = 'yangi', nom = `Tovar ${i}`): PrixodQator {
  return {
    manbaQator: i + 2, manbaRaqam: null, sana: '2026-10-27', nom, birlik: 'kg', miqdor: i + 0.25,
    miqdorMatni: String(i + 0.25), tur: '', yetkazuvchi: 'Ta’minotchi', hujjat: '', narx: null, summa: null,
    qqs: null, kalit: `synthetic-${i}`, holat, xatolar: holat === 'xato' ? ['MIQDOR_YOQ'] : [], ogohlar: [],
  };
}

function kitob(qatorlar: PrixodQator[], takrorTekshirildi = false): PrixodKitob {
  return {
    faylNomi: 'synthetic.xlsx', sha256: 'synthetic-only', varaq: 'Приход', sarlavhaQator: 1,
    kompaniyaId: 1, skladId: 4, takrorTekshirildi, qatorlar, otkazilganVaraqlar: ['Расход'], boshQatorlar: 2,
    ogohlar: [], nomTakliflari: [],
    jami: {
      yangi: qatorlar.filter((q) => q.holat === 'yangi').length,
      takror: qatorlar.filter((q) => q.holat === 'takror').length,
      xato: qatorlar.filter((q) => q.holat === 'xato').length,
      ogohli: qatorlar.filter((q) => q.ogohlar.length > 0).length,
    },
  };
}

function xlsx(name: string): File {
  const file = new File(['synthetic workbook bytes'], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(name).buffer });
  return file;
}

function faylYukla(file: File) {
  fireEvent.change(screen.getByLabelText('XLSX fayli'), { target: { files: [file] } });
}

function kechikkan<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('PrixodKitobPreview', () => {
  it('shows a localized missing-Приход-sheet message without exposing parser codes', async () => {
    mocks.read.mockRejectedValue(new Error('PRIXOD_SHEET_REQUIRED'));
    render(<PrixodKitobPreview kompaniyaId={1} skladId={4} />);
    faylYukla(xlsx('no-receipt-sheet.xlsx'));

    expect((await screen.findByRole('alert')).textContent).toContain('Faylda «Приход» varag‘i topilmadi.');
    expect(screen.queryByText('PRIXOD_SHEET_REQUIRED')).toBeNull();
  });

  it('disables file selection for an invalid company id', () => {
    render(<PrixodKitobPreview kompaniyaId={0} skladId={4} />);
    expect((screen.getByLabelText('XLSX fayli') as HTMLInputElement).disabled).toBe(true);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('does not report zero duplicates before warehouse comparison is checked', async () => {
    mocks.read.mockResolvedValue(kitob([qator(1)]));
    render(<PrixodKitobPreview kompaniyaId={1} skladId={4} />);
    faylYukla(xlsx('unchecked-duplicates.xlsx'));

    expect(await screen.findByText('Tovar 1')).not.toBeNull();
    expect(screen.getAllByText('Takror')[0].parentElement?.textContent).toBe('Takror—');
    expect(screen.getByRole('button', { name: 'Takror—' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Takrorlar ombor bilan hali solishtirilmagan.')).not.toBeNull();
  });

  it('discards a late result after another file replaces it', async () => {
    const first = kechikkan<PrixodKitob>();
    const second = kechikkan<PrixodKitob>();
    mocks.read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<PrixodKitobPreview kompaniyaId={1} skladId={4} />);

    faylYukla(xlsx('first.xlsx'));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
    const firstSignal = mocks.read.mock.calls[0][2] as AbortSignal;
    faylYukla(xlsx('second.xlsx'));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);

    first.resolve(kitob([qator(1, 'yangi', 'OLD result')]));
    await waitFor(() => expect(screen.queryByText('OLD result')).toBeNull());
    second.resolve(kitob([qator(2, 'yangi', 'CURRENT result')]));
    expect(await screen.findByText('CURRENT result')).not.toBeNull();
  });

  it('aborts and hides an in-flight result when company scope changes', async () => {
    const pending = kechikkan<PrixodKitob>();
    mocks.read.mockReturnValue(pending.promise);
    const view = render(<PrixodKitobPreview kompaniyaId={1} skladId={4} />);
    faylYukla(xlsx('company.xlsx'));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
    const signal = mocks.read.mock.calls[0][2] as AbortSignal;

    view.rerender(<PrixodKitobPreview kompaniyaId={2} skladId={4} />);
    await waitFor(() => expect(signal.aborted).toBe(true));
    pending.resolve(kitob([qator(1, 'yangi', 'WRONG COMPANY')]));
    await waitFor(() => expect(screen.queryByText('WRONG COMPANY')).toBeNull());
    expect(screen.getByText('Excel faylini tanlab, qatorlarni tekshiring')).not.toBeNull();
  });

  it('explains missing source ordinal, changed name header and invalid/nonpositive quantity precisely', async () => {
    const row = qator(7, 'xato', 'Sinov materiali');
    row.manbaQator = 9;
    row.manbaRaqam = null;
    row.hujjat = 'synthetic-invoice-42';
    row.miqdor = null;
    row.miqdorMatni = '-2';
    row.xatolar = ['MIQDOR_XATO'];
    row.ogohlar = ['RAQAM_YOQ', 'NOM_SARLAVHASI'];
    mocks.read.mockResolvedValue(kitob([row]));
    render(<PrixodKitobPreview kompaniyaId={1} skladId={4} />);
    faylYukla(xlsx('messages.xlsx'));

    expect(await screen.findByText('Sinov materiali')).not.toBeNull();
    expect(screen.getByText('Manba raqami ko‘rsatilmagan')).not.toBeNull();
    expect(screen.getByText('Nom ustuni sarlavhasi o‘zgargan — nomlar D ustunidan olindi.')).not.toBeNull();
    expect(screen.getByText('Miqdor musbat son bo‘lishi kerak')).not.toBeNull();
    expect(screen.queryByText('Hujjat raqami ko‘rsatilmagan')).toBeNull();
  });

  it('searches across Latin/Cyrillic, filters statuses and pages at 50 rows without inventing prices', async () => {
    const rows = Array.from({ length: 53 }, (_, i) => qator(i, 'yangi', i === 0 ? 'sement qop' : `Tovar ${i}`));
    rows[51] = qator(51, 'takror', 'Takror yozuv');
    rows[52] = qator(52, 'xato', 'Xato yozuv');
    mocks.read.mockResolvedValue(kitob(rows, true));
    render(<PrixodKitobPreview kompaniyaId={1} skladId={4} />);
    faylYukla(xlsx('rows.xlsx'));

    expect(await screen.findByText('Tovar 49')).not.toBeNull();
    expect(screen.getByText('Mahalliy qoralama')).not.toBeNull();
    expect(screen.getByText('Tasdiqlash faqat mahalliy qoralamani belgilaydi; DBga yozilmaydi.')).not.toBeNull();
    expect(screen.queryByText('Tovar 50')).toBeNull();
    expect(screen.getByText('Bo‘sh shablon qatorlari').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText(/Narx va summa hozircha noma’lum/)).not.toBeNull();
    expect(screen.queryByRole('columnheader', { name: /Narx|Summa/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Keyingi sahifa' }));
    expect(await screen.findByText('Tovar 50')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Takror/ }));
    expect(screen.getByText('Takror yozuv')).not.toBeNull();
    expect(screen.queryByText('Xato yozuv')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Xato/ }));
    expect(screen.getByText('Xato yozuv')).not.toBeNull();
    expect(screen.queryByText('Takror yozuv')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Barchasi/ }));
    fireEvent.change(screen.getByLabelText('Qatorlarni qidirish'), { target: { value: 'семент' } });
    expect(screen.getByText('sement qop')).not.toBeNull();
    expect(screen.queryByText('Tovar 1')).toBeNull();
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });

  it('edits and explicitly confirms all draft fields, preserves source rows, and invalidates approval after editing', async () => {
    const source = qator(21, 'xato', '');
    source.sana = null; source.birlik = ''; source.miqdor = 0; source.miqdorMatni = '0';
    source.xatolar = ['SANA_YOQ', 'NOM_YOQ', 'BIRLIK_YOQ', 'MIQDOR_XATO'];
    const before = structuredClone(source);
    mocks.read.mockResolvedValue(kitob([source], true));
    render(<PrixodKitobPreview kompaniyaId={1} skladId={4} />);
    faylYukla(xlsx('editable-invalid.xlsx'));
    await screen.findByText('Manba: 23-qator');
    expect((screen.getByRole('button', { name: /^Takror/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Tahrirlash' }));

    fireEvent.change(screen.getByLabelText('Sana'), { target: { value: '2026-10-27' } });
    expect((screen.getByRole('button', { name: /^Takror/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Material nomi'), { target: { value: 'Sement' } });
    fireEvent.change(screen.getByLabelText('O‘lchov birligi'), { target: { value: 'kg' } });
    fireEvent.change(screen.getByLabelText('Miqdor'), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText('Yetkazuvchi'), { target: { value: 'Ta’minotchi A' } });
    fireEvent.change(screen.getByLabelText('Hujjat raqami'), { target: { value: 'H-21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hammasi to‘g‘ri — tasdiqlash' }));

    expect(await screen.findByText('Kiritish tasdiqlandi — hali saqlanmagan.')).not.toBeNull();
    expect(screen.getByText('Sement')).not.toBeNull();
    expect(screen.getByText('Ta’minotchi A')).not.toBeNull();
    expect(source).toEqual(before);

    fireEvent.click(screen.getByRole('button', { name: 'Tahrirlash' }));
    fireEvent.change(screen.getByLabelText('Miqdor'), { target: { value: '' } });
    expect((screen.getByRole('button', { name: 'Hammasi to‘g‘ri — tasdiqlash' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Tahrirlangan qoralama — tasdiqlash kerak.')).not.toBeNull();
    expect(source).toEqual(before);
  });

  it('clears local drafts on company change and when another file is selected', async () => {
    const source = qator(31, 'yangi', 'Original material');
    const before = structuredClone(source);
    mocks.read.mockResolvedValue(kitob([source]));
    const view = render(<PrixodKitobPreview kompaniyaId={1} skladId={4} />);
    faylYukla(xlsx('draft-first.xlsx'));
    await screen.findByText('Original material');
    fireEvent.click(screen.getByRole('button', { name: 'Tahrirlash' }));
    fireEvent.change(screen.getByLabelText('Material nomi'), { target: { value: 'Company draft' } });

    view.rerender(<PrixodKitobPreview kompaniyaId={2} skladId={4} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    faylYukla(xlsx('draft-company-two.xlsx'));
    expect(await screen.findByText('Original material')).not.toBeNull();
    expect(screen.queryByText('Company draft')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tahrirlash' }));
    fireEvent.change(screen.getByLabelText('Material nomi'), { target: { value: 'File draft' } });
    faylYukla(xlsx('draft-replacement.xlsx'));
    expect(await screen.findByText('Original material')).not.toBeNull();
    expect(screen.queryByText('File draft')).toBeNull();
    expect(source).toEqual(before);
  });

  it('exports only explicitly confirmed drafts with the requested period metadata', async () => {
    const approvedSource = qator(40, 'yangi', 'Confirmed stone');
    approvedSource.hujjat = 'IN-40';
    const untouchedSource = qator(41, 'yangi', 'Unconfirmed sand');
    mocks.read.mockResolvedValue(kitob([approvedSource, untouchedSource]));
    mocks.excel.mockResolvedValue(new Uint8Array([3, 4, 5]));
    render(<PrixodKitobPreview kompaniyaId={27} skladId={8} skladNomi="Warehouse Eight" />);
    faylYukla(xlsx('source-book.xlsx'));
    await screen.findByText('Confirmed stone');
    const exportButton = screen.getByRole('button', { name: 'Tasdiqlangan qoralamalar — RU Excel' }) as HTMLButtonElement;
    expect(exportButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Davr boshi'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Davr oxiri'), { target: { value: '2026-10-31' } });
    expect(exportButton.disabled).toBe(true);

    fireEvent.click(screen.getAllByRole('button', { name: 'Tahrirlash' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Hammasi to‘g‘ri — tasdiqlash' }));
    expect(exportButton.disabled).toBe(false);
    fireEvent.click(exportButton);
    await waitFor(() => expect(mocks.excel).toHaveBeenCalledTimes(1));

    const [rows, davr] = mocks.excel.mock.calls[0] as [Array<Record<string, unknown>>, Record<string, unknown>];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      id: '42', sana: '2026-10-27', operatsiya: 'prixod', nom: 'Confirmed stone', birlik: 'kg',
      miqdor: 40.25, tomon: 'Ta’minotchi', hujjat: 'IN-40', manbaQator: 42, tasdiqlangan: true,
    }));
    expect(davr).toEqual(expect.objectContaining({
      bosh: '2026-10-01', oxir: '2026-10-31', kompaniya: 'Kompaniya 27', ombor: 'Warehouse Eight',
      holat: 'qoralama', rasxodKiritilgan: false, manbaNomi: 'synthetic.xlsx', manbaSha256: 'synthetic-only',
    }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(expect.any(Uint8Array), expect.stringContaining('Kirim_qoralama_')));
  });

  it('keeps period export disabled without a warehouse even for a confirmed draft', async () => {
    mocks.read.mockResolvedValue(kitob([qator(50, 'yangi', 'No-warehouse material')]));
    render(<PrixodKitobPreview kompaniyaId={27} skladId={null} />);
    faylYukla(xlsx('no-warehouse.xlsx'));
    await screen.findByText('No-warehouse material');
    fireEvent.change(screen.getByLabelText('Davr boshi'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Davr oxiri'), { target: { value: '2026-10-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tahrirlash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hammasi to‘g‘ri — tasdiqlash' }));
    expect((screen.getByRole('button', { name: 'Tasdiqlangan qoralamalar — RU Excel' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.excel).not.toHaveBeenCalled();
  });

  it('discards a delayed draft export after company changes', async () => {
    mocks.read.mockResolvedValue(kitob([qator(60)]));
    const pending = kechikkan<Uint8Array>(); mocks.excel.mockReturnValue(pending.promise);
    const view = render(<PrixodKitobPreview kompaniyaId={1} skladId={4} />);
    faylYukla(xlsx('company-one.xlsx')); await screen.findByText('Tovar 60');
    fireEvent.change(screen.getByLabelText('Davr boshi'), {target:{value:'2026-10-01'}});
    fireEvent.change(screen.getByLabelText('Davr oxiri'), {target:{value:'2026-10-31'}});
    fireEvent.click(screen.getByRole('button',{name:'Tahrirlash'}));
    fireEvent.click(screen.getByRole('button',{name:'Hammasi to‘g‘ri — tasdiqlash'}));
    fireEvent.click(screen.getByRole('button',{name:'Tasdiqlangan qoralamalar — RU Excel'}));
    await waitFor(()=>expect(mocks.excel).toHaveBeenCalledOnce());
    view.rerender(<PrixodKitobPreview kompaniyaId={2} skladId={4}/>);
    pending.resolve(new Uint8Array([1]));
    await waitFor(()=>expect(screen.queryByText('Tovar 60')).toBeNull());
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
