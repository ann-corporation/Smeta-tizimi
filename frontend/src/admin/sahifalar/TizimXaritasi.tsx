/**
 * «Tizim xaritasi» — /admin/tizim-xaritasi (egasi 2026-10-27: «Tizimda nima bo'layotganini real ko'rib turish uchun
 * tizim darajasidagi mindmap»). FAQAT platforma superadmini va u ruxsat bergan odamlar: avval yengil tekshiruv
 * (`tizim_xaritasi_ruxsat_tekshir_v1`), ruxsat bo'lmasa — «ruxsat yo'q» va HECH qanday ma'lumot so'ralmaydi.
 * Server baribir har chaqiruvda tekshiradi (yashirish xavfsizlik emas).
 *
 * Kanvas, joylashuv, klaviatura, zum, fokus — mavjud mindmap (XaritaKanvas + mindmap-korinish) — takror chizish yo'q.
 * Yangilash: 30 soniyada, faqat sahifa ko'rinib turganda; xatoda kutish ortadi (lib/useJonliYangilash).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, KeyRound, Lock, RefreshCcw } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { tizimXaritasiOl, useTizimRuxsat, type TizimGraf } from '../../api/t2-tizim-xaritasi';
import { t, useTil, sanaFormatla } from '../../i18n/til';
import { fokusYoli, mindmapJoyla } from '../../lib/mindmap-korinish';
import { boshlangichYigilgan, tizimDaraxtQur, YANGILASH_MAX_MS, YANGILASH_MS } from '../../lib/tizim-xaritasi';
import { useJonliYangilash } from '../../lib/useJonliYangilash';
import { XaritaKanvas } from '../../components/mindmap/XaritaKanvas';
import { TizimPanel } from './tizim-xaritasi/TizimPanel';
import { HodisaLenta } from './tizim-xaritasi/HodisaLenta';
import { RuxsatBoshqaruv } from './tizim-xaritasi/RuxsatBoshqaruv';

const BOSH: ReadonlySet<string> = new Set();

export default function TizimXaritasi() {
  useTil();
  const ruxsat = useTizimRuxsat();
  if (ruxsat.isLoading) {
    return <div className="grid h-full place-items-center p-6 text-[13px] text-text-mute">{t('Ruxsat tekshirilmoqda…')}</div>;
  }
  if (!ruxsat.data?.ruxsat) return <RuxsatYoq />;
  return <TizimXaritaKorinish superadmin={ruxsat.data.superadmin} />;
}

function RuxsatYoq() {
  return (
    <div className="grid h-full place-items-center p-6" data-testid="tizim-ruxsat-yoq">
      <div className="fz-note fz-note--info max-w-md">
        <Lock aria-hidden />
        <span>{t('Ruxsat yo‘q. Tizim xaritasini faqat platforma superadmini va u ruxsat bergan foydalanuvchilar ko‘radi.')}</span>
      </div>
    </div>
  );
}

export function TizimXaritaKorinish({ superadmin }: { superadmin: boolean }) {
  const kamQisqarish = useReducedMotion();
  const [graf, setGraf] = useState<TizimGraf | null>(null);
  const [xato, setXato] = useState('');
  const [rad, setRad] = useState(false);
  const [kompaniya, setKompaniya] = useState<number | null>(null);
  const [kompaniyalar, setKompaniyalar] = useState<{ id: number; nom: string }[]>([]);
  const [tanlangan, setTanlangan] = useState<string | null>(null);
  const [yigilgan, setYigilgan] = useState<Set<string> | null>(null);
  const [ruxsatlarOchiq, setRuxsatlarOchiq] = useState(false);

  const yukla = useCallback(async () => {
    const r = await tizimXaritasiOl({ kompaniyaId: kompaniya });
    if (!r.ok) {
      if (r.code === 'AUTHORIZATION_DENIED') setRad(true);
      setXato(r.error);
      return false;
    }
    setXato('');
    setGraf(r.natija);
    if (r.natija.korinish?.doira === 'tizim') {
      setKompaniyalar(r.natija.tugunlar.filter((n) => n.tur === 'kompaniya').map((n) => ({ id: Number(n.meta?.kompaniya_id), nom: n.nom })));
    }
    return true;
  }, [kompaniya]);

  const jonli = useJonliYangilash(yukla, { oraliq: YANGILASH_MS, maxOraliq: YANGILASH_MAX_MS, yoqilgan: !rad });

  const daraxt = useMemo(() => (graf ? tizimDaraxtQur(graf) : null), [graf]);
  // Filtr almashsa — yig'ish holati qayta hisoblanadi; aks holda foydalanuvchi tanlovi saqlanadi.
  const { yangila } = jonli;
  useEffect(() => { setYigilgan(null); setTanlangan(null); yangila(); }, [kompaniya, yangila]);
  const yigSet: ReadonlySet<string> = useMemo(() => yigilgan ?? (daraxt ? boshlangichYigilgan(daraxt) : BOSH), [yigilgan, daraxt]);
  const joylashuv = useMemo(() => (daraxt ? mindmapJoyla(daraxt, yigSet) : null), [daraxt, yigSet]);
  const tanlanganBor = !!(tanlangan && daraxt?.tugunlar.has(tanlangan));
  const yoritilgan = useMemo(() => (daraxt && tanlanganBor && tanlangan !== daraxt.ildiz ? fokusYoli(daraxt, tanlangan!) : null), [daraxt, tanlangan, tanlanganBor]);

  const tanla = (id: string | null) => {
    setTanlangan(id);
    setRuxsatlarOchiq(false);
    const ota = id ? daraxt?.tugunlar.get(id)?.ota : null;
    if (ota && yigSet.has(ota)) setYigilgan(() => { const n = new Set(yigSet); n.delete(ota); return n; });
  };
  const yigToggle = (id: string) => setYigilgan(() => { const n = new Set(yigSet); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const hammasiniYig = (yig: boolean) => {
    if (!daraxt) return;
    const root = daraxt.tugunlar.get(daraxt.ildiz)!;
    setYigilgan(yig ? new Set(root.bolalar.filter((id) => daraxt.tugunlar.get(id)!.bolalar.length)) : new Set());
  };

  if (rad) return <RuxsatYoq />;

  const keyingiSoniya = Math.round(jonli.keyingiMs / 1000);
  const yangilanganMatn = jonli.oxirgi ? t('yangilandi {v}', { v: sanaFormatla(jonli.oxirgi, { hour: '2-digit', minute: '2-digit' }) }) : '';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-bg text-text lg:overflow-hidden" style={{ fontFamily: 'var(--font-sans)' }}>
      <header className="shrink-0 border-b border-border bg-surface px-4 py-2.5 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-[19px] font-semibold leading-7">
              <span aria-hidden className="inline-block h-3 w-3 rotate-45 rounded-[2px] bg-[var(--accent)]" />
              {t('Tizim xaritasi')}
            </h1>
            <p className="hidden text-[12.5px] text-text-dim sm:block">{t('Kompaniyalar → modullar: oxirgi amallar, xatolar va navbat. Tugunni bosing — tafsilot.')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {kompaniyalar.length > 1 || kompaniya != null ? (
              <select value={kompaniya ?? ''} onChange={(e) => setKompaniya(e.target.value ? Number(e.target.value) : null)} aria-label={t('Kompaniya filtri')}
                className="h-8 max-w-[220px] rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-surface px-2 text-[12.5px]">
                <option value="">{t('Barcha kompaniyalar')}</option>
                {kompaniyalar.map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}
              </select>
            ) : null}
            <span className="inline-flex items-center gap-1 text-[11.5px] text-text-mute" data-testid="tizim-yangilandi"
              title={t('Har 30 soniyada yangilanadi (yashirin tabda to‘xtaydi)')}>
              <Clock aria-hidden className="h-3.5 w-3.5" />{yangilanganMatn}
            </span>
            {jonli.xatoSoni > 0 ? <span className="text-[11.5px] text-warn">{t('qayta urinish {n} soniyadan keyin', { n: keyingiSoniya })}</span> : null}
            <button type="button" className="fz-btn fz-btn--sm fz-btn--icon" onClick={jonli.yangila} aria-label={t('Yangilash')} title={t('Yangilash')}>
              <RefreshCcw className={jonli.yuklanmoqda && !kamQisqarish ? 'animate-spin' : ''} />
            </button>
            {superadmin ? (
              <button type="button" className={'fz-btn fz-btn--sm ' + (ruxsatlarOchiq ? 'fz-btn--primary' : '')} onClick={() => setRuxsatlarOchiq((v) => !v)} aria-pressed={ruxsatlarOchiq}>
                <KeyRound aria-hidden />{t('Ruxsatlar')}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {xato ? (
        <div className="fz-note fz-note--danger mx-3 mt-2" role="alert">
          <AlertTriangle aria-hidden />
          <span className="flex-1">{t('Xarita o‘qilmadi: {x}', { x: xato })}</span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="relative min-h-[60vh] min-w-0 flex-1 lg:min-h-0">
          {!daraxt || !joylashuv
            ? <div className="grid h-full place-items-center p-6 text-[13px] text-text-mute">{jonli.yuklanmoqda ? t('Xarita yuklanmoqda…') : t('Xarita ma’lumoti yo‘q.')}</div>
            : (
              <XaritaKanvas daraxt={daraxt} joylashuv={joylashuv} tanlangan={tanlanganBor ? tanlangan : null} onTanla={tanla} yoritilgan={yoritilgan}
                yigilgan={yigSet} onYigToggle={yigToggle} onHammasiniYig={hammasiniYig} guruhNomi="" />
            )}
        </main>
        <aside aria-label={t('Tafsilot paneli')} className="flex shrink-0 flex-col border-t border-border bg-surface lg:w-[360px] lg:border-l lg:border-t-0">
          {ruxsatlarOchiq && superadmin
            ? <div className="min-h-0 flex-1 overflow-y-auto"><RuxsatBoshqaruv /></div>
            : (
              <>
                <div className="min-h-0 flex-[1_1_55%] overflow-y-auto">
                  {daraxt ? <TizimPanel d={daraxt} tanlangan={tanlanganBor ? tanlangan : null} onTanla={tanla} malumotYoq={graf?.malumot_yoq ?? []} /> : null}
                </div>
                <section className="flex min-h-0 flex-[1_1_45%] flex-col border-t border-border">
                  <h2 className="shrink-0 px-4 pb-1 pt-2.5 text-[13px] font-semibold">{t('Oxirgi hodisalar')}</h2>
                  <div className="min-h-0 flex-1 overflow-y-auto"><HodisaLenta hodisalar={graf?.oxirgi_hodisalar ?? []} onTanla={tanla} /></div>
                </section>
              </>
            )}
        </aside>
      </div>
    </div>
  );
}
