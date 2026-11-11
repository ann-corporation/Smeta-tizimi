/**
 * BugunBolimi.tsx — buyurtmachining «Bugun» uyi (ZakazchikKabinet tepasida): 6 ta katta tugma, «sizdan nima kutilmoqda»,
 * obyektlar portfeli (shartnoma, smeta, pudratchi hisoboti bo'yicha fakt, tasdiqlangan F2, Forma-3, to'langan, qarz) va oylik hisobot.
 * Manba: t2_zakazchik_bugun_v1 (server grant bo'yicha qirqadi). Pul: ma'lum bo'lmagan = «—» (0 emas); QQS bilan avval.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { bugunOl, type Bugun, type BugunObyekt } from '../../api/t2-tomon';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { Bolim } from './tomon-ui';
import { TolovXabariYozish } from './TolovXabarlari';
import { PORTFEL_USTUNLAR, TAQDIM_RESURS_NOMI, etiborBelgisi, kutishJami, portfelJami, pudratchiBoyicha, type PortfelUstun } from './bugun-yordam';
import { pul, tugma } from './tomon-yordam';

const USTUN_NOMI: Record<PortfelUstun, string> = {
  shartnoma: 'Shartnoma (QQS bilan)', smeta: 'Smeta (QQS siz)', fakt: 'Fakt — pudratchi hisoboti (QQS siz)', f2: 'Tasdiqlangan F2 ustamasiz (QQS siz)',
  f2_ustamali: 'F2 ustamali (QQS siz)', f2_qqs: 'Tasdiqlangan F2 (QQS bilan)', f3: 'Forma-3 (QQS bilan)', tolangan: 'To‘langan (QQS bilan)', qarz: 'Qarz (QQS bilan)',
};

function Katta({ nom, son, izoh, yol, rang, onClick }: { nom: string; son?: number; izoh: string; yol?: string; rang?: string; onClick?: () => void }) {
  const ichi = (
    <>
      <span className="flex items-center gap-2 text-[15px] font-semibold">{t(nom)}{son != null && son > 0 && <span className={`fz-chip ${rang ?? 'fz-chip--warn'}`}>{son}</span>}</span>
      <span className="text-xs text-text-dim">{t(izoh)}</span>
    </>
  );
  const sinf = 'fz-card flex min-h-[84px] flex-col justify-center gap-1 p-4 text-left hover:border-accent';
  return yol ? <Link to={yol} className={sinf}>{ichi}</Link> : <button type="button" className={sinf} onClick={onClick}>{ichi}</button>;
}

export default function BugunBolimi({ kompaniyaId, kompaniyaNomi }: { kompaniyaId: number; kompaniyaNomi: string }) {
  const [d, setD] = useState<Bugun | null>(null);
  const [xato, setXato] = useState('');
  const [tolovObyekt, setTolovObyekt] = useState<number | null>(null);
  const [band, setBand] = useState(false);
  const ol = useCallback(async () => {
    const r = await bugunOl(kompaniyaId);
    if (r.ok) { setD(r.natija); setXato(''); } else setXato(r.error);
  }, [kompaniyaId]);
  useEffect(() => { void ol(); }, [ol]);

  const kutish = useMemo(() => (d ? kutishJami(d.kutayotgan) : null), [d]);
  const jami = useMemo(() => (d ? portfelJami(d.obyektlar) : null), [d]);
  const guruhlar = useMemo(() => (d ? pudratchiBoyicha(d) : []), [d]);
  const korinadigan = useMemo(() => PORTFEL_USTUNLAR.filter((u) => d && d.obyektlar.some((o) => (u === 'f2_ustamali' || u === 'f2_qqs' ? o.f2?.ustama_jami != null : u === 'f2' ? o.f2 != null : u === 'qarz' ? o.qarz != null : true))), [d]);

  async function hisobotYukla() {
    if (!d || band) return;
    setBand(true);
    try {
      const { zakazchikOylikHisobot } = await import('../../lib/zakazchik-hisobot');
      const x = await zakazchikOylikHisobot(d.obyektlar, { kompaniya: kompaniyaNomi, sana: d.sana });
      const r = await hujjatTokenBilan({ kompaniyaId, bytes: x.bytes, hujjat: 'ZAKAZCHIK_HISOBOT', sabab: `Oylik hisobot ${d.sana}`, yacheykalar: x.yacheykalar }, () => downloadBlob(x.bytes, x.faylNomi));
      toast(r.ok ? (r.xabar || t('Yuklandi')) : r.xabar, r.ok ? 'ok' : 'danger');
    } catch { toast(t('Hisobotni yig‘ib bo‘lmadi.'), 'danger'); }
    setBand(false);
  }

  if (xato) return <div className="fz-note" data-testid="bugun-xato">{xato}</div>;
  if (!d || !kutish || !jami) return null;
  return (
    <div className="space-y-4" data-testid="bugun-bolimi">
      <section aria-label={t('Bugun')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Katta nom="Hujjatlar: qabul / qaytarish" son={kutish.hujjat} izoh="Forma-2, Forma-3, АОСР — sizning qaroringiz kutilmoqda" yol="/admin/taqdimlar" />
        <Katta nom="Murojaatlar" son={kutish.murojaatJavob + kutish.murojaatTekshiruv} izoh="Javob berish yoki bajarilganini tekshirish" yol="/admin/murojaatlar" />
        <Katta nom="Predpisaniya / remark berish" son={kutish.kechikkan} rang="fz-chip--danger" izoh="Muddat va foto-dalil bilan; muddati o‘tganlar qizil" yol="/admin/murojaatlar?yangi=predpisaniya" />
        <Katta nom="To‘lov xabari" son={d.kutayotgan.tolov_xabar_kutilmoqda} izoh="Forma-3 bo‘yicha to‘lagan summangizni yozing" onClick={() => setTolovObyekt(d.obyektlar[0]?.obyekt_id ?? null)} />
        <Katta nom="Oylik hisobot (Excel)" izoh={band ? 'Yig‘ilmoqda…' : 'Butun portfel bo‘yicha, bitta fayl'} onClick={() => void hisobotYukla()} />
        <Katta nom="Pudratchilar va ruxsatlar" izoh="Kim bilan ulangansiz, nimani ko‘rasiz" yol="/admin/aloqalar" />
      </section>

      {d.obyektlar.length === 0 && <p className="text-sm text-text-dim">{t('Portfel bo‘sh: pudratchi sizga obyektni ochgach shu yerda ko‘rinadi.')}</p>}
      {d.obyektlar.length > 0 && (
        <Bolim sarlavha="Portfel: obyektlar bo‘yicha" amal={<span className="text-xs text-text-dim">{t('Bugungi sana')}: {d.sana}</span>}>
          {Object.keys(d.kutayotgan.taqdim).length > 0 && (
            <p className="mb-2 text-xs text-text-dim">{t('Qaror kutayotgan')}: {Object.entries(d.kutayotgan.taqdim).map(([k, n]) => `${t(TAQDIM_RESURS_NOMI[k] ?? k)} — ${n}`).join(' · ')}</p>)}
          <div className="fz-table-wrap"><table className="fz-table min-w-[1100px]">
            <thead><tr><th>{t('Obyekt')}</th>{korinadigan.map((u) => <th key={u} className="fz-c-num">{t(USTUN_NOMI[u])}</th>)}<th>{t('Holat')}</th><th /></tr></thead>
            <tbody>
              {guruhlar.map((g) => [
                <tr key={`g${g.id}`}><td colSpan={korinadigan.length + 3} className="bg-surface-2 text-xs font-semibold">{g.nom}</td></tr>,
                ...g.obyektlar.map((o) => <Qator key={o.obyekt_id} o={o} ustunlar={korinadigan} onTolov={() => setTolovObyekt(o.obyekt_id)} />),
              ])}
              <tr className="fz-row-total"><td>{t('Jami')}</td>{korinadigan.map((u) => (
                <td key={u} className="fz-c-num">{jami[u].summa == null ? '—' : pul(jami[u].summa)}{jami[u].nomalum > 0 && <span className="block text-[10px] text-warn">{t('{n} ta obyektda noma’lum', { n: jami[u].nomalum })}</span>}</td>))}<td /><td /></tr>
            </tbody>
          </table></div>
          <p className="mt-2 text-[11px] text-text-mute">{t('«—» = noma’lum yoki pudratchi bu ko‘rsatkichni sizga ochmagan (nol emas). Fakt — pudratchi o‘zi kiritgan hisobot; sertifikatlangan emas.')}</p>
        </Bolim>
      )}
      {tolovObyekt != null && <TolovXabariYozish kompaniyaId={kompaniyaId} obyektlar={d.obyektlar} tanlangan={tolovObyekt} onOzgardi={() => void ol()} />}
    </div>
  );
}

function Hujayra({ o, u }: { o: BugunObyekt; u: PortfelUstun }) {
  if (u === 'f2' && o.f2) return <>{o.f2.soni > 0 ? pul(o.f2.jami) : '—'}<span className="block text-[10px] text-text-mute">{o.f2.soni} {t('ta')}{o.f2.ustama_jami && o.f2.ustama_jami.narxsiz_qator > 0 ? ` · ${t('narxsiz qator: {n} ta', { n: o.f2.ustama_jami.narxsiz_qator })}` : ''}</span></>;
  const q = u === 'shartnoma' ? o.shartnoma_summa : u === 'smeta' ? o.smeta?.summa ?? null : u === 'fakt' ? o.fakt?.summa ?? null : u === 'f2_ustamali' ? o.f2?.ustama_jami?.ustamali ?? null
    : u === 'f2_qqs' ? o.f2?.ustama_jami?.podval?.vsego ?? null : u === 'f3' ? o.f3?.summa ?? null : u === 'tolangan' ? o.tolangan?.summa ?? null : o.qarz;
  const nx = u === 'smeta' ? o.smeta?.narxsiz_qator : u === 'fakt' ? o.fakt?.narxsiz_qator : 0;
  return <>{q == null ? '—' : pul(q)}{!!nx && <span className="block text-[10px] text-warn">{t('narxsiz qator: {n} ta', { n: nx })}</span>}</>;
}

function Qator({ o, ustunlar, onTolov }: { o: BugunObyekt; ustunlar: readonly PortfelUstun[]; onTolov: () => void }) {
  const b = etiborBelgisi(o);
  return (
    <tr>
      <td className="font-medium"><Link to={`/admin/zakazchik/obyekt/${o.aloqa_id}/${o.obyekt_id}`} className="text-accent underline">{o.obyekt_nom}</Link>
        {o.shartnoma_raqam && <span className="block text-[10px] text-text-mute">№ {o.shartnoma_raqam}</span>}</td>
      {ustunlar.map((u) => <td key={u} className={`fz-c-num ${u === 'qarz' && o.qarz != null && o.qarz > 0 ? 'text-danger font-semibold' : ''}`}><Hujayra o={o} u={u} /></td>)}
      <td className="text-xs">
        {b === 'qaror' && <Link to="/admin/taqdimlar" className="fz-chip fz-chip--warn">{o.kutayotgan_taqdim} {t('hujjat kutmoqda')}</Link>}
        {b === 'qarz' && <span className="fz-chip fz-chip--danger">{t('qarz bor')}</span>}
        {b === 'murojaat' && <Link to="/admin/murojaatlar" className="fz-chip">{o.ochiq_murojaat} {t('ochiq murojaat')}</Link>}
        {o.xabar_kutilmoqda > 0 && <span className="block text-[10px] text-text-dim">{t('to‘lov xabari kutilmoqda')}: {pul(o.xabar_kutilmoqda)}</span>}
      </td>
      <td>{(o.f3 != null || o.tolangan != null) && <button type="button" className={tugma} onClick={onTolov}>{t('To‘lov xabari')}</button>}</td>
    </tr>
  );
}
