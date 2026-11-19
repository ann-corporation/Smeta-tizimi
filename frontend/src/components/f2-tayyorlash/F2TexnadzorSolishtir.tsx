import { useMemo, useRef, useState } from 'react';
import { Download, Upload, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { DiskdanTanlashTugma } from '../../hujjat-maydoni/DiskdanTanlash';
import { toast } from '../../umumiy/ui/Toast';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { solishtirHisobotiXlsx, texnadzorFaylOqi } from '../../lib/f2-texnadzor-oqi';
import { texnadzorAslOqi, type AslHujjat } from '../../lib/f2-texnadzor-asl';
import { F2TexnadzorAsl } from './F2TexnadzorAsl';
import { solishtir, type Chip, type Natija, type QoralamaQator } from '../../lib/f2-texnadzor-solishtir';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { aslFaylSaqla } from '../../api/t2-asl-fayl';
import { hujjatTokenBilan } from '../../lib/token-hujjat';

type Filtr = 'ozgargan' | 'hammasi' | Chip;
const KO_RSATISH_CHEGARA = 400;

function holatNomi(n: Natija): string {
  if (n.holat === 'KALITSIZ') return n.kiritilgan ? t('Texnadzor qo‘shgan — kiritilgan') : t('Texnadzor qo‘shgan');
  if (n.holat === 'HAJM_FARQ') return t('Hajm farqi');
  if (n.holat === 'NARX_FARQ') return t('Narx farqi');
  if (n.holat === 'TIZIMDA_YOQ') return t('Tizimda yo‘q');
  if (n.holat === 'FAYLDA_YOQ') return t('Faylda yo‘q');
  return t('Teng');
}
function chipNomi(c: Chip): string {
  return c === 'bajarildi' ? t('Bajarildi') : c === 'bizning' ? t('Bizning tuzatish') : c === 'yangi' ? t('Yangi') : c === 'hujjat' ? t('Hujjat kerak') : t('OCHIQ');
}
const CHIPLAR: Chip[] = ['bajarildi', 'bizning', 'yangi', 'hujjat', 'ochiq'];
const fmt = (v: number | null) => (v == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 }).format(v));

