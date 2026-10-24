/**
 * «Davom ettiriladigan F2 lar» (egasi 2026-10-24: «har birini raqamini qayerdan eslab qolaman»).
 * Serverdagi F2 V3 ish qoralamalari: akt №, oy, fayl/varaq, ✓/◐/✕ soni va foizi, oxirgi o'zgarish, kim yaratgan; «Ochish».
 * Umumiy komponent: F2 import oynasi (onOchish — shu sahifada tiklash) va F2 Reestr (havola → /admin/f2?job=…).
 * Obyekt berilmasa — kompaniya bo'yicha hammasi, obyekt bo'yicha guruhlangan. Yozilgan qoralamalar pastda, belgi bilan.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { f2DavomRoyxatOl, type T2F2DavomQator } from '../../api/t2-f2-davom';
import { t } from '../../i18n/til';
import { navbatdagilar, tartiblangan } from '../../lib/f2-ketma-ketlik';

type Props = {
  kompaniyaId: number | null | undefined;
  obyektId?: number | null;
  /** Shu sahifada tiklash (F2 import). Berilmasa — F2 import sahifasiga havola. */
  onOchish?: (jobId: number, aktId?: number) => void;
  band?: boolean;
  /** Ro'yxatni qayta o'qish uchun kalit (masalan saqlangandan keyin). */
  yangilash?: number;
};

const foiz = (n: number, jami: number) => (jami > 0 ? Math.round((n / jami) * 100) : 0);
const sana = (s: string) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
/** Fayl nomidan foydalanuvchi o'qiydigan qism: «2026-08__42__1-лот__Obyekt.xlsx» → «1-лот · Obyekt». */
export function faylQisqa(f: string | null): string {
  if (!f) return '—';
  const s = f.replace(/\.(xlsx|xlsm|xls)$/i, '').split('__');
  return (s.length >= 3 ? s.slice(2) : s).join(' · ').replace(/_/g, ' ');
}

