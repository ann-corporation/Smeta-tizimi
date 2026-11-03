import { Check, FileSpreadsheet } from 'lucide-react';
import { OpsOyna } from '../kompaniya-ops/OpsUi';
import { t } from '../../i18n/til';
import { OmborOvozYordam } from './OmborOvozYordam';
import { materialMaydonTaklif, materialTaklifQidir, type MaterialTaklif } from '../../lib/ombor-prixod/taklif';
import {
  qoralamaQator, qoralamaTasdiqla, qoralamaTahrirla,
  type PrixodMaydonlar, type PrixodQoralama,
} from '../../lib/ombor-prixod/qoralama';

const MAYDONLAR: { id: keyof PrixodMaydonlar; label: string; type?: string; inputMode?: 'decimal' }[] = [
  { id: 'sana', label: 'Sana', type: 'date' },
  { id: 'nom', label: 'Material nomi', type: 'text' },
  { id: 'birlik', label: 'O‘lchov birligi', type: 'text' },
  { id: 'miqdor', label: 'Miqdor', type: 'text', inputMode: 'decimal' },
  { id: 'yetkazuvchi', label: 'Yetkazuvchi', type: 'text' },
  { id: 'hujjat', label: 'Hujjat raqami', type: 'text' },
];

const XATO_MATNLARI: Record<string, string> = {
  SANA_YOQ: 'Sana kiritilmagan', SANA_XATO: 'Sana formati noto‘g‘ri', NOM_YOQ: 'Tovar nomi kiritilmagan',
  BIRLIK_YOQ: 'O‘lchov birligi kiritilmagan', MIQDOR_YOQ: 'Miqdor kiritilmagan',
  MIQDOR_XATO: 'Miqdor musbat son bo‘lishi kerak', MIQDOR_SANA: 'Miqdor sana ko‘rinishida; ustunni tekshiring',
};

export function PrixodQatorEditor({
  kompaniyaId, qoralama, takliflar, onOzgar, onYop,
}: {
  kompaniyaId: number;
  qoralama: PrixodQoralama;
  takliflar: MaterialTaklif[];
  onOzgar: (q: PrixodQoralama) => void;
  onYop: () => void;
}) {
  const natija = qoralamaQator(qoralama);
  const nomTakliflari = materialTaklifQidir(takliflar, qoralama.maydonlar.nom);
  const birlikTakliflari = materialMaydonTaklif(takliflar, qoralama.maydonlar.nom, 'birliklar', qoralama.maydonlar.birlik);
  const yetkazuvchiTakliflari = materialMaydonTaklif(takliflar, qoralama.maydonlar.nom, 'yetkazuvchilar', qoralama.maydonlar.yetkazuvchi);

  const setMaydon = (id: keyof PrixodMaydonlar, value: string) => onOzgar(qoralamaTahrirla(qoralama, { [id]: value }));
  const tasdiqlashMumkin = natija.xatolar.length === 0;

  return <div className="[&_[data-yop]]:min-h-[48px] [&_[data-yop]]:min-w-[48px]"><OpsOyna ochiq sarlavha={t('Kirim qatorini tahrirlash')} onYop={onYop} kenglik={680}
    ikon={<FileSpreadsheet aria-hidden="true" />} amallar={
      <>
        <button type="button" className="fz-btn min-h-[48px] px-4" onClick={onYop}>{t('Yopish')}</button>
        <button type="button" className="fz-btn fz-btn--primary min-h-[48px] px-4" disabled={!tasdiqlashMumkin}
          onClick={() => onOzgar(qoralamaTasdiqla(qoralama))}>
          <Check size={16} aria-hidden="true" />{t('Hammasi to‘g‘ri — tasdiqlash')}
        </button>
      </>
    }>
    <p className="m-0 text-[12px] text-text-dim">{t('Manba qatori: {qator}', { qator: qoralama.manba.manbaQator })} · {t('Faqat mahalliy qoralama; hali saqlanmagan.')}</p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {MAYDONLAR.map(({ id, label, type, inputMode }) => <div key={id} className="min-w-0">
        <label className="block text-[12px] font-medium text-text-dim" htmlFor={`prixod-${qoralama.manba.manbaQator}-${id}`}>{t(label)}</label>
        <input id={`prixod-${qoralama.manba.manbaQator}-${id}`} type={type} inputMode={inputMode} value={qoralama.maydonlar[id]}
          onChange={(e) => setMaydon(id, e.target.value)} className="mt-1 h-[48px] w-full rounded-md border border-[var(--border-strong)] bg-bg px-3 text-[13px] text-text outline-none focus:border-[var(--accent)]" />
        {id === 'nom' && nomTakliflari.length > 0 && <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={t('Material nomi takliflari')}>
          {nomTakliflari.map((item) => <button key={item.nom} type="button" className="min-h-[48px] rounded-md border border-border bg-surface-2 px-3 text-left text-[12px] text-text hover:bg-surface-3"
            onClick={() => setMaydon('nom', item.nom)}>{item.nom}<span className="ml-1 text-text-mute">{item.manbaQatorlar.length}</span></button>)}
        </div>}
        {id === 'birlik' && birlikTakliflari.length > 0 && <Takliflar title={t('Birlik takliflari')} items={birlikTakliflari} onTanla={(value) => setMaydon('birlik', value)} />}
        {id === 'yetkazuvchi' && yetkazuvchiTakliflari.length > 0 && <Takliflar title={t('Yetkazuvchi takliflari')} items={yetkazuvchiTakliflari} onTanla={(value) => setMaydon('yetkazuvchi', value)} />}
      </div>)}
    </div>

    <section className="rounded-md border border-border bg-surface-2 p-3" aria-label={t('Tasdiqlashdan oldin barcha qiymatlar')}>
      <h3 className="m-0 text-[13px] font-semibold text-text">{t('Tasdiqlashdan oldin barcha qiymatlar')}</h3>
      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-2">
        {MAYDONLAR.map(({ id, label }) => <div key={id} className="min-w-0">
          <dt className="text-text-mute">{t(label)}</dt>
          <dd className="m-0 break-words font-medium text-text">{qoralama.maydonlar[id].trim() || (id === 'yetkazuvchi' ? t('Ko‘rsatilmagan') : t('Bo‘sh'))}</dd>
        </div>)}
      </dl>
      {natija.xatolar.length > 0 && <ul className="mb-0 mt-3 list-disc pl-5 text-[12px] text-danger" role="alert">
        {natija.xatolar.map((code, index) => <li key={`${code}-${index}`}>{t(XATO_MATNLARI[code] ?? 'Qiymatni tekshiring')}</li>)}
      </ul>}
      {!tasdiqlashMumkin && <p className="mb-0 mt-2 text-[12px] text-danger">{t('Xatolarni tuzatmaguncha tasdiqlab bo‘lmaydi.')}</p>}
    </section>
    <OmborOvozYordam kompaniyaId={kompaniyaId} takliflar={takliflar}
      onTaklif={(fields) => onOzgar(qoralamaTahrirla(qoralama, fields))} />
  </OpsOyna></div>;
}

function Takliflar({ title, items, onTanla }: { title: string; items: string[]; onTanla: (value: string) => void }) {
  return <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={title}>
    {items.map((item) => <button key={item} type="button" className="min-h-[48px] rounded-md border border-border bg-surface-2 px-3 text-[12px] text-text hover:bg-surface-3"
      onClick={() => onTanla(item)}>{item}</button>)}
  </div>;
}
