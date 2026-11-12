/**
 * SinovSorovYubor.tsx — pudratchi АОСР / ish qatori kontekstidan laboratoriyaga SINOV SO'ROVI yuboradi (yoki «mos emas» natija uchun qayta sinov).
 * Kimga: faqat faol aloqadagi «laboratoriya» roli. Natija (protokol) o'zi АОСР va ish qatoriga ilova bo'ladi; mos emas bo'lsa predpisaniya keladi.
 */
import { useEffect, useMemo, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { toast } from '../../umumiy/ui/Toast';
import { aloqalarOl, type Aloqa } from '../../api/t2-tomon';
import { sinovTurlariOl, sorovYubor, type SinovTuri } from '../../api/t2-lab-sorov';
import { t, tilOl } from '../../i18n/til';
import { inp, tugma, tugmaAsosiy } from '../zakazchik/tomon-yordam';

export type SorovKontekst = { obyektId: number; aosrId?: number | null; aosrNom?: string | null; qatorId?: number | null; qatorNom?: string | null; aslSorovId?: number | null; sinovTuri?: string };

const turNomi = (x: Pick<SinovTuri, 'nom' | 'nom_ru'>) => (tilOl() === 'ru' && x.nom_ru ? x.nom_ru : x.nom);

export function SinovSorovYubor({ kompaniyaId, kontekst, onYuborildi, onYopish }: { kompaniyaId: number; kontekst: SorovKontekst; onYuborildi: () => void; onYopish?: () => void }) {
  const [aloqalar, setAloqalar] = useState<Aloqa[] | null>(null);
  const [turlar, setTurlar] = useState<SinovTuri[]>([]);
  const [aloqaId, setAloqaId] = useState<number | ''>('');
  const [turi, setTuri] = useState(kontekst.sinovTuri ?? '');
  const [konstruksiya, setKonstruksiya] = useState('');
  const [joy, setJoy] = useState('');
  const [namuna, setNamuna] = useState('');
  const [muddat, setMuddat] = useState('');
  const [izoh, setIzoh] = useState('');
  const [majburiy, setMajburiy] = useState(true);
  const [band, setBand] = useState(false);
  const qayta = kontekst.aslSorovId != null;

  useEffect(() => {
    let tirik = true;
    void Promise.all([aloqalarOl(kompaniyaId), sinovTurlariOl(kompaniyaId)]).then(([a, tr]) => {
      if (!tirik) return;
      const lablar = a.ok ? a.natija.filter((x) => x.holat === 'faol' && x.qarshi_rol.trim().toLowerCase() === 'laboratoriya') : [];
      setAloqalar(lablar); setTurlar(tr.ok ? tr.natija : []);
      if (lablar.length === 1) setAloqaId(lablar[0].id);
    });
    return () => { tirik = false; };
  }, [kompaniyaId]);

  const tanlanganTur = useMemo(() => turlar.find((x) => x.kalit === turi), [turlar, turi]);
  const yubor = async () => {
    if (aloqaId === '') return;
    setBand(true);
    const ns = namuna.trim() ? Number(namuna) : null;
    const r = await sorovYubor(kompaniyaId, {
      aloqaId, sinovTuri: qayta ? undefined : turi, obyektId: kontekst.obyektId, aosrId: kontekst.aosrId, qatorId: kontekst.qatorId, konstruksiya, joy,
      namunaSoni: ns != null && Number.isFinite(ns) ? ns : null, muddat, izoh, majburiy, aslSorovId: kontekst.aslSorovId,
    });
    setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(qayta ? t('Qayta sinov so‘rovi yuborildi') : t('Sinov so‘rovi laboratoriyaga yuborildi'), 'ok');
    onYuborildi();
  };

  if (aloqalar == null) return <p className="text-xs text-text-dim">{t('Yuklanmoqda…')}</p>;
  if (aloqalar.length === 0) return <p className="text-sm text-text-dim">{t('Laboratoriya bilan faol aloqa yo‘q. «Tomonlar aloqasi» sahifasida laboratoriyani taklif qiling (rol: laboratoriya).')}</p>;
  return (
    <div className="space-y-2" data-testid="sinov-sorov-yubor">
      <div className="flex items-center gap-2 text-sm font-semibold"><FlaskConical size={15} />{qayta ? t('Qayta sinov so‘rovi') : t('Sinov so‘rovi')}</div>
      {(kontekst.aosrNom || kontekst.qatorNom) && <p className="text-xs text-text-dim">{[kontekst.aosrNom && `АОСР: ${kontekst.aosrNom}`, kontekst.qatorNom && `${t('Ish')}: ${kontekst.qatorNom}`].filter(Boolean).join(' · ')}</p>}
      <div className="grid gap-2 md:grid-cols-3">
        <label className="text-xs text-text-dim">{t('Laboratoriya')}
          <select className={`${inp} mt-1 block w-full`} value={aloqaId} onChange={(e) => setAloqaId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">{t('— tanlang —')}</option>{aloqalar.map((a) => <option key={a.id} value={a.id}>{a.qarshi_nom}</option>)}</select></label>
        {!qayta && <label className="text-xs text-text-dim">{t('Sinov turi')}
          <select className={`${inp} mt-1 block w-full`} value={turi} onChange={(e) => setTuri(e.target.value)}>
            <option value="">{t('— tanlang —')}</option>{turlar.map((x) => <option key={x.kalit} value={x.kalit}>{turNomi(x)}</option>)}</select></label>}
        <label className="text-xs text-text-dim">{t('Konstruksiya / qism')}<input className={`${inp} mt-1 block w-full`} value={konstruksiya} onChange={(e) => setKonstruksiya(e.target.value)} placeholder={t('masalan: Fundament Fm-1')} /></label>
        <label className="text-xs text-text-dim">{t('Joy (qavat, o‘q)')}<input className={`${inp} mt-1 block w-full`} value={joy} onChange={(e) => setJoy(e.target.value)} /></label>
        <label className="text-xs text-text-dim">{t('Namuna soni')}<input inputMode="numeric" className={`${inp} mt-1 block w-full`} value={namuna} onChange={(e) => setNamuna(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="text-xs text-text-dim">{t('Muddat')}<input type="date" className={`${inp} mt-1 block w-full`} value={muddat} onChange={(e) => setMuddat(e.target.value)} /></label>
        <label className="text-xs text-text-dim md:col-span-3">{t('Izoh')}<input className={`${inp} mt-1 block w-full`} value={izoh} onChange={(e) => setIzoh(e.target.value)} /></label>
      </div>
      {tanlanganTur?.standart && <p className="text-[11px] text-text-dim">{t('Norma')}: {tanlanganTur.standart}</p>}
      <label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={majburiy} onChange={(e) => setMajburiy(e.target.checked)} />{t('Majburiy sinov (mos emas bo‘lsa АОСР yuborilmaydi)')}</label>
      <div className="flex gap-2">
        <button type="button" className={tugmaAsosiy} disabled={band || aloqaId === '' || (!qayta && !turi)} onClick={() => void yubor()}>{t('So‘rov yuborish')}</button>
        {onYopish && <button type="button" className={tugma} onClick={onYopish}>{t('Yopish')}</button>}
      </div>
    </div>
  );
}
