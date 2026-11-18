/**
 * AdminPanel.tsx - Disk boshqaruvi (kompaniya boshqaruvchisi): ishlatilgan/limit, eng katta papkalar, versiya va savat hajmi,
 * "savatni bo'shatish" / "eski versiyalarni o'chirish", tashqi havola va pay-as-you-go sozlamalari, trafik va kunlik hisob.
 * Narxlar va limitlar sozlanadigan (t2_token_sozlama / t2_tarif / t2_token_narx) - bu yerda faqat ko'rsatiladi.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from '../umumiy/ui/Toast';
import { t } from '../i18n/til';
import { hmAdmin, hmBosh, hmHajm, hmSozlama, hmSozlamaYoz, type HmAdmin } from '../api/t2-hujjat-maydoni';

export function AdminPanel({ kompaniyaId }: { kompaniyaId: number }) {
  const [a, setA] = useState<HmAdmin | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [soz, setSoz] = useState<{ havola_ruxsat: boolean; ortiqcha: boolean } | null>(null);
  const yangila = useCallback(async () => {
    const r = await hmAdmin(kompaniyaId);
    if (r.ok) { setA(r); setXato(null); } else setXato(r.code === 'RUXSAT_YOQ' ? t('Disk boshqaruvi faqat kompaniya boshqaruvchisi uchun.') : (r.xato ?? r.code));
    const s = await hmSozlama(kompaniyaId); if (s.ok) setSoz(s);
  }, [kompaniyaId]);
  useEffect(() => { void yangila(); }, [yangila]);
  if (xato) return <p className="text-[13px]" role="alert">{xato}</p>;
  if (!a) return <p className="text-[12px] text-text-mute">{t('Yuklanmoqda…')}</p>;
  const bosh = async (tur: 'savat' | 'eski_versiyalar') => {
    if (!window.confirm(tur === 'savat' ? t('Savat butunlay bo‘shatilsinmi? Bu qaytarilmaydi.') : t('Eski versiyalar o‘chirilsinmi? Faqat joriy versiyalar qoladi.'))) return;
    const r = await hmBosh(kompaniyaId, tur); if (!r.ok) toast(r.xato ?? r.code, 'danger'); else { toast(t('Joy bo‘shatildi'), 'ok'); void yangila(); }
  };
  const sozYoz = async (p: { havolaRuxsat?: boolean; ortiqcha?: boolean }) => { const r = await hmSozlamaYoz(kompaniyaId, p); if (!r.ok) toast(r.xato ?? r.code, 'danger'); else void yangila(); };
  const foiz = a.kvota.limit ? Math.round((a.kvota.ishlatilgan * 100) / a.kvota.limit) : 0;
  return (
    <div className="space-y-4 text-[13px]">
      <section className="fz-card"><div className="fz-card__head"><h2 className="fz-card__title">{t('Disk hajmi')}</h2></div>
        <p>{hmHajm(a.kvota.ishlatilgan)} / {hmHajm(a.kvota.limit)} ({foiz}%){a.reja ? <span className="text-text-mute"> · {a.reja.nom} {t('gacha')} {a.reja.tugaydi}</span> : <span className="text-text-mute"> · {t('Bepul reja')}</span>}</p>
        <p className="mt-1 text-text-mute">{t('Savat')}: {hmHajm(a.savat_bayt)} · {t('Eski versiyalar')}: {hmHajm(a.eski_versiya_bayt)}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="fz-btn" disabled={!a.savat_bayt} onClick={() => void bosh('savat')}>{t('Savatni bo‘shatish')}</button>
          <button type="button" className="fz-btn" disabled={!a.eski_versiya_bayt} onClick={() => void bosh('eski_versiyalar')}>{t('Eski versiyalarni o‘chirish')}</button>
          <Link className="fz-btn fz-btn--primary" to="/admin/tokenlar">{t('Disk rejasini oshirish')}</Link>
        </div>
      </section>
      <section className="fz-card"><div className="fz-card__head"><h2 className="fz-card__title">{t('Eng katta papkalar')}</h2></div>
        <table className="fz-table"><tbody>{a.top_papkalar.map((p) => <tr key={String(p.papka_id)}><td>{p.nom}</td><td className="fz-c-num">{hmHajm(p.bayt)}</td></tr>)}</tbody></table></section>
      <section className="fz-card"><div className="fz-card__head"><h2 className="fz-card__title">{t('Trafik (shu oy)')}</h2></div>
        <p>{t('Yuklab olingan')}: {hmHajm(a.trafik.chiqish)} / {t('bepul')} {hmHajm(a.trafik.bepul)} · {t('Yuklangan')}: {hmHajm(a.trafik.kirish)}</p>
        <p className="text-[12px] text-text-mute">{t('Bepul trafikdan oshgani tokenda hisoblanadi; yuklab olish hech qachon to‘xtatilmaydi.')}</p></section>
      <section className="fz-card"><div className="fz-card__head"><h2 className="fz-card__title">{t('Sozlamalar')}</h2></div>
        {soz && <div className="space-y-1.5">
          <label className="flex items-center gap-2"><input type="checkbox" checked={soz.havola_ruxsat} onChange={(e) => void sozYoz({ havolaRuxsat: e.target.checked })} /> {t('Tashqi havola orqali ulashishga ruxsat (faqat ko‘rish, muddatli)')}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={soz.ortiqcha} onChange={(e) => void sozYoz({ ortiqcha: e.target.checked })} /> {t('Limitdan oshganda xotira tokenda hisoblansin (aks holda yuklash bloklanadi)')}</label></div>}
      </section>
      {a.hisob.length > 0 && <section className="fz-card"><div className="fz-card__head"><h2 className="fz-card__title">{t('So‘nggi hisoblar')}</h2></div>
        <table className="fz-table"><tbody>{a.hisob.map((h, i) => <tr key={i}><td>{h.sana}</td><td>{h.tur}</td><td className="fz-c-num">{hmHajm(h.bayt)}</td><td className="fz-c-num">{h.token}</td><td>{h.holat}</td></tr>)}</tbody></table></section>}
    </div>
  );
}