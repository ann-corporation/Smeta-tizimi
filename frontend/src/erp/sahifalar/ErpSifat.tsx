import { useState } from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import { useSifatData, useNuqsonQosh, useNuqsonHolatYangila } from '../../api/hooks';
import { Sahifa, Skelet } from '../../umumiy/ui/Sahifa';
import { ErpQoshModal } from '../ErpQoshModal';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { OpsBoshQator, OpsKpi, OpsKpiQator, OpsQidiruv, OpsTaqsimot } from '../../components/kompaniya-ops/OpsUi';

/** Nuqson holati va darajasi — so'z + rang (Firuza). Qiymatlar bazadagidek (o'zgarmagan). */
const STATUS: Record<string, { stamp: string; rang: string }> = {
  Yangi: { stamp: 'fz-stamp--info', rang: 'var(--info)' },
  Jarayonda: { stamp: 'fz-stamp--warn', rang: 'var(--warn)' },
  'Muddati o\'tgan': { stamp: 'fz-stamp--danger', rang: 'var(--danger)' },
  Tuzatildi: { stamp: 'fz-stamp--ok', rang: 'var(--ok)' },
};
const DARAJA: Record<string, string> = { Oddiy: 'fz-chip', 'O\'rta': 'fz-chip fz-chip--warn', Kritik: 'fz-chip fz-chip--danger' };

