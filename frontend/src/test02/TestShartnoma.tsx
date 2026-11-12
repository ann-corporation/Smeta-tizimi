import type { ReactNode } from 'react';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { sbT2ShartnomalarOl, sbT2ShartnomaSaqla, sbT2ShartnomaBogSaqla, type Shartnoma } from '../api/t2-shartnoma';
import { sbT2ObyektlarOlKomp, type T2Obyekt } from '../api/supabase';
import { sbT2LoyihalarOl, type Loyiha } from '../api/t2-loyiha';
import { usePTOWorkspace } from '../umumiy/kontekst/PTOWorkspaceContext';
import { Briefcase, Plus, FileText, Calculator, PieChart, RefreshCw, Network } from 'lucide-react';
import { FmtN } from '../lib/format';
import { toast } from '../umumiy/ui/Toast';
import { t } from '../i18n/til';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { useKompaniya } from './KompaniyaTanlov';
import { EntityFormModal } from '../umumiy/ui/forms/SharedForms';
import { onEntityChanged } from '../api/entity-consistency';
import { taqsimot } from '../lib/kompaniya-ops-korinish';
import { sbKontragentlarOl } from '../api/t2-kontragent';
import { keyingiShartnomaRaqam } from '../lib/shartnoma-sukut';
import { OpsBoshQator, OpsKpi, OpsKpiQator, OpsQidiruv, OpsTablar, OpsTaqsimot } from '../components/kompaniya-ops/OpsUi';

/**
 * Shartnomalar reestri (egasi 2026-10-25: Firuza ko'rinishi). Summa — shartnomadagi QQS bilan jami (ustama emas).
 * Sub-pudrat va kafolat ushlanmasi hali hisoblanmaydi — «—» (nol emas).
 */
type Tab = 'shartnomalar' | 'dop' | 'kalkulyator' | 'radar';
const HOLAT: Record<Shartnoma['holat'], { nom: string; stamp: string; rang: string }> = {
  faol: { nom: 'Faol', stamp: 'fz-stamp--ok', rang: 'var(--ok)' },
  yopilgan: { nom: 'Yopilgan', stamp: 'fz-stamp--frozen', rang: 'var(--accent)' },
  bekor: { nom: 'Bekor', stamp: 'fz-stamp--danger', rang: 'var(--danger)' },
};

/** Navigatsiya oqimi (2026-11-11): «keyingi bosqichda ishga tushiriladi» tablari (Qo'shimcha kelishuvlar, Ustama va soliqlar, Limitlar radari) yashirilgan; tayyor bo'lganda id ni qo'shing. */
const TAYYOR_TABLAR = ['shartnomalar'] as const;

