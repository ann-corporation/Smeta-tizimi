import { useState } from 'react';
import { t } from '../../i18n/til';
import { hajmMatni } from '../../lib/fayl-daraxt';

/**
 * R2 dublikatlarni tozalash (egasi 2026-10-20: «dublikatlar R2 da yig'ilib axlatxona»). Faqat platforma superadmini
 * (server har chaqiruvda bazada tekshiradi). 1) Tekshirish — hech narsa o'zgarmaydi. 2) Birlashtirish — nusxa yozuvlar bitta
 * obyektga bog'lanadi, eski obyektlar o'chirilmaydi. 3) Yetimlarni o'chirish — hech kim ishlatmaydigan obyektlar R2 dan
 * o'chadi (qaytarib bo'lmaydi, tasdiq so'raladi).
 */
type Holat = { guruh: number; tejash: number; yetim: number };

async function soro(usul: 'GET' | 'POST', tana?: unknown): Promise<Record<string, unknown>> {
  const r = await fetch('/api/r2-dublikat', usul === 'GET' ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tana) });
  const j: Record<string, unknown> | null = await r.json().catch(() => null);
  if (!r.ok || !j || j.ok !== true) throw new Error(String(j?.code ?? r.status));
  return j;
}

export function R2DublikatPanel() {
  const [holat, setHolat] = useState<Holat | null>(null);
  const [band, setBand] = useState<string | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);

  const tekshir = async () => {
    setBand(t('Tekshirilmoqda…')); setXabar(null);
    try {
      const j = await soro('GET');
      setHolat({ guruh: (j.guruhlar as unknown[]).length, tejash: Number(j.jami_tejash_bytes ?? 0), yetim: Number(j.yetim_kutilmoqda ?? 0) });
    } catch (e) { setXabar(t('Xato: {x}', { x: e instanceof Error ? e.message : String(e) })); }
    finally { setBand(null); }
  };

  const birlashtir = async () => {
    setXabar(null);
    let jami = 0, yetim = 0; const otkaz: number[] = [];
    try {
      for (let i = 0; i < 50; i++) {
        setBand(t('Birlashtirilmoqda… {n} ta yozuv', { n: jami }));
        const j = await soro('POST', { amal: 'birlashtir', otkaz });
        jami += Number(j.birlashtirildi ?? 0); yetim += Number(j.yetim ?? 0);
        for (const o of (j.otkazildi as Array<{ asosiy_id: number }> | undefined) ?? []) otkaz.push(o.asosiy_id);
        if (!Number(j.qoldi)) break;
      }
      setXabar(t('Birlashtirildi: {n} ta yozuv, {y} ta eski obyekt yetim bo‘ldi.{o}', { n: jami, y: yetim,
        o: otkaz.length ? ' ' + t('{k} ta guruh o‘tkazib yuborildi (asosiy obyekt R2 da tasdiqlanmadi).', { k: otkaz.length }) : '' }));
    } catch (e) { setXabar(t('Xato: {x}', { x: e instanceof Error ? e.message : String(e) })); }
    finally { setBand(null); void tekshir(); }
  };

  const yetimOchir = async () => {
    if (!window.confirm(t('Hech bir hujjat ishlatmaydigan eski R2 obyektlari butunlay o‘chiriladi. Bu amalni qaytarib bo‘lmaydi. Davom etilsinmi?'))) return;
    setXabar(null);
    let soni = 0, bayt = 0;
    try {
      for (let i = 0; i < 100; i++) {
        setBand(t('O‘chirilmoqda… {n} ta obyekt', { n: soni }));
        const j = await soro('POST', { amal: 'yetim_ochir' });
        soni += Number(j.ochirildi ?? 0); bayt += Number(j.bayt ?? 0);
        if (!Number(j.qoldi) || !Number(j.ochirildi)) break;
      }
      setXabar(t('R2 dan o‘chirildi: {n} ta obyekt, {h} bo‘shadi.', { n: soni, h: hajmMatni(bayt) }));
    } catch (e) { setXabar(t('Xato: {x}', { x: e instanceof Error ? e.message : String(e) })); }
    finally { setBand(null); void tekshir(); }
  };

  return (
    <section className="karta space-y-2 p-3 text-[12px]" aria-label={t('R2 dublikatlar')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-text">{t('R2 dublikatlar (superadmin)')}</span>
        {holat && <span className="text-text-dim">{t('{g} guruh · {h} tejaladi · yetim: {y}', { g: holat.guruh, h: hajmMatni(holat.tejash), y: holat.yetim })}</span>}
        <span className="ml-auto flex flex-wrap gap-1.5">
          <button type="button" className="tugma h-7 px-2 text-[11px]" disabled={!!band} onClick={() => void tekshir()}>{t('Tekshirish')}</button>
          <button type="button" className="tugma h-7 px-2 text-[11px]" disabled={!!band || !holat?.guruh} onClick={() => void birlashtir()}>{t('Birlashtirish')}</button>
          <button type="button" className="tugma h-7 px-2 text-[11px] text-danger" disabled={!!band || !holat?.yetim} onClick={() => void yetimOchir()}>{t('Yetimlarni R2 dan o‘chirish')}</button>
        </span>
      </div>
      <p className="text-[11px] text-text-mute">{t('Hujjat yozuvlari o‘zgarmaydi — faqat bir xil baytlar bitta obyektda saqlanadi. Birlashtirish hech narsani o‘chirmaydi; o‘chirish alohida tugma.')}</p>
      {band && <p role="status" className="text-text-dim">{band}</p>}
      {xabar && <p role="status" className="text-text">{xabar}</p>}
    </section>
  );
}
