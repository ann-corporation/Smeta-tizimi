import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { T2Qator } from '../../api/supabase';

const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.yoz }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
const baj = vi.hoisted(() => ({ royxat: vi.fn(async () => ({ ok: true, qatorlar: [] as unknown[] })), belgila: vi.fn(), bekor: vi.fn() }));
vi.mock('../../api/t2-bajarilmadi', async (orig) => ({ ...(await orig<typeof import('../../api/t2-bajarilmadi')>()), bajarilmadiRoyxatOl: baj.royxat, bajarilmadiBelgila: baj.belgila, bajarilmadiBekor: baj.bekor }));
const abc = vi.hoisted(() => ({ ochir: vi.fn() }));
vi.mock('../../api/t2-ish-abc', () => ({ ishTuriQidir: vi.fn(async () => []), resursQidir: vi.fn(async () => []), narxTakliflari: vi.fn(async () => []), ishAbcSaqla: vi.fn(), ishAbcTahrir: vi.fn(), ishAbcOchir: abc.ochir, abcXato: () => '' }));

const zb = vi.hoisted(() => ({ ol: vi.fn(async () => ({ almashtiradi: new Map<number, number>(), almashtirilgan: new Map<number, number>() })) }));
vi.mock('../../lib/fakt-zamena-boglanish', () => ({ zamenaBoglanishOl: zb.ol }));

import { FaktJurnal } from './FaktJurnal';
import { urinishOchir, yozilganOchir } from '../../lib/fakt-qamrov-urinish';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);
const rows = [
  q({ id: 1, tur: 'rz', kod: '1', nom: 'Yer ishlari' }),
  q({ id: 2, tur: 'bl', ota_id: 1, daraja: 1, nom: 'Grunt', hajm: 100 }),
  q({ id: 3, tur: 'mat', ota_id: 2, daraja: 2, nom: 'Qum', hajm: 10 }),
  q({ id: 4, tur: 'rz', kod: '2', nom: 'Beton ishlari' }),
  q({ id: 5, tur: 'bl', ota_id: 4, daraja: 1, nom: 'Poydevor', hajm: 30 }),
];
const states = [{ qator_id: 2, smeta_hajm: 100, fakt_hajm: 40 }, { qator_id: 3, smeta_hajm: 10, fakt_hajm: 0 }, { qator_id: 5, smeta_hajm: 30, fakt_hajm: 0 }];
const props = () => ({ kompaniyaId: 1, obyektId: 8, rows, states, holatniYangila: vi.fn(), tuzilmaniYangila: vi.fn() });

afterEach(() => { cleanup(); vi.clearAllMocks(); urinishOchir(1, 8); yozilganOchir(1, 8); });

