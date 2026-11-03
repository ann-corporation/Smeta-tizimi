import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TahlilYorliqlari } from './RahbarTahlil';
import { rahbarPanelTozala } from '../../api/t2-rahbar-panel';
import { rahbarXlsx } from '../../lib/rahbar-panel/eksport';

afterEach(cleanup);
const pk = (k: Record<string, number>, subs: Array<{ kontragent: string; summa: number }> = []) => ({ qqs_bilan: 112, qqs: 12, ustamali: 100, ustamasiz: 80,
  kesim: { chel: 0, mash: 0, mat: 0, ob: 0, subpudrat: 0, svod: 0, ustamasiz: 0, nomalum: 0, ...k }, soat: { chel: 10, mash: 5 }, subpudratchilar: subs });
const p = rahbarPanelTozala({
  ok: true, davr: { dan: null, gacha: null },
  kartalar: {
    portfel: { shartnoma_qqs_bilan: null, shartnoma_soni: 0, smeta: pk({ chel: 60, subpudrat: 20 }, [{ kontragent: 'Sintetik haykal', summa: 20 }]) },
    bajarildi: { davr: pk({ chel: 30 }), jami: pk({ chel: 30 }), akt_soni: 1, foiz_smeta: 50, foiz_shartnoma: null, reestr: null },
    tolandi: { davr: null, jami: null, yozuv_soni: 0, manbalar_yoq: ['tolov'] },
    debitor: { qiymat: null, hujjatlangan: null, tolangan: null, yosh: null, asos: 'f2', manbalar_yoq: ['tolov'] },
    kreditor: { qiymat: null, manbalar_yoq: [] }, rentabellik: { daromad: 100, tannarx: null, marja: null, foiz: null, manbalar_yoq: [] },
  },
  fakt: pk({ chel: 40 }), pul_oqimi: { oylar: [], prognoz: { kun: 90, qoralama_f2: null, tolanmagan_f2: null, kutilayotgan: null, majburiyatlar: null, manbalar_yoq: [] } },
  obyektlar: [{ obyekt_id: 1, nom: 'Sintetik A', holat: 'faol', loyiha_id: null, loyiha_nom: null, shartnoma: null, smeta: null, fakt: null, f2: null,
    f2_qoralama: { qqs_bilan: null, ustamali: null, soni: 0 }, f3: null, tolangan: null, tolangan_foiz: null, qarz: null, marja_foiz: null,
    bajarilish: { fakt: null, f2: null, f3: null }, signal: { soni: 0, kritik: 0, eng_kop: null } }],
  diqqat: [{ kod: 'narxsiz', obyekt_id: null, nom: null, summa_tasir: null, soni: 2 }], tasdiq_kutmoqda: [], signal_guruh: [], shartnomalar: [],
});

describe('Tahlil yorliqlari', () => {
  it('Resurslar: smeta/fakt/F2 kesim va F2/smeta foizi; haqiqiy xarajat «kiritilmagan»', () => {
    render(<MemoryRouter><TahlilYorliqlari p={p} /></MemoryRouter>);
    const t = screen.getByTestId('resurs-tahlili');
    expect(t.textContent).toContain('50%');
    expect(t.textContent).toContain('kiritilmagan');
  });
  it('Subpudratchilar: kontragent nomi; Yetkazuvchilar — manba yo‘q', () => {
    render(<MemoryRouter><TahlilYorliqlari p={p} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: 'Subpudratchilar' }));
    expect(screen.getByTestId('subpudrat-tahlili').textContent).toContain('Sintetik haykal');
    fireEvent.click(screen.getByRole('tab', { name: 'Yetkazuvchilar' }));
    expect(screen.getByTestId('tahlil-yetkazuvchi').textContent).toContain('kiritilmagan');
  });
});

describe('Excel eksport', () => {
  it('4 varaq; kiritilmagan qiymat bo‘sh katak + «не введено» (0 emas)', async () => {
    const { bytes, faylNomi } = await rahbarXlsx(p, { qamrovNomi: 'Sintetik / MChJ', sana: '2026-11-03' });
    expect(faylNomi).toBe('Panel_rukovoditelya_Sintetik MChJ_20261103.xlsx');
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Сводка', 'Объекты', 'Ресурсы', 'Внимание']);
    const s = wb.getWorksheet('Сводка')!;
    const tolov = s.getRows(1, s.rowCount)!.find((r) => String(r.getCell(1).value).startsWith('Оплачено'))!;
    expect(tolov.getCell(2).value).toBeNull();
    expect(tolov.getCell(5).value).toBe('не введено');
  });
});

