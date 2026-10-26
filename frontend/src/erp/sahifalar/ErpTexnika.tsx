import { useState } from 'react';
import { Fuel, MapPin, Plus, Pencil, Gauge } from 'lucide-react';
import { FmtN } from '../../lib/format';
import { useTexnikaData, useTexnikaQosh, useTexnikaTarixQosh, useTexnikaTahrir } from '../../api/hooks';
import { Sahifa, Skelet } from '../../umumiy/ui/Sahifa';
import { ErpQoshModal, type ErpField } from '../ErpQoshModal';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { yoqilgiUlush } from '../../lib/kompaniya-ops-korinish';
import { OpsBoshQator, OpsChiziq, OpsKpi, OpsKpiQator, OpsQidiruv, OpsTaqsimot } from '../../components/kompaniya-ops/OpsUi';

/** Texnika holati: so'z + rang (Firuza). */
const HOLAT: Record<string, { stamp: string; rang: string; filtr: string }> = {
  Ishlayapti: { stamp: 'fz-stamp--ok', rang: 'var(--ok)', filtr: 'ishlayapti' },
  Remontda: { stamp: 'fz-stamp--danger', rang: 'var(--danger)', filtr: 'remontda' },
  Kutishda: { stamp: 'fz-stamp--warn', rang: 'var(--warn)', filtr: 'kutishda' },
  Ijara: { stamp: 'fz-stamp--info', rang: 'var(--info)', filtr: 'ijara' },
};

