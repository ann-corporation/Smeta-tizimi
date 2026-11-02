/**
 * SozlamalarMarkazi — /admin/sozlamalar: tizimdagi BARCHA sozlamalar bitta joyda (reestr: lib/sozlama/sozlamaReestr).
 * Uch qatlam: Akkaunt (shaxsiy) · Kompaniya (admin panel) · Tizim (platforma, faqat superadmin).
 * Sahifa hech narsani o‘zi o‘zgartirmaydi — har sozlama o‘zining haqiqiy sahifasiga havola.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Building2, ChevronRight, Search, ServerCog, UserRound } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { useKompaniyaProfil } from '../../api/t2-men';
import { t } from '../../i18n/til';
import { qidiruvdaBor } from '../../i18n/lotin-kirill';
import {
  QATLAMLAR, SOZLAMALAR, mavqeMos, qatlamSoni, sozlamaFiltr, type Sozlama, type SozlamaQatlam,
} from '../../lib/sozlama/sozlamaReestr';

const QATLAM_NOMI: Record<SozlamaQatlam, string> = { akkaunt: 'Akkaunt', kompaniya: 'Kompaniya', tizim: 'Tizim' };
const QATLAM_IZOH: Record<SozlamaQatlam, string> = {
  akkaunt: 'Faqat siz uchun: profil, til, kirish, ko‘rinish.',
  kompaniya: 'Kompaniya admin panelidan boshqariladi: a‘zolar, hujjatlar, narx, AI.',
  tizim: 'Butun platforma uchun — faqat superadmin.',
};
/* Egasi 2026-10-27: tizim qatlami haqidagi gap ham faqat superadminga (boshqalar uchun u umuman yo'q). */
const TAVSIF_KOMPANIYA = 'Akkaunt — faqat siz uchun; Kompaniya — admin panelida butun jamoa uchun.';
const QATLAM_IKON: Record<SozlamaQatlam, typeof UserRound> = { akkaunt: UserRound, kompaniya: Building2, tizim: ServerCog };
const MAVQE_NOMI: Record<string, string> = { zakazchik: 'Buyurtmachi', pudratchi: 'Pudratchi', loyihachi: 'Loyihachi' };

function SozlamaKarta({ s, xira = false }: { s: Sozlama; xira?: boolean }) {
  return (
    <Link to={s.yol} data-sozlama={s.id}
      className="fz-card flex items-start gap-3 p-3 h-full hover:bg-[var(--surface-3)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
      style={xira ? { opacity: 0.6 } : undefined}>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-text">{t(s.nom)}</span>
        <span className="block text-[12px] text-text-dim mt-0.5">{t(s.izoh)}</span>
        <span className="mt-2 flex flex-wrap gap-1">
          <span className={`fz-chip ${s.saqlash === 'server' ? 'fz-chip--accent' : 'fz-chip--warn'}`}>
            {s.saqlash === 'server' ? t('Serverda') : t('Faqat shu brauzerda')}
          </span>
        </span>
      </span>
      <ChevronRight size={14} className="text-text-mute mt-1 shrink-0" aria-hidden="true" />
    </Link>
  );
}

function Guruhlar({ royxat, xira = false }: { royxat: Sozlama[]; xira?: boolean }) {
  const kamaytir = useReducedMotion();
  const guruh = useMemo(() => {
    const m = new Map<string, Sozlama[]>();
    for (const s of royxat) m.set(s.bolim, [...(m.get(s.bolim) ?? []), s]);
    return [...m.entries()];
  }, [royxat]);
  return (
    <>
      {guruh.map(([bolim, list], gi) => (
        <motion.section key={bolim} aria-label={t(bolim)}
          initial={kamaytir ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: kamaytir ? 0 : 0.18, delay: kamaytir ? 0 : Math.min(gi, 6) * 0.03 }}>
          <h3 className="fz-panel__h mb-2"><span>{t(bolim)}</span><span className="text-text-mute">{list.length}</span></h3>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))' }}>
            {list.map((s) => <SozlamaKarta key={s.id} s={s} xira={xira} />)}
          </div>
        </motion.section>
      ))}
    </>
  );
}

