import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { T2Qator } from '../../api/supabase';

// Sintetik ma'lumot; tarmoq yo'q (barcha API mock).
const m = vi.hoisted(() => ({ yoz: vi.fn(), toast: vi.fn(), holat: vi.fn() }));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: m.yoz }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));
vi.mock('../../api/t2-bajarilmadi', async (orig) => ({ ...(await orig<typeof import('../../api/t2-bajarilmadi')>()), bajarilmadiRoyxatOl: vi.fn(async () => ({ ok: true, qatorlar: [] })) }));
vi.mock('../../api/t2-holat-qisman', () => ({ sbT2QatorHolatQisman: m.holat, sbT2DaraxtQisman: vi.fn() }));
vi.mock('../../lib/fakt-zamena-boglanish', () => ({ zamenaBoglanishOl: vi.fn(async () => ({ almashtiradi: new Map(), almashtirilgan: new Map() })) }));

import { IshVaraq } from './IshVaraq';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 8, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: 'n', birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: null, narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);
const ISHLAR = [11, 12, 13, 14, 15, 16];
const rows = [
  q({ id: 1, tur: 'rz', kod: '1', nom: 'Bolim A' }),
  ...ISHLAR.map((id) => q({ id, tur: 'bl', ota_id: 1, daraja: 1, kod: `E${id}`, nom: `Ish ${id}`, hajm: 100 })),
  q({ id: 31, tur: 'mat', ota_id: 11, daraja: 2, nom: 'Qum', hajm: 10 }),
  q({ id: 2, tur: 'rz', kod: '2', nom: 'Bolim B' }),
  q({ id: 21, tur: 'bl', ota_id: 2, daraja: 1, nom: 'Poydevor', hajm: 30 }),
];
const states = [...ISHLAR.map((id) => ({ qator_id: id, smeta_hajm: 100, fakt_hajm: 40 })), { qator_id: 31, smeta_hajm: 10, fakt_hajm: 0 }, { qator_id: 21, smeta_hajm: 30, fakt_hajm: 0 }];
const props = () => ({ kompaniyaId: 1, obyektId: 8, rows, states, holatniYangila: vi.fn() });

const bos = (key: string, o: Record<string, unknown> = {}) => fireEvent.keyDown(document.activeElement ?? window, { key, ...o });
const kirit = (nom: string) => screen.getByLabelText(`Fakt: ${nom}`) as HTMLInputElement;

afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });

