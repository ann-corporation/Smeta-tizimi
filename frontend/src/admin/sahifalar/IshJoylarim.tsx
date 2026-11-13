/**
 * ISH JOYLARIM — «Telegram modeli» markazi (egasi 2026-10-22: «yanada qulay va kreativ — muhitlar o'rtasida inqilob»).
 *
 *  • Barcha ish joylari bitta ekranda — Telegram chatlar ro'yxati kabi: avatar, nom, 👤/🏢, rol, «sizni kutmoqda» belgisi,
 *    oxirgi faollik. Bosish — o'sha joyga o'tish.
 *  • «Mening ishlarim» — BARCHA ish joylaridagi o'z navbatingiz bitta ro'yxatda (F2 tasdiq / qoralama): almashtirib yurmasdan,
 *    bir bosishda kerakli ish joyi tanlanadi va hujjat ochiladi.
 *  • Yangi ish joyi / havola orqali qo'shilish — shu yerning o'zida.
 * Ma'lumot: /api/ish-joyi?bolim=joylarim (faqat o'z a'zoliklari, har ishning ruxsati bazada tekshiriladi).
 *
 * Firuza ko'rinishi (2026-10-25): Sahifa karkasi, Skelet / BoshHolat, holat — shtamp so'zi bilan, faqat token ranglari.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Building2, CheckCircle2, FileEdit, Search, User } from 'lucide-react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { IshJoyiAmallari } from '../../umumiy/kontekst/IshJoyiAmallari';
import { KompaniyaOching } from '../components/KompaniyaOching';
import { BoshHolat, Sahifa, Skelet } from '../../umumiy/ui/Sahifa';
import { ishJoylarim, type IshJoyiKarta, type MeningIshim } from '../../api/t2-ish-joyi';
import { ROLE_LABELS } from '../../lib/company-authorization/permission-labels';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { t, tilLocale } from '../../i18n/til';

/** Barqaror avatar rangi (id dan) va bosh harflar — Telegram kabi. */
export const avatarRangi = (id: number) => `hsl(${(id * 137.508) % 360} 55% 42%)`;
export function boshHarflar(nom: string): string {
  const s = nom.replace(/[«»"'().,№-]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return ((s[0]?.[0] ?? '?') + (s[1]?.[0] ?? '')).toUpperCase();
}
/** «5 daqiqa oldin» kabi qisqa vaqt. */
export function qachon(iso: string | null, hozir = Date.now()): string {
  if (!iso) return '';
  const d = Math.max(0, Math.round((hozir - new Date(iso).getTime()) / 60000));
  if (d < 1) return t('hozir');
  if (d < 60) return `${d} ${t('daq.')}`;
  if (d < 60 * 24) return `${Math.round(d / 60)} ${t('soat')}`;
  if (d < 60 * 24 * 30) return `${Math.round(d / 1440)} ${t('kun')}`;
  return new Date(iso).toLocaleDateString('ru-RU');
}
/** Noma'lum summa — «—» (0 emas). */
const summa = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${t('so‘m')}`);

/** Avatar: ish joyi rangi mavzu fonida yumshatilgan — yorug' va tun mavzusida ham o'qiladi. */
function Avatar({ id, nom, kichik = false }: { id: number; nom: string; kichik?: boolean }) {
  const rang = avatarRangi(id);
  return <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${kichik ? 'h-7 w-7 text-[12px]' : 'h-10 w-10 text-[13px]'}`}
    style={{ background: `color-mix(in srgb, ${rang} 32%, var(--surface-2))`, color: `color-mix(in srgb, ${rang} 40%, var(--text))`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${rang} 45%, transparent)` }}>{boshHarflar(nom)}</span>;
}

/** «Mening ishlarim» qatori — komponentdan TASHQARIDA (har renderda qayta o'rnatilmaydi). */
function IshQatori({ x, onOch }: { x: MeningIshim; onOch: (x: MeningIshim) => void }) {
  const tasdiq = x.tur === 'f2_tasdiq';
  const davr = davrNomi(x.oy, tilLocale()) || x.oy || '—';
  return <li>
    <button type="button" onClick={() => onOch(x)} className="fz-list__q items-center" style={{ gridTemplateColumns: 'auto minmax(0, 1fr) auto' }}>
      <Avatar id={x.kompaniya_id} nom={x.kompaniya_nom} kichik />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="fz-list__nom truncate">{x.obyekt_nom}</span>
          <span className={`fz-stamp ${tasdiq ? 'fz-stamp--warn' : 'fz-stamp--draft'}`}>{tasdiq ? t('Tasdiq kutmoqda') : t('Qoralama')}</span>
        </span>
        <span className="fz-list__sub truncate">F2 · {davr} · {x.kompaniya_nom}</span>
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <span className="fz-list__sum">{summa(x.summa)}</span>
        <span className="text-[12px] text-text-mute">{qachon(x.yangilandi)}</span>
      </span>
    </button>
  </li>;
}

/** Ish joyi qatori (chap ro'yxat). */
function JoyQatori({ j, joriy, onOch }: { j: IshJoyiKarta; joriy: boolean; onOch: (id: number) => void }) {
  const Ikon = j.turi === 'shaxsiy' ? User : Building2;
  return <li>
    <button type="button" onClick={() => onOch(j.kompaniya_id)} aria-current={joriy ? 'true' : undefined}
      className="fz-list__q items-center" style={{ gridTemplateColumns: 'auto minmax(0, 1fr) auto' }}>
      <Avatar id={j.kompaniya_id} nom={j.nom} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <Ikon size={13} className="shrink-0 text-text-mute" aria-hidden="true" />
          <span className="fz-list__nom truncate">{j.nom}</span>
        </span>
        <span className="fz-list__sub truncate">{ROLE_LABELS[j.rol] ?? j.rol} · {j.obyektlar} {t('obyekt')} · {j.azolar} {t('a’zo')}</span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className="text-[12px] text-text-mute">{qachon(j.oxirgi_faollik)}</span>
        {j.kutmoqda > 0 && <span className="fz-chip fz-chip--accent" title={t('Sizni kutayotgan ishlar')}>{j.kutmoqda}</span>}
      </span>
    </button>
  </li>;
}

function IshGuruhi({ sarlavha, ikon, ishlar, ton, onOch }: { sarlavha: string; ikon: ReactNode; ishlar: MeningIshim[]; ton: 'warn' | 'dim'; onOch: (x: MeningIshim) => void }) {
  if (!ishlar.length) return null;
  return <div>
    <div className={`fz-panel__h px-3 pt-2 ${ton === 'warn' ? 'text-warn' : ''}`}><span className="inline-flex items-center gap-1.5">{ikon}{sarlavha}</span><span>{ishlar.length}</span></div>
    <ul className="fz-list">{ishlar.map((x) => <IshQatori key={x.akt_id} x={x} onOch={onOch} />)}</ul>
  </div>;
}

export default function IshJoylarim() {
  const k = useKompaniya();
  const navigate = useNavigate();
  const [joylar, setJoylar] = useState<IshJoyiKarta[] | null>(null);
  const [ishlar, setIshlar] = useState<MeningIshim[]>([]);
  const [xato, setXato] = useState('');
  const [q, setQ] = useState('');
  const [band, setBand] = useState(false);

  async function yukla() {
    setBand(true);
    try { const d = await ishJoylarim(); setJoylar(d.ishJoylari); setIshlar(d.ishlarim); setXato(''); }
    catch (e) { setXato(e instanceof Error ? e.message : t('Ish joylari o‘qilmadi')); }
    finally { setBand(false); }
  }
  // Ish joylari ro'yxati o'zgarganda (yangi joy / havola orqali qo'shilish) — markaz ham yangilanadi.
  useEffect(() => { void yukla(); }, [k.kompaniyalar.length]);

  const korinadi = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (joylar ?? []).filter((j) => !s || j.nom.toLowerCase().includes(s));
  }, [joylar, q]);
  const tasdiq = ishlar.filter((x) => x.tur === 'f2_tasdiq');
  const qoralama = ishlar.filter((x) => x.tur === 'f2_qoralama');

  function ochJoy(id: number, yol = '/admin/obyektlar') {
    if (k.joriyId !== id) k.tanla(id);
    navigate(yol);
  }
  const ishniOch = (x: MeningIshim) => ochJoy(x.kompaniya_id, `/admin/f2-tarix?obyekt=${x.obyekt_id}`);
  const boshMatn = q ? t('Topilmadi.') : t('Hali ish joyingiz yo‘q — «＋» bilan oching yoki havola orqali qo‘shiling.');

  return (
    <Sahifa sarlavha={t('Ish joylarim')} tavsif={t('Barcha ish joylaringiz va ulardagi navbatingiz — bitta ekranda. Bosing — o‘sha joyga o‘tasiz.')}
      onYangila={() => void yukla()} yangilanmoqda={band} amallar={<IshJoyiAmallari />}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        {xato && <div role="alert" className="fz-note fz-note--danger"><AlertTriangle aria-hidden="true" /><span>{xato}</span></div>}

        <div className="grid gap-4 lg:grid-cols-[minmax(280px,2fr)_3fr]">
          <section aria-label={t('Ish joylari')} className="fz-card">
            <div className="relative border-b border-border p-2">
              <Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-mute" aria-hidden="true" />
              <input className="input h-8 w-full pl-8" placeholder={t('Ish joyini qidirish…')} aria-label={t('Ish joyini qidirish')} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {!joylar && !xato && <Skelet qatorlar={4} />}
            {korinadi.length > 0 && <ul className="fz-list">
              {korinadi.map((j) => <JoyQatori key={j.kompaniya_id} j={j} joriy={k.joriyId === j.kompaniya_id} onOch={ochJoy} />)}
            </ul>}
            {joylar && !joylar.length && <KompaniyaOching />}
            {joylar && !!joylar.length && !korinadi.length && <BoshHolat matn={boshMatn} />}
          </section>

          <section aria-label={t('Mening ishlarim')} className="fz-card">
            <div className="fz-card__head">
              <div>
                <h2 className="fz-card__title">{t('Mening ishlarim')}</h2>
                <p className="fz-card__sub">{t('barcha ish joylaridan')}</p>
              </div>
              {ishlar.length > 0 && <span className="fz-chip fz-chip--accent">{ishlar.length}</span>}
            </div>
            {!joylar && !xato && <Skelet qatorlar={3} />}
            {joylar && !ishlar.length && <div className="p-4"><div className="fz-note fz-note--info"><CheckCircle2 aria-hidden="true" /><span>{t('Hozir sizni kutayotgan ish yo‘q.')}</span></div></div>}
            <IshGuruhi sarlavha={t('Tasdiq kutmoqda')} ikon={<CheckCircle2 size={13} aria-hidden="true" />} ishlar={tasdiq} ton="warn" onOch={ishniOch} />
            <IshGuruhi sarlavha={t('F2 qoralamalari')} ikon={<FileEdit size={13} aria-hidden="true" />} ishlar={qoralama} ton="dim" onOch={ishniOch} />
          </section>
        </div>
      </div>
    </Sahifa>
  );
}
