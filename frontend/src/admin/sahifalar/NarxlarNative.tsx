import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { MarketPriceComparison } from '../../components/smeta-studio-pro/MarketPriceComparison';
/**
 * NarxlarNative — Narxlar markazining Supabase-only ko‘rinishi.
 *
 * Bu komponent GAS chaqirmaydi. Hisoblash ham qilmaydi: natija va manba
 * `t2_narx_markaz`ning bazadagi ko‘rinishidan olinadi. Flag-off legacy
 * ekran boshqa modulda o‘z holicha qoladi.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Save, Search, ShieldAlert, Tags } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { FmtN } from '../../lib/format';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { sbOqi, sbT2ObyektlarOlKomp, type T2Obyekt } from '../../api/supabase';
import {
  sbT2NarxBelgila, sbT2NarxMarkazOl, sbT2NarxSanaQosh,
  sbT2TopilmaganlarOl, type NarxMarkaz, type Topilmagan,
} from '../../api/t2-narx';
import {
  sbNarxDalilBogla, sbNarxDalillarOl, sbNarxManbaQidiruvQatorlariOl, sbNarxManbalarOl,
  type NarxDalilHolat, type NarxManba, type NarxManbaQidiruvQatori,
} from '../../api/t2-narx-dalil';
import { birlikKalit, narxSemantikNomzodlari, nomKalit, type NarxQidiruvResurs, type NarxSemantikNomzod } from '../../lib/narx-dalil/semantik';
import { PanelXatoChegarasi } from '../../umumiy/ui/XatoChegarasi';
import { t } from '../../i18n/til';
import { MARKAZ_MANBA, markazXulosa, narxOgish } from '../../lib/narx-korinish';
import { ManbaChip, OgishMeter, QamrovChizigi } from '../../components/narx/NarxKorinish';

// Katalog importi (xlsx/pdf tahlili, ~475 KB) — lazy: Narxlar sahifasi usiz tez ochiladi.
const KatalogManbaImport = lazy(() => import('./KatalogManbaImport'));

type NarxRegistr = {
  id: number;
  nom_key: string;
  birlik_key: string;
  versiya: number;
  narx: number;
};

type NarxQidiruvQator = NarxQidiruvResurs & { obyekt_id: number; hajm: number | null };

const ERKIN_KAT = ['МАТ', 'ОБ', 'М/К', 'КАБ'];

function kalit(nomKey: string, birlikKey: string) {
  return `${nomKey}|${birlikKey}`;
}

function birlikdanQulfKat(birlik: string | null | undefined) {
  const u = String(birlik || '').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (['ЧЕЛЧ', 'ЧЕЛСОАТ', 'CHELCH', 'CHELSOAT'].includes(u)) return 'ЧЕЛ';
  if (['МАШЧ', 'МАШСОАТ', 'MASHCH', 'MASHSOAT'].includes(u)) return 'МАШ';
  return null;
}

function xatoXabari(x: unknown) {
  return x instanceof Error ? x.message : 'Narx saqlanmadi';
}

export default function NarxlarNative() {
  const { joriy, yuklanmoqda: kompaniyaYuklanmoqda } = useKompaniya();
  const workspace = usePTOWorkspace();
  const kompaniyaId = joriy?.id ?? null;
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [obyektId, setObyektId] = useState<number | null>(null);
  const [markaz, setMarkaz] = useState<NarxMarkaz[]>([]);
  const [topilmaganlar, setTopilmaganlar] = useState<Topilmagan[]>([]);
  const [manbalar, setManbalar] = useState<NarxManba[]>([]);
  const [manbaQatorlar, setManbaQatorlar] = useState<NarxManbaQidiruvQatori[]>([]);
  const [dalillar, setDalillar] = useState<NarxDalilHolat[]>([]);
  const [qidiruvQatorlar, setQidiruvQatorlar] = useState<NarxQidiruvQator[]>([]);
  const [registr, setRegistr] = useState<Record<string, NarxRegistr>>({});
  const [qidiruv, setQidiruv] = useState('');
  const [faqatXavf, setFaqatXavf] = useState(false);
  const [tanlangan, setTanlangan] = useState<NarxMarkaz | Topilmagan | null>(null);
  const [narxKiritma, setNarxKiritma] = useState('');
  const [kat, setKat] = useState('');
  const [sana, setSana] = useState(() => new Date().toISOString().slice(0, 10));
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xato, setXato] = useState('');
  const [xabar, setXabar] = useState('');

  const yukla = useCallback(async () => {
    if (!kompaniyaId) {
      setObyektlar([]); setObyektId(null); setMarkaz([]); setTopilmaganlar([]); setRegistr({});
      return;
    }
    setYuklanmoqda(true); setXato('');
    try {
      const [m, r, o] = await Promise.all([
        sbT2NarxMarkazOl(kompaniyaId),
        sbOqi<NarxRegistr>({
          jadval: 't2_narx',
          ustunlar: 'id,nom_key,birlik_key,versiya,narx',
          filtr: `kompaniya_id=eq.${kompaniyaId}&obyekt_id=is.null`,
          tartib: 'nom_key.asc', limit: 20000,
        }),
        sbT2ObyektlarOlKomp(kompaniyaId),
      ]);
      if (!m.ok) throw new Error(m.error || 'Narxlar markazi o‘qilmadi');
      if (!r.ok) throw new Error(r.error || 'Narx registri o‘qilmadi');
      if (!o.ok) throw new Error(o.error || 'Obyektlar o‘qilmadi');
      setMarkaz((m.qatorlar as NarxMarkaz[]) || []);
      const byKey: Record<string, NarxRegistr> = {};
      for (const row of (r.qatorlar as NarxRegistr[]) || []) byKey[kalit(row.nom_key, row.birlik_key)] = row;
      setRegistr(byKey);
      const obyektlarYangi = (o.qatorlar as T2Obyekt[]) || [];
      setObyektlar(obyektlarYangi);
      setObyektId(oldingi => workspace.scope.objectId ?? oldingi ?? obyektlarYangi[0]?.id ?? null);
    } catch (e) {
      setXato(xatoXabari(e));
    } finally {
      setYuklanmoqda(false);
    }
  }, [kompaniyaId, workspace.scope.objectId]);

  const topilmaganlarniYukla = useCallback(async () => {
    if (!obyektId || !kompaniyaId) {
      setTopilmaganlar([]); setManbalar([]); setManbaQatorlar([]); setDalillar([]); setQidiruvQatorlar([]); return;
    }
    const [r, q, m, d, manba] = await Promise.all([
      sbT2TopilmaganlarOl(obyektId),
      sbOqi<NarxQidiruvQator>({
        jadval: 't2_qator',
        ustunlar: 'id,obyekt_id,tur,kod,nom,birlik,narx,kat,hajm',
        filtr: `obyekt_id=eq.${obyektId}&tur=in.(rs,mat,ob)`,
        tartib: 'id.asc', limit: 50000,
      }),
      sbNarxManbalarOl(kompaniyaId),
      sbNarxDalillarOl(kompaniyaId, obyektId),
      sbNarxManbaQidiruvQatorlariOl(kompaniyaId),
    ]);
    if (!r.ok) { setXato(r.error || 'Bog‘lanish topilmagan resurslar o‘qilmadi'); return; }
    if (!q.ok) { setXato(q.error || 'Smeta qatorlari o‘qilmadi'); return; }
    if (!m.ok) { setXato(m.error || 'Narx manbalari o‘qilmadi'); return; }
    if (!d.ok) { setXato(d.error || 'Narx dalillari o‘qilmadi'); return; }
    if (!manba.ok) { setXato(manba.error || 'Narx manbasi qatorlari o‘qilmadi'); return; }
    setTopilmaganlar((r.qatorlar as Topilmagan[]) || []);
    setQidiruvQatorlar((q.qatorlar as NarxQidiruvQator[]) || []);
    setManbalar((m.qatorlar as NarxManba[]) || []);
    setDalillar((d.qatorlar as NarxDalilHolat[]) || []);
    setManbaQatorlar((manba.qatorlar as NarxManbaQidiruvQatori[]) || []);
  }, [obyektId, kompaniyaId]);

  useEffect(() => { if (!kompaniyaYuklanmoqda) void yukla(); }, [kompaniyaYuklanmoqda, yukla]);
  useEffect(() => { void topilmaganlarniYukla(); }, [topilmaganlarniYukla]);

  const tanlanganKalit = tanlangan && 'nom_key' in tanlangan
    ? kalit(tanlangan.nom_key, tanlangan.birlik_key) : null;
  const tanlanganRegistr = tanlanganKalit ? registr[tanlanganKalit] : undefined;
  const tanlanganBirlik = tanlangan?.birlik ?? null;
  const qulfKat = birlikdanQulfKat(tanlanganBirlik);

  useEffect(() => {
    if (!tanlangan) { setNarxKiritma(''); setKat(''); return; }
    setNarxKiritma(tanlanganRegistr ? String(tanlanganRegistr.narx) : '');
    setKat(qulfKat || ('kat' in tanlangan ? (tanlangan.kat || '') : ''));
  }, [tanlangan, tanlanganRegistr, qulfKat]);

  const markazSatrlar = useMemo(() => {
    const q = qidiruv.trim().toLocaleLowerCase();
    return markaz.filter(r => {
      if (faqatXavf && !r.xavf) return false;
      return !q || `${r.nom || ''} ${r.birlik || ''}`.toLocaleLowerCase().includes(q);
    });
  }, [markaz, qidiruv, faqatXavf]);
  const topilmaganSatrlar = useMemo(() => {
    const q = qidiruv.trim().toLocaleLowerCase();
    return topilmaganlar.filter(r => !q || `${r.nom || ''} ${r.birlik || ''}`.toLocaleLowerCase().includes(q));
  }, [topilmaganlar, qidiruv]);

  const manbaById = useMemo(() => new Map(manbalar.map(m => [m.id, m])), [manbalar]);
  const sourceRows = useMemo(() => manbaQatorlar.map(r => ({
    ...r, manbaTur: manbaById.get(r.manba_id)?.tur,
  })), [manbaQatorlar, manbaById]);
  const semantikNomzodlar = useMemo(
    () => narxSemantikNomzodlari(qidiruvQatorlar.filter(q => q.narx == null), sourceRows),
    [qidiruvQatorlar, sourceRows],
  );
  const takliflarByKey = useMemo(() => {
    const groups = new Map<string, { qatorIds: number[]; nomzodlar: NarxSemantikNomzod[] }>();
    for (const q of qidiruvQatorlar) {
      const key = `${nomKalit(q.nom)}|${birlikKalit(q.birlik)}`;
      const group = groups.get(key) ?? { qatorIds: [], nomzodlar: [] };
      if (!group.qatorIds.includes(q.id)) group.qatorIds.push(q.id);
      groups.set(key, group);
    }
    for (const candidate of semantikNomzodlar) {
      const group = groups.get(candidate.resursKalit);
      if (!group) continue;
      const old = group.nomzodlar.findIndex(x => x.manba_qator_id === candidate.manba_qator_id);
      if (old < 0) group.nomzodlar.push(candidate);
      else if (candidate.moslikFoiz > group.nomzodlar[old].moslikFoiz) group.nomzodlar[old] = candidate;
    }
    for (const group of groups.values()) group.nomzodlar.sort((a, b) => b.moslikFoiz - a.moslikFoiz || a.manba_narx - b.manba_narx);
    return groups;
  }, [qidiruvQatorlar, semantikNomzodlar]);
  const dalilQatorIds = useMemo(() => new Set(dalillar.map(d => d.qator_id)), [dalillar]);

  async function dalilniBoglash(qatorIds: number[], candidate: NarxSemantikNomzod) {
    if (!kompaniyaId || !obyektId || !qatorIds.length) return;
    setSaqlanmoqda(true); setXato(''); setXabar('');
    try {
      const r = await sbNarxDalilBogla(kompaniyaId, obyektId, qatorIds.map(qator_id => ({
        qator_id,
        manba_qator_id: candidate.manba_qator_id,
        izoh: `Deterministik taklif: ${candidate.moslikFoiz}% moslik; smeta narxi o‘zgartirilmaydi.`,
      })));
      if (!r.ok) throw new Error(r.error || r.sabab || 'Narx dalili bog‘lanmadi');
      setXabar(`${qatorIds.length} ta qatorga katalog dalili bog‘landi. Smeta narxi o‘zgarmadi; farq faqat taqqoslash uchun ko‘rsatiladi.`);
      await topilmaganlarniYukla();
    } catch (e) {
      setXato(xatoXabari(e));
    } finally {
      setSaqlanmoqda(false);
    }
  }

  async function narxniSaqlash() {
    if (!tanlangan || !tanlanganKalit) return;
    const narx = Number(narxKiritma.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(narx) || narx <= 0) {
      setXato('Narx musbat son bo‘lishi kerak. Noma’lum qiymat 0 bilan almashtirilmaydi.');
      return;
    }
    setSaqlanmoqda(true); setXato(''); setXabar('');
    try {
      const r = await sbT2NarxBelgila({
        nom: tanlangan.nom || '', birlik: tanlangan.birlik || undefined, narx,
        kat: qulfKat || kat || undefined, kutilganVersiya: tanlanganRegistr?.versiya,
      });
      if (!r.ok) throw new Error(r.sabab === 'STALE_VERSION'
        ? 'Narx boshqa foydalanuvchi tomonidan yangilangan. Sahifani yangilang.'
        : r.error || r.sabab || 'Narx saqlanmadi');
      setXabar('Narx registrga saqlandi. Smetadagi qatordagi narx avtomatik o‘zgarmaydi.');
      setTanlangan(null);
      await yukla(); await topilmaganlarniYukla();
    } catch (e) {
      setXato(xatoXabari(e));
    } finally {
      setSaqlanmoqda(false);
    }
  }

  async function sanaNarxiniQoshish() {
    if (!tanlangan) return;
    const narx = Number(narxKiritma.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(narx) || narx <= 0) {
      setXato('Sana narxi musbat son bo‘lishi kerak.'); return;
    }
    setSaqlanmoqda(true); setXato(''); setXabar('');
    try {
      const r = await sbT2NarxSanaQosh({
        sana,
        qatorlar: [{ nom: tanlangan.nom || '', birlik: tanlangan.birlik || undefined, narx }],
        manba: 'Narxlar markazi',
      });
      if (!r.ok || r.kafolat !== true || r.kirgan !== (r.yozildi || 0) + (r.tashlandi || 0)) {
        throw new Error(r.error || r.sabab || 'Sana narxi hisob kafolati bilan saqlanmadi');
      }
      setXabar('Sana narxi saqlandi. U bazadagi narx manbalari bilan alohida ko‘rinadi.');
      await yukla();
    } catch (e) {
      setXato(xatoXabari(e));
    } finally {
      setSaqlanmoqda(false);
    }
  }

  const xulosa = useMemo(() => markazXulosa(markaz), [markaz]);
  const manbaKalit = (r: NarxMarkaz) => (r.natija == null || r.manba == null ? 'yoq' : r.manba);

  if (kompaniyaYuklanmoqda) return <div className="p-6 text-sm text-text-mute">{t('Kompaniya konteksti yuklanmoqda…')}</div>;
  if (!kompaniyaId) return <div className="fz-note fz-note--warn m-6">{t('Narxlarni ko‘rish uchun faol kompaniya tanlanmagan.')}</div>;

  const xavfTugma = faqatXavf ? t('Xavf filtri: yoqilgan') : t('Faqat xavflilar');
  return (
    <Sahifa
      sarlavha="Narxlar markazi"
      tavsif="Narx manbasi va uning hisobga olinishi aniq ko‘rinadi"
      amallar={<button onClick={() => void yukla()} disabled={yuklanmoqda} className="fz-btn fz-btn--ghost">
        <RefreshCw size={15} className={yuklanmoqda ? 'animate-spin' : ''} /> {t('Yangilash')}
      </button>}
    >
      <div className="flex flex-col gap-3">
        <section className="fz-panel" aria-label={t('Narx qayerdan olinadi')} data-testid="markaz-xulosa">
          <div className="fz-panel__h"><span>{t('Narx qayerdan olinadi (ustunlik: belgilangan → sana → smeta, eng kattasi)')}</span><span>{xulosa.jami > 0 ? t('{n} resurs', { n: xulosa.jami.toLocaleString('ru-RU') }) : t('hisoblanmadi — obyekt tanlang yoki resurslar yuklanmoqda')}</span></div>
          {xulosa.jami === 0 ? <p className="text-[12px] text-text-mute" data-testid="markaz-bosh">{t('Narx ko‘rsatkichi 0 emas, balki hisoblanmagan: obyekt tanlanmagan yoki resurs ro‘yxati bo‘sh.')}</p> : null}
          {xulosa.jami > 0 && <QamrovChizigi aria={t('Narx qayerdan olinadi')} bolaklar={xulosa.bolaklar}
            nomlar={Object.fromEntries(Object.entries(MARKAZ_MANBA).map(([k, v]) => [k, t(v.matn)]))}
            ranglar={Object.fromEntries(Object.entries(MARKAZ_MANBA).map(([k, v]) => [k, v.rang]))} />}
          {xulosa.xavf > 0 && <button type="button" onClick={() => setFaqatXavf((v) => !v)} className="fz-chip fz-chip--warn self-start">
            <ShieldAlert size={12} aria-hidden="true" />{t('{n} ta resurs obyektlararo 5% dan ortiq farq bilan narxlangan', { n: String(xulosa.xavf) })}</button>}
        </section>
        <PanelXatoChegarasi nom="katalog-import"><Suspense fallback={<div className="fz-card min-h-[120px] p-4" aria-busy="true"><div className="skel h-4 w-48" /></div>}><KatalogManbaImport /></Suspense></PanelXatoChegarasi>
        <PanelXatoChegarasi nom="bozor-narx"><MarketPriceComparison objectId={obyektId} companyId={kompaniyaId} /></PanelXatoChegarasi>
        <div className="fz-card fz-card__body flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1 text-[12px] font-medium text-text-dim">{t('Obyekt')}
            <select value={obyektId ?? ''} onChange={e => { const id = Number(e.target.value); setObyektId(Number.isSafeInteger(id) && id > 0 ? id : null); workspace.setObjectId(Number.isSafeInteger(id) && id > 0 ? id : null); }}
              className="mt-1.5 h-9 w-full px-3 text-[13px] text-text">
              {!obyektlar.length && <option value="">{t('— obyekt yo‘q —')}</option>}
              <ObyektOptionlari obyektlar={obyektlar} />
            </select>
          </label>
          <label className="min-w-[220px] flex-1 text-[12px] font-medium text-text-dim">{t('Qidiruv')}
            <span className="relative mt-1.5 block"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute" />
              <input value={qidiruv} onChange={e => setQidiruv(e.target.value)} placeholder={t('nom yoki birlik…')}
                className="h-9 w-full pl-8 pr-3 text-[13px] text-text" />
            </span>
          </label>
          <button onClick={() => setFaqatXavf(v => !v)} aria-pressed={faqatXavf} className={`fz-btn ${faqatXavf ? 'border-warn text-warn' : ''}`}>{xavfTugma}</button>
        </div>

        {xato && <div className="fz-note fz-note--danger" role="alert"><AlertTriangle aria-hidden="true" /><span>{xato}</span></div>}
        {xabar && <div className="fz-note border-ok/40 bg-[var(--ok-soft)]" role="status"><CheckCircle2 className="text-ok" aria-hidden="true" /><span>{xabar}</span></div>}

        <section className="fz-card">
          <div className="fz-card__head">
            <div>
              <h2 className="fz-card__title flex items-center gap-2"><AlertTriangle size={15} className={topilmaganSatrlar.length ? 'text-warn' : 'text-ok'} aria-hidden="true" />
                {t('Bog‘lanish topilmagan resurslar ({n})', { n: String(topilmaganSatrlar.length) })}</h2>
              <p className="fz-card__sub">{t('Har bir qator uchun katalogdan birlik va mazmun bo‘yicha taklif qidiriladi. Taklif narxi smeta narxidan alohida ko‘rsatiladi; u smetaga avtomatik yozilmaydi.')}</p>
            </div>
          </div>
          <div className="max-h-[420px] divide-y divide-border overflow-auto">
            {topilmaganSatrlar.map(r => {
              const key = `${nomKalit(r.nom)}|${birlikKalit(r.birlik)}`;
              const group = takliflarByKey.get(key);
              const dalilBoglangan = !!group?.qatorIds.some(id => dalilQatorIds.has(id));
              return <div key={`${r.obyekt_id}|${r.nom_key}|${r.birlik_key}`} className="px-4 py-2.5 text-[12.5px]">
                <div className="flex items-center gap-3">
                  <button onClick={() => setTanlangan(r)} className="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-sm)] px-1 py-0.5 text-left hover:bg-surface-3">
                    <span className="truncate font-medium text-text">{r.nom || '—'}</span><span className="fz-c-unit w-16 shrink-0 text-text-mute">{r.birlik || '—'}</span>
                    <span className="w-20 shrink-0 text-right tabular-nums text-text-dim">{t('{n} qator', { n: String(r.qator_soni) })}</span>
                    <span className="fz-chip fz-chip--accent shrink-0">{t('Qo‘lda narxlash')}</span>
                  </button>
                  {dalilBoglangan ? <span className="fz-stamp fz-stamp--ok shrink-0">{t('Dalil bog‘langan')}</span> : <span className="fz-stamp fz-stamp--draft shrink-0">{t('Narxsiz')}</span>}
                </div>
                {group?.nomzodlar.slice(0, 3).map(candidate => {
                  const manba = manbaById.get(candidate.manba_id);
                  return <div key={`${key}|${candidate.manba_qator_id}`} className="ml-3 mt-2 grid gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-2 p-2.5 md:grid-cols-[minmax(0,1fr)_150px_170px_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">{manba && <ManbaChip tur={manba.tur} />}<span className="truncate text-text">{manba?.nom || t('Manba #{n}', { n: String(candidate.manba_id) })}</span></div>
                      <div className="mt-0.5 text-[11.5px] text-text-mute">{candidate.sabablar.join(' · ')}</div>
                    </div>
                    <span className="flex flex-col gap-0.5 text-[11px] text-text-mute">{t('Moslik')}
                      <span className="fz-meter" style={{ minWidth: 0 }}><span className="fz-meter__t"><i className="fz-meter__shu" style={{ width: `${Math.max(0, Math.min(100, candidate.moslikFoiz))}%` }} /></span><span className="fz-meter__f">{candidate.moslikFoiz}%</span></span>
                    </span>
                    <span className="flex flex-col gap-0.5 text-[11px] text-text-mute">
                      <span>{t('Taklif')}: <b className="tabular-nums text-text">{candidate.manba_narx.toLocaleString('ru-RU')}</b> · {t('smeta')}: <b className="tabular-nums text-text-dim">{candidate.smeta_narx == null ? '—' : candidate.smeta_narx.toLocaleString('ru-RU')}</b></span>
                      <OgishMeter og={narxOgish(candidate.manba_narx, candidate.smeta_narx)} />
                    </span>
                    <button onClick={() => void dalilniBoglash(group.qatorIds, candidate)} disabled={saqlanmoqda} className="fz-btn fz-btn--primary fz-btn--sm">{t('Dalilni bog‘lash')}</button>
                  </div>;
                })}
                {!group?.nomzodlar.length && <div className="ml-3 mt-1.5"><span className="fz-chip fz-chip--warn">{t('Katalogdan birlik va mazmun bo‘yicha ishonchli taklif topilmadi — qo‘lda tanlash kerak.')}</span></div>}
              </div>;
            })}
            {!topilmaganSatrlar.length && <p className="py-5 text-center text-[12.5px] text-ok">{t('Tanlangan obyekt uchun narxi topilmagan resurs yo‘q.')}</p>}
          </div>
        </section>

        <section className="fz-card">
          <div className="fz-card__head"><h2 className="fz-card__title flex items-center gap-2"><Tags size={15} className="text-accent" aria-hidden="true" />{t('Narx registri ({n})', { n: String(markazSatrlar.length) })}</h2></div>
          <div className="max-h-[520px] overflow-auto"><table className="fz-table text-[12.5px]">
            <thead><tr>
              <th>{t('Resurs')}</th><th>{t('Birlik')}</th><th>{t('Kat.')}</th><th className="fz-c-num">{t('Smeta max')}</th><th className="fz-c-num">{t('Belgilangan')}</th><th className="fz-c-num">{t('Sana max')}</th><th className="fz-c-num">{t('Natija')}</th><th>{t('Manba')}</th>
            </tr></thead>
            <tbody>{markazSatrlar.map(r => { const mk = MARKAZ_MANBA[manbaKalit(r)]; return <tr key={kalit(r.nom_key, r.birlik_key)} onClick={() => setTanlangan(r)} className="cursor-pointer">
              <td className="max-w-[360px]"><div className="truncate text-text">{r.nom || '—'}</div>{r.xavf && <span className="fz-stamp fz-stamp--warn mt-0.5" title={r.farq_koef != null ? t('Obyektlar orasida {k} barobar farq', { k: r.farq_koef.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) }) : undefined}>{t('Farq >5%')}{r.farq_koef != null ? ` ×${r.farq_koef.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}` : ''}</span>}</td>
              <td className="fz-c-unit">{r.birlik || '—'}</td><td className="text-text-mute">{r.kat || '—'}</td>
              <td className={`fz-c-num ${r.manba === 'smeta' ? 'font-semibold text-text' : 'text-text-dim'}`}><FmtN val={r.smeta_max} /></td>
              <td className={`fz-c-num ${r.manba === 'belgilangan' ? 'font-semibold text-text' : 'text-text-dim'}`}><FmtN val={r.belgilangan_narx} /></td>
              <td className={`fz-c-num ${r.manba === 'sana' ? 'font-semibold text-text' : 'text-text-dim'}`}><FmtN val={r.sana_max_narx} /></td>
              <td className="fz-c-num font-semibold text-text">{r.natija == null ? '—' : <FmtN val={r.natija} />}</td>
              <td><span className={`fz-chip ${mk.cls}`}>{t(mk.matn)}</span></td>
            </tr>; })}</tbody>
          </table></div>
        </section>

        {tanlangan && <section className="fz-card border-accent/40">
          <div className="fz-card__head"><div><h2 className="fz-card__title">{tanlangan.nom || t('Nomsiz resurs')}</h2><p className="fz-card__sub">{tanlangan.birlik || t('Birlik ko‘rsatilmagan')} · {qulfKat || ('kat' in tanlangan ? tanlangan.kat || t('kategoriya yo‘q') : t('kategoriya yo‘q'))}</p></div><button onClick={() => setTanlangan(null)} className="fz-btn fz-btn--ghost fz-btn--sm">{t('Yopish')}</button></div>
          <div className="fz-card__body">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-[12px] text-text-dim">{t('Narx')}<MoneyInput  min="0.000001" value={narxKiritma} onValueChange={(moneyValue) => setNarxKiritma(moneyValue)} className="mt-1 block w-full input" /></label>
            <label className="text-[12px] text-text-dim">{t('Kategoriya')}
              {qulfKat ? <span className="mt-1 block h-9 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2 text-text-mute">{t('{k} · birlikdan qulflangan', { k: qulfKat })}</span> : <select value={kat} onChange={e => setKat(e.target.value)} className="mt-1 w-full input"><option value="">{t('— o‘zgartirmaslik —')}</option>{ERKIN_KAT.map(x => <option key={x} value={x}>{x}</option>)}</select>}
            </label>
            <label className="text-[12px] text-text-dim">{t('Sana narxi uchun sana')}<input type="date" value={sana} onChange={e => setSana(e.target.value)} className="mt-1 block w-full input" /></label>
          </div>
          {tanlanganRegistr && <p className="mt-2 text-xs text-text-mute">{t('Saqlash paytida mavjud narx qayta tekshiriladi.')}</p>}
          <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void narxniSaqlash()} disabled={saqlanmoqda} className="fz-btn fz-btn--primary"><Save size={14} />{t('Belgilangan narxni saqlash')}</button><button onClick={() => void sanaNarxiniQoshish()} disabled={saqlanmoqda} className="fz-btn">{t('Sana narxini qo‘shish')}</button></div>
          </div>
        </section>}
      </div>
    </Sahifa>
  );
}
