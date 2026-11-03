import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrixodKitobPreview } from './PrixodKitobPreview';
import type { PrixodKitob, PrixodQator } from '../../lib/ombor-prixod/turlar';

const mocks = vi.hoisted(() => ({ read: vi.fn(), varaqlar: vi.fn(), yozilgan: vi.fn(), importla: vi.fn(), yukla: vi.fn(), excel: vi.fn(), download: vi.fn() }));
vi.mock('../../lib/ombor-prixod/davr-eksport', () => ({ omborDavrExcel: mocks.excel }));
vi.mock('../../lib/construction-document-control/export/download-helper', () => ({ downloadBlob: mocks.download }));
vi.mock('../../lib/token-hujjat', () => ({ hujjatTokenBilan: async (_p: unknown, deliver: () => void) => { deliver(); return { ok: true }; } }));
vi.mock('../../lib/ombor-prixod/read-fonda', () => ({ prixodKitobFonda: mocks.read }));
vi.mock('../../lib/ombor-prixod/kitob', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/ombor-prixod/kitob')>()), varaqNomlari: mocks.varaqlar }));
vi.mock('../../api/t2-sklad-kirim', () => ({ sbSkladKirimYozilganQatorlar: mocks.yozilgan, sbSkladKirimImport: mocks.importla }));
vi.mock('../../api/t2-hujjat-canonical', () => ({ hujjatYukla: mocks.yukla }));

const SHA = 'c'.repeat(64);
beforeEach(() => {
  localStorage.clear();
  mocks.varaqlar.mockResolvedValue(['Приход', 'Расход']);
  mocks.yozilgan.mockResolvedValue(new Set<number>());
  mocks.yukla.mockResolvedValue({ ok: true, data: { document_id: 501, sha256: SHA } });
  mocks.importla.mockImplementation(async ({ bolak }: { bolak: { qatorlar: unknown[] } }) => ({ ok: true, qator_soni: bolak.qatorlar.length }));
});
afterEach(() => { cleanup(); for (const m of Object.values(mocks)) m.mockReset(); });

function qator(i: number, holat: PrixodQator['holat'] = 'yangi'): PrixodQator {
  return { manbaQator: i + 2, manbaRaqam: String(i), sana: '2026-10-27', nom: `Tovar ${i}`, birlik: 'kg', miqdor: i + 0.25,
    miqdorMatni: String(i + 0.25), tur: 'Материал', yetkazuvchi: 'Ta’minotchi', hujjat: '', narx: null, summa: null, qqs: null,
    kalit: null, holat, xatolar: holat === 'xato' ? ['MIQDOR_SANA'] : [], ogohlar: [] };
}
function kitob(qatorlar: PrixodQator[]): PrixodKitob {
  return { faylNomi: 'synthetic.xlsx', sha256: SHA, varaq: 'Приход', sarlavhaQator: 1, kompaniyaId: 1, skladId: 4,
    takrorTekshirildi: false, qatorlar, otkazilganVaraqlar: ['Расход'], boshQatorlar: 2, ogohlar: [], nomTakliflari: [],
    jami: { yangi: qatorlar.filter((q) => q.holat === 'yangi').length, takror: 0, xato: qatorlar.filter((q) => q.holat === 'xato').length, ogohli: 0 } };
}
function xlsx(name = 'synthetic.xlsx'): File {
  const file = new File(['synthetic workbook bytes'], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(name).buffer });
  return file;
}
const yukla = (f = xlsx()) => fireEvent.change(screen.getByLabelText('XLSX fayli'), { target: { files: [f] } });
const yozTugma = () => screen.getByRole('button', { name: /Tasdiqlab yozish|Davom ettirish/ }) as HTMLButtonElement;

