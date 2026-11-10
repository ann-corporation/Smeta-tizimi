import { useEffect, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { OpsOyna } from '../kompaniya-ops/OpsUi';
import { toast } from '../../umumiy/ui/Toast';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { buyurtmaQabul, buyurtmaTafsilotOl, buyurtmaXatosi, type BuyurtmaQabulQator, type BuyurtmaRoyxatQator, type BuyurtmaTafsilot, type QabulQatorHolat } from '../../api/t2-buyurtma';
import { yangiOperationId } from '../../api/supabase';

/**
 * «Qabul qildim» (xaridor): odatda BITTA tugma - hammasi to'liq keldi. Qisman yoki muammo bo'lsa - «Qisman yoki muammo bor»:
 * har qator uchun kelgan miqdor va holat (butun / kam / shikast). Yakuniy holatni (to'liq / qisman / nizo) server qaror qiladi.
 */
export function BuyurtmaQabul({ kompaniyaId, buyurtma, onYop, onTayyor }: {
  kompaniyaId: number; buyurtma: Pick<BuyurtmaRoyxatQator, 'id' | 'versiya'>; onYop: () => void; onTayyor: () => void;
}) {
  const [tafsilot, setTafsilot] = useState<BuyurtmaTafsilot | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [batafsil, setBatafsil] = useState(false);
  const [miqdorlar, setMiqdorlar] = useState<Record<number, string>>({});
  const [holatlar, setHolatlar] = useState<Record<number, QabulQatorHolat>>({});
  const [band, setBand] = useState(false);
  const [operationId] = useState(() => yangiOperationId());

  useEffect(() => {
    let bekor = false;
    void buyurtmaTafsilotOl(kompaniyaId, buyurtma.id).then((r) => {
      if (bekor) return;
      if (!r.ok) { setXato(t(buyurtmaXatosi(r))); return; }
      setTafsilot(r);
      setMiqdorlar(Object.fromEntries(r.qatorlar.map((q) => [q.id, String(q.miqdor)])));
    });
    return () => { bekor = true; };
  }, [kompaniyaId, buyurtma.id]);

  const yubor = async (qisman: boolean) => {
    if (!tafsilot) return;
    const qatorlar: BuyurtmaQabulQator[] = [];
    for (const q of tafsilot.qatorlar) {
      const m = qisman ? Number(miqdorlar[q.id]) : Number(q.miqdor);
      if (!Number.isFinite(m) || m < 0) { toast(t('Kelgan miqdor noto‘g‘ri'), 'warn'); return; }
      qatorlar.push({ buyurtma_qator_id: q.id, qabul_miqdor: m, holat: qisman ? (holatlar[q.id] ?? 'butun') : 'butun' });
    }
    setBand(true);
    try {
      const r = await buyurtmaQabul(kompaniyaId, { buyurtmaId: buyurtma.id, kutilganVersiya: tafsilot.buyurtma.versiya, qatorlar }, operationId);
      if (!r.ok) { toast(t(buyurtmaXatosi(r)), 'danger'); return; }
      toast(r.holat === 'nizo' ? t('Qabul saqlandi: nizo belgilandi') : r.holat === 'qisman' ? t('Qabul saqlandi: qisman') : t('Qabul qilindi'), r.holat === 'nizo' ? 'warn' : 'ok');
      onTayyor();
    } finally { setBand(false); }
  };

  return (
    <OpsOyna ochiq onYop={onYop} band={band} ikon={<PackageCheck />} sarlavha={t('Buyurtmani qabul qilish') + ' #' + buyurtma.id} kenglik={560}
      amallar={<>
        <button type="button" onClick={onYop} disabled={band} className="fz-btn fz-btn--ghost">{t('Yopish')}</button>
        {batafsil
          ? <button type="button" onClick={() => void yubor(true)} disabled={band || !tafsilot} className="fz-btn fz-btn--primary">{t('Qabulni saqlash')}</button>
          : <button type="button" onClick={() => void yubor(false)} disabled={band || !tafsilot} className="fz-btn fz-btn--primary">{t('Hammasi to‘liq keldi')}</button>}
      </>}>
      {xato && <p className="fz-note" role="alert">{xato}</p>}
      {!xato && !tafsilot && <div className="skel h-16 rounded" />}
      {!xato && tafsilot && (<>
        <ul className="divide-y divide-border text-[13px]">
          {tafsilot.qatorlar.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-medium">{q.nom}</span>
              {batafsil ? (
                <span className="inline-flex items-center gap-2">
                  <input type="number" min="0" step="any" value={miqdorlar[q.id] ?? ''} onChange={(e) => setMiqdorlar({ ...miqdorlar, [q.id]: e.target.value })}
                    className="w-24 text-right tabular-nums" aria-label={t('Kelgan miqdor') + ': ' + q.nom} />
                  <span className="text-text-mute">/ <FmtN val={q.miqdor} /> {q.birlik}</span>
                  <select value={holatlar[q.id] ?? 'butun'} onChange={(e) => setHolatlar({ ...holatlar, [q.id]: e.target.value as QabulQatorHolat })} aria-label={t('Holati') + ': ' + q.nom}>
                    <option value="butun">{t('Butun')}</option>
                    <option value="kam">{t('Kam keldi')}</option>
                    <option value="shikast">{t('Shikastlangan')}</option>
                  </select>
                </span>
              ) : <span className="tabular-nums"><FmtN val={q.miqdor} /> {q.birlik}</span>}
            </li>
          ))}
        </ul>
        {!batafsil && <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm self-start" onClick={() => setBatafsil(true)}>{t('Qisman yoki muammo bor')}</button>}
      </>)}
    </OpsOyna>
  );
}
