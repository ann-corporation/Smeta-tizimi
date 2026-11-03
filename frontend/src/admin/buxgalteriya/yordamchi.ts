import { t } from '../../i18n/til';

export const kirit = 'w-full rounded-md border border-border bg-surface px-2 py-1 text-[12.5px] text-text outline-none focus:border-accent';
export const yorliq = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-mute';
export const th = 'px-2 py-2';
export const td = 'px-2 py-1.5';

export type Davr = { dan: string; gacha: string };

export const DT_IZOH = () => t('Debet: hisob ko‘payadi (aktiv) yoki qarz kamayadi (passiv).');
export const KT_IZOH = () => t('Kredit: hisob kamayadi (aktiv) yoki qarz ko‘payadi (passiv).');

const p2 = (n: number) => String(n).padStart(2, '0');
export function bugunOyBoshi(d = new Date()): string { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-01`; }
export function bugun(d = new Date()): string { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
export function yilBoshi(d = new Date()): string { return `${d.getFullYear()}-01-01`; }
export function chorakBoshi(d = new Date()): string { return `${d.getFullYear()}-${p2(Math.floor(d.getMonth() / 3) * 3 + 1)}-01`; }
export function ddmmyyyy(s: string | null | undefined): string { return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split('-').reverse().join('.') : (s ?? ''); }