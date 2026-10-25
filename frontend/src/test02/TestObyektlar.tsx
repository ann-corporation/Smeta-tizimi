import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, MapPin, Plus, FolderKanban, FolderPlus, Building2 } from 'lucide-react';
import { ModalOyna } from '../components/pto-workspace/ModalOyna';
import { tasdiqSora } from '../umumiy/ui/Tasdiq';
import { ProjectNavigator } from '../components/pto-workspace/ProjectNavigator';
import { t } from '../i18n/til';
import { Sahifa, BoshHolat } from '../umumiy/ui/Sahifa';
import { sbT2ObyektlarOlKomp, sbObyektOchirish, sbObyektTahrirlash, sbObyektLokatsiyaBelgila, sbT2ObyektYarat, type T2Obyekt } from '../api/supabase';
import { sbT2LoyihalarOl, type T2Loyiha } from '../api/t2-loyiha';
import { toast } from '../umumiy/ui/Toast';
import { useKompaniya } from './KompaniyaTanlov';
import { usePTOWorkspace } from '../umumiy/kontekst/PTOWorkspaceContext';
import { ObyektUlash } from '../components/ulash/ObyektUlash';

const ObjectLocationMap = lazy(() => import('../components/pto-workspace/ObjectLocationMap'));
const ObyektlarXaritasi = lazy(() => import('../components/pto-workspace/ObyektlarXaritasi'));

type Qator = T2Obyekt;