describe('IshVaraq — Ish varag‘i', () => {
  it('bo‘lim yig‘ilishi: yopiq bo‘lim ichi DOM da yo‘q; ishning resurslari sukut yopiq', () => {
    render(<IshVaraq {...props()} />);
    expect(screen.getByText('Ish 11')).toBeTruthy();
    expect(screen.queryByText('Qum')).toBeNull(); // resurs — ish ochilguncha DOM da yo'q
    fireEvent.click(screen.getByLabelText('Resurslar: Ish 11'));
    expect(screen.getByText('Qum')).toBeTruthy();
    const yig = screen.getAllByRole('button', { name: 'Yig‘ish' })[0];
    fireEvent.click(yig);
    expect(screen.queryByText('Ish 11')).toBeNull();
    expect(screen.getByText('Poydevor')).toBeTruthy(); // boshqa bo'lim tegilmadi
  });

  it('faqat o‘qish ustunlari: smeta hajm, F2, qoldiq (smeta − fakt) ko‘rinadi', () => {
    render(<IshVaraq {...props()} />);
    expect(screen.getByTestId('varaq-smeta-11').textContent).toBe('100');
    expect(screen.getByTestId('varaq-qoldiq-11').textContent).toBe('60');
    expect(screen.getByTestId('varaq-f2-11').textContent).toBe('—');
  });

  it('klaviatura oqimi: 5 qator faqat klaviatura bilan kiritiladi, so‘ng Ctrl+S — BITTA saqlash chaqiruvi, aniq payload', async () => {
    m.yoz.mockResolvedValue({ ok: true });
    m.holat.mockResolvedValue({ ok: true, qatorlar: [{ qator_id: 13, fakt_hajm: 40 }, { qator_id: 14, fakt_hajm: 40 }] }); // CAS: «=» kiritmalar serverdagi faktga nisbatan
    render(<IshVaraq {...props()} />);
    bos('ArrowDown'); bos('ArrowDown'); // sarlavha → birinchi ish (navigatsiya rejimi)
    bos('Enter'); // tahrir
    expect(document.activeElement).toBe(kirit('Ish 11'));
    const qiymatlar: Array<[string, string]> = [['Ish 11', '5'], ['Ish 12', '+6'], ['Ish 13', '=70'], ['Ish 14', '50%'], ['Ish 15', '2,5']];
    qiymatlar.forEach(([nom, v], i) => {
      expect(document.activeElement).toBe(kirit(nom));
      fireEvent.change(kirit(nom), { target: { value: v } });
      if (i < qiymatlar.length - 1) bos('Enter'); // Enter = keyingi qator
    });
    expect(screen.getByTestId('ish-varaq-saqlanmagan').textContent).toContain('5');
    bos('s', { ctrlKey: true });
    await waitFor(() => expect(m.yoz).toHaveBeenCalledTimes(1));
    const arg = m.yoz.mock.calls[0][0];
    expect(arg.obyektId).toBe(8);
    expect(arg.sana).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof arg.operationId).toBe('string');
    // 11: +5; 12: +6; 13: =70 → 70 − 40 = 30; 14: 50% (jami) → 50 − 40 = 10; 15: +2.5
    expect(arg.qatorlar).toEqual([
      { qator_id: 11, hajm: 5 }, { qator_id: 12, hajm: 6 }, { qator_id: 13, hajm: 30 }, { qator_id: 14, hajm: 10 }, { qator_id: 15, hajm: 2.5 },
    ]);
  });

  it('Esc — katak tahriri bekor (avvalgi qiymat qaytadi)', () => {
    render(<IshVaraq {...props()} />);
    kirit('Ish 11').focus();
    fireEvent.change(kirit('Ish 11'), { target: { value: '9' } });
    expect(kirit('Ish 11').value).toBe('9');
    bos('Escape');
    expect(kirit('Ish 11').value).toBe('');
    expect(screen.queryByTestId('ish-varaq-saqlanmagan')).toBeNull();
  });

  it('Excel ustunini joylash (ommaviy amal) va Ctrl+Z — qaytaradi', () => {
    render(<IshVaraq {...props()} />);
    kirit('Ish 11').focus();
    fireEvent.paste(kirit('Ish 11'), { clipboardData: { getData: () => '1\n2\n3' } });
    expect(kirit('Ish 12').value).toBe('+2');
    expect(screen.getByTestId('ish-varaq-saqlanmagan').textContent).toContain('3');
    bos('z', { ctrlKey: true });
    expect(kirit('Ish 12').value).toBe('');
    expect(screen.queryByTestId('ish-varaq-saqlanmagan')).toBeNull();
  });

  it('xato qiymat bilan Ctrl+S — saqlanmaydi, sabab ko‘rsatiladi', () => {
    render(<IshVaraq {...props()} />);
    fireEvent.change(kirit('Ish 11'), { target: { value: 'abc' } });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(m.yoz).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith('1 tasida xato — tuzating', 'warn');
  });

  it('«/» — qidiruvga fokus; qidiruv qatorlarni filtrlaydi', () => {
    render(<IshVaraq {...props()} />);
    fireEvent.keyDown(window, { key: '/' });
    const qid = screen.getByLabelText('Qidirish');
    expect(document.activeElement).toBe(qid);
    fireEvent.change(qid, { target: { value: 'poydevor' } });
    expect(screen.getByText('Poydevor')).toBeTruthy();
    expect(screen.queryByText('Ish 11')).toBeNull();
  });

  it('pastki doimiy panel: saqlanmagan soni va Saqlash tugmasi', () => {
    render(<IshVaraq {...props()} />);
    expect(screen.getByTestId('ish-varaq-jami')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Saqlash/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(kirit('Ish 11'), { target: { value: '1' } });
    expect((screen.getByRole('button', { name: /Saqlash/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('IshVaraq — o‘lchov (26 000 qator, sintetik)', () => {
  it('virtualizatsiya: DOM da faqat ko‘rinadigan qatorlar; ochilish vaqti qayd etiladi', () => {
    const R: T2Qator[] = []; const S: Array<{ qator_id: number; smeta_hajm: number; fakt_hajm: number }> = [];
    let id = 1;
    for (let b = 0; b < 100; b++) {
      const bid = id++; R.push(q({ id: bid, tur: 'rz', nom: `B${b}` }));
      for (let i = 0; i < 40; i++) {
        const iid = id++; R.push(q({ id: iid, tur: 'bl', ota_id: bid, nom: `I${iid}`, hajm: 10 })); S.push({ qator_id: iid, smeta_hajm: 10, fakt_hajm: 1 });
        for (let r = 0; r < 5; r++) { const rid = id++; R.push(q({ id: rid, tur: r % 2 ? 'mat' : 'rs', ota_id: iid, nom: `R${rid}`, hajm: 1 })); S.push({ qator_id: rid, smeta_hajm: 1, fakt_hajm: 0 }); }
      }
    }
    const t0 = performance.now();
    render(<IshVaraq kompaniyaId={1} obyektId={8} rows={R} states={S} holatniYangila={vi.fn()} />);
    const ms = performance.now() - t0;
    const chizilgan = document.querySelectorAll('[data-satr]').length;
    // eslint-disable-next-line no-console
    console.info(`[ish-varaq perf] ${R.length} qator: ochilish (render) ${ms.toFixed(0)} ms, DOM satrlar ${chizilgan}, jami satr ${screen.getByTestId('ish-varaq-soni').textContent}`);
    expect(screen.getByTestId('ish-varaq-virtual')).toBeTruthy();
    expect(chizilgan).toBeLessThan(60);
  });
});