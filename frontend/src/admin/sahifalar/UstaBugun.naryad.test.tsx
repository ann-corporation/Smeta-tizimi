import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Naryad } from '../../lib/naryad';

const ctx = vi.hoisted(() => ({ permissions: ['company.read', 'fakt.read', 'self.work.read', 'self.work.write'] as string[] }));
const sb = vi.hoisted(() => ({ sbOqi: vi.fn(), yangiOperationId: vi.fn() }));
const usta = vi.hoisted(() => ({ faktTogriYoz: vi.fn(), navbatYozuviniYubor: vi.fn(), sbUstaQoralamalarOl: vi.fn(), ustaNaryadlarOl: vi.fn() }));
const hr = vi.hoisted(() => ({ hrOyOl: vi.fn(), hrTabelSaqla: vi.fn(), hrXodimlarOl: vi.fn(), hrMenOl: vi.fn(), hrXato: () => 'xato' }));
vi.mock('../../test02/KompaniyaTanlov', () => ({ useKompaniya: () => ({ joriy: { id: 17, nom: 'Test MChJ', permissions: ctx.permissions }, superadmin: false }) }));
vi.mock('../../api/t2-obyektlar-kesh', () => ({ useT2ObyektlarRoyxati: () => ({ obyektlar: [{ id: 5, nom: 'Obyekt A' }], yuklanmoqda: false, xato: '' }) }));
vi.mock('../../api/supabase', () => sb);
vi.mock('../../api/t2-usta', () => usta);
vi.mock('../../api/t2-hr', () => hr);
vi.mock('../../components/foto-dalil/FotoDalil', () => ({ FotoDalil: () => <div data-testid="foto-dalil" /> }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: vi.fn() }));

import UstaBugun from './UstaBugun';

const BL = [{ qator_id: 301, kod: '1.1', nom: 'Beton quyish', birlik: 'м3', smeta_hajm: 10, fakt_hajm: 0, qoldiq_hajm: 10 }, { qator_id: 302, kod: '1.2', nom: 'Armatura', birlik: 'т', smeta_hajm: 4, fakt_hajm: 0, qoldiq_hajm: 4 }];
const naryad = (holat: Naryad['holat'] = 'berildi', ustiga: Partial<Naryad> = {}): Naryad => ({
  id: 5, obyekt_id: 5, raqam: 'N-1', davr_dan: null, davr_gacha: null, usta_nom: 'Usta', brigada: null, holat, izoh: null, versiya: 3, fakt_operation_id: 'f', fakt_holat: null, fakt_akt_id: null,
  xarajat_id: null, xarajat_summa: null, yaratildi: '',
  qatorlar: [{ id: 11, qator_id: 301, tartib: 1, kod: '1.1', nom: 'Beton quyish', birlik: 'м3', hajm: 10, norma_chel_soat: null, smeta_mehnat_birlik: null, usta_narx: null, kat: 'ЧЕЛ', usta_birlik: 'м3', koef: 1,
    usta_narx_birlik: 90000, smeta_kat_birlik: null, bajarilgan_hajm: null, qabul_hajm: null, fakt_boshida: null, fakt_delta: null, fakt_yozilgan: null }], ...ustiga,
});

let n = 0;
beforeEach(() => {
  ctx.permissions = ['company.read', 'fakt.read', 'self.work.read', 'self.work.write'];
  [sb, usta, hr].forEach((m) => Object.values(m).forEach((f) => typeof f === 'function' && 'mockReset' in f && (f as ReturnType<typeof vi.fn>).mockReset()));
  n = 0; sb.yangiOperationId.mockImplementation(() => `op-${++n}`);
  sb.sbOqi.mockResolvedValue({ ok: true, qatorlar: BL });
  usta.ustaNaryadlarOl.mockResolvedValue([naryad()]);
  usta.navbatYozuviniYubor.mockResolvedValue({ ok: true });
  usta.sbUstaQoralamalarOl.mockResolvedValue({ ok: true, qatorlar: [] });
  hr.hrMenOl.mockResolvedValue({ ok: true, qator: { naryad_summa: 1234000, naryad_soni: 2 } });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  localStorage.clear();
});
afterEach(cleanup);

const ochish = async () => { render(<UstaBugun />); fireEvent.click(await screen.findByRole('button', { name: /Obyekt A/ })); };

