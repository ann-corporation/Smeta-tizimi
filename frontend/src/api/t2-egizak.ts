import { sbOqi, type SbJavob } from './supabase';
import type { QatorHolat } from './t2-fakt';
import { EGIZAK_USTUNLAR, type EgizakQator } from '../lib/f2-moslash-v3/egizak';
import { t } from '../i18n/til';

/** Egizak ma'lumotini o'qish xatosi: `kod` hisobotda tashxis uchun xabarga ham yoziladi. */
export class EgizakOqishXatosi extends Error {
  readonly kod: string;
  constructor(kod: string) {
    super(t('Egizak obyekt ma’lumotlari o‘qilmadi ({kod}).', { kod }));
    this.name = 'EgizakOqishXatosi';
    this.kod = kod;
  }
}

/** Server `toliq:false` (Worker so'rov byudjeti) bersa — oxirgi kalitdan `kalit=gt.<oxirgi>` bilan davom etadi. */
const MAKS_DAVOM = 12;
async function toliqOqi<T>(s: { jadval: string; filtr: string; ustunlar?: string; kalit: 'id' | 'qator_id' }): Promise<T[]> {
  const hammasi: T[] = [];
  let oxirgi: number | null = null;
  for (let i = 0; i < MAKS_DAVOM; i++) {
    const r: SbJavob<T> = await sbOqi<T>({
      jadval: s.jadval, filtr: s.filtr + (oxirgi == null ? '' : `&${s.kalit}=gt.${oxirgi}`),
      ustunlar: s.ustunlar, tartib: `${s.kalit}.asc`, limit: 50000,
    });
    if (!r.ok) throw new EgizakOqishXatosi(r.code || 'UPSTREAM');
    const q = r.qatorlar ?? [];
    hammasi.push(...q);
    if (r.toliq !== false) return hammasi;
    // Yarim natija — davom etamiz; ilgarilamasa jim yarim ma'lumot qaytarmaymiz.
    const k = q.length ? Number((q[q.length - 1] as Record<string, unknown>)[s.kalit]) : NaN;
    if (!Number.isSafeInteger(k) || (oxirgi != null && k <= oxirgi)) throw new EgizakOqishXatosi('TOLIQ_EMAS');
    oxirgi = k;
  }
  throw new EgizakOqishXatosi('TOLIQ_EMAS');
}

/** Obyektning t2_qator qatorlari (egizak moslash uchun): F2 egizak nusxasi va Fakt egizaklari umumiy o'qiydi. */
export function egizakQatorlarOl(oid: number): Promise<EgizakQator[]> {
  return toliqOqi<EgizakQator>({ jadval: 't2_qator', filtr: `obyekt_id=eq.${oid}`, ustunlar: EGIZAK_USTUNLAR, kalit: 'id' });
}

/** Obyektning qator holati (smeta/fakt hajmi). Kalit tartibida — server kalit oraliqlari bilan parallel o'qiydi. */
export function egizakHolatOl(oid: number): Promise<QatorHolat[]> {
  return toliqOqi<QatorHolat>({ jadval: 't2_qator_holat', filtr: `obyekt_id=eq.${oid}`, kalit: 'qator_id' });
}
