/**
 * TekshiruvForma.tsx - /admin/nazorat/tekshiruv. Sayt tekshiruvi: obyekt + ish turi -> tayyor checklist -> har band
 * "Mos / Mos emas / O'tkazish". Nomuvofiq band: nima noto'g'ri (izoh) + foto majburiy. Yakunlanganda tizim har nomuvofiq band uchun
 * muddati bilan PREDPISANIYA beradi (pudratchiga ko'rinadi). Qoralama istalgan vaqt saqlanadi.
 */
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import { zakazchikObyektlarOl, type Muhimlik, type ZakazchikObyekt } from '../../api/t2-tomon';
import { tekshiruvTafsilotOl, tekshiruvYoz, type BandNatija, type TekshiruvBand } from '../../api/t2-nazorat';
import { TEKSHIRUV_SHABLONLAR, bandlarniBoshlash, muddatKunTaklif, tekshiruvShabloni, tekshiruvXulosa } from '../../lib/nazorat/tekshiruv';
import { t } from '../../i18n/til';
import { Bolim } from '../zakazchik/tomon-ui';
import { inp } from '../zakazchik/tomon-yordam';
import { FotoYuklash } from './FotoYuklash';

const NATIJA_TUGMA: Array<[BandNatija, string, string]> = [['mos', 'Mos', 'fz-btn--primary'], ['mos_emas', 'Mos emas', 'fz-btn--danger'], ['yoq', 'O‘tkazish', '']];
const MUHIMLIK: Array<[Muhimlik, string]> = [['past', 'Past'], ['oddiy', 'Oddiy'], ['yuqori', 'Yuqori'], ['kritik', 'Kritik']];
const bugun = () => new Date().toISOString().slice(0, 10);

