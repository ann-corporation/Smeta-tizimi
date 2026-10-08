import { describe, expect, it } from 'vitest';
import { mashinistMehnati, narxBildirishnomaKerak } from './narx-bildirishnoma';
import { ostatkaHujjatModeli } from './ostatka-export';
import type { T2Qator } from '../api/supabase';

const qator = (id: number, ota_id: number | null, tur: string, p: Partial<T2Qator> = {}): T2Qator => ({
  id, obyekt_id: 1, obyekt: 'X', kompaniya_id: 1, ota_id, daraja: 0, tartib: id, tur, kod: 'K' + id, nom: 'Poz ' + id, birlik: 'м3',
  hajm: 10, narx: 100, summa: 1000, kat: 'МАТ', narx_usul: null, qoshimcha: false, zamena: false, d1: null, d2: null, d3: null,
  xom_qator: id, yangilandi: null, manba_id: null, versiya: 1, raqam: null, norma: null, ...p,
});

describe('egasi qoidasi (2026-10-08): summalar doim ko‘rinadi, bildirishnoma faqat narxsiz qatorga', () => {
  it('narx 0 — haqiqiy narx, bildirishnoma yo‘q; narx yo‘q — bildirishnoma bor', () => {
    expect(narxBildirishnomaKerak({ nom: 'ПЕСОК' }, 0)).toBe(false);
    expect(narxBildirishnomaKerak({ nom: 'ПЕСОК' }, null)).toBe(true);
  });
  it('mashinist mehnati (narxi mashina ichida) — bildirishnoma yo‘q', () => {
    expect(mashinistMehnati({ nom: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ' })).toBe(true);
    expect(narxBildirishnomaKerak({ nom: 'Затраты труда машинистов' }, null)).toBe(false);
    expect(narxBildirishnomaKerak({ nom: 'ЗАТРАТЫ ТРУДА РАБОЧИХ' }, null)).toBe(true);
  });
  it('Ostatka: narxsiz resurs jamini bo‘shatmaydi; mashinist qatori ro‘yxatga tushmaydi', () => {
    const rows = [
      qator(1, null, 'rz', { hajm: null, narx: null, summa: null, nom: 'Раздел' }),
      qator(2, 1, 'bl', { narx: null, summa: null }),
      qator(3, 2, 'rs', { narx: 100, hajm: 10 }),
      qator(4, 2, 'rs', { narx: null, hajm: 5, nom: 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', kat: 'МАШ' }),
      qator(5, 2, 'rs', { narx: 0, hajm: 3, nom: 'ВОДА' }),
    ];
    const holat = [3, 4, 5].map((id) => ({ qator_id: id, fakt_hajm: 0, f2_hajm: 0 })) as unknown as Parameters<typeof ostatkaHujjatModeli>[1];
    const m = ostatkaHujjatModeli(rows, holat);
    expect(m.jami).toBe(1000);
    expect(m.diqqat.filter((d) => d.sabab.includes('нет сметной цены'))).toEqual([]);
  });
});
