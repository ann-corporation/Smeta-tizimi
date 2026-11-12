import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CheckCircle2, AlertCircle, Save, RefreshCw, Archive, Network, UserPlus } from 'lucide-react';
import { toast } from '../umumiy/ui/Toast';
import { t } from '../i18n/til';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { useKompaniya } from './KompaniyaTanlov';
import { sbKontragentSaqla, sbKontragentlarOl, type Kontragent } from '../api/t2-kontragent';
import { arxivlashJarayoni } from '../api/t2-arxiv';
import { onEntityChanged } from '../api/entity-consistency';
import { taqsimot } from '../lib/kompaniya-ops-korinish';
import { OpsBoshQator, OpsMaydon, OpsTaqsimot } from '../components/kompaniya-ops/OpsUi';

/**
 * Kontragentlar reestri (egasi 2026-10-25: Firuza ko'rinishi). Chapda — yangi kontragent formasi, o'ngda — ro'yxat;
 * tepada rollar taqsimoti (bosilsa — filtr). Didox ulanmaguncha rekvizitlar qo'lda kiritiladi.
 */
const ROLLAR: { id: string; nom: string; rang: string }[] = [
  { id: 'buyurtmachi', nom: 'Buyurtmachi', rang: 'var(--info)' },
  { id: 'pudratchi', nom: 'Bosh pudratchi', rang: 'var(--accent)' },
  { id: 'subpudratchi', nom: 'Subpudratchi', rang: 'var(--kat-chel)' },
  { id: 'loyihachi', nom: 'Loyihachi', rang: 'var(--kat-ob)' },
  { id: 'taminotchi', nom: 'Ta’minotchi', rang: 'var(--kat-mash)' },
  { id: 'laboratoriya', nom: 'Laboratoriya', rang: 'var(--kat-mat)' },
];
const rolNomi = (id: string | null | undefined) => (id ? t(ROLLAR.find((r) => r.id === id)?.nom ?? id) : '—');