describe('FaktJurnal', () => {
  it('bo‘lim ishlari, "+" va "=" bitta paketda, fokus yo‘qolmaydi', async () => {
    m.yoz.mockResolvedValue({ ok: true });
    const p = props();
    render(<FaktJurnal {...p} />);
    const grunt = screen.getByLabelText('Bugun bajarildi: Grunt') as HTMLInputElement;
    grunt.focus();
    fireEvent.change(grunt, { target: { value: '1' } });
    expect(document.activeElement).toBe(screen.getByLabelText('Bugun bajarildi: Grunt'));   // qayta yaratilmadi
    fireEvent.click(screen.getAllByRole('button', { name: '=' })[0]);
    fireEvent.change(screen.getByLabelText('Jami fakt: Grunt'), { target: { value: '55' } });
    fireEvent.change(screen.getByLabelText('Bugun bajarildi: Qum'), { target: { value: '2,5' } });
    expect(screen.getByText('2 ta o‘zgarish')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Saqlash/ }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ obyektId: 8, qatorlar: [{ qator_id: 2, hajm: 15 }, { qator_id: 3, hajm: 2.5 }] }));
    await waitFor(() => expect(p.holatniYangila).toHaveBeenCalled());
    expect(p.tuzilmaniYangila).not.toHaveBeenCalled();
  });

  it('Ctrl+S saqlaydi; 100% tugmasi qoldiqni yozadi', async () => {
    m.yoz.mockResolvedValue({ ok: true });
    render(<FaktJurnal {...props()} />);
    fireEvent.click(screen.getAllByRole('button', { name: '100%' })[0]);
    expect((screen.getByLabelText('Bugun bajarildi: Grunt') as HTMLInputElement).value).toBe('60');
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ qatorlar: [{ qator_id: 2, hajm: 60 }] })));
  });

  it('yagona ochiq qoldiq: «bajarilmaydi» ayriladi — ustun, 100% tugmasi va ogohlantirish bir xil raqamda', async () => {
    baj.royxat.mockResolvedValueOnce({ ok: true, qatorlar: [{ id: 1, qator_id: 2, bajarilmagan_hajm: 20, holat: 'faol' }] });
    render(<FaktJurnal {...props()} />);
    await waitFor(() => expect(screen.getByTestId('ochiq-2').textContent).toMatch(/^40/)); // 100 − 40 − 20
    fireEvent.click(screen.getAllByRole('button', { name: '100%' })[0]);
    expect((screen.getByLabelText('Bugun bajarildi: Grunt') as HTMLInputElement).value).toBe('40');
    expect(screen.queryByTestId('qoldiqdan-oshdi')).toBeNull();
    fireEvent.change(screen.getByLabelText('Bugun bajarildi: Grunt'), { target: { value: '45' } });
    expect(screen.getByTestId('qoldiqdan-oshdi').textContent).toMatch(/\+5/);
  });

  it('Qamrov %: bo‘lim → foiz → oldindan ko‘rish (istisnolar) → bitta fakt_yoz_v2, xabarda «Bekor qilish»', async () => {
    m.yoz.mockResolvedValue({ ok: true, akt_id: 77 });
    const p = props();
    render(<FaktJurnal {...p} />);
    fireEvent.keyDown(window, { key: '%' });
    const dlg = screen.getByRole('dialog', { name: 'Qamrov %' });
    expect(screen.getByTestId('qamrov-jami').textContent).toMatch(/2 qator yoziladi/); // Grunt 60 + Qum 10
    expect(dlg.querySelector('[data-testid="qamrov-istisno-2"]')?.textContent).toMatch(/Allaqachon faktli/);
    fireEvent.change(screen.getByLabelText('Bajarilish foizi'), { target: { value: '50' } });
    fireEvent.click(screen.getByLabelText('Olinsin: Grunt')); // ish olib tashlansa — ichidagi Qum ham tushadi
    expect(screen.getByTestId('qamrov-jami').textContent).toMatch(/0 qator yoziladi/);
    fireEvent.click(screen.getByLabelText('Olinsin: Grunt'));
    fireEvent.keyDown(screen.getByLabelText('Bajarilish foizi'), { key: 'Enter' });
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ obyektId: 8, qatorlar: [{ qator_id: 2, hajm: 30 }, { qator_id: 3, hajm: 5 }] }));
    await waitFor(() => expect(p.holatniYangila).toHaveBeenCalled());
    const ok = m.toast.mock.calls.find((c) => String(c[0]).startsWith('Qamrov 50%'));
    expect(ok?.[4]).toMatchObject({ label: 'Bekor qilish' });
    expect(screen.queryByRole('dialog', { name: 'Qamrov %' })).toBeNull();
  });

  it('Qamrov % (JQA-04/08): javob noma’lum → foiz o‘zgartirilsa ham, oyna yopilib qayta ochilsa ham XUDDI SHU amal (bir xil ID) qayta yuboriladi', async () => {
    const qabul = new Set<string>(); let yozildi = 0;
    m.yoz.mockImplementation(async (r: { operationId: string; qatorlar: { hajm: number }[] }) => {
      if (!qabul.has(r.operationId)) { qabul.add(r.operationId); yozildi += r.qatorlar.reduce((s, q) => s + q.hajm, 0); }
      if (m.yoz.mock.calls.length === 1) return { ok: false, error: 'Server 90 soniyada javob bermadi — amal serverda bajarilgan bo‘lishi mumkin.' };
      return { ok: true, akt_id: qabul.size, takror: m.yoz.mock.calls.length > 1 };
    });
    const p = props();
    render(<FaktJurnal {...p} />);
    fireEvent.click(screen.getByTestId('qamrov-tanlangan'));
    fireEvent.keyDown(screen.getByLabelText('Bajarilish foizi'), { key: 'Enter' }); // 100%: Grunt 60 + Qum 10
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('qamrov-urinish')).toBeTruthy());
    expect(p.holatniYangila).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Bajarilish foizi') as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByTestId('urinish-tashla')).toBeNull(); // noma’lum — tashlab bo‘lmaydi, faqat qayta yuborish
    fireEvent.change(screen.getByLabelText('Bajarilish foizi'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yopish' }));
    fireEvent.click(screen.getByTestId('qamrov-tanlangan')); // qayta ochildi — urinish reestrdan
    expect(screen.getByTestId('qamrov-urinish').textContent).toMatch(/100%/);
    fireEvent.click(screen.getByRole('button', { name: /^Faktga yozish — qayta yuborish/ }));
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(2));
    expect(m.yoz.mock.calls[1][0]).toEqual(m.yoz.mock.calls[0][0]);
    expect(yozildi).toBe(70); // ikki marta yozilmadi
    await waitFor(() => expect(p.holatniYangila).toHaveBeenCalled());
    expect(screen.queryByRole('dialog', { name: 'Qamrov %' })).toBeNull();
    fireEvent.click(screen.getByTestId('qamrov-tanlangan')); // hal bo‘ldi — yangi urinishga yo‘l ochiq
    expect(screen.queryByTestId('qamrov-urinish')).toBeNull();
  });

  it('Qamrov %: ish qatoridagi «%» tugmasi va katakda «%» — faqat shu ish', () => {
    render(<FaktJurnal {...props()} />);
    fireEvent.keyDown(screen.getByLabelText('Bugun bajarildi: Qum'), { key: '%' });
    expect(screen.getByRole('dialog', { name: 'Qamrov %' }).textContent).toMatch(/Grunt/);
    expect(screen.getByTestId('qamrov-jami').textContent).toMatch(/2 qator yoziladi/);
  });

  it('boshqa bo‘lim tanlanadi; qidiruv butun obyekt bo‘yicha', () => {
    render(<FaktJurnal {...props()} />);
    expect(screen.queryByText('Poydevor')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /2 Beton ishlari/ }));
    expect(screen.getByText('Poydevor')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Qidirish'), { target: { value: 'qum' } });
    expect(screen.getByText('Qum')).toBeTruthy();
  });

  it('xato qiymat — saqlash o‘chiq', () => {
    render(<FaktJurnal {...props()} />);
    fireEvent.change(screen.getByLabelText('Bugun bajarildi: Grunt'), { target: { value: 'abc' } });
    expect((screen.getByRole('button', { name: /^Saqlash/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Son emas')).toBeTruthy();
  });

  it('smetasiz obyekt — bajarilgan ishni kiritish taklifi', () => {
    render(<FaktJurnal {...props()} rows={[]} states={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Bajarilgan ishni kiritish/ }));
    expect(screen.getByRole('dialog', { name: 'Qo‘shimcha ish (smetadan tashqari)' })).toBeTruthy();
  });

  it('asl smeta qatorida tahrir/o‘chirish YO‘Q; qo‘shilgan ishda bor — o‘chirish va tahrir', async () => {
    abc.ochir.mockResolvedValue({ ok: true, ochirildi: 2 });
    const p = props();
    const qosh = [...rows,
      q({ id: 9, tur: 'bl', ota_id: 1, daraja: 1, nom: 'Qo‘shimcha devor', hajm: 4, qoshimcha: true }),
      q({ id: 10, tur: 'rs', ota_id: 9, daraja: 2, nom: 'G‘isht', birlik: 'шт', hajm: 8, narx: 1500, narx_usul: 'SMETA_OBYEKT', kat: 'МАТ', norma: 2 } as Partial<T2Qator> & { id: number; tur: string })];
    render(<FaktJurnal {...p} rows={qosh} states={[...states, { qator_id: 9, smeta_hajm: 4, fakt_hajm: 1 }]} />);
    expect(screen.queryByRole('button', { name: 'O‘chirish: Grunt' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tahrirlash: Grunt' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tahrirlash: Qo‘shimcha devor' }));
    expect(screen.getByRole('dialog', { name: 'Tahrirlash: Qo‘shimcha ish (smetadan tashqari)' })).toBeTruthy();
    expect((screen.getByLabelText('Ish hajmi') as HTMLInputElement).value).toBe('4');
    expect((screen.getByLabelText('1-resurs normasi') as HTMLInputElement).value).toBe('2');
    expect((screen.getByLabelText('Bajarilgan hajm') as HTMLInputElement).value).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));
    vi.spyOn(window, 'prompt').mockReturnValue('xato kiritilgan');
    fireEvent.click(screen.getByRole('button', { name: 'O‘chirish: Qo‘shimcha devor' }));
    await waitFor(() => expect(abc.ochir).toHaveBeenCalledWith(expect.objectContaining({ obyektId: 8, qatorId: 9, sabab: 'xato kiritilgan' })));
    await waitFor(() => expect(p.tuzilmaniYangila).toHaveBeenCalled());
  });


  it('klaviatura: qidiruvdan ↓ — birinchi hajm katagiga; Esc (bo‘sh) — qidiruvga qaytadi; Ctrl+Enter saqlaydi', async () => {
    m.yoz.mockResolvedValue({ ok: true });
    render(<FaktJurnal {...props()} />);
    const qid = screen.getByLabelText('Qidirish') as HTMLInputElement;
    qid.focus();
    fireEvent.keyDown(qid, { key: 'ArrowDown' });
    const grunt = screen.getByLabelText('Bugun bajarildi: Grunt') as HTMLInputElement;
    expect(document.activeElement).toBe(grunt);
    fireEvent.keyDown(grunt, { key: 'Escape' });
    expect(document.activeElement).toBe(qid);
    grunt.focus();
    fireEvent.change(grunt, { target: { value: '3' } });
    fireEvent.keyDown(grunt, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ qatorlar: [{ qator_id: 2, hajm: 3 }] })));
  });

  it('«Bajarilmaydi»: tugma modalni ochadi, taklif hajm = smeta - fakt, smeta o‘zgarmaydi', async () => {
    baj.belgila.mockResolvedValue({ ok: true });
    render(<FaktJurnal {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /Bajarilmaydi: Grunt/ }));
    const dlg = screen.getByRole('dialog', { name: 'Bajarilmaydi' });
    expect((screen.getByLabelText('Bajarilmagan hajm') as HTMLInputElement).value).toBe('60');
    fireEvent.keyDown(dlg, { key: 'Enter' });
    await waitFor(() => expect(baj.belgila).toHaveBeenCalledWith(expect.objectContaining({ kompaniyaId: 1, obyektId: 8, qatorlar: [{ qator_id: 2, hajm: 60 }], sabab: 'texnik_sabab' })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Bajarilmaydi' })).toBeNull());
    expect(m.yoz).not.toHaveBeenCalled();
  });

  it('ierarxiya: yuqori bo‘lim bosilganda BARCHA avlodlar (ichki bo‘lim sarlavhasi, ishlar, resurslar) ko‘rinadi; chapda ishlar soni', () => {
    const ich = [
      q({ id: 20, tur: 'rz', kod: '3', nom: 'Karkas' }),
      q({ id: 21, tur: 'rz', ota_id: 20, daraja: 1, kod: '3.1', nom: 'Ustunlar' }),
      q({ id: 22, tur: 'rz', ota_id: 21, daraja: 2, kod: '3.1.1', nom: 'Qavat 1' }),
      q({ id: 23, tur: 'bl', ota_id: 22, daraja: 3, nom: 'Beton quyish', hajm: 12 }),
      q({ id: 24, tur: 'mat', ota_id: 23, daraja: 4, nom: 'Beton B25', hajm: 12.2, kat: 'МАТ' }),
      q({ id: 25, tur: 'rs', ota_id: 23, daraja: 4, nom: 'Betonchi mehnati', birlik: 'чел.-ч', hajm: 30, kat: 'ЧЕЛ', norma: 2.5 } as Partial<T2Qator> & { id: number; tur: string }),
    ];
    render(<FaktJurnal {...props()} rows={ich} states={[{ qator_id: 23, smeta_hajm: 12, fakt_hajm: 0 }]} />);
    expect(screen.getByTestId('bolim-soni-20').textContent).toMatch(/^1 ish/);
    fireEvent.click(screen.getByRole('button', { name: /3 Karkas/ }));
    expect(screen.queryByText('Bu bo‘limda (ichki bo‘limlari bilan) ish yo‘q.')).toBeNull();
    expect(screen.getByTestId('bolim-sarlavha-21')).toBeTruthy();
    expect(screen.getByTestId('bolim-sarlavha-22')).toBeTruthy();
    expect(screen.getByText('Beton quyish')).toBeTruthy();
    expect(screen.getByLabelText('Bugun bajarildi: Beton B25')).toBeTruthy();
    expect(screen.getByTestId('resurs-25').querySelector('[data-testid="avto-belgi"]')).toBeTruthy();
    // Ish bo'yicha yopish va hammasini ochish.
    fireEvent.click(screen.getByRole('button', { name: 'Resurslar: Beton quyish' }));
    expect(screen.queryByLabelText('Bugun bajarildi: Beton B25')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hamma resurslarni yopish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hamma resurslarni ochish' }));
    expect(screen.getByLabelText('Bugun bajarildi: Beton B25')).toBeTruthy();
  });

  it('zamena qator TURIGA mos: alohida resurs va ish ichidagi resurs — «Resurs zamenasi», ish — «Ish zamenasi»', () => {
    const r2 = [...rows, q({ id: 30, tur: 'mat', ota_id: 1, daraja: 1, nom: 'Ж/Б БЛОКИ РАЗМ.БР100.20.12', birlik: 'шт', hajm: 40, kat: 'МАТ' })];
    render(<FaktJurnal {...props()} rows={r2} states={[...states, { qator_id: 30, smeta_hajm: 40, fakt_hajm: 0 }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zamena: Ж/Б БЛОКИ РАЗМ.БР100.20.12' }));
    let dlg = screen.getByRole('dialog', { name: 'Resurs zamenasi' });
    expect(screen.queryByLabelText('Ish shifri')).toBeNull();
    expect(dlg.querySelector('[data-testid="zamena-asl"]')?.textContent).toMatch(/Almashtiriladigan resurs:.*МАТ.*Ж\/Б БЛОКИ/);
    expect(screen.queryByLabelText('1-resurs normasi')).toBeNull(); // ishsiz resurs — aniq hajm
    expect(screen.getByLabelText('1-resurs aniq hajmi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zamena: Qum' }));
    dlg = screen.getByRole('dialog', { name: 'Resurs zamenasi' });
    expect(dlg.textContent).toMatch(/Ish: Grunt/);
    expect(screen.getByLabelText('1-resurs normasi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zamena: Grunt' }));
    expect(screen.getByRole('dialog', { name: 'Ish zamenasi' })).toBeTruthy();
    expect(screen.getByLabelText('Ish shifri')).toBeTruthy();
  });

  describe('resurs zamenasi va ishdan chiqarish (egasi 2026-10-27)', () => {
    const rs = (o: Partial<T2Qator> & { id: number; tur: string; norma?: number }) => q(o as Partial<T2Qator> & { id: number; tur: string });
    const ish = [
      q({ id: 60, tur: 'rz', kod: '6', nom: 'Karkas' }),
      q({ id: 61, tur: 'bl', ota_id: 60, daraja: 1, nom: 'Beton quyish', hajm: 12 }),
      rs({ id: 62, tur: 'rs', ota_id: 61, daraja: 2, nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', birlik: 'чел.-ч', hajm: 30, kat: 'ЧЕЛ', norma: 2.5 }),
      rs({ id: 63, tur: 'rs', ota_id: 61, daraja: 2, nom: 'Kran', birlik: 'маш.-ч', hajm: 6, kat: 'МАШ', norma: 0.5, narx: 300000 }),
    ];
    const st = [{ qator_id: 61, smeta_hajm: 12, fakt_hajm: 6 }, { qator_id: 62, smeta_hajm: 30, fakt_hajm: 15 }, { qator_id: 63, smeta_hajm: 6, fakt_hajm: 3, smeta_summa: 1800000, fakt_manbasi: 'BL_NORMA' }];

    it('ishchi mehnati: zamena tugmasi YO‘Q (sababi tooltip‘da), chiqarish ham yo‘q; kran — ikkalasi bor', () => {
      render(<FaktJurnal {...props()} rows={ish} states={st} />);
      expect(screen.queryByRole('button', { name: 'Zamena: ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ' })).toBeNull();
      const mehnat = screen.getByTestId('resurs-62');
      expect(mehnat.querySelector('[data-testid="zamena-yoq"]')?.getAttribute('title')).toMatch(/zamena qilinmaydi/);
      expect(mehnat.querySelector('[data-testid="chiqarish-yoq"]')?.getAttribute('title')).toMatch(/chiqarib bo‘lmaydi/);
      expect(screen.getByRole('button', { name: 'Zamena: Kran' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Ishdan chiqarish: Kran' })).toBeTruthy();
    });

    it('kran ishdan chiqariladi: «bajarilmaydi» qatlamiga TO‘LIQ smeta hajmi + sabab (smeta o‘zgarmaydi, fakt yozilmaydi)', async () => {
      baj.belgila.mockResolvedValue({ ok: true, yaratildi: 1, otkazildi: 0 });
      render(<FaktJurnal {...props()} rows={ish} states={st} />);
      fireEvent.click(screen.getByRole('button', { name: 'Ishdan chiqarish: Kran' }));
      const dlg = screen.getByRole('dialog', { name: 'Resursni ishdan chiqarish' });
      expect(dlg.textContent).toMatch(/Ish: Beton quyish/);
      fireEvent.change(screen.getByLabelText('Sabab'), { target: { value: 'loyiha_ozgardi' } });
      fireEvent.keyDown(dlg, { key: 'Enter' });
      await waitFor(() => expect(baj.belgila).toHaveBeenCalledWith(expect.objectContaining({ qatorlar: [{ qator_id: 63, hajm: 6 }], sabab: 'loyiha_ozgardi' })));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Resursni ishdan chiqarish' })).toBeNull());
      expect(m.yoz).not.toHaveBeenCalled();
    });

    it('server belgini o‘tkazib yuborsa (boshqa faol belgi bor) — xato ko‘rsatiladi, oyna yopilmaydi', async () => {
      baj.belgila.mockResolvedValue({ ok: true, yaratildi: 0, otkazildi: 1 });
      render(<FaktJurnal {...props()} rows={ish} states={st} />);
      fireEvent.click(screen.getByRole('button', { name: 'Ishdan chiqarish: Kran' }));
      fireEvent.click(screen.getByRole('button', { name: /^Chiqarish/ }));
      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.getByRole('dialog', { name: 'Resursni ishdan chiqarish' })).toBeTruthy();
    });

    it('chiqarilgan kran: «ishdan chiqarilgan» belgisi, ochiq qoldiq o‘rnida «—», chiqarish/zamena tugmasi yo‘q', async () => {
      baj.royxat.mockResolvedValueOnce({ ok: true, qatorlar: [{ id: 7, obyekt_id: 8, qator_id: 63, bajarilmagan_hajm: 6, hajm: 6, holat: 'faol' }] });
      render(<FaktJurnal {...props()} rows={ish} states={st} />);
      await screen.findByTestId('chiqarilgan-belgi');
      expect(screen.getByTestId('ochiq-63').textContent).toBe('—');
      expect(screen.queryByRole('button', { name: 'Ishdan chiqarish: Kran' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Zamena: Kran' })).toBeNull();
    });
  });

  it('zamena asl ostida «↻ zamena: asl X», aslda «almashtirildi X / Y»; qoldiqdan oshsa ogohlantirish (bloklanmaydi)', async () => {
    zb.ol.mockResolvedValueOnce({ almashtiradi: new Map([[40, 2]]), almashtirilgan: new Map([[2, 30]]) });
    const r2 = [...rows, q({ id: 40, tur: 'bl', ota_id: 1, daraja: 1, nom: 'Grunt (qo‘lda)', hajm: 30, zamena: true, qoshimcha: true })];
    render(<FaktJurnal {...props()} rows={r2} states={[...states, { qator_id: 40, smeta_hajm: 30, fakt_hajm: 0 }]} />);
    await waitFor(() => expect(screen.getByTestId('zamena-belgi').textContent).toMatch(/zamena: asl Grunt/));
    expect(screen.getByTestId('almashtirildi-belgi').textContent).toMatch(/almashtirildi 30 \/ 100 м3/);
    const ishlar = [...document.querySelectorAll('[data-testid^="ish-"]')].map((x) => x.getAttribute('data-testid')).filter((x) => /^ish-\d+$/.test(x ?? ''));
    expect(ishlar.indexOf('ish-40')).toBe(ishlar.indexOf('ish-2') + 1);
    fireEvent.change(screen.getByLabelText('Bugun bajarildi: Grunt'), { target: { value: '50' } }); // 40 + 50 > 100 − 30
    expect(screen.getByTestId('qoldiqdan-oshdi')).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Saqlash/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('ishdan keyingi alohida material: xira taklif, «Materiallarni ham olish» kiritmaga oladi (avtomatik saqlamaydi)', async () => {
    m.yoz.mockResolvedValue({ ok: true });
    const r2 = [
      q({ id: 50, tur: 'rz', kod: '7', nom: 'Yo‘l' }),
      q({ id: 51, tur: 'bl', ota_id: 50, daraja: 1, tartib: 1, nom: 'Asfalt yotqizish', birlik: 'м2', hajm: 1000 }),
      q({ id: 52, tur: 'mat', ota_id: 50, daraja: 1, tartib: 2, nom: 'Asfaltobeton', birlik: 'т', hajm: 120, kat: 'МАТ' }),
      q({ id: 53, tur: 'mat', ota_id: 50, daraja: 1, tartib: 3, nom: 'Bitum', birlik: 'т', hajm: 2, kat: 'МАТ' }),
    ];
    render(<FaktJurnal {...props()} rows={r2} states={[{ qator_id: 51, smeta_hajm: 1000, fakt_hajm: 0 }, { qator_id: 52, smeta_hajm: 120, fakt_hajm: 0 }, { qator_id: 53, smeta_hajm: 2, fakt_hajm: 0.5 }]} />);
    expect(screen.queryByTestId('material-taklif')).toBeNull();
    fireEvent.change(screen.getByLabelText('Bugun bajarildi: Asfalt yotqizish'), { target: { value: '500' } });
    const takliflar = screen.getAllByTestId('material-taklif').map((x) => x.textContent);
    expect(takliflar).toEqual(['taklif: +60', 'taklif: +0,5']);
    expect(m.yoz).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Materiallarni ham olish: Asfalt yotqizish' }));
    expect((screen.getByLabelText('Bugun bajarildi: Asfaltobeton') as HTMLInputElement).value).toBe('60');
    expect((screen.getByLabelText('Bugun bajarildi: Bitum') as HTMLInputElement).value).toBe('0.5');
    expect(m.yoz).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(m.yoz).toHaveBeenCalledWith(expect.objectContaining({ qatorlar: [{ qator_id: 51, hajm: 500 }, { qator_id: 52, hajm: 60 }, { qator_id: 53, hajm: 0.5 }] })));
  });

  it('ish ichidagi material (ota = ish) ham ergashadi: ish ulushida xira taklif, «Materiallarni ham olish» bitta tugma', () => {
    m.yoz.mockResolvedValue({ ok: true });
    render(<FaktJurnal {...props()} />);
    // Grunt fakti 40/100 → ichidagi Qum (smeta 10, fakt 0) uchun 4 taklif.
    expect(screen.getByTestId('resurs-3').querySelector('[data-testid="material-taklif"]')?.textContent).toBe('taklif: +4');
    fireEvent.click(screen.getAllByRole('button', { name: '=' })[0]);
    fireEvent.change(screen.getByLabelText('Jami fakt: Grunt'), { target: { value: '70' } });
    expect(screen.getByTestId('resurs-3').querySelector('[data-testid="material-taklif"]')?.textContent).toBe('taklif: +7');
    expect(m.yoz).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Materiallarni ham olish: Grunt' }));
    expect((screen.getByLabelText('Bugun bajarildi: Qum') as HTMLInputElement).value).toBe('7');
    expect(m.yoz).not.toHaveBeenCalled();
  });

  it('Fakt Studio paneli: F2 tayyorlash (fakt bo‘yicha F2 qoralama) tugmasi f2Otish ni chaqiradi', () => {
    const f2 = vi.fn();
    render(<FaktJurnal {...props()} f2Otish={f2} />);
    expect(screen.getByTestId('fakt-studio-bar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /F2 qoralama/ }));
    expect(f2).toHaveBeenCalled();
  });
});