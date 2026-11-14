/**
 * LabKabinet.tsx — /admin/laboratoriya. Laboratoriya kabineti («PlayStation pult»): BUGUN — kelgan sinov so'rovlari, bitta tugma bilan protokolni to'ldirish.
 * Pudratchi uchun ham shu yerda o'z yuborgan so'rovlari (natija, qayta sinov). Ruxsat serverda (faol aloqa + rol).
 */
import { useEffect, useState } from 'react';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { sorovlarOl, type SorovQisqa } from '../../api/t2-lab-sorov';
import { t } from '../../i18n/til';
import { Bolim } from '../zakazchik/tomon-ui';
import { tugma } from '../zakazchik/tomon-yordam';
import { ProtokolForma } from './ProtokolForma';
import { SinovSorovYubor } from './SinovSorovYubor';
import { SorovlarRoyxati } from './SorovlarRoyxati';

type Rejim = 'kelgan' | 'yuborilgan';

export default function LabKabinet() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [rejim, setRejim] = useState<Rejim>('kelgan');
  const [tanlangan, setTanlangan] = useState<number | null>(null);
  const [yangilash, setYangilash] = useState(0);
  const [qayta, setQayta] = useState<SorovQisqa | null>(null);
  const [soni, setSoni] = useState<{ kelgan: number; kechikkan: number; yuborilgan: number } | null>(null);

  useEffect(() => {
    setSoni(null); // kompaniya almashganda eski sonlar «—» bo'lib turadi (0 emas)
    if (!kompaniyaId) return;
    let tirik = true;
    void Promise.all([sorovlarOl(kompaniyaId, { yonalish: 'kelgan', holat: 'ochiq' }), sorovlarOl(kompaniyaId, { yonalish: 'yuborilgan', holat: 'ochiq' })]).then(([k, y]) => {
      if (!tirik) return;
      const kl = k.ok ? k.natija : [];
      setSoni({ kelgan: kl.length, kechikkan: kl.filter((x) => x.kechikkan).length, yuborilgan: y.ok ? y.natija.length : 0 });
      // Faqat bitta yo'nalishda so'rov bo'lsa — shuni ko'rsatamiz (laboratoriya kompaniyasi kelganlarni, pudratchi yuborganlarini).
      if (!kl.length && y.ok && y.natija.length) setRejim('yuborilgan');
    });
    return () => { tirik = false; };
  }, [kompaniyaId, yangilash]);

  if (!kompaniyaId) return <KompaniyaKerak nima="Laboratoriya" />;
  const tayyor = () => { setYangilash((x) => x + 1); };
  return (
    <Sahifa sarlavha="Laboratoriya" tavsif="Sinov so‘rovlari: pudratchi so‘raydi → laboratoriya protokolni to‘ldiradi → protokol АОСР va ish qatoriga o‘zi ilova bo‘ladi">
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label={t('Bugun')}>
          <button type="button" onClick={() => { setRejim('kelgan'); setTanlangan(null); setQayta(null); }} className={`fz-card p-4 text-left ${rejim === 'kelgan' ? 'ring-2 ring-accent' : ''}`}>
            <div className="text-xs text-text-dim">{t('Bugun: kelgan so‘rovlar')}</div><div className="text-2xl font-semibold tabular-nums">{soni?.kelgan ?? '—'}</div></button>
          <button type="button" onClick={() => { setRejim('kelgan'); setTanlangan(null); }} className="fz-card p-4 text-left">
            <div className="text-xs text-text-dim">{t('Muddati o‘tgan')}</div><div className={`text-2xl font-semibold tabular-nums ${soni?.kechikkan ? 'text-danger' : ''}`}>{soni?.kechikkan ?? '—'}</div></button>
          <button type="button" onClick={() => { setRejim('yuborilgan'); setTanlangan(null); setQayta(null); }} className={`fz-card p-4 text-left ${rejim === 'yuborilgan' ? 'ring-2 ring-accent' : ''}`}>
            <div className="text-xs text-text-dim">{t('Men yuborgan (ochiq)')}</div><div className="text-2xl font-semibold tabular-nums">{soni?.yuborilgan ?? '—'}</div></button>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)]">
          <Bolim sarlavha={rejim === 'kelgan' ? 'Kelgan so‘rovlar' : 'Yuborgan so‘rovlarim'}>
            <SorovlarRoyxati kompaniyaId={kompaniyaId} yonalish={rejim} tanlangan={tanlangan} onTanla={(id) => { setTanlangan(id); setQayta(null); }} yangilash={yangilash}
              onQayta={rejim === 'yuborilgan' ? (s) => { setQayta(s); setTanlangan(null); } : undefined} />
          </Bolim>
          <Bolim sarlavha={qayta ? 'Qayta sinov' : rejim === 'kelgan' ? 'Protokol' : 'So‘rov'}>
            {qayta ? (
              <SinovSorovYubor kompaniyaId={kompaniyaId} kontekst={{ obyektId: qayta.obyekt_id, aosrId: qayta.aosr_id, aosrNom: qayta.aosr_raqam, qatorId: qayta.qator_id, aslSorovId: qayta.id }}
                onYuborildi={() => { setQayta(null); tayyor(); }} onYopish={() => setQayta(null)} />
            ) : tanlangan == null ? <p className="text-sm text-text-dim">{t('Ro‘yxatdan so‘rovni tanlang')}</p> : (
              <>
                <ProtokolForma kompaniyaId={kompaniyaId} id={tanlangan} onTayyor={tayyor} />
                <div className="mt-3"><button type="button" className={tugma} onClick={() => setTanlangan(null)}>{t('Yopish')}</button></div>
              </>
            )}
          </Bolim>
        </div>
      </div>
    </Sahifa>
  );
}