/** Texnadzor qaytargan Excel'ni joriy qoralama bilan solishtirish — faqat o'qish (hech narsa saqlanmaydi). */
export function F2TexnadzorSolishtir({ qoralama, aktRaqam, onYop, obyektId }: { qoralama: readonly QoralamaQator[]; aktRaqam: string; onYop: () => void; obyektId?: number | null }) {
  const kid = useKompaniya().joriy?.id ?? null;
  const [natija, setNatija] = useState<ReturnType<typeof solishtir> | null>(null);
  const [fayl, setFayl] = useState('');
  const [band, setBand] = useState(false);
  const [filtr, setFiltr] = useState<Filtr>('ozgargan');
  const [qidiruv, setQidiruv] = useState('');
  const [asl, setAsl] = useState<AslHujjat | null>(null);
  const [korinish, setKorinish] = useState<'jadval' | 'asl'>('jadval');
  const [faqatBelgili, setFaqatBelgili] = useState(false);
  const inp = useRef<HTMLInputElement>(null);

  async function oqi(f: File) {
    setBand(true);
    try {
      const bytes0 = await f.arrayBuffer();
      const qator = await texnadzorFaylOqi(bytes0.slice(0));
      if (!qator) { toast(t('Bu tizim F-2 eksporti emas: КАЛИТ ustuni topilmadi'), 'danger'); return; }
      setNatija(solishtir(qator, qoralama)); setFayl(f.name); setFiltr('ozgargan'); setKorinish('jadval');
      try { setAsl(await texnadzorAslOqi(bytes0.slice(0))); } catch { setAsl(null); }
      // Texnadzor fayli asl nusxasi arxivga (R2/Disk) — solishtirishni to'xtatmaydi.
      void aslFaylSaqla(f, { kompaniyaId: kid, obyektId: obyektId ?? null, turi: 'asl_f2' });
    } catch { toast(t('Faylni o‘qib bo‘lmadi'), 'danger'); } finally { setBand(false); }
  }

  const korinadi = useMemo(() => {
    if (!natija) return [];
    const q = qidiruv.trim().toLowerCase();
    return natija.qatorlar.filter((n) => (filtr === 'hammasi' ? true : filtr === 'ozgargan' ? n.chip != null : n.chip === filtr && n.hisobga)
      && (!q || `${n.shifr} ${n.nom} ${n.izoh}`.toLowerCase().includes(q)));
  }, [natija, filtr, qidiruv]);

  const natijaXarita = useMemo(() => new Map((natija?.qatorlar ?? []).filter((n) => n.qator != null).map((n) => [n.qator as number, n])), [natija]);
  const kop = korinadi.length > KO_RSATISH_CHEGARA;

  async function hisobot() {
    if (!natija) return;
    const sarlavha = [t('Qator №'), t('Shifr'), t('Nomi'), t('Texnadzor izohi'), t('Fayl hajmi'), t('Qoralama hajmi'), t('Fayl narxi'), t('Qoralama narxi'), t('Holat')];
    const bytes = await solishtirHisobotiXlsx(korinadi, sarlavha, (n) => `${holatNomi(n)}${n.chip ? ` / ${chipNomi(n.chip)}` : ''}`);
    const faylNomi = `texnadzor-solishtirish-${aktRaqam || 'f2'}.xlsx`;
    if (!kid) { toast(t('Kompaniya tanlanmagan'), 'danger'); return; }
    const r = await hujjatTokenBilan({ kompaniyaId: kid, bytes, hujjat: 'TEXNADZOR_SOLISHTIRISH', obyekt: obyektId ?? null, sabab: `Сверка с технадзором · Ф-2 ${aktRaqam}`.slice(0, 120) }, () => downloadBlob(bytes, faylNomi));
    toast(r.ok ? (r.xabar || t('Hisobot tayyor')) : r.xabar, r.ok ? 'ok' : 'danger');
  }

  return (
    <section aria-label={t('Texnadzor faylini solishtirish')} data-testid="texnadzor-solishtir" className="fz-note fz-note--info" style={{ display: 'block' }}>
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-[13px]">{t('Texnadzor faylini solishtirish')}</strong>
        <span className="text-[12px] text-text-dim">{t('Texnadzor qaytargan Excel joriy qoralama bilan solishtiriladi — hech narsa o‘zgarmaydi.')}</span>
        <button type="button" onClick={onYop} className="fz-btn fz-btn--ghost fz-btn--sm fz-btn--icon ml-auto" aria-label={t('Yopish')}><X aria-hidden="true" /></button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input ref={inp} type="file" accept=".xlsx,.xlsm" hidden data-testid="texnadzor-fayl" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void oqi(f); }} />
        <button type="button" disabled={band} onClick={() => inp.current?.click()} className="fz-btn fz-btn--sm"><Upload aria-hidden="true" />{t('Kompyuterdan tanlash')}</button>
        <DiskdanTanlashTugma accept=".xlsx,.xlsm" disabled={band} onFayllar={(fl) => { if (fl[0]) void oqi(fl[0]); }} onXato={(m) => toast(m, 'danger')} />
        {fayl && <span className="text-[12px] text-text-mute">{fayl}</span>}
        {natija && <button type="button" onClick={() => void hisobot()} className="fz-btn fz-btn--ghost fz-btn--sm ml-auto"><Download aria-hidden="true" />{t('Hisobotni Excelga yuklab olish')}</button>}
      </div>
      {natija && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={t('Xulosa')}>
            {CHIPLAR.map((c) => (
              <button key={c} type="button" aria-pressed={filtr === c} onClick={() => setFiltr(filtr === c ? 'ozgargan' : c)} className={`fz-chip cursor-pointer ${filtr === c ? 'fz-chip--accent' : ''}`} style={{ border: 0 }}>
                {chipNomi(c)}: {natija.xulosa[c]}
              </button>
            ))}
            <button type="button" aria-pressed={filtr === 'hammasi'} onClick={() => setFiltr(filtr === 'hammasi' ? 'ozgargan' : 'hammasi')} className="fz-btn fz-btn--ghost fz-btn--sm">{t('Hammasi')}</button>
            <input value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} aria-label={t('Qidirish')} placeholder={t('Qidirish')} className="ml-auto rounded border border-border bg-bg px-2 py-1 text-[12px]" />
          </div>
          {asl && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={t('Ko‘rinish')}>
              <button type="button" aria-pressed={korinish === 'jadval'} onClick={() => setKorinish('jadval')} className={`fz-chip cursor-pointer ${korinish === 'jadval' ? 'fz-chip--accent' : ''}`} style={{ border: 0 }}>{t('Jadval')}</button>
              <button type="button" aria-pressed={korinish === 'asl'} onClick={() => setKorinish('asl')} className={`fz-chip cursor-pointer ${korinish === 'asl' ? 'fz-chip--accent' : ''}`} style={{ border: 0 }}>{t('Asl ko‘rinish')}</button>
              {korinish === 'asl' && <label className="text-[12px]"><input type="checkbox" checked={faqatBelgili} onChange={(e) => setFaqatBelgili(e.target.checked)} /> {t('Faqat belgilangan')}</label>}
            </div>
          )}
          {asl && korinish === 'asl' ? <F2TexnadzorAsl asl={asl} natijalar={natijaXarita} chipNomi={chipNomi} faqatBelgili={faqatBelgili} /> : (
          <div className="mt-2 overflow-auto" style={{ maxHeight: 420 }}>
            <table className="w-full border-collapse text-[12px]">
              <thead><tr className="text-left text-text-mute">
                <th className="p-1">{t('Qator №')}</th><th className="p-1">{t('Shifr')}</th><th className="p-1">{t('Nomi')}</th><th className="p-1">{t('Texnadzor izohi')}</th>
                <th className="p-1 text-right">{t('Hajm: fayl / qoralama')}</th><th className="p-1 text-right">{t('Narx: fayl / qoralama')}</th><th className="p-1">{t('Holat')}</th>
              </tr></thead>
              <tbody>
                {korinadi.slice(0, KO_RSATISH_CHEGARA).map((n, i) => (
                  <tr key={`${n.qator ?? 'q'}-${n.id ?? i}-${i}`} className={n.rs ? 'text-text-mute' : ''} style={n.rs ? { opacity: 0.6 } : undefined}>
                    <td className="p-1 tabular-nums">{n.qator ?? '—'}</td>
                    <td className="p-1">{n.shifr}</td>
                    <td className="p-1" style={{ paddingLeft: n.rs ? 16 : 4 }}>{n.rang && <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, marginRight: 4, background: `#${n.rang}`, border: '1px solid var(--border, #ccc)' }} />}{n.nom}</td>
                    <td className="p-1">{n.izoh}</td>
                    <td className="p-1 text-right tabular-nums">{fmt(n.fHajm)} / {fmt(n.dHajm)}</td>
                    <td className="p-1 text-right tabular-nums">{fmt(n.fNarx)} / {fmt(n.dNarx)}</td>
                    <td className="p-1">{holatNomi(n)}{n.chip ? ` · ${chipNomi(n.chip)}` : ''}</td>
                  </tr>
                ))}
                {korinadi.length === 0 && <tr><td colSpan={7} className="p-2 text-text-mute">{t('Mos qator yo‘q')}</td></tr>}
              </tbody>
            </table>
          </div>
          )}
          {kop && !(asl && korinish === 'asl') && <p className="m-0 mt-1 text-[11px] text-text-mute">{t('Dastlabki {n} qator ko‘rsatildi — to‘liq ro‘yxat hisobotda', { n: KO_RSATISH_CHEGARA })}</p>}
        </>
      )}
    </section>
  );
}
