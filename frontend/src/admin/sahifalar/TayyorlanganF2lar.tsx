import { useEffect, useState } from 'react';
import { sbT2AktReestrOl, type T2AktReestr } from '../../api/supabase';
import { f2ImportQilinganmi } from '../../lib/f2-manba';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { ZakazchigaYuborish } from '../zakazchik/ZakazchigaYuborish';

/**
 * F2 tayyorlash bo'limida: shu obyektda TIZIMDA tayyorlangan F2 lar va «Zakazchikka yuborish» (egasi 2026-10-20).
 * F2 importdan kiritilgan o'tgan davr aktlari bu ro'yxatga kirmaydi — ularni yuborish ma'nosiz.
 * Yuborish faqat ichki tasdiqlangan aktda (tasdiqlash — F2 tarixi va tasdiqlash sahifasida).
 */
export function TayyorlanganF2lar({ kompaniyaId, obyektId, yangilash = 0 }: { kompaniyaId?: number | null; obyektId: number; yangilash?: number }) {
  const [aktlar, setAktlar] = useState<T2AktReestr[] | null>(null);
  useEffect(() => {
    let faol = true;
    setAktlar(null);
    void (async () => {
      try {
        const r = await sbT2AktReestrOl(obyektId);
        const f2 = (r.ok ? r.qatorlar ?? [] : []).filter((a) => a.tur === 'f2' && a.holat !== 'bekor');
        const belgilar = await Promise.all(f2.map((a) => f2ImportQilinganmi(a.id).catch(() => false)));
        if (faol) setAktlar(f2.filter((_, i) => !belgilar[i]));
      } catch { if (faol) setAktlar([]); }
    })();
    return () => { faol = false; };
  }, [obyektId, yangilash]);
  if (!aktlar?.length) return null;
  return (
    <section className="karta space-y-1.5 p-3 text-[12px]" aria-label={t('Tayyorlangan F2 lar')}>
      <p className="font-semibold text-text">{t('Shu obyektda tayyorlangan F2 lar')}</p>
      <ul className="space-y-1">
        {aktlar.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 border-b border-border/40 pb-1 last:border-0">
            <span className="font-medium text-text">№ {a.raqam || '—'}</span>
            <span className="text-text-dim">{a.oy?.slice(0, 7)}</span>
            <span className="tabular-nums text-text-dim"><FmtN val={a.hujjat_jami} /></span>
            <span className={a.lifecycle_status === 'approved' ? 'text-ok' : 'text-warn'}>
              {a.lifecycle_status === 'approved' ? t('tasdiqlangan') : a.holat === 'qoralama' ? t('qoralama — avval F2 tarixida tasdiqlang') : a.lifecycle_status ?? a.holat}
            </span>
            <span className="ml-auto flex items-center gap-2">
              {a.lifecycle_status === 'approved'
                ? <ZakazchigaYuborish kompaniyaId={kompaniyaId} aktId={a.id} />
                : <a className="underline text-accent" href={`/admin/f2-tarix?obyekt=${obyektId}`}>{t('Tasdiqlashga')}</a>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