export default function SozlamalarMarkazi() {
  const k = useKompaniya();
  const [qp, setQp] = useSearchParams();
  const [q, setQ] = useState('');
  const kamaytir = useReducedMotion();

  const joriyId = k.globalRejim ? null : (k.joriy?.id ?? null);
  const profil = useKompaniyaProfil(joriyId);
  const mavqe = k.joriy?.mavqe ?? profil.data?.mavqe ?? null;

  const korinadigan = useMemo(
    () => sozlamaFiltr({ superadmin: k.superadmin, permissions: k.joriy?.permissions ?? [] }),
    [k.superadmin, k.joriy?.permissions],
  );
  const soni = qatlamSoni(korinadigan);
  const jamiTizimda = SOZLAMALAR.length;
  const qatlamlar = QATLAMLAR.filter((x) => x !== 'tizim' || k.superadmin);
  const sorov = qp.get('qatlam');
  const faol: SozlamaQatlam = qatlamlar.find((x) => x === sorov) ?? 'akkaunt';

  const topilgan = korinadigan.filter((s) => s.qatlam === faol)
    .filter((s) => !q.trim() || qidiruvdaBor(`${t(s.nom)} ${t(s.izoh)} ${t(s.bolim)} ${s.nom} ${s.izoh} ${s.bolim}`, q));
  const mos = faol === 'kompaniya' ? topilgan.filter((s) => mavqeMos(s, mavqe)) : topilgan;
  const nomos = faol === 'kompaniya' ? topilgan.filter((s) => !mavqeMos(s, mavqe)) : [];
  const jami = soni.akkaunt + soni.kompaniya + soni.tizim;

  const mavqeMatn = mavqe && MAVQE_NOMI[mavqe] ? t(MAVQE_NOMI[mavqe]) : null;

  return (
    <Sahifa sarlavha="Sozlamalar markazi" tavsif={k.superadmin ? 'Akkaunt — faqat siz uchun; Kompaniya — admin panelida butun jamoa uchun; Tizim — butun platforma uchun (superadmin).' : TAVSIF_KOMPANIYA}>
      <div className="flex flex-col gap-4 max-w-5xl">
        <div className="fz-card px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" role="status">
          <b className="text-text">{t('Jami {n} sozlama', { n: jami })}</b>
          {qatlamlar.map((x) => <span key={x} className="text-text-dim">· {t(QATLAM_NOMI[x])} {soni[x]}</span>)}
          {k.superadmin && <span className="text-text-mute text-[12px] sm:ml-auto">{t('Tizimda jami {n} ta sozlama mavjud', { n: jamiTizimda })}</span>}
        </div>

        <div role="tablist" aria-label={t('Sozlamalar qatlamlari')} className="flex gap-1 overflow-x-auto pb-1">
          {qatlamlar.map((x) => {
            const a = x === faol;
            const Ikon = QATLAM_IKON[x];
            return (
              <button key={x} type="button" role="tab" aria-selected={a} id={`sozlama-tab-${x}`} aria-controls="sozlama-panel" onClick={() => setQp({ qatlam: x }, { replace: true })}
                className="relative flex items-center gap-2 rounded-md px-3 text-[13px] whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                style={{ height: 'var(--control-lg)', color: a ? 'var(--text)' : 'var(--text-dim)', fontWeight: a ? 600 : 500 }}>
                {a && <motion.span layoutId="sozlama-faol" transition={{ duration: kamaytir ? 0 : 0.18 }} className="absolute inset-0 rounded-md" style={{ background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)' }} />}
                <Ikon size={15} aria-hidden="true" className="relative" />
                <span className="relative">{t(QATLAM_NOMI[x])}</span>
                <span className="relative text-text-mute text-[12px]">{soni[x]}</span>
              </button>
            );
          })}
        </div>

        <div id="sozlama-panel" role="tabpanel" aria-labelledby={`sozlama-tab-${faol}`} className="flex flex-col gap-4">
          <p className="text-[12px] text-text-dim m-0">{t(QATLAM_IZOH[faol])}</p>

          {faol === 'kompaniya' && (
            <div className="fz-note fz-note--info" role="note">
              <Building2 aria-hidden="true" />
              <div className="min-w-0 break-words">
                {k.globalRejim || !k.joriy
                  ? t('Kompaniya tanlanmagan — kompaniya sozlamalarini ko‘rish uchun ish joyini tanlang.')
                  : <>
                    <b>{k.joriy.nom}</b> · {mavqeMatn ?? t('turi belgilanmagan')}
                    {!mavqeMatn && !profil.isLoading && <> — <Link to="/admin/kompaniya?tab=profil" className="underline">{t('Kompaniya turini belgilash')}</Link></>}
                  </>}
              </div>
            </div>
          )}

          <label className="relative block max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-mute" aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Sozlamalarni qidirish…')} aria-label={t('Sozlamalarni qidirish…')}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] pl-8 pr-3 text-[13px] text-text outline-none focus:border-[var(--accent)]" style={{ height: 'var(--control-md)' }} />
          </label>

          {mos.length === 0 && nomos.length === 0 && <p className="text-[13px] text-text-dim m-0">{t('Hech narsa topilmadi.')}</p>}
          <Guruhlar royxat={mos} />

          {nomos.length > 0 && (
            <details className="fz-card p-3">
              <summary className="cursor-pointer text-[13px] font-semibold text-text">{t('Boshqa turdagi kompaniyalar uchun')} <span className="text-text-mute">({nomos.length})</span></summary>
              <div className="flex flex-col gap-4 mt-3"><Guruhlar royxat={nomos} xira /></div>
            </details>
          )}
        </div>
      </div>
    </Sahifa>
  );
}