export function F2DavomRoyxat({ kompaniyaId, obyektId, onOchish, band, yangilash }: Props) {
  const [qatorlar, setQatorlar] = useState<T2F2DavomQator[] | null>(null);
  const [xato, setXato] = useState('');
  const [yozilganKor, setYozilganKor] = useState(false);
  // Obyekt tanlangan bo'lsa — faqat o'shaniki; «Hamma obyektlar» bosilsa kompaniyaning barcha ochiq qoralamalari.
  const [hamma, setHamma] = useState(false);
  const korObyekt = hamma ? null : (obyektId ?? null);

  useEffect(() => {
    if (!kompaniyaId) { setQatorlar(null); return; }
    let faol = true;
    setXato('');
    void f2DavomRoyxatOl(kompaniyaId, korObyekt).then((r) => {
      if (!faol) return;
      if (r.ok) setQatorlar(r.qatorlar); else { setQatorlar([]); setXato(r.error ?? ''); }
    }).catch(() => { if (faol) { setQatorlar([]); setXato(t('F2 qoralamalari o‘qilmadi')); } });
    return () => { faol = false; };
  }, [kompaniyaId, korObyekt, yangilash]);

  // Obyekt ichida eski oydan yangiga, keyin F2 raqami; har obyektda eng eski yozilmagani — «Navbatdagi».
  const ochiq = useMemo(() => tartiblangan((qatorlar ?? []).filter((q) => !q.yozilgan)), [qatorlar]);
  const yozilgan = useMemo(() => tartiblangan((qatorlar ?? []).filter((q) => q.yozilgan)), [qatorlar]);
  const navbat = useMemo(() => navbatdagilar(qatorlar ?? []), [qatorlar]);
  const guruhlar = useMemo(() => {
    const m = new Map<number, { nom: string; q: T2F2DavomQator[] }>();
    for (const q of ochiq) { const g = m.get(q.obyekt_id) ?? { nom: q.obyekt_nom ?? '#' + q.obyekt_id, q: [] }; g.q.push(q); m.set(q.obyekt_id, g); }
    return [...m.entries()];
  }, [ochiq]);

  if (!kompaniyaId || qatorlar == null) return null;
  // O'qilmasa yoki qoralama yo'q bo'lsa — joy egallamaydi (asosiy oqim «Server qoralamasi raqami» orqali ham ishlaydi).
  // Tanlangan obyektda yo'q bo'lsa ham boshqa obyektlardagilarni ko'rish tugmasi qoladi.
  if (!qatorlar.length && !(obyektId && !hamma)) return null;

  const amal = (q: T2F2DavomQator) => {
    if (q.yozilgan) {
      const holat = <span className="text-text-dim">{t('yozilgan')}{q.akt_holat ? ` (${q.akt_holat})` : ''}</span>;
      // Yozilgan QORALAMA akt - «✎ Tahrirlash»: import oynasi shu aktning manba hujjati va operator qarorlari bilan qayta ochiladi.
      if (q.akt_holat !== 'qoralama' || q.akt_id == null) return holat;
      return <span className="inline-flex items-center gap-2">{holat}{onOchish
        ? <button type="button" className="tugma h-7 px-2" disabled={band} onClick={() => onOchish(q.job_id, q.akt_id ?? undefined)}>✎ {t('Tahrirlash')}</button>
        : <a className="tugma h-7 px-2" href={`/admin/f2?obyekt=${q.obyekt_id}&job=${q.job_id}&akt=${q.akt_id}`}>✎ {t('Tahrirlash')}</a>}</span>;
    }
    if (onOchish) return <button type="button" className="tugma tugma-asosiy h-7 px-2" disabled={band} onClick={() => onOchish(q.job_id)}>{t('Ochish')}</button>;
    return <a className="tugma h-7 px-2" href={`/admin/f2?obyekt=${q.obyekt_id}&job=${q.job_id}`}>{t('Ochish')}</a>;
  };
  const satr = (q: T2F2DavomQator) => (
    <tr key={q.job_id} className={`border-b border-border/40 ${navbat.has(q.job_id) ? 'bg-accent/10' : ''}`}>
      <td className="px-1 font-semibold">{q.raqam ? `№ ${q.raqam}` : '—'}{navbat.has(q.job_id) && <span className="ml-1 rounded bg-accent/20 px-1 text-[10px] font-semibold text-text">{t('Navbatdagi')}</span>}</td>
      <td className="px-1 tabular-nums">{q.oy ?? '—'}</td>
      <td className="px-1" title={q.fayl ?? ''}>{faylQisqa(q.fayl)}{q.akt_idx != null && q.akt_idx > 0 ? ` · ${t('varaq')} ${q.akt_idx + 1}` : ''}</td>
      <td className="px-1 text-right tabular-nums">
        <span className="text-ok">{'✓ '}{q.aniq}</span>{' · '}<span className="text-warn">{'◐ '}{q.taklif}</span>{' · '}<span className="text-danger">{'✕ '}{q.topilmadi}</span>
        <span className="ml-1 text-text-dim">{`(${foiz(q.aniq, q.jami)}%)`}</span>
      </td>
      <td className="px-1 text-text-dim">{sana(q.yangilandi)}{q.kim ? ` · ${q.kim}` : ''}</td>
      <td className="px-1 text-right">{amal(q)}</td>
    </tr>
  );

  return (
    <section className="karta space-y-2 p-3 text-[12px]" aria-label={t('Davom ettiriladigan F2 lar')}>
      <p className="flex items-center gap-2 font-semibold text-text">
        <span>{t('Davom ettiriladigan F2 lar')}{` (${ochiq.length})`}</span>
        {!!obyektId && <button type="button" className="ml-auto font-normal text-text-dim underline" aria-pressed={hamma} onClick={() => setHamma((x) => !x)}>
          {hamma ? t('Faqat tanlangan obyekt') : t('Hamma obyektlar')}
        </button>}
      </p>
      {xato && <p className="text-danger">{xato}</p>}
      {ochiq.length === 0 && <p className="text-text-dim">{t('Ochiq F2 qoralamasi yo‘q.')}</p>}
      {ochiq.length !== 0 && (
        <div className="max-h-72 overflow-auto">
          <table className="w-full">
            <thead><tr className="border-b border-border text-left text-text-mute">
              <th className="px-1">{t('F2 №')}</th><th className="px-1">{t('Oy')}</th><th className="px-1">{t('Fayl')}</th>
              <th className="px-1 text-right">{t('Bog‘langan')}</th><th className="px-1">{t('O‘zgardi')}</th><th className="px-1" />
            </tr></thead>
            <tbody>{guruhlar.map(([oid, g]) => (
              <Fragment key={oid}>
                {!korObyekt && <tr><td colSpan={6} className="bg-surface-2 px-1 font-semibold">{g.nom}</td></tr>}
                {g.q.map(satr)}
              </Fragment>
            ))}</tbody>
          </table>
        </div>
      )}
      {yozilgan.length !== 0 && (
        <div>
          <button type="button" className="text-text-dim underline" onClick={() => setYozilganKor((x) => !x)}>
            {yozilganKor ? t('Yozilganlarni yashirish') : t('Yozilganlarni ko‘rsatish')}{` (${yozilgan.length})`}
          </button>
          {yozilganKor && <table className="mt-1 w-full opacity-70"><tbody>{yozilgan.map(satr)}</tbody></table>}
        </div>
      )}
    </section>
  );
}