export default function TestObyektlar() {
  const navigate = useNavigate();
  const { joriy } = useKompaniya();
  const kompYuklanmoqda = joriy === undefined;
  const qc = useQueryClient();
  const workspace = usePTOWorkspace();

  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [qatorlar, setQatorlar] = useState<Qator[] | null>(null);
  const [xato, setXato] = useState('');
  const generation = useRef(0);
  const [loadedCompany, setLoadedCompany] = useState<number | null>(null);
  const currentRows = loadedCompany === joriy?.id ? qatorlar : null;

  // Edit State
  const [editObj, setEditObj] = useState<Qator | null>(null);
  const [ulashObj, setUlashObj] = useState<Qator | null>(null);
  const [nomi, setNomi] = useState('');
  const [tur, setTur] = useState('');
  const [position, setPosition] = useState<[number, number] | null>(null);

  // T2-PTO-OWNER-CRITICAL-CLOSURE P0-1: production obyekt yaratish.
  const [loyihalar, setLoyihalar] = useState<T2Loyiha[]>([]);
  const [yaratishOchiq, setYaratishOchiq] = useState(false);
  const [yangiNom, setYangiNom] = useState('');
  const [yangiLoyihaId, setYangiLoyihaId] = useState('');
  const [yaratilmoqda, setYaratilmoqda] = useState(false);
  const [yangiJoy, setYangiJoy] = useState<[number, number] | null>(null);
  const [yangiJoyOchiq, setYangiJoyOchiq] = useState(false);
  const [xaritaKorinadi, setXaritaKorinadi] = useState(false);

  useEffect(() => {
    if (!joriy?.id) { setLoyihalar([]); return; }
    let active = true;
    void sbT2LoyihalarOl(joriy.id).then(r => { if (active && r.ok) setLoyihalar(r.qatorlar || []); });
    return () => { active = false; };
  }, [joriy?.id]);

  const obyektYarat = async () => {
    if (!joriy?.id || !yangiNom.trim()) return;
    setYaratilmoqda(true);
    try {
      const r = await sbT2ObyektYarat({ kompaniyaId: joriy.id, loyihaId: yangiLoyihaId ? Number(yangiLoyihaId) : null, nom: yangiNom.trim() });
      if (!r.ok) { toast(r.xato || r.error || r.code || 'Obyekt yaratilmadi', 'danger'); return; }
      let joyXabari = '';
      if (yangiJoy && r.obyekt_id) {
        /* Yaratish RPC'si lat/lng olmaydi: yangi qatorning versiyasini o'qib, lokatsiyani alohida yozamiz. */
        try {
          const yangilar = await sbT2ObyektlarOlKomp(joriy.id);
          const q = (yangilar.qatorlar as Qator[] | undefined)?.find((x) => x.id === r.obyekt_id);
          const lr = await sbObyektLokatsiyaBelgila(r.obyekt_id, yangiJoy[0], yangiJoy[1], q?.versiya || 1);
          if (!lr?.ok) joyXabari = ' ' + t('Lokatsiya saqlanmadi - tahrirlashda qayta belgilang.');
        } catch { joyXabari = ' ' + t('Lokatsiya saqlanmadi - tahrirlashda qayta belgilang.'); }
      }
      toast('Obyekt yaratildi.' + joyXabari, joyXabari ? 'danger' : 'ok');
      setYaratishOchiq(false); setYangiNom(''); setYangiLoyihaId(''); setYangiJoy(null); setYangiJoyOchiq(false);
      sinxronla();
    } catch (e: any) {
      toast('Xatolik: ' + (e?.message || e), 'danger');
    } finally { setYaratilmoqda(false); }
  };

  const handleOchirish = async (e: any, o: Qator) => {
    e.stopPropagation();
    if (!(await tasdiqSora({ sarlavha: t('Obyektni arxivlash'), matn: t('"{nom}" obyektini arxivga (korzinka) o‘tkazasizmi?', { nom: o.nom }), tasdiqMatni: t('Arxivga o‘tkazish'), xavfli: true }))) return;
    try {
      setYuklanmoqda(true);
      await sbObyektOchirish(o.id, o.nom);
      toast("Obyekt Korzinkaga o'tkazildi", 'ok');
      sinxronla();
    } catch(err: any) {
      toast('Xatolik: ' + err.message, 'danger');
      setYuklanmoqda(false);
    }
  };

  const handleTahrir = (e: any, o: Qator) => {
    e.stopPropagation();
    setEditObj(o);
    setNomi(o.nom);
    setTur(o.tur || '');
    if (o.lat != null && o.lng != null) {
      setPosition([o.lat, o.lng]);
    } else {
      setPosition(null);
    }
  };

  const saqlashTahrir = async () => {
    if(!editObj) return;
    try {
      setYuklanmoqda(true);
      
      const nomTurOzgardi = nomi !== editObj.nom || tur !== (editObj.tur || '');
      const joyOzgardi = !!position && (editObj.lat == null || editObj.lng == null
        || Math.abs(Number(editObj.lat) - position[0]) > 1e-7 || Math.abs(Number(editObj.lng) - position[1]) > 1e-7);
      let versiya = editObj.versiya || 0;

      // Agar nom yoki tur o'zgargan bo'lsa
      if (nomTurOzgardi) {
        const r1 = await sbObyektTahrirlash(editObj.id, nomi, tur);
        if (r1 && r1.ok === false) throw new Error(r1.error || r1.xato || 'Nom/tur saqlanmadi');
        /* Birinchi yozuv versiyani oshiradi - lokatsiya uchun yangisini o'qiymiz. */
        if (joyOzgardi && joriy?.id) {
          const yangilar = await sbT2ObyektlarOlKomp(joriy.id);
          const q = (yangilar.qatorlar as Qator[] | undefined)?.find((x) => x.id === editObj.id);
          if (q?.versiya != null) versiya = q.versiya;
        }
      }

      // Agar lokatsiya o'zgargan bo'lsa (faqat o'zgargandagina yoziladi)
      if (joyOzgardi && position) {
        const r2 = await sbObyektLokatsiyaBelgila(editObj.id, position[0], position[1], versiya);
        if (r2 && r2.ok === false) throw new Error(r2.error || r2.xato || 'Lokatsiya saqlanmadi');
      }

      toast('Obyekt tahrirlandi', 'ok');
      setEditObj(null);
      sinxronla();
    } catch(err: any) {
      toast('Xatolik: ' + err.message, 'danger');
      setYuklanmoqda(false);
    }
  };

  const yukla = useCallback(async () => {
    if (kompYuklanmoqda) return;
    const request = ++generation.current;
    if (!joriy?.id) { setQatorlar([]); setLoadedCompany(null); return; }
    setYuklanmoqda(true); setXato('');
    try {
      const r = await sbT2ObyektlarOlKomp(joriy.id);
      if (request !== generation.current) return;
      setLoadedCompany(joriy.id);
      if (!r.ok) { setXato(r.error || t('Obyektlar o‘qilmadi')); setQatorlar(null); }
      else setQatorlar((r.qatorlar as Qator[]) || []);
    } catch (e) { if (request === generation.current) setXato(e instanceof Error ? e.message : t('Obyektlar o‘qilmadi')); }
    finally { if (request === generation.current) setYuklanmoqda(false); }
  }, [kompYuklanmoqda, joriy?.id]);
  const invalidateLoad = useCallback(() => { ++generation.current; }, []);
  useEffect(() => {
    invalidateLoad(); setEditObj(null); setYaratishOchiq(false); setQatorlar(null);
    void yukla();
    return invalidateLoad;
  }, [yukla, invalidateLoad]);

  /* Obyekt yaratish/o'chirish/tahrirlashdan keyin FAQAT shu sahifaning
   * lokal ro'yxatini emas, tizimdagi BARCHA obyekt keshini yangilash kerak.
   * Aks holda egasi ko'rgan xato takrorlanadi: obyekt bazada o'chgan
   * (holat='bekor'), lekin yon panel / PTO scope tanlagichi eski keshdan
   * (`useObyektlar` staleTime = 10 daq) uni hali ko'rsatib turadi; yangi
   * yaratilgan obyekt esa o'sha joylarda paydo bo'lmaydi. Uch mustaqil
   * kesh bor — React Query (`['obyektlar']`), bu sahifa (`yukla`) va PTO
   * workspace (`refresh`) — uchalasini ham qo'zg'atamiz. */
  const sinxronla = async () => {
    await yukla();
    qc.invalidateQueries({ queryKey: ['obyektlar'] });
    qc.invalidateQueries({ queryKey: ['pto-company-lineage', joriy?.id] });
    qc.invalidateQueries({ queryKey: ['pto-markup', joriy?.id] });
    qc.invalidateQueries({ queryKey: ['pto-markup-podvals', joriy?.id] });
    workspace.refresh();
  };

  return (
    <Sahifa
      sarlavha="Loyihalar va obyektlar"
      tavsif="Loyiha → shartnoma → obyekt → smeta va bajarilgan ishlar"
      onYangila={() => void sinxronla()}
      yangilanmoqda={yuklanmoqda}
      amallar={
        <>
          <button type="button" onClick={() => setXaritaKorinadi((v) => !v)} aria-pressed={xaritaKorinadi} className="fz-btn"
            style={xaritaKorinadi ? { borderColor: 'var(--accent)', color: 'var(--accent-text)', background: 'var(--accent-soft)' } : undefined}>
            <MapPin aria-hidden="true" />
            {t('Xaritada')}
          </button>
          <button type="button" onClick={() => setYaratishOchiq(true)} className="fz-btn fz-btn--primary">
            <Plus aria-hidden="true" />
            {t('Yangi obyekt')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {xaritaKorinadi && currentRows && (
          <div className="fz-card p-3">
            <Suspense fallback={<div className="skel h-[360px] rounded-xl" />}>
              <ObyektlarXaritasi obyektlar={currentRows}
                loyihaNomi={(id) => loyihalar.find((l) => l.id === id)?.nom}
                onOpen={(o) => { workspace.setObjectId(o.id); navigate(`/admin/holat/${o.id}`); }}
                onBelgila={(o) => { const q = currentRows.find((x) => x.id === o.id); if (q) handleTahrir({ stopPropagation() {} }, q); }} />
            </Suspense>
          </div>
        )}
        {yaratishOchiq && (
          <ModalOyna sarlavha="Yangi obyekt" ikon={<FolderKanban className="text-accent" size={18} aria-hidden="true" />}
            yop={() => { setYaratishOchiq(false); setYangiNom(''); setYangiLoyihaId(''); setYangiJoy(null); setYangiJoyOchiq(false); }}>
            <label className="mb-3 block text-sm">
              <span className="text-[12px] text-text-dim">{t('Nomi')}</span>
              <input value={yangiNom} onChange={e => setYangiNom(e.target.value)} autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && yangiNom.trim() && !yaratilmoqda) void obyektYarat(); }}
                className="mt-1 h-9 w-full rounded-md border border-[var(--border-strong)] bg-bg px-3 text-sm text-text"
                placeholder={t('Masalan: Amfiteatr, blok A')} />
            </label>
            <label className="mb-4 block text-sm">
              <span className="text-[12px] text-text-dim">{t('Loyiha (ixtiyoriy)')}</span>
              <select value={yangiLoyihaId} onChange={e => setYangiLoyihaId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-[var(--border-strong)] bg-bg px-2 text-sm text-text">
                <option value="">{t('— Loyihasiz —')}</option>
                {loyihalar.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
              </select>
              {!loyihalar.length && (
                <span className="mt-1 block text-[11px] text-text-mute">
                  {t('Hali loyiha yo‘q.')} <a href="/admin/loyiha" className="text-[var(--accent-text)] underline">{t('Loyiha yaratish')}</a>
                </span>
              )}
            </label>
            <div className="mb-4">
              <button type="button" onClick={() => setYangiJoyOchiq((v) => !v)}
                className="inline-flex items-center gap-1 text-[12px] text-[var(--accent-text)] underline">
                <MapPin size={13} aria-hidden="true" /> {yangiJoyOchiq ? t('Lokatsiyani yashirish') : t('Lokatsiyani xaritadan belgilash (ixtiyoriy)')}
              </button>
              {yangiJoy && <span className="ml-2 font-mono text-[11px] text-text-mute">{yangiJoy[0].toFixed(5)}, {yangiJoy[1].toFixed(5)}</span>}
              {yangiJoyOchiq && (
                <div className="mt-2 h-[380px] overflow-hidden rounded-md border border-border">
                  <Suspense fallback={<div className="skel h-full" />}><ObjectLocationMap position={yangiJoy} onChange={setYangiJoy} /></Suspense>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="fz-btn fz-btn--ghost" onClick={() => { setYaratishOchiq(false); setYangiNom(''); setYangiLoyihaId(''); setYangiJoy(null); setYangiJoyOchiq(false); }}>
                {t('Bekor qilish')}
              </button>
              <button type="button" className="fz-btn fz-btn--primary" onClick={() => void obyektYarat()} disabled={!yangiNom.trim() || yaratilmoqda}>
                {yaratilmoqda ? t('Yaratilmoqda…') : t('Yaratish')}
              </button>
            </div>
          </ModalOyna>
        )}
        {editObj && editObj.kompaniya_id === joriy?.id && (
          <ModalOyna sarlavha="Obyekt Joylashuvini Belgilash" kenglik={640} ikon={<MapPin className="text-accent" size={18} aria-hidden="true" />} yop={() => setEditObj(null)}>
            <div className="mb-3 flex gap-3">
              <input value={nomi} onChange={e=>setNomi(e.target.value)} aria-label={t('Obyekt nomi')} className="h-9 flex-1 rounded-md border border-[var(--border-strong)] bg-bg px-3 text-sm text-text" placeholder={t('Yangi nomi…')} />
              <input value={tur} onChange={e=>setTur(e.target.value)} aria-label={t('Obyekt turi')} className="h-9 w-1/3 rounded-md border border-[var(--border-strong)] bg-bg px-3 text-sm text-text" placeholder={t('Turi…')} />
            </div>
            <div className="relative z-0 mb-4 h-[420px] overflow-hidden rounded-md border border-border">
              <Suspense fallback={<div className="skel h-full" />}><ObjectLocationMap position={position} onChange={setPosition} /></Suspense>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="fz-btn fz-btn--ghost" onClick={() => setEditObj(null)}>{t('Bekor qilish')}</button>
              <button type="button" className="fz-btn fz-btn--primary" onClick={saqlashTahrir}>{t('Saqlash va Joylash')}</button>
            </div>
          </ModalOyna>
        )}

        {xato && (
          <div role="alert" className="fz-note fz-note--danger"><AlertTriangle aria-hidden="true" /><span>{xato}</span></div>
        )}

        {yuklanmoqda && !currentRows && <div className="skel h-40 rounded-xl" />}

        {currentRows && !currentRows.length && !xato && (
          <BoshHolat matn="Hali birorta obyekt yo‘q" izoh="Obyekt — smeta, bajarilgan ishlar va hujjatlar bir joyda turadigan ish joyi. Boshlash uchun quyidagi qadamlardan birini tanlang."
            amal={<div className="flex flex-col items-center gap-4">
              <ol className="flex flex-col gap-2 text-left text-[13px] text-text-dim" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {[['1', 'Loyiha yarating (ixtiyoriy) — obyektlar shu loyiha ostida guruhlanadi.'], ['2', 'Obyekt qo‘shing va nomini yozing.'], ['3', 'Obyekt ichida smeta XLSX faylini yuklang — smeta, fakt va F2 shu yerdan boshlanadi.']].map(([n, matn]) => (
                  <li key={n} className="flex items-start gap-2.5"><span className="fz-chip fz-chip--accent" style={{ minWidth: 20, justifyContent: 'center' }}>{n}</span><span>{t(matn)}</span></li>
                ))}
              </ol>
              <div className="flex flex-wrap justify-center gap-2">
                <a className="fz-btn" href="/admin/loyiha"><FolderPlus aria-hidden="true" />{t('Loyiha yaratish')}</a>
                <button type="button" className="fz-btn fz-btn--primary" onClick={() => setYaratishOchiq(true)}><Building2 aria-hidden="true" />{t('Yangi obyekt')}</button>
              </div>
            </div>} />
        )}

        {/* ProjectNavigator sums narxsiz at every level and marks incomplete financial totals. */}
        {joriy?.id && currentRows && currentRows.length > 0 && <ProjectNavigator key={joriy.id} companyId={joriy.id} objects={currentRows}
          onOpen={(o, contractId) => {
            workspace.setObjectId(o.id);
            const params = new URLSearchParams();
            if (o.loyiha_id != null) params.set('loyiha', String(o.loyiha_id));
            if (contractId != null) params.set('shartnoma', String(contractId));
            navigate(`/admin/holat/${o.id}?${params}`);
          }}
          onEdit={o => handleTahrir({ stopPropagation() {} }, o)}
          onArchive={o => void handleOchirish({ stopPropagation() {} }, o)}
          onShare={o => setUlashObj(o)} />}
        {ulashObj && joriy?.id && <ObyektUlash kompaniyaId={joriy.id} obyekt={ulashObj} yopish={() => setUlashObj(null)} />}

      </div>
    </Sahifa>
  );
}
