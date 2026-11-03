import { useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { t } from '../../i18n/til';
import { sbOqi } from '../../api/supabase';

export type KunlikHarakat = {
  id: number;
  kompaniya_id: number;
  obyekt_id: number;
  operatsiya: string | null;
  turi: string | null;
  sana: string | null;
  nomi: string | null;
  birligi: string | null;
  obyomi: number | null;
  postavshik: string | null;
  qabul_qiluvchi: string | null;
  qabul_turi: string | null;
  izoh: string | null;
  operation_id: string | null;
  holat: string | null;
  yaratildi: string | null;
  kim: string | null;
  manba: string | null;
  m29_hujjat_id: number | null;
};

function nomaLum(value: string | null | undefined) { return value?.trim() || t('Noma’lum'); }

export function KirimKunlikJurnal({ kompaniyaId, obyektId, obyektNomi, yangilashKaliti = 0 }: {
  kompaniyaId: number;
  obyektId: number | null;
  obyektNomi?: string;
  yangilashKaliti?: number;
}) {
  const [qatorlar, setQatorlar] = useState<KunlikHarakat[]>([]);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const [toliq, setToliq] = useState(true);
  const [urinish, setUrinish] = useState(0);

  useEffect(() => {
    let active = true;
    setQatorlar([]); setToliq(true); setXato('');
    if (kompaniyaId <= 0 || !Number.isSafeInteger(obyektId) || (obyektId ?? 0) <= 0) { setBand(false); return () => { active = false; }; }
    const company = kompaniyaId; const object = obyektId!;
    setBand(true);
    void sbOqi<KunlikHarakat>({
      jadval: 't2_sklad_harakat',
      filtr: `kompaniya_id=eq.${company}&obyekt_id=eq.${object}`,
      ustunlar: 'id,kompaniya_id,obyekt_id,operatsiya,turi,sana,nomi,birligi,obyomi,postavshik,qabul_qiluvchi,qabul_turi,izoh,operation_id,holat,yaratildi,kim,manba,m29_hujjat_id',
      tartib: 'yaratildi.desc,id.desc', limit: 1000,
    }).then((result) => {
      if (!active) return;
      if (!result.ok) { setXato(t('Jurnalni o‘qib bo‘lmadi.')); setQatorlar([]); }
      else {
        setQatorlar((result.qatorlar ?? []).filter((row) => row.kompaniya_id === company && row.obyekt_id === object));
        setToliq(result.toliq !== false);
      }
      setBand(false);
    }).catch(() => { if (active) { setXato(t('Jurnalni o‘qib bo‘lmadi.')); setQatorlar([]); setBand(false); } });
    return () => { active = false; };
  }, [kompaniyaId, obyektId, yangilashKaliti, urinish]);

  return <section className="space-y-3" aria-label={t('Ombor harakatlari jurnali')}>
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="m-0 flex items-center gap-2 text-base font-semibold"><History size={18} />{t('Ombor harakatlari jurnali')}</h2>
        <p className="mb-0 mt-1 text-[12px] text-text-dim">{t('Kompaniya')}: {kompaniyaId || t('Tanlanmagan')} · {t('Obyekt')}: {obyektNomi || t('Tanlanmagan')}</p></div>
      <button type="button" className="inline-flex h-[48px] min-h-[48px] items-center gap-2 rounded-md border border-border px-3 text-sm disabled:opacity-50" disabled={band || !obyektId} onClick={() => setUrinish((n) => n + 1)}>
        <RefreshCw size={15} />{t('Yangilash')}
      </button>
    </header>
    <p className="m-0 text-[12px] text-text-dim">{t('Jurnal harakat va holatni ko‘rsatadi; bu yetkazib berilgan, qabul qilingan yoki sarflanganini alohida tasdiqlamaydi.')}</p>
    {band && <p role="status" className="text-sm text-text-dim">{t('Jurnal yuklanmoqda…')}</p>}
    {xato && <div role="alert" className="rounded-md border border-danger/30 p-3 text-sm text-danger">{xato}</div>}
    {!toliq && !band && <p role="status" className="rounded-md border border-warn/30 p-3 text-sm">{t('Jurnalning faqat bir qismi olindi; ko‘rsatilgan qatorlar to‘liq emas.')}</p>}
    {!band && !xato && <div className="fz-table-wrap">
      <table className="fz-table min-w-[1100px]">
        <thead><tr>
          <th>{t('Sana')}</th><th>{t('Yaratilgan vaqt')}</th><th>{t('Holat')}</th><th>{t('Harakat')}</th><th>{t('Material')}</th>
          <th className="fz-c-num">{t('Miqdor')}</th><th>{t('Yetkazuvchi')}</th><th>{t('Qabul qiluvchi')}</th><th>{t('Maqsad va izoh')}</th><th>{t('Kim kiritdi')}</th>
        </tr></thead>
        <tbody>
          {qatorlar.map((row) => <tr key={`${row.id}-${row.operation_id ?? ''}`}>
            <td>{row.sana || t('Noma’lum')}</td>
            <td>{row.yaratildi || t('Noma’lum')}</td>
            <td>{nomaLum(row.holat)}</td>
            <td>{row.operatsiya === 'prixod' ? t('KELDI') : row.operatsiya === 'rasxod' ? t('BERDIM') : nomaLum(row.operatsiya)}</td>
            <td><span className="font-medium">{nomaLum(row.nomi)}</span><span className="ml-1 text-[11px] text-text-mute">{nomaLum(row.turi)}</span></td>
            <td className="fz-c-num">{row.obyomi == null ? t('Noma’lum') : `${row.obyomi} ${row.birligi || t('Noma’lum')}`}</td>
            <td>{nomaLum(row.postavshik)}</td><td>{nomaLum(row.qabul_qiluvchi)}</td>
            <td className="max-w-[260px] whitespace-pre-wrap break-words">{row.izoh?.trim() || row.qabul_turi || t('Noma’lum')}{row.izoh?.trim() && row.qabul_turi ? ` · ${row.qabul_turi}` : ''}</td>
            <td>{nomaLum(row.kim)}</td>
          </tr>)}
          {qatorlar.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-sm text-text-mute">{t('Bu obyekt uchun jurnal qatori topilmadi.')}</td></tr>}
        </tbody>
      </table>
    </div>}
    <p className="m-0 text-[11px] text-text-mute">{t('Jurnal qatorlari: {soni}', { soni: qatorlar.length })}</p>
  </section>;
}
