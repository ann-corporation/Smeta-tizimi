/**
 * F2 reestri «Takrorlar» bo‘limi (egasi 2026-10-25): bir xil raqam (bir shartnoma/obyekt doirasida), bir xil summa + obyekt,
 * tuzatish aktlari («N-П») va ularning asl akti juftligi. Faqat ko‘rsatadi — hech narsa o‘zgartirmaydi.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { ReestrMalumot } from '../../api/t2-f2-reestr';
import { reestrTakrorlar, type TakrorAkt, type TakrorGuruh } from '../../lib/f2-dublikat/reestrTakror';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';

const SARLAVHA: Record<TakrorGuruh['tur'], string> = {
  raqam: 'Bir xil raqam (bir shartnoma yoki obyekt doirasida)',
  summa: 'Bir obyektda bir xil summa (±0,5%)',
  tuzatish: 'Tuzatish aktlari va ularning asl akti',
};

export function F2Takrorlar({ malumot }: { malumot: ReestrMalumot }) {
  const guruhlar = useMemo(() => {
    const akt: TakrorAkt[] = malumot.aktlar.map((a) => ({ id: a.id, obyekt_id: a.obyekt_id, oy: a.oy, raqam: a.raqam, holat: a.holat, hujjat_jami: a.hujjat_jami }));
    const sh = new Map<number, number[]>([...malumot.shartnomalar].map(([oid, l]) => [oid, l.map((s) => s.id)]));
    return reestrTakrorlar(akt, sh);
  }, [malumot]);
  const nom = useMemo(() => new Map(malumot.obyektlar.map((o) => [o.id, o.nom])), [malumot]);
  const turlar = (['raqam', 'summa', 'tuzatish'] as const).map((tur) => ({ tur, l: guruhlar.filter((g) => g.tur === tur) }));
  const jami = guruhlar.filter((g) => g.tur !== 'tuzatish').length;
  return <details className="karta p-3 text-[12.5px]" open={jami > 0} aria-label={t('Takrorlar')}>
    <summary className="cursor-pointer font-semibold">
      {t('Takrorlar tekshiruvi')}: {jami > 0 ? <span className="text-warn">{t('{n} ta guruh tekshirilsin', { n: jami })}</span> : <span className="text-ok">{t('takror topilmadi')}</span>}
    </summary>
    <div className="mt-2 space-y-3">
      {turlar.map(({ tur, l }) => l.length > 0 && <div key={tur}>
        <div className="mb-1 text-[11px] font-semibold text-text-dim">{t(SARLAVHA[tur])} · {l.length}</div>
        <ul className="space-y-1.5">
          {l.map((g, i) => <li key={`${tur}-${g.kalit}-${i}`} className="rounded-lg border border-border/60 p-2">
            <div className="font-medium">{tur === 'summa' ? (nom.get(Number(g.kalit)) ?? `#${g.kalit}`) : g.kalit}
              {g.aslYoq && <span className="ml-2 text-warn">{t('asl akt topilmadi')}</span>}</div>
            <ul className="mt-1 text-text-dim">
              {g.aktlar.map((a, j) => <li key={a.id}>
                {tur === 'tuzatish' && <span className="mr-1 text-text-mute">{j === 0 ? t('tuzatish') : t('asl')}</span>}
                <Link className="text-accent underline" to={`/admin/f2-tarix?obyekt=${a.obyekt_id}`}>#{a.id}</Link>
                {' · '}{nom.get(a.obyekt_id) ?? `#${a.obyekt_id}`} · {a.oy.slice(0, 7)} · №{a.raqam ?? '—'} · {a.holat}
                {' · '}{a.hujjat_jami != null ? <FmtN val={a.hujjat_jami} /> : <span className="text-warn">{t('noma’lum')}</span>}
              </li>)}
            </ul>
          </li>)}
        </ul>
      </div>)}
    </div>
  </details>;
}