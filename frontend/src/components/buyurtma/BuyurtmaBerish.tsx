import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { OpsMaydon, OpsOyna } from '../kompaniya-ops/OpsUi';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { buyurtmaXatosi, buyurtmaYarat } from '../../api/t2-buyurtma';
import { yangiOperationId } from '../../api/supabase';
import type { T2Zayavka } from '../../api/t2-zayavka';
import type { Yetkazuvchi } from './aloqalar';
import { buyurtmaMiqdori } from './hisob';

/**
 * «Buyurtma berish» - zayavka (ta'minotda) -> yetkazuvchiga buyurtma. Oddiy: yetkazuvchini tanlang, miqdor va (ixtiyoriy) narx, bitta tugma.
 * Yetkazuvchi - faqat tizimga ulangan (faol aloqali) kompaniya. Yo'q bo'lsa - tushunarli xabar va taklif yuborish havolasi.
 * Narx NDS siz; bo'sh qoldirilsa NOMA'LUM (0 emas) yoziladi.
 */
export function BuyurtmaBerish({ kompaniyaId, zayavka, yetkazuvchilar, onYop, onBerildi }: {
  kompaniyaId: number; zayavka: T2Zayavka; yetkazuvchilar: Yetkazuvchi[] | null; onYop: () => void; onBerildi: (buyurtmaId: number | undefined) => void;
}) {
  const [tanlangan, setTanlangan] = useState('');
  const [miqdor, setMiqdor] = useState(String(buyurtmaMiqdori(zayavka)));
  const [narx, setNarx] = useState('');
  const [band, setBand] = useState(false);
  const [operationId] = useState(() => yangiOperationId());
  const yoq = yetkazuvchilar !== null && yetkazuvchilar.length === 0;

  const yubor = async () => {
    const y = yetkazuvchilar?.find((x) => String(x.kompaniyaId) === tanlangan);
    const m = Number(miqdor);
    if (!y) { toast(t('Yetkazuvchini tanlang'), 'warn'); return; }
    if (!Number.isFinite(m) || m <= 0) { toast(t('Miqdor musbat son bo‘lishi kerak.'), 'warn'); return; }
    const n = narx.trim() === '' ? null : Number(narx);
    if (n != null && (!Number.isFinite(n) || n < 0)) { toast(t('Narx noto‘g‘ri'), 'warn'); return; }
    setBand(true);
    try {
      const r = await buyurtmaYarat(kompaniyaId, {
        ijrochiKompaniyaId: y.kompaniyaId, aloqaId: y.aloqaId, obyektId: zayavka.obyektId,
        qatorlar: [{ nom: zayavka.itemText, birlik: zayavka.unit || 'dona', miqdor: m, narx: n, zayavka_id: zayavka.id }],
      }, operationId);
      if (!r.ok) { toast(t(buyurtmaXatosi(r)), 'danger'); return; }
      toast(t('Buyurtma yuborildi'), 'ok');
      onBerildi(r.id);
    } finally { setBand(false); }
  };

  return (
    <OpsOyna ochiq onYop={onYop} band={band} ikon={<Truck />} sarlavha={t('Buyurtma berish')}
      amallar={<>
        <button type="button" onClick={onYop} disabled={band} className="fz-btn fz-btn--ghost">{t('Bekor qilish')}</button>
        <button type="button" onClick={() => void yubor()} disabled={band || yoq || yetkazuvchilar === null} className="fz-btn fz-btn--primary">
          {band ? t('Yuborilmoqda…') : t('Buyurtma berish')}
        </button>
      </>}>
      <p className="text-[13px] text-text-dim"><b>{zayavka.itemText}</b></p>
      {yoq ? (
        <section className="fz-note" role="alert">
          <span>{t('Yetkazuvchi tizimga ulanmagan — taklif yuboring')}. <Link to="/admin/kontragentlar?tab=aloqa" className="underline">{t('Taklif yuborish')}</Link></span>
        </section>
      ) : (<>
        <OpsMaydon nom={t('Yetkazuvchi')} majburiy>
          <select value={tanlangan} onChange={(e) => setTanlangan(e.target.value)} disabled={yetkazuvchilar === null} aria-label={t('Yetkazuvchi')}>
            <option value="">{yetkazuvchilar === null ? t('Yuklanmoqda…') : t('— tanlang —')}</option>
            {(yetkazuvchilar ?? []).map((y) => <option key={y.kompaniyaId} value={y.kompaniyaId}>{y.nom || '#' + y.kompaniyaId}</option>)}
          </select>
        </OpsMaydon>
        <div className="grid grid-cols-[1fr_1fr] gap-3">
          <OpsMaydon nom={t('Miqdor') + (zayavka.unit ? ' (' + zayavka.unit + ')' : '')} majburiy>
            <input type="number" min="0" step="any" value={miqdor} onChange={(e) => setMiqdor(e.target.value)} className="text-right tabular-nums" aria-label={t('Miqdor')} />
          </OpsMaydon>
          <OpsMaydon nom={t('Narx (so‘m, QQS siz)')} izoh={t('Bo‘sh qoldirsangiz — narx noma’lum')}>
            <MoneyInput value={narx} onValueChange={setNarx} className="text-right tabular-nums" aria-label={t('Narx (so‘m, QQS siz)')} />
          </OpsMaydon>
        </div>
      </>)}
    </OpsOyna>
  );
}