export default function ErpTexnika() {
  const { data, isLoading } = useTexnikaData();
  const [qidiruv, setQidiruv] = useState('');
  const [filtir, setFiltir] = useState('barchasi');
  const [qoshOchiq, setQoshOchiq] = useState(false);
  const [tarixOchiq, setTarixOchiq] = useState(false);
  const [tanlanganTexnika, setTanlanganTexnika] = useState('');
  const [tahrirTexnika, setTahrirTexnika] = useState<any | null>(null);
  const texnikaQosh = useTexnikaQosh();
  const texnikaTahrir = useTexnikaTahrir();
  const tarixQosh = useTexnikaTarixQosh();

  if (isLoading || !data) return <Sahifa sarlavha="Texnika va yoqilg‘i"><Skelet qatorlar={5} /></Sahifa>;

  const filtrlanganTexnikalar = data.texnikalar.filter((x: any) => {
    const mosKeladi = String(x.nom ?? '').toLowerCase().includes(qidiruv.toLowerCase())
      || String(x.davlatRaqami ?? '').toLowerCase().includes(qidiruv.toLowerCase());
    if (filtir === 'ishlayapti') return mosKeladi && x.holat === 'Ishlayapti';
    if (filtir === 'remontda') return mosKeladi && x.holat === 'Remontda';
    if (filtir === 'kutishda') return mosKeladi && x.holat === 'Kutishda';
    if (filtir === 'ijara') return mosKeladi && x.holat === 'Ijara';
    return mosKeladi;
  });
  const soni = (h: string) => data.texnikalar.filter((x: any) => x.holat === h).length;
  const boshqa = data.texnikalar.filter((x: any) => !HOLAT[x.holat]).length;
  /* Bak hajmi ma'lumotda yo'q — chiziq shkalasi: ro'yxatdagi eng katta qoldiq (kamida 300 L, avvalgi shkala). */
  const yoqMaks = Math.max(300, ...data.texnikalar.map((x: any) => Number(x.yoqilgiQoldiq) || 0));

  return (
    <Sahifa
      sarlavha="Texnika va yoqilg‘i (GSM)"
      tavsif="Maxsus texnika holati, joylashuvi, yoqilg‘i qoldig‘i va motochas yozuvlari."
      amallar={<>
        <button type="button" onClick={() => setTarixOchiq(true)} className="fz-btn"><Fuel /> {t('Zapravka / smena')}</button>
        <button type="button" onClick={() => setQoshOchiq(true)} className="fz-btn fz-btn--primary"><Plus /> {t('Texnika qo‘shish')}</button>
      </>}
    >
      <div className="flex flex-col gap-3">
        <OpsKpiQator yorliq={t('Texnika ko‘rsatkichlari')}>
          <OpsKpi nom={t('Jami texnika')} qiymat={t('{n} ta', { n: data.jamiTexnika })} />
          <OpsKpi nom={t('Faol (obyektda)')} rang="var(--ok)" qiymat={t('{n} ta', { n: data.faolTexnika })} />
          <OpsKpi nom={t('Remontda')} rang="var(--danger)" qiymat={<span className={data.remontda ? 'text-danger' : ''}>{t('{n} ta', { n: data.remontda })}</span>} />
          <OpsKpi nom={t('Oylik yoqilg‘i sarfi')} rang="var(--kat-mash)" qiymat={<><FmtN val={data.oylikYoqilgi} /> L</>} />
        </OpsKpiQator>

        <OpsTaqsimot sarlavha={t('Park holati')} tanlangan={filtir === 'barchasi' ? null : filtir}
          onTanla={(k) => setFiltir((f) => (f === k || k === 'boshqa' ? 'barchasi' : k))}
          ong={filtir !== 'barchasi' ? <button type="button" className="fz-chip fz-chip--accent" onClick={() => setFiltir('barchasi')}>{t('barchasi')}</button> : t('bosing — filtr')}
          segmentlar={[
            ...Object.entries(HOLAT).map(([h, v]) => ({ kalit: v.filtr, nom: t(h), soni: soni(h), rang: v.rang })),
            ...(boshqa ? [{ kalit: 'boshqa', nom: t('Holati ko‘rsatilmagan'), soni: boshqa, rang: 'var(--border-strong)' }] : []),
          ]} />

        <OpsQidiruv qiymat={qidiruv} onChange={setQidiruv} placeholder={t('Texnika nomi yoki raqami…')} />

        <div className="fz-table-wrap">
          <table className="fz-table">
            <thead>
              <tr>
                <th>{t('Texnika va turi')}</th><th>{t('Davlat raqami')}</th><th>{t('Joy va haydovchi')}</th>
                <th style={{ minWidth: 150 }}>{t('Yoqilg‘i qoldig‘i')}</th><th>{t('Holat')}</th><th style={{ textAlign: 'right' }}>{t('Amallar')}</th>
              </tr>
            </thead>
            <tbody>
              {filtrlanganTexnikalar.map((x: any) => {
                const h = HOLAT[x.holat];
                const ul = yoqilgiUlush(x.yoqilgiQoldiq == null ? null : Number(x.yoqilgiQoldiq), yoqMaks);
                return (
                  <tr key={x.id}>
                    <td><span className="block font-medium text-text">{x.nom}</span><span className="text-[11.5px] text-text-mute">{x.turi ? t(x.turi) : '—'}</span></td>
                    <td>{x.davlatRaqami ? <span className="fz-c-shifr rounded border border-border px-1.5 py-0.5">{x.davlatRaqami}</span> : '—'}</td>
                    <td>
                      <span className="inline-flex items-center gap-1 text-text-dim"><MapPin size={13} className="text-text-mute" />{x.obyekt || '—'}</span>
                      <span className="block pl-[18px] text-[11.5px] text-text-mute">{x.haydovchi || ''}</span>
                    </td>
                    <td>
                      <span className="flex items-center gap-2">
                        <OpsChiziq ulush={ul} rang={ul != null && ul < 0.15 ? 'var(--danger)' : 'var(--kat-mash)'} />
                        <span className="whitespace-nowrap text-[12px] tabular-nums">{x.yoqilgiQoldiq ?? '—'} L</span>
                      </span>
                    </td>
                    <td><span className={`fz-stamp ${h?.stamp ?? ''}`}>{x.holat ? t(x.holat) : '—'}</span></td>
                    <td className="text-right">
                      <span className="inline-flex gap-1">
                        <button type="button" onClick={() => { setTanlanganTexnika(x.id); setTarixOchiq(true); }} className="fz-btn fz-btn--sm"><Fuel /> {t('Zapravka')}</button>
                        <button type="button" onClick={() => { setTanlanganTexnika(x.id); setTarixOchiq(true); }} className="fz-btn fz-btn--sm"><Gauge /> {t('Motochas')}</button>
                        {/* ⚡ 2026-08-17 (audit): tahrirlash — holat, norma, haydovchi (avval faqat Google Sheets orqali). */}
                        <button type="button" onClick={() => setTahrirTexnika(x)} aria-label={t('Texnikani tahrirlash')} title={t('Tahrirlash (holat, norma, haydovchi…)')} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm"><Pencil /></button>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtrlanganTexnikalar.length === 0 && (
                <OpsBoshQator ustun={6} matn={data.texnikalar.length === 0 ? t('Hali birorta texnika kiritilmagan — «Texnika qo‘shish» tugmasini bosing.') : t('Qidiruvga mos texnika topilmadi.')} />
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ErpQoshModal
        isOpen={qoshOchiq}
        title={t('Yangi texnika qo‘shish')}
        isSaving={texnikaQosh.isPending}
        onClose={() => setQoshOchiq(false)}
        fields={TEXNIKA_MAYDONLAR}
        onSubmit={async (v) => {
          try {
            await texnikaQosh.mutateAsync(v as any);
            toast(t('Texnika qo‘shildi'), 'ok');
            setQoshOchiq(false);
          } catch (e: any) { toast(t('Xato: {x}', { x: e.message }), 'danger'); }
        }}
      />

      {/* ⚡⚡⚡ 2026-08-17 (audit): TAHRIR modali. `apiTexnikaTahrir` GAS da BOR,
          hook'i YOZILGAN edi — lekin sahifa chaqirmasdi. Ya'ni texnika bir
          marta kiritilsa, uning HOLATINI («Ishlayapti» → «Remontda») ham,
          yoqilg'i NORMASINI ham saytdan o'zgartirib bo'lmasdi; norma xato
          bo'lsa yoqilg'i hisobi doim xato chiqardi.
          Maydonlar ro'yxati qo'shish bilan AYNI BIR manbadan olinadi. */}
      <ErpQoshModal
        isOpen={!!tahrirTexnika}
        title={t('Tahrirlash: {nom}', { nom: tahrirTexnika?.nom ?? '' })}
        isSaving={texnikaTahrir.isPending}
        onClose={() => setTahrirTexnika(null)}
        fields={TEXNIKA_MAYDONLAR}
        initial={tahrirTexnika ?? undefined}
        onSubmit={async (v) => {
          if (!tahrirTexnika) return;
          try {
            await texnikaTahrir.mutateAsync({ ...(v as any), id: tahrirTexnika.id });
            toast(t('Saqlandi'), 'ok');
            setTahrirTexnika(null);
          } catch (e: any) { toast(t('Xato: {x}', { x: e.message }), 'danger', undefined, 9000); }
        }}
      />

      <ErpQoshModal
        isOpen={tarixOchiq}
        title={t('Zapravka / smena yozuvi')}
        isSaving={tarixQosh.isPending}
        initial={{ texnikaId: tanlanganTexnika, sana: new Date().toISOString().split('T')[0] }}
        onClose={() => { setTarixOchiq(false); setTanlanganTexnika(''); }}
        fields={[
          { key: 'texnikaId', label: 'Texnika', type: 'select', required: true, options: data.texnikalar.map((t: any) => ({ value: t.id, label: `${t.nom}${t.davlatRaqami ? ' · ' + t.davlatRaqami : ''}` })) },
          { key: 'sana', label: 'Sana', type: 'date', required: true },
          { key: 'kirimLitr', label: 'Quyilgan yoqilg‘i (litr)', type: 'number', placeholder: '0' },
          { key: 'chiqimLitr', label: 'Qo‘lda chiqim (litr)', type: 'number', placeholder: '0' },
          { key: 'motochas', label: 'Motochas (soat)', type: 'number', placeholder: '0' },
          { key: 'izoh', label: 'Izoh', type: 'textarea' },
        ]}
        onSubmit={async (v) => {
          try {
            await tarixQosh.mutateAsync(v as any);
            toast(t('Yozuv qo‘shildi'), 'ok');
            setTarixOchiq(false);
            setTanlanganTexnika('');
          } catch (e: any) { toast(t('Xato: {x}', { x: e.message }), 'danger'); }
        }}
      />
    </Sahifa>
  );
}

/* Qo'shish va tahrirlash uchun YAGONA maydonlar ro'yxati — ikki joyda
   alohida yozilsa, biri yangilanib ikkinchisi eskirib qolardi. */
const TEXNIKA_MAYDONLAR: ErpField[] = [
  { key: 'nom', label: 'Nomi', type: 'text', required: true, placeholder: 'Hyundai Ekskavator' },
  { key: 'davlatRaqami', label: 'Davlat raqami', type: 'text', placeholder: '01 A 123 AA' },
  { key: 'turi', label: 'Turi', type: 'select', options: ['Ekskavator', 'Kran', 'Samosval', 'Buldozer', 'Boshqa'] },
  { key: 'holat', label: 'Holati', type: 'select', options: ['Ishlayapti', 'Remontda', 'Kutishda', 'Ijara'] },
  { key: 'obyekt', label: 'Obyekt', type: 'text' },
  { key: 'haydovchi', label: 'Haydovchi', type: 'text' },
  { key: 'soatlikNorma', label: 'Motochasiga yoqilg‘i normasi (litr)', type: 'number', placeholder: '15' },
  { key: 'oldingiQoldiq', label: 'Boshlang‘ich yoqilg‘i qoldig‘i (litr)', type: 'number', placeholder: '0' },
];
