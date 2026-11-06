import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { t } from '../../i18n/til';
import { qatorMuhrFarqOl } from '../../api/t2-qator-muhr';
import { muhrXaritasi, muhrXulosa, MUHR_MAYDON_NOMI, type QatorMuhrFarq } from '../../lib/qator-muhr/farq';

/**
 * SMETA CONST (egasi 2026-10-27): obyekt smetasining asl muhridan farqi. O'qish — view `t2_qator_muhr_farq`.
 * `yangilash` o'zgarsa (daraxt qayta yuklangan) — qayta o'qiladi. O'qib bo'lmasa (masalan migratsiya hali qo'llanmagan) —
 * jim: belgi ko'rinmaydi, smeta ishlashda davom etadi.
 */
export function useMuhrFarq(obyektId: number | null, qatorlar: readonly { id?: number | null; versiya?: number | null }[] | null | undefined) {
  const [royxat, setRoyxat] = useState<QatorMuhrFarq[]>([]);
  /* Massiv havolasiga emas, mazmun imzosiga bog'lanadi: har renderda yangi massiv qaytsa ham (masalan bo'sh `[]`)
   * cheksiz qayta o'qish/render bo'lmaydi; qator tahrirlansa versiya o'zgaradi — imzo yangilanadi. */
  const imzo = useMemo(() => {
    const q = qatorlar ?? [];
    let v = 0, maxId = 0;
    for (const r of q) { v += Number(r.versiya) || 0; maxId = Math.max(maxId, Number(r.id) || 0); }
    return `${q.length}:${v}:${maxId}`;
  }, [qatorlar]);
  useEffect(() => {
    let faol = true;
    setRoyxat((p) => (p.length ? [] : p));
    // Tezlik (2026-11-06): daraxt hali yuklanmagan (bo'sh) paytda o'qilmaydi — avval har ochilishda 2 marta o'qilardi
    // (bo'sh imzo, keyin qatorlar kelgach). Qatorlar kelishi bilan bir marta o'qiladi.
    if (obyektId == null || imzo.startsWith('0:')) return;
    void qatorMuhrFarqOl(obyektId).then((r) => { if (faol && r.ok) setRoyxat((r.qatorlar || []) as QatorMuhrFarq[]); }).catch(() => { /* jim */ });
    return () => { faol = false; };
  }, [obyektId, imzo]);
  const xarita = useMemo(() => muhrXaritasi(royxat), [royxat]);
  return { royxat, xarita };
}

/** Daraxt ustidagi xulosa: nechta o'zgargan / qo'shilgan / o'chirilgan; o'chirilganlar ro'yxati shu yerda (daraxtda yo'q). */
export function MuhrFarqXulosa({ royxat }: { royxat: readonly QatorMuhrFarq[] }) {
  const x = useMemo(() => muhrXulosa(royxat), [royxat]);
  const ochirilgan = useMemo(() => royxat.filter((f) => f.holat === 'ochirilgan'), [royxat]);
  if (!x.jami) return null;
  const qismlar = [
    x.ozgargan ? `${x.ozgargan} ${t('ta o‘zgargan')}` : '',
    x.narxQoyildi ? `${x.narxQoyildi} ${t('tasida narx qo‘yilgan')}` : '',
    x.qoshilgan ? `${x.qoshilgan} ${t('ta qo‘shilgan')}` : '',
    x.ochirilgan ? `${x.ochirilgan} ${t('ta o‘chirilgan')}` : '',
    x.muhrsiz ? `${x.muhrsiz} ${t('ta muhrsiz')}` : '',
  ].filter(Boolean);
  const ton = x.ozgargan || x.ochirilgan ? 'warn' : 'info';
  return (
    <details className={`fz-note fz-note--${ton}`} style={{ display: 'block' }}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1">
        <ShieldAlert size={15} aria-hidden="true" />
        <b>{t('Asl smetadan farq')}:</b>
        <span>{qismlar.join(' · ')}</span>
        {x.jurnalsiz > 0 && <span className="fz-stamp fz-stamp--warn" title={t('O‘zgarishlar jurnalida yozuv yo‘q — o‘zgarish import yoki ommaviy amal orqali qilingan.')}>{x.jurnalsiz} {t('ta jurnalsiz')}</span>}
        {x.ekspertizagacha > 0 && <span className="fz-chip">{t('ekspertizagacha bo‘limda')}: {x.ekspertizagacha}</span>}
        <span className="ml-auto text-[11.5px] text-text-mute">{t('Daraxtda «Asl smetadan farq» filtri')}</span>
      </summary>
      <div className="mt-2 text-[12px]">
        <p className="text-text-mute">{t('Asl smeta qatorlari muhrlangan: har o‘zgarish (hatto bitta vergul) shu yerda va daraxtdagi belgida «avval / endi» bilan ko‘rinadi. Tahrirlash taqiqlanmaydi.')}</p>
        {ochirilgan.length > 0 && <div className="mt-2">
          <p className="fz-panel__h">{t('O‘chirilgan asl qatorlar')}</p>
          <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto">
            {ochirilgan.slice(0, 200).map((f) => <li key={f.qator_id} className="flex gap-2">
              <span className="font-mono text-text-mute">{f.kod || '—'}</span>
              <span className="min-w-0 flex-1 truncate" title={f.nom ?? ''}>{f.nom || t('Nomsiz')}</span>
              <span className="text-text-mute">#{f.qator_id}</span>
            </li>)}
          </ul>
          {ochirilgan.length > 200 && <p className="text-text-mute">… {t('va yana')} {ochirilgan.length - 200}</p>}
        </div>}
        <p className="mt-2 text-[11px] text-text-mute">{t('Kuzatiladigan maydonlar')}: {Object.values(MUHR_MAYDON_NOMI).map((m) => t(m)).join(', ')}.</p>
      </div>
    </details>
  );
}
