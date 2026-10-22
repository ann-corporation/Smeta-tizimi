/**
 * ISH JOYLARIM — «Telegram modeli» markazi (egasi 2026-10-22: «yanada qulay va kreativ — muhitlar o'rtasida inqilob»).
 *
 *  • Barcha ish joylari bitta ekranda — Telegram chatlar ro'yxati kabi: avatar, nom, 👤/🏢, rol, «sizni kutmoqda» belgisi,
 *    oxirgi faollik. Bosish — o'sha joyga o'tish.
 *  • «Mening ishlarim» — BARCHA ish joylaridagi o'z navbatingiz bitta ro'yxatda (F2 tasdiq / qoralama): almashtirib yurmasdan,
 *    bir bosishda kerakli ish joyi tanlanadi va hujjat ochiladi.
 *  • Yangi ish joyi / havola orqali qo'shilish — shu yerning o'zida.
 * Ma'lumot: /api/ish-joyi?bolim=joylarim (faqat o'z a'zoliklari, har ishning ruxsati bazada tekshiriladi).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CheckCircle2, FileEdit, Loader2, RefreshCw, Search, User } from 'lucide-react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { IshJoyiAmallari } from '../../umumiy/kontekst/IshJoyiAmallari';
import { ishJoylarim, type IshJoyiKarta, type MeningIshim } from '../../api/t2-ish-joyi';
import { ROLE_LABELS } from '../../lib/company-authorization/permission-labels';
import { t } from '../../i18n/til';

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
const summa = (n: number | null) => (n == null ? t('noma’lum') : n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }));

function Avatar({ id, nom, kichik = false }: { id: number; nom: string; kichik?: boolean }) {
  return <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${kichik ? 'h-6 w-6 text-[10px]' : 'h-10 w-10 text-[13px]'}`}
    style={{ background: avatarRangi(id) }}>{boshHarflar(nom)}</span>;
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

  function IshQatori({ x }: { x: MeningIshim }) {
    return <li>
      <button type="button" onClick={() => ishniOch(x)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2">
        <Avatar id={x.kompaniya_id} nom={x.kompaniya_nom} kichik />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-text">{x.obyekt_nom} · F2 {x.oy}</span>
          <span className="block truncate text-[11px] text-text-mute">{x.kompaniya_nom} · {summa(x.summa)} {t('so‘m')}</span>
        </span>
        <span className="shrink-0 text-[11px] text-text-mute">{qachon(x.yangilandi)}</span>
      </button>
    </li>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-text">{t('Ish joylarim')}</h1>
          <p className="text-[12px] text-text-dim">{t('Barcha ish joylaringiz va ulardagi navbatingiz — bitta ekranda. Bosing — o‘sha joyga o‘tasiz.')}</p>
        </div>
        <IshJoyiAmallari />
        <button type="button" className="tugma h-8" onClick={() => void yukla()} disabled={band} aria-label={t('Yangilash')}>
          {band ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}</button>
      </header>
      {xato && <p role="alert" className="text-[13px] text-rose-400">{xato}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,2fr)_3fr]">
        <section aria-label={t('Ish joylari')} className="karta overflow-hidden">
          <div className="relative border-b border-border p-2">
            <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-mute" />
            <input className="input h-8 w-full pl-7 text-[12.5px]" placeholder={t('Ish joyini qidirish…')} aria-label={t('Ish joyini qidirish')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!joylar && !xato && <p className="p-4 text-[13px] text-text-dim"><Loader2 size={13} className="inline animate-spin" /> {t('yuklanmoqda…')}</p>}
          <ul className="divide-y divide-border/50">
            {korinadi.map((j) => {
              const joriy = k.joriyId === j.kompaniya_id;
              return <li key={j.kompaniya_id}>
                <button type="button" onClick={() => ochJoy(j.kompaniya_id)} aria-current={joriy ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 ${joriy ? 'bg-accent/10' : ''}`}>
                  <Avatar id={j.kompaniya_id} nom={j.nom} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {j.turi === 'shaxsiy' ? <User size={12} className="shrink-0 text-text-mute" /> : <Building2 size={12} className="shrink-0 text-text-mute" />}
                      <span className="truncate text-[13.5px] font-medium text-text">{j.nom}</span>
                    </span>
                    <span className="block truncate text-[11px] text-text-mute">
                      {ROLE_LABELS[j.rol] ?? j.rol} · {j.obyektlar} {t('obyekt')} · {j.azolar} {t('a’zo')}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[10.5px] text-text-mute">{qachon(j.oxirgi_faollik)}</span>
                    {j.kutmoqda > 0 && <span className="min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-semibold text-white"
                      title={t('Sizni kutayotgan ishlar')}>{j.kutmoqda}</span>}
                  </span>
                </button>
              </li>;
            })}
          </ul>
          {joylar && !korinadi.length && <p className="p-4 text-[13px] text-text-mute">{q ? t('Topilmadi.') : t('Hali ish joyingiz yo‘q — «＋» bilan oching yoki havola orqali qo‘shiling.')}</p>}
        </section>

        <section aria-label={t('Mening ishlarim')} className="karta space-y-3 p-3">
          <h2 className="text-[14px] font-semibold text-text">{t('Mening ishlarim')} <span className="text-[12px] font-normal text-text-mute">— {t('barcha ish joylaridan')}</span></h2>
          {joylar && !ishlar.length && <p className="text-[13px] text-text-mute"><CheckCircle2 size={14} className="inline text-emerald-400" /> {t('Hozir sizni kutayotgan ish yo‘q.')}</p>}
          {tasdiq.length > 0 && <div>
            <h3 className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-warn"><CheckCircle2 size={13} /> {t('Tasdiq kutmoqda')} ({tasdiq.length})</h3>
            <ul>{tasdiq.map((x) => <IshQatori key={x.akt_id} x={x} />)}</ul>
          </div>}
          {qoralama.length > 0 && <div>
            <h3 className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-text-dim"><FileEdit size={13} /> {t('F2 qoralamalari')} ({qoralama.length})</h3>
            <ul>{qoralama.map((x) => <IshQatori key={x.akt_id} x={x} />)}</ul>
          </div>}
        </section>
      </div>
    </div>
  );
}
