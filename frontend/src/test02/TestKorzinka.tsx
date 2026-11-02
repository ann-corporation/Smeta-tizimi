import { useState, useEffect } from 'react';
import { sbKorzinkaOqish, sbKorzinkadanTiklash, sbButunlayOchirish } from '../api/supabase';
import { Trash2, RefreshCw, AlertTriangle, Building2, FileText, Package, RotateCcw } from 'lucide-react';
import { toast } from '../umumiy/ui/Toast';
import { useKompaniya } from './KompaniyaTanlov';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { tasdiqSora } from '../umumiy/ui/Tasdiq';
import { t } from '../i18n/til';

type Jadval = 't2_obyekt' | 't2_shaxsiy_smeta' | 't2_sklad_harakat';
const TABS: { id: Jadval; nom: string; Icon: typeof Building2 }[] = [
  { id: 't2_obyekt', nom: 'Obyektlar', Icon: Building2 },
  { id: 't2_shaxsiy_smeta', nom: 'Smetalar', Icon: FileText },
  { id: 't2_sklad_harakat', nom: 'Sklad hujjatlari', Icon: Package },
];

/** Korzinka (Firuza, 2026-10-25): o'chirilganlar turi bo'yicha, tiklash — oddiy amal, butunlay o'chirish — xavfli tasdiq bilan. */
export default function TestKorzinka() {
  const { joriy } = useKompaniya();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [items, setItems] = useState<any[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState('');
  const [tab, setTab] = useState<Jadval>('t2_obyekt');

  const yuklash = async () => {
    setYuklanmoqda(true);
    setXato('');
    const res = await sbKorzinkaOqish(joriy?.id);
    setYuklanmoqda(false);
    if (res.ok) {
      setItems(res.qatorlar || []);
    } else {
      setXato(res.error || t('O‘qilmadi'));
      setItems([]);
    }
  };

  useEffect(() => {
    void yuklash();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joriy]);

  const handleTiklash = async (id: number, nomi: string) => {
    try {
      await sbKorzinkadanTiklash(tab, id, nomi);
      toast(t('Muvaffaqiyatli tiklandi'), 'ok');
      void yuklash();
    } catch {
      toast(t('Xatolik yuz berdi'), 'danger');
    }
  };

  const handleOchirish = async (id: number, nomi: string) => {
    if (!(await tasdiqSora({ sarlavha: t('Butunlay o‘chirish'), matn: t('«{n}» butunlay o‘chirilsinmi? Drive dan ham o‘chib ketadi va tiklab bo‘lmaydi.', { n: nomi }), tasdiqMatni: t('Butunlay o‘chirish'), xavfli: true }))) return;
    try {
      await sbButunlayOchirish(tab, id, nomi);
      toast(t('Butunlay o‘chirildi'), 'ok');
      void yuklash();
    } catch {
      toast(t('Xatolik yuz berdi'), 'danger');
    }
  };

  const currentItems = items.filter(i => i.jadval === tab);
  const soni = (j: Jadval) => items.filter((i) => i.jadval === j).length;
  const nomi = (item: { nomi?: string; nom?: string }) => item.nomi || item.nom || t('Nomsiz');

  return (
    <Sahifa sarlavha="Korzinka" tavsif="O‘chirilgan obyektlar, smetalar va sklad hujjatlari. Tiklash — xavfsiz; «Butunlay o‘chirish» Drive dagi faylni ham o‘chiradi."
      amallar={<><span className="fz-stamp fz-stamp--danger">{t('xavfli hudud')}</span>
        <button type="button" onClick={() => void yuklash()} className="fz-btn fz-btn--ghost" aria-label={t('Yangilash')}><RefreshCw size={16} className={yuklanmoqda ? 'animate-spin' : ''} />{t('Yangilash')}</button></>}>
      <div className="flex h-full flex-col gap-3">
        {xato && <p role="alert" className="fz-note fz-note--danger"><AlertTriangle aria-hidden="true" />{xato}</p>}

        <div role="tablist" aria-label={t('Korzinka bo‘limlari')} className="flex flex-wrap gap-1 border-b border-border">
          {TABS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-[13px] font-medium ${tab === x.id ? 'border-accent text-text' : 'border-transparent text-text-dim hover:text-text'}`}>
              <x.Icon size={16} className={tab === x.id ? 'text-accent' : ''} />{t(x.nom)}<span className={`fz-chip ${soni(x.id) ? 'fz-chip--warn' : ''}`}>{soni(x.id)}</span>
            </button>
          ))}
        </div>

        <section className="fz-card flex min-h-[240px] flex-1 flex-col" role="tabpanel">
          {yuklanmoqda ? (
            <div className="skel m-4 h-32 rounded-lg" aria-label={t('Yuklanmoqda…')} />
          ) : currentItems.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-text-mute">
              <Trash2 size={40} className="opacity-30" />
              <p>{t('Korzinka bo‘sh')}</p>
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="fz-table">
                <thead><tr><th>{t('Nomi')}</th><th>{t('O‘chirilgan vaqt')}</th><th className="fz-c-num">{t('Amallar')}</th></tr></thead>
                <tbody>
                  {currentItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="font-medium text-text">{nomi(item)}</td>
                      <td className="text-text-dim">{item.ochirilgan_vaqt ? new Date(item.ochirilgan_vaqt).toLocaleString() : '—'}</td>
                      <td className="fz-c-num">
                        <span className="inline-flex gap-1.5">
                          <button type="button" onClick={() => void handleTiklash(item.id, nomi(item))} className="fz-btn fz-btn--sm"><RotateCcw size={14} />{t('Tiklash')}</button>
                          <button type="button" onClick={() => void handleOchirish(item.id, nomi(item))} className="fz-btn fz-btn--danger fz-btn--sm"><AlertTriangle size={14} />{t('Butunlay o‘chirish')}</button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Sahifa>
  );
}
