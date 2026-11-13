import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { buyurtmalarOl, type BuyurtmaRoyxatQator } from '../../api/t2-buyurtma';
import { BuyurtmaChip } from './BuyurtmaChip';
import { BuyurtmaQabul } from './BuyurtmaQabul';
import { kompaniyaNomi, type Yetkazuvchi } from './aloqalar';
import { ytBuyurtmaYuklar, type BuyurtmaYuk } from '../../api/t2-yuk-tashish';

/**
 * Berilgan buyurtmalar (xaridor tomoni, zayavka sahifasida): holat yorlig'i bilan. Yetkazuvchi «Topshirdim» desa -
 * shu qatorda bitta tugma: «Qabul qildim». Summa NDS siz; narx kiritilmagan bo'lsa - «narx noma'lum» (0 emas).
 */
export function BuyurtmaRoyxati({ kompaniyaId, yetkazuvchilar, yangilash, onOzgardi }: {
  kompaniyaId: number; yetkazuvchilar: Yetkazuvchi[] | null; yangilash: number; onOzgardi?: () => void;
}) {
  const [qatorlar, setQatorlar] = useState<BuyurtmaRoyxatQator[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [qabul, setQabul] = useState<BuyurtmaRoyxatQator | null>(null);
  const [kalit, setKalit] = useState(0);
  const [yuklar, setYuklar] = useState<Record<number, BuyurtmaYuk>>({});

  useEffect(() => {
    let bekor = false;
    void buyurtmalarOl({ kompaniyaId, yonalish: 'meniki', limit: 100 }).then((r) => {
      if (bekor) return;
      if (r.ok) { setQatorlar(r.qatorlar); setXato(null); } else { setXato(r.error); setQatorlar((q) => q ?? []); }
    });
    return () => { bekor = true; };
  }, [kompaniyaId, yangilash, kalit]);
  useEffect(() => {
    if (!qatorlar || qatorlar.length === 0) return;
    let bekor = false;
    void ytBuyurtmaYuklar(kompaniyaId, qatorlar.map((q) => q.id)).then((r) => { if (!bekor && r.ok) setYuklar(Object.fromEntries((r.natija.yuklar ?? []).map((y) => [y.buyurtma_id, y]))); });
    return () => { bekor = true; };
  }, [kompaniyaId, qatorlar]);
  const qaytaYukla = useCallback(() => setKalit((k) => k + 1), []);

  const harakat = (b: BuyurtmaRoyxatQator) => {
    if (b.holat === 'topshirildi') return <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" onClick={() => setQabul(b)}>{yuklar[b.id]?.holat === 'yetkazildi' ? t('Yetkazildi — qabul qiling') : t('Qabul qildim')}</button>;
    if (b.holat === 'qisman' || b.holat === 'nizo') return <span className="text-[12px] text-text-mute">{t('Yetkazuvchi bilan kelishiladi')}</span>;
    const y = yuklar[b.id];
    if (y) return <span className="text-[12px] text-text-mute">{y.holat === 'yetkazildi' ? t('Mashina yukni yetkazdi — yetkazuvchi «Topshirdim» belgilagach qabul qilinadi.') : t('Mashina chaqirilgan')}</span>;
    if (['yuborildi', 'qabul_qilindi', 'bajarilmoqda', 'tayyor'].includes(b.holat)) return <Link className="fz-btn fz-btn--sm" to={'/admin/yuk-chaqirish?buyurtma=' + b.id + '&nom=' + encodeURIComponent('Buyurtma #' + b.id)}>{t('Mashina top')}</Link>;
    return null;
  };
  if (qatorlar === null) return null;
  if (qatorlar.length === 0 && !xato) return null;
  return (
    <section className="fz-panel" aria-label={t('Berilgan buyurtmalar')}>
      <div className="fz-panel__h"><span className="inline-flex items-center gap-2"><Truck size={14} />{t('Berilgan buyurtmalar')}</span><span>{qatorlar.length}</span></div>
      {xato && <p className="fz-note" role="alert">{xato}</p>}
      <div className="fz-table-wrap">
        <table className="fz-table">
          <thead>
            <tr>
              <th>{t('№')}</th>
              <th>{t('Yetkazuvchi')}</th>
              <th className="fz-c-num">{t('Qatorlar')}</th>
              <th className="fz-c-num">{t('Summa (QQS siz)')}</th>
              <th>{t('Holat')}</th>
              <th style={{ textAlign: 'right' }}>{t('Keyingi qadam')}</th>
            </tr>
          </thead>
          <tbody>
            {qatorlar.map((b) => (
              <tr key={b.id}>
                <td><span className="fz-c-shifr">{'#' + b.id}</span></td>
                <td>{kompaniyaNomi(yetkazuvchilar, b.ijrochi_kompaniya_id)}</td>
                <td className="fz-c-num">{b.qator_soni}</td>
                <td className="fz-c-num">{b.summa_nds_siz == null ? <span className="text-text-mute">{t('narx noma’lum')}</span> : <FmtN val={b.summa_nds_siz} />}</td>
                <td><BuyurtmaChip holat={b.holat} /></td>
                <td className="text-right">
                  {harakat(b)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {qabul && <BuyurtmaQabul kompaniyaId={kompaniyaId} buyurtma={qabul} onYop={() => setQabul(null)} onTayyor={() => { setQabul(null); qaytaYukla(); onOzgardi?.(); }} />}
    </section>
  );
}
