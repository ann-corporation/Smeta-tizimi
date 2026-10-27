/** «Jamoa» nomlari (guruh, rol, ruxsat) — komponentlar orasida umumiy. */
import { t } from '../../i18n/til';
import type { JamoaGuruhKalit } from '../../lib/mindmap-korinish';

export const AZOLAR_YOLI = '/admin/kompaniya?tab=azolar';

export function guruhNomi(k: JamoaGuruhKalit): string {
  if (k === 'rahbariyat') return t('Rahbariyat');
  if (k === 'pto') return t('PTO');
  if (k === 'prorab') return t('Prorab');
  if (k === 'bugalter') return t('Bugalter');
  return t('Boshqa');
}

export function rolNomi(rol: string | null | undefined): string {
  const r = (rol ?? '').toLowerCase();
  const m: Record<string, () => string> = {
    boss: () => t('Boss'), admin: () => t('Admin'), rahbar: () => t('Rahbar'), pto: () => t('PTO'), prorab: () => t('Prorab'),
    bugalter: () => t('Bugalter'), usta: () => t('Usta'), brigadir: () => t('Brigadir'), haydovchi: () => t('Haydovchi'),
    inspektor: () => t('Inspektor'), kuzatuvchi: () => t('Kuzatuvchi'), buyurtmachi: () => t('Buyurtmachi'), pudratchi: () => t('Pudratchi'),
    superadmin: () => t('Superadmin'),
  };
  return m[r] ? m[r]() : rol || '—';
}

export function ruxsatNomi(r: string | null | undefined): string {
  if (r === 'manage') return t('Boshqarish');
  if (r === 'write') return t('Yozish');
  if (r === 'read') return t('Ko‘rish');
  return '—';
}
