/** Yuk birjasi ekranlarining umumiy bo‘laklari: holat belgilari, QQS bilan pul (asosiy) + QQS siz, sana, qisqa matnlar. */
import { FmtN } from '../../lib/format';
import { t, tilLocale } from '../../i18n/til';
import { qqsBilan } from '../../lib/hisob-yadro';
import { TOLOV_HOLAT_NOMI, YUK_HOLAT_NOMI, type TolovHolat, type YukHolat } from '../../lib/yuk-birjasi/holat';

const STAMP: Readonly<Record<YukHolat, string>> = {
  qoralama: 'fz-stamp--draft', elon: 'fz-stamp--info', takliflar: 'fz-stamp--info', bron: 'fz-stamp--warn', yolda: 'fz-stamp--warn',
  yetkazildi: 'fz-stamp--ok', yopildi: '', bekor: 'fz-stamp--danger', muddat_tugadi: 'fz-stamp--draft', nizo: 'fz-stamp--danger',
};
export const yukHolatNomi = (h: string) => t(YUK_HOLAT_NOMI[h as YukHolat] ?? h);
export function YukHolatBelgi({ holat }: { holat: YukHolat }) {
  return <span className={`fz-stamp ${STAMP[holat] ?? ''}`}>{yukHolatNomi(holat)}</span>;
}
export function TolovBelgi({ holat }: { holat: TolovHolat }) {
  const rang = holat === 'chiqarildi' || holat === 'ushlab_turibdi' ? 'fz-stamp--ok' : holat === 'muzlatilgan' || holat === 'xato' ? 'fz-stamp--danger' : 'fz-stamp--warn';
  return <span className={`fz-stamp ${rang}`}>{t(TOLOV_HOLAT_NOMI[holat] ?? holat)}</span>;
}

export const TOLOV_SHAKLI_NOM: Readonly<Record<string, string>> = { naqd: 'Naqd', otkazma: 'O‘tkazma (perechisleniye)', ikkalasi: 'Naqd yoki o‘tkazma' };
export const YUK_TURI_NOM: Readonly<Record<string, string>> = { sochma: 'Sochma (qum, shag‘al, sement)', qoplangan: 'Qoplangan / paketli', mo_rt: 'Mo‘rt', xavfli: 'Xavfli', negabarit: 'Negabarit / uzun' };

/** Asosiy raqam — QQS BILAN (egasi qoidasi), pastida QQS siz. Noma'lum — «kiritilmagan» (0 emas). */
export function YukPul({ qqsSiz, foiz }: { qqsSiz: number | null | undefined; foiz: number | null | undefined }) {
  if (qqsSiz == null) return <span className="text-text-mute">{t('kiritilmagan')}</span>;
  const bilan = qqsBilan(qqsSiz, foiz ?? null);
  return (
    <span className="inline-flex flex-col leading-tight">
      {bilan != null
        ? <span className="font-semibold"><FmtN val={bilan} /> <span className="text-[11px] font-normal text-text-mute">UZS · {t('QQS bilan')}</span></span>
        : <span className="text-[12px] text-text-mute">{t('QQS stavkasi noma’lum')}</span>}
      <span className="text-[11px] text-text-mute">{t('QQS siz')}: <FmtN val={qqsSiz} /></span>
    </span>
  );
}

export function sanaKun(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : d.toLocaleDateString(tilLocale(), { dateStyle: 'medium' });
}
export function sanaVaqt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(tilLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}
/** «41.3111, 69.2797» → {lat,lng} yoki null. */
export function nuqtaOqi(s: string): { lat: number; lng: number } | null {
  const m = s.trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1].replace(',', '.')), lng = Number(m[2].replace(',', '.'));
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}
export const Bosh = ({ children }: { children: React.ReactNode }) => <div className="fz-card"><div className="p-4 text-[13px] text-text-mute">{children}</div></div>;