export default function TestShartnoma() {
  const navigate = useNavigate();
  const { joriy } = useKompaniya();
  const aktKomp = joriy?.id ?? 0;
  const [activeTab, setActiveTab] = useState<Tab>('shartnomalar');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [saqlamoqda, setSaqlamoqda] = useState(false);
  const [shartnomalar, setShartnomalar] = useState<Shartnoma[]>([]);
  const [qidiruv, setQidiruv] = useState('');
  /** Yangi shartnoma sukut qiymatlari: keyingi raqam (ketma-ket) va taraf — aynan bitta «buyurtmachi» kontragent. */
  const [buyurtmachi, setBuyurtmachi] = useState<string | null>(null);
  /* Loyiha/obyekt: forma shartnomani yaratishdayoq bog'laydi (aks holda Forma 3 shartnoma rejimida «Obyektlar: 0») — joriy kontekstdan oldindan tanlanadi. */
  const ws = usePTOWorkspace();
  const [loyihalar, setLoyihalar] = useState<Loyiha[]>([]);
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  useEffect(() => {
    if (!joriy) return;
    let faol = true;
    void Promise.all([sbT2LoyihalarOl(joriy.id), sbT2ObyektlarOlKomp(joriy.id)]).then(([l, o]) => {
      if (!faol) return;
      if (l.ok) setLoyihalar(l.qatorlar ?? []);
      if (o.ok) setObyektlar((o.qatorlar ?? []) as T2Obyekt[]);
    }).catch(() => undefined);
    return () => { faol = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- joriy?.id: obyekt har renderda yangi bo'lsa ham so'rov takrorlanmasin
  }, [joriy?.id]);
  useEffect(() => {
    if (!joriy) return;
    let faol = true;
    void sbKontragentlarOl(joriy.id).then((r) => { if (!faol || !r.ok) return; const b = (r.qatorlar ?? []).filter((k) => k.mavqe === 'buyurtmachi'); setBuyurtmachi(b.length === 1 ? b[0].nom : null); }).catch(() => undefined);
    return () => { faol = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- joriy?.id
  }, [joriy?.id]);

  const yukla = async () => {
    if (!joriy) return;
    setYuklanmoqda(true);
    try {
      /* ⚠️ 2026-08-28: filtr SERVERDA (avval barcha kompaniyalar o'qilib, mijozda filtrlanardi — shartnoma jim yo'qolardi). */
      const res = await sbT2ShartnomalarOl(joriy.id, false);
      setShartnomalar(res.qatorlar || []);
    } catch (e: any) {
      toast(e.message, 'danger');
    } finally {
      setYuklanmoqda(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [joriy]);
  useEffect(() => onEntityChanged((event) => {
    if (event.detail.kompaniyaId === aktKomp && event.detail.type === 'shartnoma') void yukla();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [aktKomp]);

  const stats = useMemo(() => shartnomalar.reduce((acc, s) => {
    acc.jami += Number(s.jami_nds_bilan) || 0;
    // Daromad/xarajatni «taraf» orqali farqlash hali yo'q — faol va yopilganlar bosh pudrat deb olinadi (avvalgi hisob).
    if (s.holat === 'faol' || s.holat === 'yopilgan') acc.bosh += Number(s.jami_nds_bilan) || 0;
    return acc;
  }, { jami: 0, bosh: 0 }), [shartnomalar]);
  const qqsYoq = useMemo(() => shartnomalar.filter((s) => !((s.nds || 0) > 0)).length, [shartnomalar]);
  const holatlar = useMemo(() => taqsimot(shartnomalar, (s) => s.holat, ['faol', 'yopilgan', 'bekor'] as const), [shartnomalar]);
  const q = qidiruv.toLowerCase();
  const korinadi = shartnomalar.filter((s) => `${s.raqam} ${s.nom ?? ''} ${s.taraf ?? ''}`.toLowerCase().includes(q));

  return (
    <Sahifa
      sarlavha="Shartnomalar"
      tavsif="Bosh pudrat, sub-pudrat va xarid shartnomalari reestri: summa (QQS bilan), holat va mindmapdagi bog‘lanishi."
      amallar={<>
        <button type="button" onClick={() => void yukla()} className="fz-btn fz-btn--ghost" aria-label={t('Yangilash')}><RefreshCw className={yuklanmoqda ? 'animate-spin' : ''} /> {t('Yangilash')}</button>
        <button type="button" onClick={() => setIsFormOpen(true)} className="fz-btn fz-btn--primary"><Plus /> {t('Yangi shartnoma')}</button>
      </>}
    >
      <div className="flex flex-col gap-3">
        <OpsKpiQator yorliq={t('Shartnoma ko‘rsatkichlari')}>
          <OpsKpi nom={t('Jami portfel')} qiymat={<FmtN val={stats.jami} />} ost={t('{n} ta shartnoma · so‘m, shartnomadagi jami (QQS bilan)', { n: shartnomalar.length }) + (qqsYoq > 0 ? ' · ' + t('{k} tasida QQS kiritilmagan', { k: qqsYoq }) : '')} />
          <OpsKpi nom={t('Bosh pudrat (daromad)')} rang="var(--ok)" qiymat={<FmtN val={stats.bosh} />} ost={t('faol va yopilganlar')} />
          <OpsKpi nom={t('Sub-pudrat / xarid')} rang="var(--danger)" qiymat={<span className="text-text-mute">—</span>} ost={t('hali hisoblanmaydi')} />
          <OpsKpi nom={t('Kafolat ushlanmasi')} rang="var(--warn)" qiymat={<span className="text-text-mute">—</span>} ost={t('hali hisoblanmaydi')} />
        </OpsKpiQator>

        <OpsTaqsimot sarlavha={t('Shartnomalar holati')} segmentlar={holatlar.map((h) => ({ kalit: h.kalit, nom: t(HOLAT[h.kalit]?.nom ?? h.kalit), soni: h.soni, rang: HOLAT[h.kalit]?.rang ?? 'var(--border-strong)' }))} />

        {TAYYOR_TABLAR.length > 1 && <OpsTablar<Tab> yorliq={t('Shartnoma bo‘limlari')} joriy={activeTab} onTanla={setActiveTab} tablar={[
          { id: 'shartnomalar', nom: t('Bosh shartnomalar'), ikon: <Briefcase />, soni: shartnomalar.length },
          { id: 'dop', nom: t('Qo‘shimcha kelishuvlar'), ikon: <FileText /> },
          { id: 'kalkulyator', nom: t('Ustama va soliqlar'), ikon: <Calculator /> },
          { id: 'radar', nom: t('Limitlar radari'), ikon: <PieChart /> },
        ].filter((x) => (TAYYOR_TABLAR as readonly string[]).includes(x.id)) as Array<{ id: Tab; nom: string; ikon: ReactNode; soni?: number }>} />}

        {isFormOpen && (
          <EntityFormModal
            entityType="shartnoma"
            initialData={{
              raqam: keyingiShartnomaRaqam(shartnomalar), ...(buyurtmachi ? { taraf: buyurtmachi } : {}),
              ...(ws.scope?.objectId ? { obyektId: String(ws.scope.objectId) } : ws.scope?.projectId ? { loyihaId: String(ws.scope.projectId) } : {}),
            }}
            dynamicOptions={{
              loyihaId: loyihalar.map((l) => ({ value: String(l.id), label: l.nom })),
              obyektId: obyektlar.map((o) => ({ value: String(o.id), label: o.nom })),
            }}
            title={t('Yangi shartnomani ro‘yxatga olish')}
            color="var(--accent)"
            onClose={() => setIsFormOpen(false)}
            isLoading={saqlamoqda}
            onSubmit={async (data) => {
              if (!data.raqam || !data.nom) return toast(t('Raqam va nomni kiriting!'), 'warn');
              setSaqlamoqda(true);
              try {
                const sum = data.summaBezNds === '' ? undefined : Number(data.summaBezNds);
                const ndsFoiz = Number(data.nds) || 0;
                const ndsSumma = sum == null ? undefined : (sum * ndsFoiz) / 100;
                const jami = sum == null ? undefined : sum + (ndsSumma || 0);
                const res = await sbT2ShartnomaSaqla({
                  kompaniyaId: joriy!.id, raqam: data.raqam, nom: data.nom, taraf: data.taraf,
                  summaBezNds: sum, nds: ndsSumma, jamiNdsBilan: jami, izoh: data.izoh,
                });
                if (!res.ok) throw new Error(res.error || t('Noma’lum xato'));
                /* Obyekt(lar)ni bog'lash: tanlangan obyekt, yoki tanlangan loyihaning hamma obyekti. Natija aniq aytiladi. */
                const shId = res.shartnoma_id;
                const nishon = data.obyektId ? obyektlar.filter((o) => String(o.id) === String(data.obyektId))
                  : data.loyihaId ? obyektlar.filter((o) => String(o.loyiha_id) === String(data.loyihaId)) : [];
                if (shId && nishon.length) {
                  const natijalar = await Promise.all(nishon.map((o) => sbT2ShartnomaBogSaqla(o.id, shId)));
                  const bogland = nishon.filter((_, i) => natijalar[i].ok);
                  toast(bogland.length === nishon.length
                    ? t('Shartnoma saqlandi va {n} ta obyektga bog‘landi: {nom}', { n: bogland.length, nom: bogland.map((o) => o.nom).slice(0, 4).join(', ') })
                    : t('Shartnoma saqlandi, lekin {n} ta obyektni bog‘lab bo‘lmadi — «Shartnomalar va tomonlar» da bog‘lang.', { n: nishon.length - bogland.length }), bogland.length === nishon.length ? 'ok' : 'warn');
                } else {
                  toast(t('Shartnoma muvaffaqiyatli saqlandi!'), 'ok');
                  if (!nishon.length) toast(t('Obyekt tanlanmadi: Forma 3 shartnoma rejimi obyektlarni topmaydi, ularni «Shartnomalar va tomonlar» da bog‘lang.'), 'warn');
                }
                setIsFormOpen(false);
                void yukla();
              } catch (e: any) {
                toast(e.message, 'danger');
              } finally {
                setSaqlamoqda(false);
              }
            }}
          />
        )}

        {activeTab === 'shartnomalar' && (
          <div className="flex flex-col gap-2">
            <OpsQidiruv qiymat={qidiruv} onChange={setQidiruv} placeholder={t('Raqam, nom yoki kontragent bo‘yicha…')} />
            <div className="fz-table-wrap">
              <table className="fz-table">
                <thead>
                  <tr><th>{t('Shartnoma №')}</th><th>{t('Nomi va predmeti')}</th><th>{t('Kontragent (2-tomon)')}</th><th className="fz-c-num">{t('Summa, so‘m')}</th><th>{t('Holat')}</th><th style={{ textAlign: 'right' }}>{t('Amal')}</th></tr>
                </thead>
                <tbody>
                  {korinadi.length === 0 && !yuklanmoqda && <OpsBoshQator ustun={6} matn={shartnomalar.length ? t('Qidiruvga mos shartnoma yo‘q.') : t('Hech qanday shartnoma topilmadi.')} izoh={shartnomalar.length ? undefined : t('«Yangi shartnoma» tugmasi bilan birinchi shartnomani kiriting.')} />}
                  {korinadi.map((s) => (
                    <tr key={s.id}>
                      <td><span className="fz-c-shifr">№ {s.raqam}</span><span className="block text-[11px] text-text-mute">{new Date(s.yaratildi).toLocaleDateString('ru-RU')}</span></td>
                      <td><span className="block font-medium text-text">{s.nom || '—'}</span>{s.izoh && <span className="text-[11.5px] text-text-mute">{s.izoh}</span>}</td>
                      <td className="text-text-dim">{s.taraf || '—'}</td>
                      <td className="fz-c-num">
                        <span className="block font-semibold"><FmtN val={s.jami_nds_bilan} /></span>
                        <span className={`text-[11px] ${(s.nds || 0) > 0 ? 'text-text-mute' : 'text-warn'}`}>{(s.nds || 0) > 0 ? t('QQS bilan') : t('QQS kiritilmagan')}</span>
                      </td>
                      <td><span className={`fz-stamp ${HOLAT[s.holat]?.stamp ?? ''}`}>{t(HOLAT[s.holat]?.nom ?? s.holat)}</span></td>
                      <td className="text-right">
                        <button type="button" onClick={() => navigate(`/admin/mindmap?tugun=shartnoma:${s.id}`)} className="fz-btn fz-btn--ghost fz-btn--sm"><Network /> {t('Mindmapda ko‘rish')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab !== 'shartnomalar' && (
          <section className="fz-note"><FileText /><span>{activeTab === 'dop'
            ? t('Qo‘shimcha kelishuvlar reestri — asosiy shartnomaga qilingan kelishuvlar shu yerda yuritiladi va asosiy summa bilan jamlanadi (jarayonda).')
            : t('Bu bo‘lim keyingi bosqichda ishga tushiriladi.')}</span></section>
        )}
      </div>
    </Sahifa>
  );
}
