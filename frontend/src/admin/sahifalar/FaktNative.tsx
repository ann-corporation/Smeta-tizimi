import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, Target } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { SmetaTree } from '../../umumiy/daraxt/SmetaTree';
import { useT2Daraxt } from '../../umumiy/daraxt/useT2Daraxt';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { sbT2ObyektlarOlKomp, yangiOperationId, type T2Obyekt } from '../../api/supabase';
import { sbFaktBelgilaV2, sbFaktYoz } from '../../api/t2-fakt';
import type { TreeNode } from '../../api/types';
import { faktQoldaKiritiladimi } from '../../lib/fakt-input-policy';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { FaktJurnal, type SaqlashFn } from './FaktJurnal';
import { XotiradanFakt } from './XotiradanFakt';
import { FaktQamrov } from './FaktQamrov';
import { jurnalQur, type JurnalHolat, type JurnalIsh } from '../../lib/fakt-jurnal';
import { bajarilmaydiXarita, faktQamrovBekor, holatXarita, markirovkaIshlari } from '../../lib/fakt-qamrov';


export function FaktNative() {
  const { joriy } = useKompaniya(); const navigate = useNavigate(); const [params, setParams] = useSearchParams(); const workspace = usePTOWorkspace();
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const jurnalSaqlash = useRef<SaqlashFn | null>(null); const [otmoqda, setOtmoqda] = useState(false);
  const [marker, setMarker] = useState(''); const [saving, setSaving] = useState(false);
  /** Egasi 2026-10-01: tezkor jadval (ko'p qatorni bir yo'la saqlash) asosiy ko'rinish; daraxt — ixtiyoriy. */
  const [korinish, setKorinish] = useState<'tezkor' | 'daraxt' | 'xotira'>('tezkor');
  const obyektId = Number(params.get('obyekt')); const valid = Number.isSafeInteger(obyektId) && obyektId > 0;
  /** Pereraschet ekranidan havola: `?filtr=faktsiz_f2&bolim=<id>` (fakti yo'q, F2 olingan qatorlar). */
  const boshFaktsizF2 = params.get('filtr') === 'faktsiz_f2';
  const boshBolimRaw = Number(params.get('bolim')); const boshBolimId = Number.isSafeInteger(boshBolimRaw) && boshBolimRaw > 0 ? boshBolimRaw : null;
  const { rows, states, tree, price, loading, yangilanmoqda, error, yuklash, holatniYangila } = useT2Daraxt(valid ? obyektId : null);
  const markers = useMemo(() => Array.from(new Set(rows.filter(r => faktQoldaKiritiladimi(r.tur || '') && r.kat?.trim()).map(r => r.kat!.trim()))).sort(), [rows]);
  const smetaJami = states.reduce((s, r) => s + (r.smeta_hajm || 0), 0); const faktJami = states.reduce((s, r) => s + (r.fakt_hajm || 0), 0);
  useEffect(() => { if (joriy?.id) void sbT2ObyektlarOlKomp(joriy.id).then(r => setObyektlar((r.ok ? r.qatorlar : []) as T2Obyekt[])); }, [joriy?.id]);
  const faktSaqlash = useCallback(async (node: TreeNode, mode: 'qoshish' | 'jami', value: number) => {
    if (!valid || node.id == null) return { ok: false, message: 'Kanonik qator ID topilmadi.' };
    if (!faktQoldaKiritiladimi(node.type)) return { ok: false, message: 'Bu qatorga Fakt qo‘lda kiritilmaydi.' };
    const sana = new Date().toISOString().slice(0, 10); const operationId = yangiOperationId();
    if (mode === 'qoshish') { const r = await sbFaktYoz({ obyektId, sana, operationId, qatorlar: [{ qator_id: node.id, hajm: value }], izoh: 'Fakt daraxtidan kanonik qo‘shish' }); if (!r.ok) return { ok: false, message: r.error || r.xabar || 'Fakt qo‘shilmadi.' }; }
    else { const r = await sbFaktBelgilaV2({ obyektId, qatorId: node.id, expectedFaktHajm: Number(node.fakt || 0), yangiFaktHajm: value, sana, operationId, izoh: 'Fakt daraxtidan kanonik jami tahriri' }); if (!r.ok) return { ok: false, conflict: r.code === 'FAKT_CONFLICT', message: r.code === 'FAKT_CONFLICT' ? 'Qator serverda o‘zgargan. Yangilang.' : (r.error || r.xabar || 'Fakt saqlanmadi.') }; }
    // Faqat shu qator, ota-bobolari va bolalari qayta o'qiladi; daraxt ekranda qoladi.
    await holatniYangila(node.id); return { ok: true };
  }, [obyektId, valid, holatniYangila]);
  /**
   * «Markirovka bo‘yicha 100%» (JQA-03): endi qatorma-qator `fakt_belgila_v2` («= smeta») EMAS — Qamrov % oynasi (100%):
   * oldindan ko‘rish, bitta fakt_yoz_v2 tranzaksiyasi (urinish/receipt), faqat OSHIRADI. Smetadan oshgan qator (masalan
   * 120 / 100) o‘zgarmaydi va «allaqachon ≥100%» deb ko‘rsatiladi; kamaytirish — oynadagi alohida «Tuzatish» (preview bilan).
   */
  const [markirovkaQamrov, setMarkirovkaQamrov] = useState<{ sarlavha: string; ishlar: JurnalIsh[] } | null>(null);
  const holatMap = useMemo(() => holatXarita(states as readonly JurnalHolat[]), [states]);
  const narxOl = useCallback((id: number): number | null => { const h = holatMap.get(id); const r = rows.find((x) => x.id === id); return h?.smeta_narx != null ? Number(h.smeta_narx) : r?.narx != null ? Number(r.narx) : null; }, [holatMap, rows]);
  const yuz = async () => {
    if (!marker || saving || !joriy?.id) return; setSaving(true);
    try {
      const baj = await bajarilmaydiXarita(joriy.id, obyektId);
      const j = jurnalQur(rows, states, null, baj);
      const ishlar = markirovkaIshlari(j.bolimIshlari, marker, j.ildizIshlari);
      if (!ishlar.length) { toast(t('Bu markirovkada qator topilmadi.'), 'warn'); return; }
      setMarkirovkaQamrov({ sarlavha: `${t('Markirovka')} ${marker}`, ishlar });
    } finally { setSaving(false); }
  };
  /** Avval saqlanmagan kiritmalarni saqlaydi, so'ng F2 tayyorlashga o'tadi (yuqori tugma va Fakt Studio paneli uchun umumiy). */
  const f2gaOt = async (avto = false, oy?: string) => { if (otmoqda) return; setOtmoqda(true); try { const ok = jurnalSaqlash.current ? await jurnalSaqlash.current() : true; if (!ok) { toast('Fakt saqlanmadi. Avval saqlang, keyin F2 tayyorlashga o\u2018ting.', 'warn'); return; } navigate(`/admin/f2-tayyorlash?obyekt=${obyektId}${avto ? '&avto=1' : ''}${oy ? `&oy=${oy}` : ''}`); } finally { setOtmoqda(false); } };
  const birinchiYuklash = loading && tree.length === 0;
  const korinishlar = [['tezkor', t('Fakt jurnali')], ['xotira', t('Xotiradan')], ['daraxt', t('Daraxt')]] as const;
  const jurnal = valid && joriy?.id && !birinchiYuklash && !error && (korinish === 'tezkor' || (korinish === 'daraxt' && tree.length === 0));
  return <Sahifa sarlavha="Bajarilgan ishlar (Fakt)" tavsif="Smeta hajmi va Faktni RZ → BL → RS/MAT/OB daraxtida boshqaring">
    <div className="flex h-full min-h-0 flex-col gap-3">
      <section className="fz-card flex flex-wrap items-end gap-2 p-3">
        <label className="min-w-[260px] flex-1 text-[12px] font-medium text-text-dim">{t('Obyekt')}
          <select aria-label={t('Obyekt')} value={valid ? obyektId : ''} onChange={e => { const o = obyektlar.find(x => x.id === Number(e.target.value)); if (workspace.isProvider) workspace.setObjectId(o?.id ?? null); else setParams(o ? { obyekt: String(o.id) } : {}); }} className="input mt-1.5 block h-9 w-full px-2 text-[13px] text-text">
            <option value="">{t('-- obyektni tanlang --')}</option>
            {valid && !obyektlar.some((item) => item.id === obyektId) && <option value={obyektId}>{t('Obyekt')} {'#'}{obyektId}</option>}
            <ObyektOptionlari obyektlar={obyektlar} />
          </select>
        </label>
        {valid && <button onClick={() => navigate(`/admin/holat/${obyektId}${workspace.scopeSearch(obyektId)}`)} className="fz-btn">{t('LRVga qaytish')}</button>}
        {valid && <button onClick={() => void yuklash()} disabled={loading || yangilanmoqda || saving} className="fz-btn"><RefreshCw size={14} className={yangilanmoqda ? 'animate-spin' : undefined}/> {t('Yangilash')}</button>}
        {valid && <button disabled={otmoqda} onClick={() => void f2gaOt()} className="fz-btn fz-btn--primary">{t('F2 tayyorlash →')}</button>}
        {yangilanmoqda && <span role="status" className="text-[11px] text-text-mute">{t('Yangilanmoqda…')}</span>}
        {valid && <div className="ml-auto flex items-center gap-0.5 rounded-[var(--radius-sm)] border border-border bg-surface-2 p-0.5" role="group" aria-label={t('Fakt ko‘rinishi')}>
          {korinishlar.map(([k, l]) => <button key={k} aria-pressed={korinish === k} onClick={() => setKorinish(k)} className={`fz-btn fz-btn--sm ${korinish === k ? 'border-transparent bg-accent/15 text-text' : 'fz-btn--ghost'}`}>{l}</button>)}
        </div>}
      </section>
      {valid && korinish === 'daraxt' && !birinchiYuklash && !error && tree.length > 0 && <section className="fz-card flex flex-wrap items-end gap-3 p-3" aria-label={t('Fakt markirovka boshqaruvi')}>
        <span className="text-[12px] text-text-dim"><b className="text-text">{t('Smeta')}:</b> {smetaJami.toLocaleString('ru-RU')} · <b className="text-text">{t('Fakt')}:</b> {faktJami.toLocaleString('ru-RU')}</span>
        <label className="min-w-[220px] text-[12px] font-medium text-text-dim">{t('Markirovka bo‘yicha 100%')}
          <select aria-label={t('Fakt markirovkasi')} value={marker} onChange={e => setMarker(e.target.value)} className="input mt-1 block h-9 w-full px-2 text-text"><option value="">{t('Markirovkani tanlang')}</option>{markers.map(m => <option key={m} value={m}>{m}</option>)}</select>
        </label>
        <button onClick={() => void yuz()} disabled={!marker || saving} className="fz-btn fz-btn--primary"><Target size={14}/> {saving ? t('Belgilanmoqda…') : t('100% qilish')}</button>
        <span className="text-[11px] text-text-mute">{t('Faqat BL/MAT/OB; RS avtomatik hisoblanadi.')}</span>
      </section>}
      {!valid && <section className="fz-note fz-note--info"><span>{t('Avval kanonik obyektni tanlang.')}</span></section>}
      {error && valid && <section role="alert" className="fz-note fz-note--danger"><AlertTriangle aria-hidden="true"/><span>{error}</span></section>}
      {birinchiYuklash && <div className="skel min-h-[280px] flex-1 rounded-[var(--radius-md)]"/>}
      {jurnal && joriy?.id && <FaktJurnal boshFaktsizF2={boshFaktsizF2} boshBolimId={boshBolimId} saqlashRef={jurnalSaqlash} f2Otish={(oy) => void f2gaOt(true, oy)} kompaniyaId={joriy.id} obyektId={obyektId} rows={rows} states={states} holatniYangila={() => holatniYangila()} tuzilmaniYangila={() => yuklash()} />}
      {valid && joriy?.id && korinish === 'xotira' && !birinchiYuklash && !error && <XotiradanFakt kompaniyaId={joriy.id} obyektId={obyektId} rows={rows} states={states} holatniYangila={() => holatniYangila()} tuzilmaniYangila={() => yuklash()} />}
      {korinish === 'daraxt' && tree.length > 0 && <div className="min-h-0 flex-1"><SmetaTree data={tree} priceControlLines={price} onFaktSave={faktSaqlash} onQatorTahrirlandi={yuklash}/></div>}
      {markirovkaQamrov && joriy?.id && <FaktQamrov sarlavha={markirovkaQamrov.sarlavha} ishlar={markirovkaQamrov.ishlar} holatMap={holatMap} narxOl={narxOl}
        obyektId={obyektId} kompaniyaId={joriy.id} sana={new Date().toISOString().slice(0, 10)}
        onYop={() => setMarkirovkaQamrov(null)} onBajarildi={() => holatniYangila()} aktBekor={faktQamrovBekor} />}
    </div></Sahifa>;
}
export default FaktNative;