describe('PrixodKitobPreview — Excel’dan yuklash', () => {
  it('«Приход» bo‘lmasa tushunarli xabar, parser kodi ko‘rinmaydi', async () => {
    mocks.read.mockRejectedValue(new Error('PRIXOD_SHEET_REQUIRED'));
    render(<PrixodKitobPreview kompaniyaId={1} skladId={4} />);
    yukla();
    expect((await screen.findByRole('alert')).textContent).toContain('Faylda «Приход» varag‘i topilmadi.');
    expect(screen.queryByText('PRIXOD_SHEET_REQUIRED')).toBeNull();
  });

  it('varaqlar: «Приход» tanlangan, boshqalari import qilinmaydi', async () => {
    mocks.read.mockResolvedValue(kitob([qator(1)]));
    render(<PrixodKitobPreview kompaniyaId={1} skladId={4} />);
    yukla();
    const prixod = await screen.findByRole('radio', { name: 'Приход' });
    expect(prixod.getAttribute('aria-checked')).toBe('true');
    expect((screen.getByRole('radio', { name: /Расход/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('takror va xato qatorlar oldindan ko‘rsatiladi va yozilmaydi', async () => {
    mocks.read.mockResolvedValue(kitob([qator(1), qator(2), qator(3, 'xato')]));
    mocks.yozilgan.mockResolvedValue(new Set([4])); // qator(2).manbaQator = 4
    render(<PrixodKitobPreview kompaniyaId={1} skladId={4} />);
    yukla();
    await waitFor(() => expect(yozTugma().textContent).toContain('Tasdiqlab yozish (1 qator)'));
    expect(mocks.yozilgan).toHaveBeenCalledWith({ kompaniyaId: 1, skladId: 4, sha256: SHA, varaq: 'Приход' });
    expect(document.querySelector('tr[data-holat="takror"]')?.textContent).toContain('Tovar 2');
    expect(document.querySelector('tr[data-holat="xato"]')?.textContent).toContain('Miqdor sana ko‘rinishida');
    fireEvent.click(yozTugma());
    await screen.findByText(/Yozildi: 1 ta yangi qator/);
    expect(mocks.importla).toHaveBeenCalledTimes(1);
    expect(mocks.importla.mock.calls[0][0].bolak.qatorlar.map((q: { source_row: number }) => q.source_row)).toEqual([3]);
  });

  it('asl fayl R2 ga bir marta yuklanadi, 1000 talik bo‘laklar, progress va natija', async () => {
    const rows = Array.from({ length: 2300 }, (_, i) => qator(i + 1));
    mocks.read.mockResolvedValue(kitob(rows));
    const onYozildi = vi.fn();
    render(<PrixodKitobPreview kompaniyaId={1} skladId={4} onYozildi={onYozildi} />);
    yukla();
    await waitFor(() => expect(yozTugma().disabled).toBe(false));
    fireEvent.click(yozTugma());
    await screen.findByText(/Yozildi: 2[\s  ,.]?300 ta yangi qator/);
    expect(mocks.yukla).toHaveBeenCalledTimes(1);
    expect(mocks.yukla.mock.calls[0][0]).toMatchObject({ kompaniyaId: 1, documentType: 'warehouse_receipt' });
    expect(mocks.importla.mock.calls.map((c) => c[0].bolak.qatorlar.length)).toEqual([1000, 1000, 300]);
    expect(mocks.importla.mock.calls.every((c) => c[0].documentId === 501 && c[0].varaq === 'Приход')).toBe(true);
    expect(onYozildi).toHaveBeenCalledTimes(1);
  });

  it('uzilsa «Davom ettirish» shu operation_id bilan qolganini yozadi', async () => {
    mocks.read.mockResolvedValue(kitob(Array.from({ length: 1500 }, (_, i) => qator(i + 1))));
    mocks.importla.mockResolvedValueOnce({ ok: true, qator_soni: 1000 }).mockResolvedValueOnce({ ok: false, error: 'Internet aloqasi uzildi' });
    render(<PrixodKitobPreview kompaniyaId={1} skladId={4} />);
    yukla();
    await waitFor(() => expect(yozTugma().disabled).toBe(false));
    fireEvent.click(yozTugma());
    expect(await screen.findByText('Internet aloqasi uzildi')).not.toBeNull();
    expect(yozTugma().textContent).toContain('Davom ettirish (500 qator qoldi)');
    const ikkinchiOp = mocks.importla.mock.calls[1][0].bolak.operationId;
    mocks.importla.mockImplementation(async ({ bolak }: { bolak: { qatorlar: unknown[] } }) => ({ ok: true, qator_soni: bolak.qatorlar.length }));
    fireEvent.click(yozTugma());
    await screen.findByText(/Yozildi: 1[\s  ,.]?500 ta yangi qator/);
    expect(mocks.importla.mock.calls[2][0].bolak.operationId).toBe(ikkinchiOp);
    expect(mocks.yukla).toHaveBeenCalledTimes(1);
  });

  it('yozish huquqi bo‘lmasa tugma o‘chiq va sababi yoziladi', async () => {
    mocks.read.mockResolvedValue(kitob([qator(1)]));
    render(<PrixodKitobPreview kompaniyaId={1} skladId={4} yozishMumkin={false} />);
    yukla();
    await screen.findByText('Tovar 1');
    await waitFor(() => expect(mocks.yozilgan).toHaveBeenCalled());
    expect(yozTugma().disabled).toBe(true);
    expect(screen.getByText('Omborga yozish uchun «Hujjatlar bilan ishlash» huquqi kerak.')).not.toBeNull();
  });

  it('ombor tanlanmasa faqat ko‘rib chiqiladi', async () => {
    mocks.read.mockResolvedValue(kitob([qator(1)]));
    render(<PrixodKitobPreview kompaniyaId={1} skladId={null} />);
    yukla();
    await screen.findByText('Tovar 1');
    expect(yozTugma().disabled).toBe(true);
    expect(mocks.yozilgan).not.toHaveBeenCalled();
  });

  const tasdiqla = async (nom: string) => {
    await screen.findByText(nom);
    fireEvent.click(screen.getAllByRole('button', { name: 'Tahrirlash' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Hammasi to‘g‘ri — tasdiqlash' }));
  };
  const davrKirit = () => {
    fireEvent.change(screen.getByLabelText('Davr boshi'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Davr oxiri'), { target: { value: '2026-10-31' } });
  };

  it('RU Excel faqat tasdiqlangan qoralamalarni va davr metama’lumotini eksport qiladi', async () => {
    const tasdiqlangan = qator(40); tasdiqlangan.nom = 'Confirmed stone'; tasdiqlangan.hujjat = 'IN-40';
    const tegilmagan = qator(41); tegilmagan.nom = 'Unconfirmed sand';
    mocks.read.mockResolvedValue(kitob([tasdiqlangan, tegilmagan]));
    mocks.excel.mockResolvedValue(new Uint8Array([3, 4, 5]));
    render(<PrixodKitobPreview kompaniyaId={27} skladId={8} skladNomi="Warehouse Eight" />);
    yukla();
    await screen.findByText('Confirmed stone');
    const tugma = screen.getByRole('button', { name: 'Tasdiqlangan qoralamalar — RU Excel' }) as HTMLButtonElement;
    expect(tugma.disabled).toBe(true);
    davrKirit();
    expect(tugma.disabled).toBe(true);
    await tasdiqla('Confirmed stone');
    expect(tugma.disabled).toBe(false);
    fireEvent.click(tugma);
    await waitFor(() => expect(mocks.excel).toHaveBeenCalledTimes(1));
    const [rows, davr] = mocks.excel.mock.calls[0] as [Array<Record<string, unknown>>, Record<string, unknown>];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({ id: '42', operatsiya: 'prixod', nom: 'Confirmed stone', manbaQator: 42, hujjat: 'IN-40', tasdiqlangan: true }));
    expect(davr).toEqual(expect.objectContaining({ bosh: '2026-10-01', oxir: '2026-10-31', kompaniya: 'Kompaniya 27', ombor: 'Warehouse Eight',
      holat: 'qoralama', rasxodKiritilgan: false, manbaNomi: 'synthetic.xlsx' }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(expect.any(Uint8Array), expect.stringContaining('Kirim_qoralama_')));
  });

  it('ombor tanlanmagan bo‘lsa RU Excel o‘chiq', async () => {
    mocks.read.mockResolvedValue(kitob([qator(50)]));
    render(<PrixodKitobPreview kompaniyaId={27} skladId={null} />);
    yukla();
    await tasdiqla('Tovar 50');
    davrKirit();
    expect((screen.getByRole('button', { name: 'Tasdiqlangan qoralamalar — RU Excel' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.excel).not.toHaveBeenCalled();
  });

  it('takror qator tasdiqlangan bo‘lsa ham RU Excel ga kirmaydi', async () => {
    mocks.read.mockResolvedValue(kitob([qator(60), qator(61)]));
    mocks.yozilgan.mockResolvedValue(new Set([63])); // qator(61).manbaQator = 63
    mocks.excel.mockResolvedValue(new Uint8Array([1]));
    render(<PrixodKitobPreview kompaniyaId={1} skladId={4} />);
    yukla();
    await tasdiqla('Tovar 60');
    davrKirit();
    fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlangan qoralamalar — RU Excel' }));
    await waitFor(() => expect(mocks.excel).toHaveBeenCalledOnce());
    expect((mocks.excel.mock.calls[0][0] as Array<{ manbaQator: number }>).map((r) => r.manbaQator)).toEqual([62]);
  });

  it('kompaniya almashsa kechikkan eksport yuklanmaydi', async () => {
    mocks.read.mockResolvedValue(kitob([qator(70)]));
    let resolve!: (v: Uint8Array) => void;
    mocks.excel.mockReturnValue(new Promise<Uint8Array>((r) => { resolve = r; }));
    const view = render(<PrixodKitobPreview kompaniyaId={1} skladId={4} />);
    yukla();
    await tasdiqla('Tovar 70');
    davrKirit();
    fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlangan qoralamalar — RU Excel' }));
    await waitFor(() => expect(mocks.excel).toHaveBeenCalledOnce());
    view.rerender(<PrixodKitobPreview kompaniyaId={2} skladId={4} />);
    resolve(new Uint8Array([1]));
    await waitFor(() => expect(screen.queryByText('Tovar 70')).toBeNull());
    expect(mocks.download).not.toHaveBeenCalled();
  });});
