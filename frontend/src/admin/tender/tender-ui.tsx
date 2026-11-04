/** Tender ekranlarining umumiy bo'laklari: holat belgisi, tur nomi, QQS bilan pul (asosiy) + QQS siz, sana, xato xabari. */
import type { ReactNode } from 'react';
import { FmtN } from '../../lib/format';
import { t, tilLocale } from '../../i18n/til';
import type { TenderHolat } from '../../lib/tender/holat';
import { pulJuft } from '../../lib/tender/pul';
import { TENDER_XATO_XABARI, type TenderTur } from '../../api/t2-tender';

export const HOLAT_KO: Readonly<Record<TenderHolat, { nom: string; stamp: string }>> = {
  qoralama: { nom: 'Qoralama', stamp: 'fz-stamp--draft' },
  tasdiqlashda: { nom: 'Tasdiqlashda', stamp: 'fz-stamp--warn' },
  elon: { nom: 'E’lon qilingan', stamp: 'fz-stamp--info' },
  takliflar_yopildi: { nom: 'Takliflar yopildi', stamp: 'fz-stamp--warn' },
  baholash: { nom: 'Baholash', stamp: 'fz-stamp--info' },
  golib_tanlandi: { nom: 'G‘olib tanlandi', stamp: 'fz-stamp--ok' },
  shartnoma: { nom: 'Shartnoma', stamp: 'fz-stamp--ok' },
  bajarilmoqda: { nom: 'Bajarilmoqda', stamp: 'fz-stamp--info' },
  yopildi: { nom: 'Yopildi', stamp: '' },
  bekor: { nom: 'Bekor qilindi', stamp: 'fz-stamp--danger' },
};
export const holatNomi = (h: TenderHolat | string) => t(HOLAT_KO[h as TenderHolat]?.nom ?? String(h));
export function HolatBelgi({ holat }: { holat: TenderHolat }) {
  return <span className={`fz-stamp ${HOLAT_KO[holat]?.stamp ?? ''}`}>{holatNomi(holat)}</span>;
}

const TUR_NOM: Readonly<Record<TenderTur, string>> = {
  material: 'Material (tovar)', xizmat: 'Xizmat', subpudrat: 'Subpudrat ishlari', transport: 'Transport', texnika_ijara: 'Texnika ijarasi',
  loyihalash: 'Loyihalash', laboratoriya: 'Laboratoriya sinovi',
};
export const turNomi = (x: string) => t(TUR_NOM[x as TenderTur] ?? x);

export const MEZON_NOM: Readonly<Record<string, string>> = {
  narx: 'Narx', muddat: 'Yetkazish muddati', tolov: 'To‘lov sharti', kafolat: 'Kafolat', reyting: 'Yetkazuvchi reytingi',
};

/** Asosiy raqam — QQS BILAN (egasi qoidasi), pastida QQS siz. Noma'lum — «kiritilmagan» (0 emas). */
export function TenderPul({ ndsSiz, foiz, valyuta = 'UZS', kichik = false }: { ndsSiz: number | null | undefined; foiz: number | null | undefined; valyuta?: string; kichik?: boolean }) {
  const p = pulJuft(ndsSiz, foiz);
  if (p.qqsBilan == null && p.qqsSiz == null) return <span className="text-text-mute">{t('kiritilmagan')}</span>;
  return (
    <span className="inline-flex flex-col leading-tight">
      {p.qqsBilan != null
        ? <span className={kichik ? 'text-[12.5px] font-semibold' : 'font-semibold'}><FmtN val={p.qqsBilan} /> <span className="text-[11px] font-normal text-text-mute">{valyuta} · {t('QQS bilan')}</span></span>
        : <span className="text-[12px] text-text-mute">{t('QQS stavkasi noma’lum')}</span>}
      <span className="text-[11px] text-text-mute">{t('QQS siz')}: <FmtN val={p.qqsSiz} /></span>
    </span>
  );
}

export function sanaVaqt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(tilLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}
export function sanaKun(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : d.toLocaleDateString(tilLocale(), { dateStyle: 'medium' });
}
/** datetime-local qiymati (brauzer vaqti) ⇄ ISO. */
export const isoDanLokal = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const lokaldanIso = (v: string): string | null => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

export function tenderXato(r: { error?: string; code?: string }): string {
  const k = r.code ? TENDER_XATO_XABARI[r.code] : undefined;
  return k ? t(k) : r.error ? r.error : t('Amalni bajarib bo‘lmadi.');
}

export function Bosh({ children }: { children: ReactNode }) {
  return <div className="rounded border border-dashed border-border p-6 text-center text-[13px] text-text-mute">{children}</div>;
}
