import type { PaketXom } from './paket';
import type { T2QatorHolat } from '../api/supabase';

/** epoch + revision joriy obyekt/snapshotni ajratadi; eski javob yangi UIga qo‘llanmaydi. */
export type HisobSorov = { id: number; epoch: number; revision: number; paket: PaketXom };
export type HisobJavob = {
  id: number; epoch: number; revision: number;
} & ({ ok: true; holatlar: T2QatorHolat[]; vaqtMs: number } | { ok: false; xato: 'HISOB_PAKET_XATO' });
