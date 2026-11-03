import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { EgizakQator } from '../../lib/f2-moslash-v3/egizak';

const m = vi.hoisted(() => ({ qator: vi.fn(), holat: vi.fn() }));
vi.mock('../../api/t2-egizak', async (orig) => ({ ...(await orig<typeof import('../../api/t2-egizak')>()), egizakQatorlarOl: m.qator, egizakHolatOl: m.holat }));
vi.mock('../../api/t2-fakt', () => ({ sbFaktYoz: vi.fn() }));
vi.mock('../../api/t2-holat-qisman', () => ({ sbT2QatorHolatQisman: vi.fn() }));
import { FaktEgizakOyna } from './FaktEgizakOyna';
import { EgizakOqishXatosi } from '../../api/t2-egizak';
import type { T2Obyekt } from '../../api/supabase';

const rows = (d: number): EgizakQator[] => [
  { id: 1 + d, ota_id: null, daraja: 0, tartib: 1, tur: 'rz', kod: null, nom: 'Bo‘lim', birlik: null, hajm: null, qoshimcha: false },
  { id: 2 + d, ota_id: 1 + d, daraja: 1, tartib: 2, tur: 'bl', kod: 'E1', nom: 'Ish', birlik: 'М3', hajm: 10, qoshimcha: false },
];
const ob = (id: number, nom: string, loyiha = 22) => ({ id, nom, loyiha_id: loyiha }) as unknown as T2Obyekt;
// Prod loyiha 22 ko‘rinishi: 2 ta haqiqiy egizak + egizak bo‘lmagan (katta) obyektlar.
const OBJECTS = [ob(151, 'Amfiteatr va sahna'), ob(153, 'Sun’iy ko‘l'), ob(162, 'Fast Food 1-etaj'), ob(163, 'Fast Food 2-etaj №1'),
  ob(167, 'Osiyo oshxonasi №1'), ob(168, 'Osiyo oshxonasi №2'), ob(169, 'Italiya oshxonasi'), ob(900, 'Boshqa loyiha №2', 7)];

const chiz = (objects = OBJECTS) => render(<FaktEgizakOyna obyektId={167} obyektNom="Osiyo oshxonasi №1" objects={objects} sana="2026-11-03"
  qoralama={{}} bolimNom={null} bolimKiritma={{}} obyektKiritma={{}} manbaSaqla={async () => true} onYop={() => undefined} onYozildi={() => undefined} />);

afterEach(() => { cleanup(); m.qator.mockReset(); m.holat.mockReset(); });

describe('FaktEgizakOyna: egizak yuklash (butun obyekt fakti)', () => {
  it('manba va egizak ikkalasi yuklanadi; loyihaning boshqa (egizak bo‘lmagan) obyektlariga tegilmaydi', async () => {
    m.qator.mockImplementation(async (oid: number) => rows(oid === 167 ? 0 : 100));
    m.holat.mockResolvedValue([]);
    chiz();
    expect(await screen.findByTestId('egizak-168')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(m.qator.mock.calls.map((c) => c[0]).sort()).toEqual([167, 168]);
    expect(m.holat.mock.calls.map((c) => c[0])).toEqual([168]);
  });

  it('bir egizak o‘qilmasa — xato KOD bilan ko‘rsatiladi, qolgan egizaklar yuklanadi', async () => {
    const obj = [...OBJECTS, ob(170, 'Osiyo oshxonasi №3')];
    m.qator.mockImplementation(async (oid: number) => rows(oid === 167 ? 0 : 100));
    m.holat.mockImplementation(async (oid: number) => { if (oid === 168) throw new EgizakOqishXatosi('TIMEOUT'); return []; });
    chiz(obj);
    expect(await screen.findByTestId('egizak-170')).toBeTruthy();
    const xabar = await waitFor(() => screen.getByRole('alert'));
    expect(xabar.textContent).toContain('TIMEOUT');
    expect(xabar.textContent).toContain('Osiyo oshxonasi №2');
    expect(screen.queryByTestId('egizak-168')).toBeNull();
  });

  it('manba o‘qilmasa — xabar kodni o‘z ichiga oladi', async () => {
    m.qator.mockRejectedValue(new EgizakOqishXatosi('UPSTREAM'));
    chiz();
    const xabar = await waitFor(() => screen.getByRole('alert'));
    expect(xabar.textContent).toContain('(UPSTREAM)');
  });
});