export default function ErpSifat() {
  const { data, isLoading } = useSifatData();
  const [qidiruv, setQidiruv] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('Barchasi');
  const [qoshOchiq, setQoshOchiq] = useState(false);
  const nuqsonQosh = useNuqsonQosh();
  const holatYangila = useNuqsonHolatYangila();

  if (isLoading || !data) return <Sahifa sarlavha="Sifat nazorati"><Skelet qatorlar={5} /></Sahifa>;

  const filtrlanganNuqsonlar = data.nuqsonlar.filter((n: any) => {
    const mosKeladi = String(n.tavsif ?? '').toLowerCase().includes(qidiruv.toLowerCase())
      || String(n.obyekt ?? '').toLowerCase().includes(qidiruv.toLowerCase());
    if (filterStatus !== 'Barchasi') return mosKeladi && n.status === filterStatus;
    return mosKeladi;
  });

  const holatOzgartir = async (id: string, status: 'Jarayonda' | 'Tuzatildi') => {
    try {
      await holatYangila.mutateAsync({ id, status });
      toast(t('Holat o‘zgartirildi: {h}', { h: t(status) }), 'ok');
    } catch (e: any) { toast(t('Xato: {x}', { x: e.message }), 'danger'); }
  };
  const soni = (s: string) => data.nuqsonlar.filter((n: any) => n.status === s).length;

  return (
    <Sahifa
      sarlavha="Sifat nazorati (texnadzor)"
      tavsif="Obyektlardagi nuqsonlar va ularni tuzatish yo‘li: yangi → jarayonda → tuzatildi. Muddati o‘tganlari qizil."
      amallar={<button type="button" onClick={() => setQoshOchiq(true)} className="fz-btn fz-btn--primary"><Plus /> {t('Nuqson qayd etish')}</button>}
    >
      <div className="flex flex-col gap-3">
        <OpsKpiQator yorliq={t('Sifat ko‘rsatkichlari')}>
          <OpsKpi nom={t('Jami nuqsonlar')} qiymat={t('{n} ta', { n: data.jamiNuqsonlar })} />
          <OpsKpi nom={t('Tuzatilgan')} rang="var(--ok)" qiymat={t('{n} ta', { n: data.tuzatilganlar })} />
          <OpsKpi nom={t('Muddati o‘tgan')} rang="var(--danger)" qiymat={<span className={data.muddatOtilgan ? 'text-danger' : ''}>{t('{n} ta', { n: data.muddatOtilgan })}</span>} />
          <OpsKpi nom={t('Kritik')} rang="var(--danger)" qiymat={t('{n} ta', { n: data.kritik })} />
        </OpsKpiQator>

        <OpsTaqsimot sarlavha={t('Nuqsonlar holati')} tanlangan={filterStatus === 'Barchasi' ? null : filterStatus}
          onTanla={(k) => setFilterStatus((f) => (f === k ? 'Barchasi' : k))}
          ong={filterStatus !== 'Barchasi' ? <button type="button" className="fz-chip fz-chip--accent" onClick={() => setFilterStatus('Barchasi')}>{t('Barchasi')}</button> : t('bosing — filtr')}
          segmentlar={Object.entries(STATUS).map(([s, v]) => ({ kalit: s, nom: t(s), soni: soni(s), rang: v.rang }))} />

        <OpsQidiruv qiymat={qidiruv} onChange={setQidiruv} placeholder={t('Nuqson tavsifi yoki obyekt…')} />

        <div className="fz-table-wrap">
          <table className="fz-table">
            <thead>
              <tr><th>{t('Nuqson / daraja')}</th><th>{t('Obyekt va prorab')}</th><th>{t('Sana / muddat')}</th><th>{t('Holat')}</th><th style={{ textAlign: 'right' }}>{t('Keyingi qadam')}</th></tr>
            </thead>
            <tbody>
              {filtrlanganNuqsonlar.map((n: any) => (
                <tr key={n.id}>
                  <td className="max-w-md whitespace-normal">
                    <span className="block font-medium text-text">{n.tavsif}</span>
                    {n.daraja && <span className={`mt-1 ${DARAJA[n.daraja] ?? 'fz-chip'}`}>{t(n.daraja)}</span>}
                  </td>
                  <td><span className="block font-medium">{n.obyekt || '—'}</span><span className="text-[11.5px] text-text-mute">{n.prorab}</span></td>
                  <td className="text-[12px] text-text-dim">
                    <span className="block">{t('Yozilgan')}: <b className="tabular-nums text-text">{n.sana || '—'}</b></span>
                    <span className="block">{t('Muddat')}: <b className="tabular-nums text-text">{n.muddat || '—'}</b></span>
                  </td>
                  <td>
                    <span className={`fz-stamp ${STATUS[n.status]?.stamp ?? ''}`}>{n.status ? t(n.status) : '—'}</span>
                    {n.izoh && <span className="mt-1 block text-[11px] text-text-mute">{n.izoh}</span>}
                  </td>
                  <td className="text-right">
                    <span className="inline-flex flex-wrap justify-end gap-1">
                      {n.status !== 'Tuzatildi' && n.status === 'Yangi' && (
                        <button type="button" onClick={() => void holatOzgartir(n.id, 'Jarayonda')} disabled={holatYangila.isPending} className="fz-btn fz-btn--sm">{t('Ishga olindi')}</button>
                      )}
                      {n.status !== 'Tuzatildi' && (
                        <button type="button" onClick={() => void holatOzgartir(n.id, 'Tuzatildi')} disabled={holatYangila.isPending} className="fz-btn fz-btn--sm fz-btn--primary">{t('Tuzatildi deb belgilash')}</button>
                      )}
                      {/* ⚡⚡⚡ 2026-08-16 (audit M): «Tuzatildi» dan keyin ham QAYTA OCHISH mumkin — tekshiruvdan o'tmasa nazoratdan chiqib ketmaydi. */}
                      {n.status === 'Tuzatildi' && (
                        <button type="button" onClick={() => void holatOzgartir(n.id, 'Jarayonda')} disabled={holatYangila.isPending} title={t('Tuzatish tekshiruvdan o‘tmadi — qayta ishga qaytarish')} className="fz-btn fz-btn--sm fz-btn--ghost"><RotateCcw /> {t('Qayta ochish')}</button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
              {filtrlanganNuqsonlar.length === 0 && (
                <OpsBoshQator ustun={5} matn={data.nuqsonlar.length === 0 ? t('Hali birorta nuqson qayd etilmagan — «Nuqson qayd etish» tugmasini bosing.') : t('Filtrga mos nuqson topilmadi.')} />
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ErpQoshModal
        isOpen={qoshOchiq}
        title={t('Yangi nuqson qayd etish')}
        isSaving={nuqsonQosh.isPending}
        initial={{ sana: new Date().toISOString().split('T')[0], daraja: 'Oddiy', status: 'Yangi' }}
        onClose={() => setQoshOchiq(false)}
        fields={[
          { key: 'tavsif', label: 'Nuqson tavsifi', type: 'textarea', required: true, placeholder: 'B1 ustunda beton markasi past chiqdi...' },
          { key: 'obyekt', label: 'Obyekt', type: 'text' },
          { key: 'prorab', label: 'Mas’ul prorab', type: 'text' },
          { key: 'daraja', label: 'Muhimlik darajasi', type: 'select', options: ['Oddiy', 'O\'rta', 'Kritik'] },
          { key: 'sana', label: 'Qayd etilgan sana', type: 'date' },
          { key: 'muddat', label: 'Tuzatish muddati', type: 'date' },
          { key: 'izoh', label: 'Izoh', type: 'textarea' },
        ]}
        onSubmit={async (v) => {
          try {
            await nuqsonQosh.mutateAsync(v as any);
            toast(t('Nuqson qayd etildi'), 'ok');
            setQoshOchiq(false);
          } catch (e: any) { toast(t('Xato: {x}', { x: e.message }), 'danger'); }
        }}
      />
    </Sahifa>
  );
}