export default function TekshiruvForma() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [qs] = useSearchParams();
  const [obyektlar, setObyektlar] = useState<ZakazchikObyekt[]>([]);
  const [tanlov, setTanlov] = useState(() => (qs.get('aloqa') && qs.get('obyekt') ? `${qs.get('aloqa')}:${qs.get('obyekt')}` : ''));
  const [shablon, setShablon] = useState('beton');
  const [joy, setJoy] = useState('');
  const [sana, setSana] = useState(bugun());
  const [bandlar, setBandlar] = useState<TekshiruvBand[]>(() => bandlarniBoshlash(tekshiruvShabloni('beton')!));
  const [izoh, setIzoh] = useState('');
  const [muddatKun, setMuddatKun] = useState<number | ''>('');
  const [id, setId] = useState<number | null>(() => { const v = Number(qs.get('id')); return Number.isFinite(v) && v > 0 ? v : null; });
  const [qoshimcha, setQoshimcha] = useState('');
  const [band, setBand] = useState(false);
  const [natija, setNatija] = useState<{ natija: 'mos' | 'mos_emas'; predpisaniyalar: number; yaratilmadi: boolean } | null>(null);
  const operationId = useRef(yangiOperationId());

  useEffect(() => {
    if (!kompaniyaId) return;
    let bekor = false;
    void zakazchikObyektlarOl(kompaniyaId).then((r) => { if (!bekor && r.ok) setObyektlar(r.natija); });
    return () => { bekor = true; };
  }, [kompaniyaId]);

  useEffect(() => {
    if (!kompaniyaId || id == null) return;
    let bekor = false;
    void tekshiruvTafsilotOl(kompaniyaId, id).then((r) => {
      if (bekor || !r.ok) return;
      const x = r.natija.tekshiruv;
      setTanlov(`${x.aloqa_id ?? ''}:${x.obyekt_id}`); setJoy(x.joy ?? ''); setSana(x.sana); setIzoh(x.izoh ?? ''); setBandlar(x.bandlar);
      setShablon(TEKSHIRUV_SHABLONLAR.find((s) => s.nom === x.ish_turi)?.kalit ?? 'boshqa');
    });
    return () => { bekor = true; };
    // faqat ochilganda qoralamani yuklaymiz
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kompaniyaId]);

  const obyekt = useMemo(() => obyektlar.find((o) => `${o.aloqa_id}:${o.obyekt_id}` === tanlov) ?? null, [obyektlar, tanlov]);
  const xulosa = useMemo(() => tekshiruvXulosa(bandlar), [bandlar]);
  const shablonNomi = tekshiruvShabloni(shablon)?.nom ?? 'Boshqa ish';
  const ozgartir = (i: number, p: Partial<TekshiruvBand>) => { setBandlar((b) => b.map((x, k) => (k === i ? { ...x, ...p } : x))); setNatija(null); };

  async function shablonTanla(k: string) {
    const s = tekshiruvShabloni(k); if (!s) return;
    if (bandlar.some((x) => x.natija !== 'yoq') && !(await tasdiqSora({ matn: 'Joriy belgilar o‘chadi. Davom etamizmi?', xavfli: true }))) return;
    setShablon(k); setBandlar(bandlarniBoshlash(s)); setNatija(null);
  }
  function bandQosh() {
    const nom = qoshimcha.trim(); if (nom.length < 2) return;
    setBandlar((b) => [...b, { kod: `x${b.length + 1}`, nom, natija: 'yoq', izoh: '', muhimlik: 'yuqori', document_ids: [] }]); setQoshimcha('');
  }

  async function saqla(yakunla: boolean) {
    if (!kompaniyaId || !obyekt) { toast(t('Avval obyektni tanlang'), 'danger'); return; }
    setBand(true);
    const r = await tekshiruvYoz(kompaniyaId, { id, aloqaId: obyekt.aloqa_id, obyektId: obyekt.obyekt_id, sana, ishTuri: shablonNomi, joy, bandlar, izoh, yakunla, muddatKun: muddatKun === '' ? null : muddatKun, operationId: operationId.current });
    setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    setId(r.natija.id);
    if (yakunla && r.natija.holat === 'yakunlandi') {
      setNatija({ natija: r.natija.natija ?? 'mos', predpisaniyalar: r.natija.predpisaniyalar?.length ?? 0, yaratilmadi: r.natija.predpisaniya_yaratilmadi === true });
      toast(t('Tekshiruv yakunlandi'), 'ok');
    } else toast(t('Qoralama saqlandi'), 'ok');
  }

  if (!kompaniyaId) return <KompaniyaKerak nima="Tekshiruv" />;
  if (natija) {
    return (
      <Sahifa sarlavha="Tekshiruv yakunlandi" tavsif={obyekt?.obyekt_nom ?? ''}>
        <div className="space-y-3" data-testid="tekshiruv-natija">
          <p className={`fz-note ${natija.natija === 'mos' ? '' : 'fz-note--warn'}`}>
            {natija.natija === 'mos' ? t('Hammasi mos. Kamchilik yo‘q.') : `${t('Kamchiliklar topildi. Pudratchiga predpisaniya berildi')}: ${natija.predpisaniyalar}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link className="fz-btn fz-btn--primary" to="/admin/nazorat/tekshiruv" reloadDocument>{t('Yangi tekshiruv')}</Link>
            {natija.predpisaniyalar > 0 && <Link className="fz-btn" to="/admin/murojaatlar">{t('Predpisaniyalarni ko‘rish')}</Link>}
            <Link className="fz-btn" to="/admin/nazorat">{t('Bosh sahifa')}</Link>
          </div>
        </div>
      </Sahifa>
    );
  }
  return (
    <Sahifa sarlavha="Yangi tekshiruv" tavsif="Obyektni tanlang, ish turini belgilang, har bandni tekshiring">
      <div className="space-y-4">
        <Bolim sarlavha="Qayerda va nima">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-xs text-text-dim md:col-span-2">{t('Obyekt')}
              <select className={`${inp} mt-1 block w-full`} value={tanlov} onChange={(e) => setTanlov(e.target.value)}>
                <option value="">{t('Tanlang…')}</option>
                {obyektlar.map((o) => <option key={`${o.aloqa_id}:${o.obyekt_id}`} value={`${o.aloqa_id}:${o.obyekt_id}`}>{o.obyekt_nom} — {o.qarshi_nom}</option>)}
              </select></label>
            <label className="text-xs text-text-dim">{t('Ish turi')}
              <select className={`${inp} mt-1 block w-full`} value={shablon} onChange={(e) => shablonTanla(e.target.value)}>
                {TEKSHIRUV_SHABLONLAR.map((s) => <option key={s.kalit} value={s.kalit}>{t(s.nom)}</option>)}
              </select></label>
            <label className="text-xs text-text-dim">{t('Sana')}<input type="date" className={`${inp} mt-1 block w-full`} value={sana} onChange={(e) => setSana(e.target.value)} /></label>
            <label className="text-xs text-text-dim md:col-span-4">{t('Joy (qavat, o‘q, uchastka)')}<input className={`${inp} mt-1 block w-full`} value={joy} onChange={(e) => setJoy(e.target.value)} /></label>
          </div>
        </Bolim>

        <Bolim sarlavha="Tekshiruv ro‘yxati">
          <ul className="space-y-3">
            {bandlar.map((x, i) => (
              <li key={x.kod} className={`rounded-lg border p-3 ${x.natija === 'mos_emas' ? 'border-danger/50' : 'border-border'}`}>
                <div className="text-sm font-medium">{x.nom}</div>
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={x.nom}>
                  {NATIJA_TUGMA.map(([k, nom, sinf]) => (
                    <button key={k} type="button" aria-pressed={x.natija === k} className={`fz-btn min-h-[44px] flex-1 ${x.natija === k ? sinf || 'fz-btn--primary' : ''}`} onClick={() => ozgartir(i, { natija: k })}>{t(nom)}</button>))}
                </div>
                {x.natija === 'mos_emas' && (
                  <div className="mt-3 space-y-2">
                    <textarea className={`${inp} block w-full`} rows={2} placeholder={t('Nima noto‘g‘ri? (masalan: himoya qatlami 15 mm, kerak 25 mm)')} value={x.izoh ?? ''} onChange={(e) => ozgartir(i, { izoh: e.target.value })} />
                    <FotoYuklash kompaniyaId={kompaniyaId} idlar={x.document_ids ?? []} onOzgardi={(ids) => ozgartir(i, { document_ids: ids })} />
                    <label className="block text-xs text-text-dim">{t('Muhimlik')}
                      <select className={`${inp} ml-2`} value={x.muhimlik ?? 'yuqori'} onChange={(e) => { ozgartir(i, { muhimlik: e.target.value as Muhimlik }); }}>
                        {MUHIMLIK.map(([k, nom]) => <option key={k} value={k}>{t(nom)}</option>)}</select></label>
                  </div>
                )}
              </li>))}
          </ul>
          <div className="mt-3 flex gap-2">
            <input className={`${inp} flex-1`} placeholder={t('Qo‘shimcha band (ixtiyoriy)')} value={qoshimcha} onChange={(e) => setQoshimcha(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') bandQosh(); }} />
            <button type="button" className="fz-btn fz-btn--sm" onClick={bandQosh}>{t('Qo‘shish')}</button>
          </div>
        </Bolim>

        <Bolim sarlavha="Yakun">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-xs text-text-dim md:col-span-2">{t('Umumiy izoh')}<textarea className={`${inp} mt-1 block w-full`} rows={2} value={izoh} onChange={(e) => setIzoh(e.target.value)} /></label>
            <label className="text-xs text-text-dim">{t('Kamchilikni bartaraf etish muddati (kun)')}
              <input type="number" min={1} max={60} className={`${inp} mt-1 block w-full`} placeholder={String(muddatKunTaklif('yuqori'))} value={muddatKun} onChange={(e) => setMuddatKun(e.target.value === '' ? '' : Number(e.target.value))} /></label>
          </div>
          <p className="mt-2 text-xs text-text-dim" data-testid="tekshiruv-xulosa">{t('Mos')}: {xulosa.mos} · {t('Mos emas')}: {xulosa.mosEmas} · {t('Tekshirilmadi')}: {xulosa.yoq}</p>
          {xulosa.muammolar.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-warn">{xulosa.muammolar.map((m) => <li key={m}>{m}</li>)}</ul>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="fz-btn" disabled={band || !obyekt} onClick={() => void saqla(false)}>{t('Qoralamani saqlash')}</button>
            <button type="button" className="fz-btn fz-btn--primary" disabled={band || !obyekt || !xulosa.tayyor} onClick={() => void saqla(true)}>{xulosa.mosEmas > 0 ? t('Yakunlash va predpisaniya berish') : t('Yakunlash')}</button>
          </div>
        </Bolim>
      </div>
    </Sahifa>
  );
}