export default function TestKontragent() {
  const navigate = useNavigate();
  const { joriy } = useKompaniya();
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [royxatYuklanmoqda, setRoyxatYuklanmoqda] = useState(false);
  const [kontragentlar, setKontragentlar] = useState<Kontragent[]>([]);
  const [rolFiltr, setRolFiltr] = useState('');
  const korinadigan = rolFiltr ? kontragentlar.filter((k) => k.mavqe === rolFiltr) : kontragentlar;

  const [inn, setInn] = useState('');
  const [formData, setFormData] = useState({ nom: '', rahbar: '', manzil: '', mfo: '', hisobRaqam: '', qqsTolovchi: false, mavqe: 'subpudratchi' as any });

  const royxatniYangila = useCallback(async () => {
    if (!joriy) return;
    setRoyxatYuklanmoqda(true);
    try {
      const res = await sbKontragentlarOl(joriy.id);
      setKontragentlar(res.qatorlar || []);
    } catch (e: any) {
      toast(e.message, 'danger');
    } finally {
      setRoyxatYuklanmoqda(false);
    }
  }, [joriy]);

  useEffect(() => { void royxatniYangila(); }, [royxatniYangila]);
  useEffect(() => onEntityChanged((event) => {
    if (joriy && event.detail.kompaniyaId === joriy.id && event.detail.type === 'kontragent') void royxatniYangila();
  }), [joriy, royxatniYangila]);

  const handleFetchINN = async () => {
    // ⚠️ QAT'IY QOIDA: mock yo'q. Didox/Soliq API ulanmaguncha — faqat qo'lda kiritish.
    toast(t('Didox API hali ulanmagan. Iltimos, ma’lumotlarni qo‘lda kiriting.'), 'warn');
  };

  const handleSave = async () => {
    if (!joriy) return;
    if (!formData.nom.trim()) { toast(t('Kompaniya nomini kiritish shart!'), 'danger'); return; }
    setYuklanmoqda(true);
    try {
      await sbKontragentSaqla({
        kompaniyaId: joriy.id, inn: inn || undefined, nom: formData.nom, rahbar: formData.rahbar, manzil: formData.manzil,
        mfo: formData.mfo, hisobRaqam: formData.hisobRaqam, qqsTolovchi: formData.qqsTolovchi, mavqe: formData.mavqe,
      });
      toast(t('Kontragent bazaga saqlandi!'), 'ok');
      setInn('');
      setFormData({ nom: '', rahbar: '', manzil: '', mfo: '', hisobRaqam: '', qqsTolovchi: false, mavqe: 'subpudratchi' });
      void royxatniYangila();
    } catch (e: any) {
      toast(e.message, 'danger');
    } finally {
      setYuklanmoqda(false);
    }
  };

  const handleOchir = async (k: Kontragent) => {
    // Yumshoq o'chirish: Korzinkaga (tiklash mumkin); tasdiq va xato sababi umumiy oqimda.
    try {
      if (await arxivlashJarayoni('kontragent', k.id, k.nom)) void royxatniYangila();
    } catch (e: any) {
      toast(e.message, 'danger');
    }
  };

  const rollar = useMemo(() => taqsimot(kontragentlar, (k) => String(k.mavqe ?? ''), ROLLAR.map((r) => r.id)), [kontragentlar]);

  if (!joriy) return <section className="fz-note fz-note--warn m-6">{t('Kompaniya tanlanmagan')}</section>;

  return (
    <Sahifa
      sarlavha="Kontragentlar va hamkorlar"
      tavsif="Buyurtmachi, pudratchi, loyihachi, ta’minotchi va laboratoriyalar reestri. Didox ulanmaguncha rekvizitlar qo‘lda kiritiladi."
      amallar={<button type="button" onClick={() => void royxatniYangila()} className="fz-btn fz-btn--ghost" aria-label={t('Yangilash')}><RefreshCw className={royxatYuklanmoqda ? 'animate-spin' : ''} /> {t('Yangilash')}</button>}
    >
      <div className="flex flex-col gap-3">
        <OpsTaqsimot sarlavha={t('Kontragentlar rollar bo‘yicha')} tanlangan={rolFiltr || null}
          onTanla={(k) => setRolFiltr((f) => (f === k || !k ? '' : k))}
          ong={t('{n} ta', { n: kontragentlar.length })}
          segmentlar={rollar.map((r) => ({ kalit: r.kalit, nom: r.kalit ? rolNomi(r.kalit) : t('Rol ko‘rsatilmagan'), soni: r.soni, rang: ROLLAR.find((x) => x.id === r.kalit)?.rang ?? 'var(--border-strong)' }))} />

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <section className="fz-card lg:col-span-5" aria-label={t('Yangi kontragent qo‘shish')}>
            <div className="fz-card__head"><h2 className="fz-card__title inline-flex items-center gap-2"><UserPlus size={16} />{t('Yangi kontragent qo‘shish')}</h2></div>
            <div className="space-y-3 p-5">
              <OpsMaydon nom={t('STIR (INN)')}>
                <span className="flex gap-2">
                  <input type="text" maxLength={9} value={inn} onChange={(e) => setInn(e.target.value.replace(/[^0-9]/g, ''))} placeholder={t('9 xonali raqam')} className="font-mono" />
                  <button type="button" onClick={() => void handleFetchINN()} className="fz-btn fz-btn--icon" title={t('Didox’dan tortish (hozircha ishlamaydi)')} aria-label={t('Didox’dan tortish (hozircha ishlamaydi)')}><Search /></button>
                </span>
              </OpsMaydon>
              <OpsMaydon nom={t('Kompaniya to‘liq nomi')} majburiy>
                <input type="text" value={formData.nom} onChange={(e) => setFormData((p) => ({ ...p, nom: e.target.value }))} />
              </OpsMaydon>
              <div className="grid grid-cols-2 gap-3">
                <OpsMaydon nom={t('Rahbar F.I.O')}>
                  <input type="text" value={formData.rahbar} onChange={(e) => setFormData((p) => ({ ...p, rahbar: e.target.value }))} />
                </OpsMaydon>
                <OpsMaydon nom={t('Roli')}>
                  <select value={formData.mavqe} onChange={(e) => setFormData((p) => ({ ...p, mavqe: e.target.value as any }))}>
                    {ROLLAR.map((r) => <option key={r.id} value={r.id}>{t(r.nom)}</option>)}
                  </select>
                </OpsMaydon>
              </div>
              <OpsMaydon nom={t('Yuridik manzil')}>
                <input type="text" value={formData.manzil} onChange={(e) => setFormData((p) => ({ ...p, manzil: e.target.value }))} />
              </OpsMaydon>
              <div className="grid grid-cols-2 gap-3">
                <OpsMaydon nom={t('Hisob raqami')}>
                  <input type="text" maxLength={20} value={formData.hisobRaqam} onChange={(e) => setFormData((p) => ({ ...p, hisobRaqam: e.target.value.replace(/[^0-9]/g, '') }))} className="font-mono" />
                </OpsMaydon>
                <OpsMaydon nom={t('MFO kodi')}>
                  <input type="text" maxLength={5} value={formData.mfo} onChange={(e) => setFormData((p) => ({ ...p, mfo: e.target.value.replace(/[^0-9]/g, '') }))} className="font-mono" />
                </OpsMaydon>
              </div>
              <label htmlFor="qqs" className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input type="checkbox" id="qqs" checked={formData.qqsTolovchi} onChange={(e) => setFormData((p) => ({ ...p, qqsTolovchi: e.target.checked }))} />
                {t('QQS (NDS) to‘lovchisi')}
              </label>
              <button type="button" onClick={() => void handleSave()} disabled={yuklanmoqda} className="fz-btn fz-btn--primary w-full">
                {yuklanmoqda ? <RefreshCw className="animate-spin" /> : <Save />} {t('Bazaga saqlash')}
              </button>
            </div>
          </section>

          <section className="lg:col-span-7" aria-label={t('Mavjud kontragentlar')}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-text-mute">{t('Mavjud kontragentlar')}</span>
              <select value={rolFiltr} onChange={(e) => setRolFiltr(e.target.value)} aria-label={t("Rol bo'yicha filtr")} className="ml-auto h-7 px-2 text-[12px]">
                <option value="">{t('Barcha rollar')}</option>
                {ROLLAR.map((r) => <option key={r.id} value={r.id}>{t(r.nom)}</option>)}
              </select>
            </div>
            <div className="fz-table-wrap max-h-[600px]">
              <table className="fz-table">
                <thead><tr><th>{t('Kompaniya')}</th><th>{t('INN / MFO')}</th><th>{t('Roli')}</th><th /></tr></thead>
                <tbody>
                  {korinadigan.length === 0 && <OpsBoshQator ustun={4} matn={kontragentlar.length ? t('Bu rolda kontragent yo‘q.') : t('Hozircha hech qanday kontragent qo‘shilmagan.')} />}
                  {korinadigan.map((k) => (
                    <tr key={k.id} className="group">
                      <td>
                        <span className="block font-medium text-text">{k.nom}</span>
                        <span className={`inline-flex items-center gap-1 text-[11px] ${k.qqs_tolovchi ? 'text-text-mute' : 'text-warn'}`}>
                          {k.qqs_tolovchi ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}{k.qqs_tolovchi ? t('QQS to‘lovchi') : t('QQS siz')}
                        </span>
                      </td>
                      <td><span className="fz-c-shifr block">{k.inn || '—'}</span><span className="fz-c-shifr">{k.mfo || '—'}</span></td>
                      <td><span className="fz-chip">{rolNomi(k.mavqe)}</span></td>
                      <td className="whitespace-nowrap text-right">
                        <button type="button" onClick={() => navigate('/admin/mindmap?tugun=kontragent:' + k.id)} className="fz-btn fz-btn--ghost fz-btn--sm"><Network /> {t('Mindmap')}</button>
                        <button type="button" onClick={() => void handleOchir(k)} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" title={t('Korzinkaga yuborish (keyin tiklash mumkin)')} aria-label={`${t('Korzinkaga')}: ${k.nom}`}><Archive /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </Sahifa>
  );
}