describe('Usta «Bugun» + naryad', () => {
  it('naryad satrlari BIRINCHI (o‘z birligida, narx, qoldi); naryad ishi oddiy ro‘yxatda ko‘rinmaydi; qoida bir gapda', async () => {
    await ochish();
    const kart = await screen.findByTestId('usta-naryad-11');
    expect(kart.textContent).toContain('Beton quyish');
    expect(kart.textContent).toMatch(/90\s?000/);
    expect(screen.getByTestId('usta-qoida').textContent).toContain('Bajardim');
    // naryad ishi (301) BL ro'yxatidan chiqarilgan; naryadsiz Armatura qoladi
    expect(screen.getAllByText('Beton quyish')).toHaveLength(1);
    expect(screen.getByText('Armatura')).toBeTruthy();
    // tartib: naryad bloki «Armatura» dan oldin
    const bl = screen.getByTestId('usta-naryadlar');
    expect(bl.compareDocumentPosition(screen.getByText('Armatura')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('«Bajardim» bitta `bajarildi` buyrug‘ini yuboradi; qayta urinish bir xil operation_id bilan (takror yaratmaydi)', async () => {
    usta.navbatYozuviniYubor.mockResolvedValueOnce({ ok: false, qayta: true, xato: 'tarmoq' }).mockResolvedValue({ ok: true });
    await ochish();
    fireEvent.click(await screen.findByRole('button', { name: 'Bajardim' }));
    const dlg = await screen.findByTestId('usta-bajardim');
    expect((screen.getByLabelText('Miqdor') as HTMLInputElement).value).toBe('10');
    fireEvent.click(screen.getByRole('button', { name: 'Kamaytirish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
    await waitFor(() => expect(usta.navbatYozuviniYubor).toHaveBeenCalledTimes(1));
    const y = usta.navbatYozuviniYubor.mock.calls[0][0];
    expect(y).toMatchObject({ tur: 'naryad', obyektId: 5, kompaniyaId: 17 });
    /* Payload shakli QATIY: faqat tahrirlangan satr, tugadi (oxirgi satr), izoh; boshqa kalit yo'q. */
    expect(y.payload).toEqual({ naryadId: 5, versiya: 3, qatorlar: [{ id: 11, bajarilgan_hajm: 9 }], tugadi: true, izoh: null });
    expect(dlg).toBeTruthy();
    // vaqtinchalik xato: navbatda qoldi — «Hozir yuborish» bir xil id bilan qayta yuboradi
    fireEvent.click(await screen.findByRole('button', { name: 'Hozir yuborish' }));
    await waitFor(() => expect(usta.navbatYozuviniYubor).toHaveBeenCalledTimes(2));
    expect(usta.navbatYozuviniYubor.mock.calls[1][0].id).toBe(y.id);
  });

  it('oflayn: «Bajardim» navbatga tushadi, yuborish urinishi yo‘q', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await ochish();
    fireEvent.click(await screen.findByRole('button', { name: 'Bajardim' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yuborish' }));
    expect(await screen.findByTestId('usta-navbat')).toBeTruthy();
    expect(usta.navbatYozuviniYubor).not.toHaveBeenCalled();
  });

  it('«bu oy ishlab topganim» HR «Mening oyligim» manbasidan o‘qiladi (ikkinchi jami hisoblanmaydi)', async () => {
    await ochish();
    const blok = await screen.findByTestId('usta-oy-daromadi');
    await waitFor(() => expect(blok.textContent).toMatch(/1\s?234\s?000/));
    expect(hr.hrMenOl).toHaveBeenCalledWith(17);
  });

  it('holat oddiy so‘zlarda: yuborildi → prorab qabul qildi (kam bo‘lsa sabab) ', async () => {
    const q = naryad('qabul', { izoh: 'bir qismi qayta' }); q.qatorlar[0].bajarilgan_hajm = 10; q.qatorlar[0].qabul_hajm = 7;
    usta.ustaNaryadlarOl.mockResolvedValue([q]);
    await ochish();
    expect((await screen.findByTestId('usta-naryad-holat')).textContent).toContain('Prorab qabul qildi');
    expect(screen.getByTestId('usta-kam-qabul').textContent).toContain('bir qismi qayta');
    expect(screen.queryByRole('button', { name: 'Bajardim' })).toBeNull();
  });

  it('ikki satrli naryad: «Saqlash» faqat shu satrni yuboradi (tugadi=false), boshqa satr payload’da yo‘q; «Hammasi tugadi» tugadi=true', async () => {
    const n2 = naryad(); n2.qatorlar.push({ ...n2.qatorlar[0], id: 12, qator_id: 302, nom: 'Armatura', kod: '1.2' });
    usta.ustaNaryadlarOl.mockResolvedValue([n2]);
    await ochish();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Bajardim' }))[0]);
    fireEvent.change(await screen.findByPlaceholderText('Izoh (ixtiyoriy)'), { target: { value: 'ertalab' } });
    expect(screen.getByTestId('usta-qisman-izoh')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(usta.navbatYozuviniYubor).toHaveBeenCalledTimes(1));
    expect(usta.navbatYozuviniYubor.mock.calls[0][0].payload).toEqual({ naryadId: 5, versiya: 3, qatorlar: [{ id: 11, bajarilgan_hajm: 10 }], tugadi: false, izoh: 'ertalab' });
  });

  it('oflayn: avval yuklangan naryad satrlari keshdan ko‘rinadi', async () => {
    await ochish();
    await screen.findByTestId('usta-naryad-11');
    cleanup();
    sb.sbOqi.mockResolvedValue({ ok: false });
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await ochish();
    expect(await screen.findByTestId('usta-naryad-11')).toBeTruthy();
  });
  it('naryadi yo‘q usta: avvalgi xulq — BL qoldiqli ishlar (fakt qoralama yo‘li), naryad bo‘limi yo‘q', async () => {
    usta.ustaNaryadlarOl.mockResolvedValue([]);
    await ochish();
    expect(await screen.findByText('Beton quyish')).toBeTruthy();
    expect(screen.queryByTestId('usta-naryadlar')).toBeNull();
  });

  it('prorab (fakt.write): naryad bo‘limi so‘ralmaydi (naryadni «Naryad» sahifasida boshqaradi)', async () => {
    ctx.permissions = ['company.read', 'fakt.read', 'fakt.write', 'self.work.write'];
    await ochish();
    await screen.findByText('Beton quyish');
    expect(usta.ustaNaryadlarOl).not.toHaveBeenCalled();
  });
});
