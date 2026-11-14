/**
 * Forma 3 → ESF (elektron hisob-faktura) tayyorlash bo'limi (Forma3ShartnomaPanel ichida; yangi sahifa/menyu emas).
 * Tashqi servis chaqirilmaydi: paket brauzerda quriladi, buxgalter JSON/Excel faylni didox/faktura.uz ga o'zi yuklaydi.
 * Bazaga faqat: shartnoma ID maydonlari (my3 / kapital.imv / kadastr) va F3 ESF holati + tashqi ID.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileJson } from 'lucide-react';
import { t } from '../../i18n/til';
import type { Shartnoma } from '../../api/t2-shartnoma';
import { forma3EsfHolatYoz, shartnomaEsfIdYoz } from '../../api/t2-document-control';
import type { Forma3Rekvizit, F3ShartnomaYigindi } from '../../lib/forma3-export';
import {
  ESF_ID_NOMI, ESF_ID_TURLARI, ESF_T_ESLATMA, esfCsv, esfJson, esfPaketQur, esfQatorlarF3dan, esfTekshir,
  type EsfIdTuri, type EsfKiritma,
} from '../../lib/esf/esf-tayyorlash';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { toast } from '../../umumiy/ui/Toast';

type Holat = 'tayyor' | 'yuborildi' | 'qabul' | 'rad';
const HOLAT_NOMI: Record<Holat, string> = { tayyor: 'Tayyor', yuborildi: 'Yuborildi', qabul: 'Qabul qilindi', rad: 'Rad etildi' };

export function Forma3EsfBolim({ kompaniyaId, boshHolat = null, boshTashqiId = '', forma3Id, forma3Raqam, oy, shartnoma, yigindi, pudratchi, zakazchik, qqsFoiz }: {
  kompaniyaId: number;
  boshHolat?: Holat | null;
  boshTashqiId?: string | null;
  forma3Id: number | null;
  forma3Raqam?: string | null;
  oy: string;
  shartnoma: Shartnoma;
  yigindi: F3ShartnomaYigindi;
  pudratchi: Forma3Rekvizit | null;
  zakazchik: Forma3Rekvizit | null;
  qqsFoiz: number | null;
}) {
  const [idTuri, setIdTuri] = useState<EsfIdTuri | ''>(shartnoma.esf_id_turi ?? '');
  const [my3, setMy3] = useState(shartnoma.my3_shartnoma_id ?? '');
  const [kapital, setKapital] = useState(shartnoma.kapital_imv_id ?? '');
  const [kadastr, setKadastr] = useState(shartnoma.kadastr_raqam ?? '');
  const [ikpu, setIkpu] = useState<Record<number, string>>({});
  const [birlik, setBirlik] = useState<Record<number, string>>({});
  const [tashqiId, setTashqiId] = useState(boshTashqiId ?? '');
  const [band, setBand] = useState(false);
  const [holat, setHolat] = useState<Holat | null>(boshHolat);

  const kiritma: EsfKiritma = useMemo(() => {
    const qatorlar = esfQatorlarF3dan(yigindi).map((q, i) => ({ ...q, ikpu: ikpu[i] ?? null, birlikKodi: birlik[i] ?? null }));
    return {
      forma3Raqam, davr: oy, hujjatSana: null,
      sotuvchi: { nom: pudratchi?.toliqNom, stir: pudratchi?.inn, bank: pudratchi?.bank, hisobRaqam: pudratchi?.hisobRaqam, mfo: pudratchi?.mfo, manzil: pudratchi?.manzil },
      xaridor: { nom: zakazchik?.toliqNom, stir: zakazchik?.inn, bank: zakazchik?.bank, hisobRaqam: zakazchik?.hisobRaqam, mfo: zakazchik?.mfo, manzil: zakazchik?.manzil },
      shartnoma: { raqam: shartnoma.raqam, sana: shartnoma.sana ?? null, idTuri: idTuri || null, my3Id: my3, kapitalId: kapital, kadastr },
      qqsFoiz, qatorlar,
    };
  }, [yigindi, ikpu, birlik, forma3Raqam, oy, pudratchi, zakazchik, shartnoma, idTuri, my3, kapital, kadastr, qqsFoiz]);
  const tekshiruv = useMemo(() => esfTekshir(kiritma), [kiritma]);

  const idSaqla = async () => {
    setBand(true);
    try {
      await shartnomaEsfIdYoz({ shartnomaId: shartnoma.id, idTuri: idTuri || null, my3, kapital, kadastr });
      toast(t('Shartnoma ID saqlandi'), 'ok');
    } catch { toast(t('Shartnoma ID saqlanmadi (rahbar/buxgalter ruxsati kerak).'), 'danger'); }
    finally { setBand(false); }
  };
  const holatYoz = async (h: Holat) => {
    if (forma3Id == null) return;
    setBand(true);
    try {
      await forma3EsfHolatYoz({ forma3Id, holat: h, tashqiId: tashqiId.trim() || null });
      setHolat(h);
      toast(t('ESF holati saqlandi'), 'ok');
    } catch { toast(t('ESF holati saqlanmadi.'), 'danger'); }
    finally { setBand(false); }
  };
  const yuklab = async (tur: 'json' | 'csv') => {
    const p = esfPaketQur(kiritma);
    const json = esfJson(p);
    const nom = `ESF_${(shartnoma.raqam || 'shartnoma').replace(/[^\w.-]+/g, '_')}_${oy}`;
    // Token: yagona hujjat mexanizmi. Xesh KANONIK JSON dan olinadi (format fayldan mustaqil) — shu ESF qayta yuklansa (JSON yoki CSV) bepul.
    const r = await hujjatTokenBilan(
      { kompaniyaId, bytes: new TextEncoder().encode(json), hujjat: 'ESF', sabab: `ESF · Форма №3 ${forma3Raqam ?? forma3Id ?? ''} · № ${shartnoma.raqam} · ${oy}`, yacheykalar: 0 },
      () => {
        if (tur === 'json') downloadBlob(new TextEncoder().encode(json), `${nom}.json`, 'application/json');
        else downloadBlob(new TextEncoder().encode(esfCsv(p)), `${nom}.csv`, 'text/csv;charset=utf-8');
      },
    );
    if (!r.ok) { toast(r.xabar, 'danger'); return; }
    if (r.xabar) toast(r.xabar, 'ok');
  };
  return (
    <section aria-label={t('E-faktura (ESF) tayyorlash')} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
      <div>
        <h3 className="fz-card__title" style={{ fontSize: 15 }}>{t('E-faktura (ESF) tayyorlash')}</h3>
        <p className="fz-card__sub">{t('Forma 3 dan ESF ma‘lumotlari. Fayl didox/faktura.uz ga qo‘lda yuklanadi — tizim tashqi servisga ulanmaydi.')}</p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="fz-kpi__label">{t('Shartnoma ID turi')}</span>
          <select className="input" value={idTuri} disabled={band} onChange={(e) => setIdTuri(e.target.value as EsfIdTuri | '')}>
            <option value="">{t('— tanlang —')}</option>
            {ESF_ID_TURLARI.map((x) => <option key={x} value={x}>{ESF_ID_NOMI[x]}</option>)}
          </select>
        </label>
        {idTuri === 'my3' && <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="fz-kpi__label">{ESF_ID_NOMI.my3}</span><input className="input" value={my3} disabled={band} onChange={(e) => setMy3(e.target.value)} /></label>}
        {idTuri === 'kapital' && <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="fz-kpi__label">{ESF_ID_NOMI.kapital}</span><input className="input" value={kapital} disabled={band} onChange={(e) => setKapital(e.target.value)} /></label>}
        {idTuri === 'kadastr' && <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="fz-kpi__label">{ESF_ID_NOMI.kadastr}</span><input className="input" value={kadastr} disabled={band} onChange={(e) => setKadastr(e.target.value)} /></label>}
        <button type="button" className="fz-btn fz-btn--ghost" disabled={band} onClick={() => void idSaqla()}>{t('ID ni saqlash')}</button>
      </div>
      <p className="fz-card__sub" style={{ margin: 0 }}>{ESF_T_ESLATMA}</p>

      <div role="group" aria-label={t('Jo‘natishdan oldingi tekshiruv')}>
        <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
          {tekshiruv.tayyor ? t('Majburiy maydonlar to‘liq') : t('Yetishmaydi: {n} ta majburiy maydon', { n: tekshiruv.yoqSoni })}
          {tekshiruv.ogohSoni > 0 && ` · ${t('ogohlantirish: {n}', { n: tekshiruv.ogohSoni })}`}
        </p>
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
          {tekshiruv.qatorlar.map((x) => (
            <li key={x.kalit} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              {x.holat === 'ok' ? <CheckCircle2 size={14} aria-label={t('Tayyor')} /> : <AlertTriangle size={14} aria-label={x.holat === 'yoq' ? t('Yetishmaydi') : t('Ogohlantirish')} />}
              <span>{x.nom}{x.izoh ? ` — ${x.izoh}` : ''}</span>
            </li>
          ))}
        </ul>
      </div>

      {kiritma.qatorlar.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer' }}>{t('Qatorlar uchun IKPU va o‘lchov birligi kodi (ixtiyoriy)')}</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            {kiritma.qatorlar.map((q, i) => (
              <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <span style={{ minWidth: 220 }}>{q.nom}</span>
                <input className="input" placeholder={t('IKPU kodi')} aria-label={`IKPU ${i + 1}`} value={ikpu[i] ?? ''} onChange={(e) => setIkpu((s) => ({ ...s, [i]: e.target.value }))} />
                <input className="input" placeholder={t('Birlik kodi')} aria-label={`${t('Birlik kodi')} ${i + 1}`} value={birlik[i] ?? ''} onChange={(e) => setBirlik((s) => ({ ...s, [i]: e.target.value }))} />
              </div>
            ))}
          </div>
        </details>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="fz-btn fz-btn--primary" onClick={() => void yuklab('json')}><FileJson /> {t('JSON yuklab olish')}</button>
        <button type="button" className="fz-btn fz-btn--ghost" onClick={() => void yuklab('csv')}><Download /> {t('Excel (CSV) yuklab olish')}</button>
        <button type="button" className="fz-btn fz-btn--ghost" disabled={band || forma3Id == null || !tekshiruv.tayyor} onClick={() => void holatYoz('tayyor')}>{t('ESF tayyor deb belgilash')}</button>
      </div>

      {forma3Id != null && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="fz-kpi__label">{t('didox/faktura.uz dagi hujjat ID (yuborilgach)')}</span>
            <input className="input" value={tashqiId} disabled={band} onChange={(e) => setTashqiId(e.target.value)} />
          </label>
          {(['yuborildi', 'qabul', 'rad'] as const).map((h) => (
            <button key={h} type="button" className="fz-btn fz-btn--ghost fz-btn--sm" disabled={band || (h !== 'rad' && !tashqiId.trim())} onClick={() => void holatYoz(h)}>
              {t(HOLAT_NOMI[h])}
            </button>
          ))}
          {holat && <span className="fz-kpi__label">{t('ESF holati: {h}', { h: t(HOLAT_NOMI[holat]) })}</span>}
        </div>
      )}
    </section>
  );
}
