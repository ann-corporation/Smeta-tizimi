/**
 * KompaniyaTanlagich — qobiq tepasidagi "Kontekst: <Kompaniya>" ko'rsatkichi
 * va almashtirish tugmasi. AdminShell va TestShell bir xil komponentni
 * ishlatadi (bitta kompaniya konteksti).
 */
import { Building2, Globe, ChevronDown, RefreshCw } from 'lucide-react';
import { useKompaniya, type KompaniyaMavqe } from './KompaniyaKontekst';
import { tizimdanChiq } from './chiqish';
import { t } from '../../i18n/til';

const MAVQE_BELGI: Record<string, { nom: string; rang: string }> = {
  zakazchik: { nom: 'Buyurtmachi', rang: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  pudratchi: { nom: 'Pudratchi', rang: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  loyihachi: { nom: 'Loyihachi', rang: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30' },
};

/** Eski UI mosligi — `mavqe` bo'lsa rangli belgi, bo'lmasa hech narsa. */
export function MavqeBelgisi({ mavqe }: { mavqe: KompaniyaMavqe | null | undefined }) {
  if (!mavqe) return null;
  const b = MAVQE_BELGI[mavqe] || { nom: String(mavqe), rang: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' };
  return (
    <span className={'inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ' + b.rang}>
      {t(b.nom)}
    </span>
  );
}

export function KompaniyaTanlagich() {
  const k = useKompaniya();

  if (k.yuklanmoqda) {
    return <span className="text-[11px] text-text-mute inline-flex items-center gap-1.5"><RefreshCw size={11} className="animate-spin" /> {t('Kompaniya yuklanmoqda…')}</span>;
  }
  if (k.xato) {
    return (
      <span className="text-[11px] text-danger inline-flex items-center gap-2">
        {k.xato}
        {k.authXato
          ? <button onClick={tizimdanChiq} className="underline hover:no-underline">{t('Chiqib, qayta kirish')}</button>
          : <button onClick={k.qayta} className="underline hover:no-underline">{t('Qayta urinish')}</button>}
      </span>
    );
  }

  const options: { qiymat: string; matn: string }[] = [
    ...(k.superadmin ? [{ qiymat: 'global', matn: `🌐 ${t('Global rejim')}` }] : []),
    ...k.kompaniyalar.map((c) => ({ qiymat: String(c.id), matn: c.nom })),
  ];

  // superadmin, a'zolik yo'q -> faqat global
  if (!k.kompaniyalar.length && k.superadmin) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-accent">
        <Globe size={12} /> {t('Kontekst: Global rejim')}
      </span>
    );
  }
  // oddiy foydalanuvchi, a'zolik yo'q
  if (!k.kompaniyalar.length) {
    return <span className="text-[11px] text-warn inline-flex items-center gap-1.5"><Building2 size={12} /> {t('Hech qaysi kompaniyaga a’zo emassiz')}</span>;
  }
  // yagona a'zolik, superadmin emas -> faqat nom (tanlash shart emas)
  if (k.kompaniyalar.length === 1 && !k.superadmin) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-text-dim">
        <Building2 size={12} className="text-accent" /> {t('Kontekst:')} <b className="text-text">{k.kompaniyalar[0].nom}</b>
      </span>
    );
  }

  const joriyQiymat = k.globalRejim ? 'global' : (k.joriyId != null ? String(k.joriyId) : '');

  return (
    <span className="inline-flex items-center gap-1.5">
      {k.globalRejim ? <Globe size={12} className="text-accent" /> : <Building2 size={12} className="text-accent" />}
      <span className="text-[11px] text-text-dim">{t('Kontekst:')}</span>
      <span className="relative inline-flex items-center">
        <select
          value={joriyQiymat}
          onChange={(e) => { const v = e.target.value; if (v === 'global') k.globalGa(); else k.tanla(Number(v)); }}
          className="appearance-none bg-[var(--surface-2)] border border-border rounded pl-2 pr-6 py-0.5
                     text-[11px] font-medium text-text outline-none focus:border-accent/50 cursor-pointer"
        >
          {joriyQiymat === '' && <option value="" disabled>{t('— kompaniyani tanlang —')}</option>}
          {options.map((o) => <option key={o.qiymat} value={o.qiymat}>{o.matn}</option>)}
        </select>
        <ChevronDown size={12} className="absolute right-1.5 pointer-events-none text-text-dim" />
      </span>
    </span>
  );
}
