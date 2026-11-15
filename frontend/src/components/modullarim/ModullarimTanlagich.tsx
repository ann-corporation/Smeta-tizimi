/**
 * ModullarimTanlagich — foydalanuvchi O'ZI ishlatadigan modullarni tanlaydi (Telegram modeli). Akkaunt markazi bo'limi va birinchi
 * kirishdagi oyna shu komponentni ishlatadi. Ro'yxat — kompaniya ruxsatiga ko'ra foydalanuvchiga ochiq modullar (menyu filtri bilan
 * bir manba); tanlash ruxsat BERMAYDI, faqat menyuni toraytiradi. Hech narsa tanlanmasa — hamma ochiq modul ko'rinadi.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { useModullar } from '../../api/t2-modul';
import { MODUL_TANLOV_KALIT, korildiYoz, tanlovSaqla, useModulTanlov } from '../../api/modullarim';
import { menyuQur, menyuYollari, type NavKontekst } from '../../lib/nav/navFiltr';
import { tanlanadiganModullar, tanlovAlmashtir, tanlovTozala, type Tanlov } from '../../lib/modullarim/modullarim';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { Nota, Skelet } from '../akkaunt/AkkauntUi';

export function ModullarimTanlagich({ kompaniyaId, onTayyor, onKeyin }: { kompaniyaId: number; onTayyor?: () => void; onKeyin?: () => void }) {
  const k = useKompaniya();
  const qc = useQueryClient();
  const modulQ = useModullar(kompaniyaId);
  const q = useModulTanlov(kompaniyaId);
  const [qoralama, setQoralama] = useState<Tanlov | null>(null);
  const [band, setBand] = useState(false);

  const rol = k.superadmin ? 'superadmin' : (k.joriy?.rol ?? '');
  const royxat = useMemo(() => {
    const navK: NavKontekst = { superadmin: !!k.superadmin, rol, permissions: k.joriy?.permissions, modullar: modulQ.data };
    return tanlanadiganModullar(menyuYollari(menyuQur({ ...navK, ilova: 'hammasi' })));
  }, [k.superadmin, rol, k.joriy?.permissions, modulQ.data]);

  if (q.isLoading) return <Skelet qatorlar={4} />;
  const joriy: Tanlov = qoralama ?? (q.data ? { tanlangan: q.data.tanlangan, tartib: q.data.tartib, versiya: q.data.versiya } : { tanlangan: [], tartib: [], versiya: 0 });
  const tanlanganSoni = royxat.filter((m) => joriy.tanlangan.includes(m.kod)).length;
  const ozgargan = qoralama !== null;

  async function saqla(t0: Tanlov) {
    setBand(true);
    const r = await tanlovSaqla(kompaniyaId, t0);
    setBand(false);
    korildiYoz(kompaniyaId);
    qc.setQueryData([MODUL_TANLOV_KALIT, kompaniyaId], r);
    setQoralama(null);
    toast(t('Modullarim saqlandi'), 'ok');
    onTayyor?.();
  }
  function keyinroq() { korildiYoz(kompaniyaId); onKeyin?.(); }

  return (
    <div className="flex flex-col gap-3" data-testid="modullarim-tanlagich">
      <p className="text-[12px] text-text-dim m-0">
        {t('Kerakli modullarni belgilang — yon menyuda faqat shular ko‘rinadi. Hech narsa belgilanmasa, sizga ochiq hamma modul ko‘rinadi. Tanlov sizga yangi ruxsat bermaydi.')}
      </p>
      {q.data?.manba === 'mahalliy' && <Nota tur="info">{t('Tanlovingiz shu qurilmada saqlanadi; server tayyor bo‘lgach boshqa qurilmalar bilan ham sinxronlanadi.')}</Nota>}
      {royxat.length === 0
        ? <Nota tur="info">{t('Hozircha sizga ochiq modul yo‘q.')}</Nota>
        : (
          <ul className="grid gap-2 m-0 p-0 list-none" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
            {royxat.map((m) => {
              const tanlangan = joriy.tanlangan.includes(m.kod);
              return (
                <li key={m.kod}>
                  <button type="button" role="checkbox" aria-checked={tanlangan} data-modul={m.kod}
                    onClick={() => setQoralama(tanlovAlmashtir(joriy, m.kod))}
                    className="w-full flex items-start gap-2 rounded-md border px-3 py-2 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                    style={{ borderColor: tanlangan ? 'var(--accent)' : 'var(--border)', background: tanlangan ? 'var(--accent-soft)' : 'var(--surface-2)' }}>
                    <span aria-hidden="true" className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--border-strong)]">
                      {tanlangan && <Check size={12} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-text">{t(m.nom)}</span>
                      <span className="block text-[11px] text-text-dim">{t(m.izoh)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" className="fz-btn fz-btn--primary" disabled={band || (!ozgargan && !onKeyin)} onClick={() => void saqla(joriy)}>
          {band ? <Loader2 className="animate-spin" size={14} /> : t('Saqlash')}
        </button>
        {tanlanganSoni > 0 && (
          <button type="button" className="fz-btn fz-btn--ghost" disabled={band} onClick={() => setQoralama(tanlovTozala(joriy))}>
            {t('Hammasini ko‘rsatish')}
          </button>
        )}
        {onKeyin && <button type="button" className="fz-btn fz-btn--ghost" disabled={band} onClick={keyinroq}>{t('Keyinroq')}</button>}
      </div>
    </div>
  );
}
