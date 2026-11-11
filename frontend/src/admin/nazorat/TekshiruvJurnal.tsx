/**
 * TekshiruvJurnal.tsx - /admin/nazorat/jurnal. Texnadzorning o'z tekshiruvlari jurnali (kun/davr bo'yicha), har tekshiruvning foto va
 * predpisaniyalari holati (raund, muddat) va rasmiy ruscha jurnalni Excelga yuklash (mavjud RasmiyVaraq).
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { tekshiruvTafsilotOl, tekshiruvlarOl, type TekshiruvQisqa, type TekshiruvTafsilot } from '../../api/t2-nazorat';
import { hujjatYuklabOlishUrl } from '../../api/t2-hujjat-canonical';
import { kunlikJurnalXlsx } from '../../lib/nazorat/tekshiruv';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { t } from '../../i18n/til';
import { Bolim } from '../zakazchik/tomon-ui';
import { inp } from '../zakazchik/tomon-yordam';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const oyBoshi = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); };
const kun = (s: string) => s.slice(0, 10).split('-').reverse().join('.');

function Tafsilot({ kompaniyaId, id }: { kompaniyaId: number; id: number }) {
  const [d, setD] = useState<TekshiruvTafsilot | null>(null);
  useEffect(() => { let b = false; void tekshiruvTafsilotOl(kompaniyaId, id).then((r) => { if (!b && r.ok) setD(r.natija); }); return () => { b = true; }; }, [kompaniyaId, id]);
  if (!d) return <div className="skel h-12 rounded-lg" />;
  const bad = d.tekshiruv.bandlar.filter((x) => x.natija === 'mos_emas');
  return (
    <div className="space-y-2 bg-bg-soft p-3 text-[13px]" data-testid="tekshiruv-tafsilot">
      {bad.length === 0 ? <p className="text-text-dim">{t('Kamchilik topilmagan.')}</p> : <ul className="space-y-1">{bad.map((x) => <li key={x.kod}><b>{x.nom}</b>{x.izoh ? ` — ${x.izoh}` : ''}</li>)}</ul>}
      {d.fotolar.length > 0 && <div className="flex flex-wrap gap-2">{d.fotolar.map((f) => (
        <a key={f.document_id} href={hujjatYuklabOlishUrl(f.document_id)} target="_blank" rel="noreferrer"><img src={hujjatYuklabOlishUrl(f.document_id)} alt={t('Foto')} className="h-16 w-16 rounded-md border border-border object-cover" loading="lazy" /></a>))}</div>}
      {d.predpisaniyalar.length > 0 && (
        <ul className="text-xs">{d.predpisaniyalar.map((p) => (
          <li key={p.id}><Link className="text-accent underline" to={`/admin/murojaatlar?id=${p.id}`}>{p.sarlavha}</Link>
            {` · ${t('holat')}: ${p.holat}${p.raund > 1 ? ` · ${t('raund')} ${p.raund}` : ''}${p.muddat ? ` · ${t('muddat')} ${kun(p.muddat)}` : ''}`}{p.kechikkan && <span className="fz-chip fz-chip--warn ml-1">{t('kechikkan')}</span>}</li>))}</ul>)}
    </div>
  );
}

export default function TekshiruvJurnal() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [dan, setDan] = useState(oyBoshi());
  const [gacha, setGacha] = useState(iso(new Date()));
  const [royxat, setRoyxat] = useState<TekshiruvQisqa[]>([]);
  const [ochiq, setOchiq] = useState<number | null>(null);
  const [yuklandi, setYuklandi] = useState(false);

  const ol = useCallback(async () => {
    if (!kompaniyaId) return;
    const r = await tekshiruvlarOl(kompaniyaId, { dan, gacha, limit: 500 });
    if (r.ok) setRoyxat(r.natija); else toast(r.error, 'danger');
    setYuklandi(true);
  }, [kompaniyaId, dan, gacha]);
  useEffect(() => { void ol(); }, [ol]);

  if (!kompaniyaId) return <KompaniyaKerak nima="Tekshiruvlar jurnali" />;
  const yakun = royxat.filter((x) => x.holat === 'yakunlandi');
  function yukla() {
    const { bytes, faylNomi } = kunlikJurnalXlsx(royxat, { davr: `${kun(dan)} - ${kun(gacha)}`, inspektorNomi: joriy?.nom });
    downloadBlob(bytes, faylNomi);
  }
  return (
    <Sahifa sarlavha="Tekshiruvlar jurnali" tavsif="Sizning sayt tekshiruvlaringiz: kamchiliklar, foto va predpisaniyalar holati">
      <div className="space-y-4">
        <Bolim sarlavha="Davr" amal={<button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={yakun.length === 0} onClick={yukla}>{t('Jurnalni Excelga yuklash')}</button>}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-text-dim">{t('Dan')}<input type="date" className={`${inp} mt-1 block`} value={dan} onChange={(e) => setDan(e.target.value)} /></label>
            <label className="text-xs text-text-dim">{t('Gacha')}<input type="date" className={`${inp} mt-1 block`} value={gacha} onChange={(e) => setGacha(e.target.value)} /></label>
            <button type="button" className="fz-btn fz-btn--sm" onClick={() => { setDan(iso(new Date())); setGacha(iso(new Date())); }}>{t('Bugun')}</button>
          </div>
        </Bolim>
        <Bolim sarlavha="Tekshiruvlar" amal={<Link className="fz-btn fz-btn--sm" to="/admin/nazorat/tekshiruv">{t('Yangi tekshiruv')}</Link>}>
          {yuklandi && royxat.length === 0 && <p className="text-sm text-text-dim">{t('Bu davrda tekshiruv yo‘q.')}</p>}
          <ul className="divide-y divide-border">
            {royxat.map((x) => (
              <li key={x.id} className="py-2">
                <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left text-[13px]" aria-expanded={ochiq === x.id} onClick={() => setOchiq(ochiq === x.id ? null : x.id)}>
                  <span className="font-semibold">{kun(x.sana)}</span><span>{x.obyekt_nom ?? '—'}</span><span className="text-text-dim">{x.ish_turi}{x.joy ? ` · ${x.joy}` : ''}</span>
                  {x.holat === 'qoralama' ? <span className="fz-chip">{t('qoralama')}</span> : <span className={`fz-chip ${x.natija === 'mos_emas' ? 'fz-chip--warn' : ''}`}>{x.natija === 'mos_emas' ? t('kamchilik bor') : t('hammasi mos')}</span>}
                  {x.predpisaniya_soni > 0 && <span className="fz-chip">{t('predpisaniya')}: {x.predpisaniya_soni}</span>}
                </button>
                {x.holat === 'qoralama' && <Link className="mt-1 inline-block text-xs text-accent underline" to={`/admin/nazorat/tekshiruv?id=${x.id}`}>{t('Davom ettirish')}</Link>}
                {ochiq === x.id && <Tafsilot kompaniyaId={kompaniyaId} id={x.id} />}
              </li>))}
          </ul>
        </Bolim>
      </div>
    </Sahifa>
  );
}
