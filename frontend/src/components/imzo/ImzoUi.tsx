/**
 * components/imzo/ImzoUi.tsx - imzo holati belgisi, imzolar ro'yxati va fayl saqlash yordamchisi.
 * Imzo holati SERVERDA kriptografik tekshirilgan natija (functions/_shared/imzo.ts); bu yerda faqat ko'rsatiladi.
 */
import type { ReactNode } from 'react';
import { AlertTriangle, BadgeCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { t } from '../../i18n/til';
import type { ImzoHolati, ImzoKorinish } from '../../api/t2-imzo';
import { nomidanTomonTaxmin, tomonYorligi, sanaMatni } from '../../lib/imzo/qr-varaq';

const HOLAT: Record<ImzoHolati, { matn: string; tur: 'ok' | 'warn' | 'danger' }> = {
  haqiqiy: { matn: 'Imzo haqiqiy', tur: 'ok' },
  imzo_yaroqsiz: { matn: 'Imzo yaroqsiz', tur: 'danger' },
  hujjat_ozgargan: { matn: 'Hujjat o‘zgargan - imzo yaroqsiz', tur: 'danger' },
  hujjat_almashtirilgan: { matn: 'Hujjatning yangi tahriri bor', tur: 'warn' },
  hujjat_ochirilgan: { matn: 'Hujjat o‘chirilgan', tur: 'warn' },
  shubhali: { matn: 'Shubhali (kalit buzilgan deb e‘lon qilingan)', tur: 'danger' },
};
const RANG = { ok: 'var(--ok, #1a7f37)', warn: 'var(--warn, #9a6700)', danger: 'var(--danger, #cf222e)' } as const;

export function ImzoHolatBelgisi({ holat }: { holat: ImzoHolati }) {
  const h = HOLAT[holat] ?? HOLAT.imzo_yaroqsiz;
  const Ikon = h.tur === 'ok' ? BadgeCheck : h.tur === 'warn' ? AlertTriangle : holat === 'imzo_yaroqsiz' ? ShieldX : ShieldAlert;
  return <span className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: RANG[h.tur] }}><Ikon size={14} aria-hidden="true" />{t(h.matn)}</span>;
}

/** «Texnik nazorat (Buyurtmachi nomidan)» - imzolovchi qaysi tomon sifatida imzolaganini ko'rsatadi. */
export function tomonMatni(q: Pick<ImzoKorinish, 'tomon' | 'nomidan_kompaniya'>): string {
  return tomonYorligi(q.tomon, q.nomidan_kompaniya ? nomidanTomonTaxmin(q.tomon) : null, q.nomidan_kompaniya).uz;
}

export function ImzoQatorlari({ imzolar, maxfiy = false }: { imzolar: readonly ImzoKorinish[]; maxfiy?: boolean }) {
  if (!imzolar.length) return <p className="text-[13px] text-text-dim m-0">{t('Hali imzo qo‘yilmagan.')}</p>;
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-2">
      {imzolar.map((q, i) => (
        <li key={q.token ?? q.id ?? i} className="rounded-md border border-[var(--border)] p-3 flex flex-col gap-1" style={q.joriy ? { borderColor: 'var(--accent)' } : undefined}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="text-[13px] text-text break-words">{q.imzolovchi}</b>
            <ImzoHolatBelgisi holat={q.holat} />
          </div>
          <span className="text-[12px] text-text-dim">{tomonMatni(q)}</span>
          <span className="text-[12px] text-text-dim">{q.imzolovchi_kompaniya}{maxfiy ? '' : ` · ${q.rol}`}</span>
          <span className="text-[12px] text-text-dim">{t('Elektron imzolangan')} · {sanaMatni(q.vaqt)} · {t('Kod')}: <code>{q.kod}</code></span>
          {q.kalit_bekor && !q.shubhali && <span className="text-[12px] text-text-dim">{t('Kalit keyin bekor qilingan (imzo o‘sha paytda to‘g‘ri edi).')}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Baytlarni foydalanuvchiga saqlaydi (imzolangan nusxa: avval to'langan hujjatning qayta yuklanishi - bepul). */
export function faylSaqla(bytes: Uint8Array, nom: string, mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = nom;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

/** Oddiy yorliqli maydon (yorliq + kiritish + izoh). */
export function Lbl({ yorliq, yordam, children }: { yorliq: string; yordam?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[12px] text-text-dim">{t(yorliq)}</span>
      {children}
      {yordam && <span className="text-[11.5px] text-text-dim">{t(yordam)}</span>}
    </label>
  );
}
