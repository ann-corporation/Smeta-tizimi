import { useState, useEffect } from 'react';
import { Network, Save, Trash2, RefreshCw, Sparkles, ArrowRight } from 'lucide-react';
import { useKompaniya } from './KompaniyaTanlov';
import { toast } from '../umumiy/ui/Toast';
import { tasdiqSora } from '../umumiy/ui/Tasdiq';
import { t } from '../i18n/til';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { sbMaterialAliaslarOl, sbMaterialAliasYoz, sbMaterialAliasOchir, type MaterialAlias } from '../api/t2-material-alias';
import { OpsBoshQator, OpsMaydon } from '../components/kompaniya-ops/OpsUi';

/**
 * Material nomlari (alias → kanonik kalit) — egasi 2026-10-25: Firuza ko'rinishi.
 * Har xil yozilgan nom bitta standart kalitga bog'lanadi; kompaniya tanlanmagan bo'lsa — global qoida.
 */
export default function TestMaterialAlias() {
  const { joriy } = useKompaniya();
  const [aliaslar, setAliaslar] = useState<MaterialAlias[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [form, setForm] = useState({ aliasNom: '', kanonikNomKey: '', kanonikBirlikKey: '' });
  const [qoshmoqda, setQoshmoqda] = useState(false);

  const yukla = async () => {
    setYuklanmoqda(true);
    try {
      // Joriy kompaniyaning aliaslari (kompaniya yo'q bo'lsa — global)
      const res = await sbMaterialAliaslarOl(joriy?.id || null);
      setAliaslar(res.qatorlar || []);
    } catch (e: any) {
      toast(e.message, 'danger');
    } finally {
      setYuklanmoqda(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [joriy]);

  const handleSaqlash = async () => {
    if (!form.aliasNom || !form.kanonikNomKey) return toast(t('Alias va kanonik kalit majburiy!'), 'warn');
    setQoshmoqda(true);
    try {
      await sbMaterialAliasYoz({ aliasNom: form.aliasNom, kanonikNomKey: form.kanonikNomKey, kanonikBirlikKey: form.kanonikBirlikKey || undefined, kompaniyaId: joriy?.id });
      toast(t('Material aliasingiz saqlandi'), 'ok');
      setForm({ aliasNom: '', kanonikNomKey: '', kanonikBirlikKey: '' });
      void yukla();
    } catch (e: any) {
      toast(e.message, 'danger');
    } finally {
      setQoshmoqda(false);
    }
  };

  const handleOchirish = async (a: MaterialAlias) => {
    if (!(await tasdiqSora({ sarlavha: t('Aliasni o‘chirish'), matn: t('«{a}» → «{k}» bog‘lanishi o‘chirilsinmi?', { a: a.alias_nom, k: a.kanonik_nom_key }), tasdiqMatni: t('O‘chirish'), xavfli: true }))) return;
    try {
      await sbMaterialAliasOchir(a.id);
      toast(t('Alias o‘chirildi'), 'ok');
      void yukla();
    } catch (e: any) {
      toast(e.message, 'danger');
    }
  };

  const global = aliaslar.filter((a) => a.kompaniya_id === null).length;

  return (
    <Sahifa
      sarlavha="Material nomlari (AI sozlama)"
      tavsif="Har xil yozilgan material nomini bitta standart (kanonik) kalitga bog‘lash — qidiruv va moslashtirish shu orqali ishlaydi."
      amallar={<button type="button" onClick={() => void yukla()} className="fz-btn fz-btn--ghost" aria-label={t('Yangilash')}><RefreshCw className={yuklanmoqda ? 'animate-spin' : ''} /> {t('Yangilash')}</button>}
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-4">
          <section className="fz-card" aria-label={t('Yangi bog‘lanish')}>
            <div className="fz-card__head"><h2 className="fz-card__title inline-flex items-center gap-2"><Network size={16} />{t('Yangi bog‘lanish')}</h2></div>
            <div className="space-y-3 p-5">
              <OpsMaydon nom={t('Erkin yozilish (alias)')} majburiy izoh={t('AI ushbu yozuvni qidirganda kanonik kalitga o‘tkazadi.')}>
                <input type="text" value={form.aliasNom} onChange={(e) => setForm((p) => ({ ...p, aliasNom: e.target.value }))} placeholder={t('Masalan: M-200 beton, sement M400')} className="font-mono" />
              </OpsMaydon>
              <OpsMaydon nom={t('Kanonik nom (kalit)')} majburiy izoh={t('Smeta yoki narxlash bazasidagi qat’iy nom/kod.')}>
                <input type="text" value={form.kanonikNomKey} onChange={(e) => setForm((p) => ({ ...p, kanonikNomKey: e.target.value }))} placeholder={t('Masalan: M200')} className="font-semibold" />
              </OpsMaydon>
              <OpsMaydon nom={t('Kanonik birlik')}>
                <input type="text" value={form.kanonikBirlikKey} onChange={(e) => setForm((p) => ({ ...p, kanonikBirlikKey: e.target.value }))} placeholder={t('m3, tn, kg (ixtiyoriy)')} />
              </OpsMaydon>
              <button type="button" onClick={() => void handleSaqlash()} disabled={qoshmoqda || !form.aliasNom || !form.kanonikNomKey} className="fz-btn fz-btn--primary w-full">
                {qoshmoqda ? <RefreshCw className="animate-spin" /> : <Save />} {t('Bog‘lash')}
              </button>
            </div>
          </section>
          <section className="fz-note fz-note--info">
            <Sparkles />
            <span><b>{t('Global va lokal')}</b>{' — '}{t('kompaniya tanlanmagan bo‘lsa bog‘lanish global qoidaga aylanadi va barcha foydalanuvchilarga yordam beradi; kompaniya tanlangan bo‘lsa — faqat shu kompaniya uchun ishlaydi.')}</span>
          </section>
        </div>

        <div className="lg:col-span-8">
          <div className="mb-2 flex gap-2 text-[12px]">
            <span className="fz-chip">{t('{n} ta bog‘lanish', { n: aliaslar.length })}</span>
            <span className="fz-chip">{t('global: {n}', { n: global })}</span>
            <span className="fz-chip fz-chip--accent">{t('lokal: {n}', { n: aliaslar.length - global })}</span>
          </div>
          <div className="fz-table-wrap">
            <table className="fz-table whitespace-nowrap">
              <thead><tr><th>{t('Erkin yozuv (alias)')}</th><th /><th>{t('Kanonik standart (kalit)')}</th><th>{t('Turi')}</th><th style={{ textAlign: 'right' }}>{t('Amallar')}</th></tr></thead>
              <tbody>
                {yuklanmoqda ? <tr><td colSpan={5}><div className="skel h-20 rounded" /></td></tr>
                  : aliaslar.length === 0 ? <OpsBoshQator ustun={5} matn={t('Hali hech qanday alias kiritilmagan.')} />
                    : aliaslar.map((a) => (
                      <tr key={a.id} className="group">
                        <td className="font-medium text-text">{a.alias_nom}</td>
                        <td className="w-6 text-text-mute"><ArrowRight size={14} /></td>
                        <td>
                          <span className="fz-chip fz-chip--accent font-mono">{a.kanonik_nom_key}</span>
                          {a.kanonik_birlik_key && <span className="ml-1.5 text-[11.5px] text-text-mute">/ {a.kanonik_birlik_key}</span>}
                        </td>
                        <td><span className={`fz-stamp ${a.kompaniya_id === null ? 'fz-stamp--info' : ''}`}>{a.kompaniya_id === null ? t('Global') : t('Lokal')}</span></td>
                        <td className="text-right">
                          <button type="button" onClick={() => void handleOchirish(a)} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" title={t('O‘chirish')} aria-label={t('O‘chirish')}><Trash2 /></button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Sahifa>
  );
}
