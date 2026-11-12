/**
 * KorikPanellari.tsx - texnadzor/buyurtmachi qaror chiqarishdan oldin ko'radigan qo'shimcha dalillar:
 *  - AosrDalillari: yuborilgan АОСР ga bog'langan laboratoriya protokollari (fayl bilan) va fotolar;
 *  - F2Tekshiruvi: F2 hajmi faktdan oshmaganmi va yashirin ishlar imzolangan АОСР bilan yopilganmi (ogohlantirish, bloklamaydi).
 * Faqat o'qish; qiymat yo'q bo'lsa «—» (0 emas). Fakt hajmi faqat pudratchi ruxsat bergan bo'lsa ko'rinadi (serverda).
 */
import { useEffect, useState } from 'react';
import { aosrKorikOl, f2TekshiruvOl, type AosrKorik, type F2Muammo, type F2Tekshiruv } from '../../api/t2-nazorat';
import { hujjatYuklabOlishUrl } from '../../api/t2-hujjat-canonical';
import { t } from '../../i18n/til';

const NATIJA_NOM: Record<string, string> = { mos: 'mos', mos_emas: 'mos emas', kutilmoqda: 'kutilmoqda' };
const kun = (s: string | null | undefined) => (s ? s.slice(0, 10).split('-').reverse().join('.') : '—');

export function AosrDalillari({ kompaniyaId, taqdimId }: { kompaniyaId: number; taqdimId: number }) {
  const [d, setD] = useState<AosrKorik | null>(null);
  const [xato, setXato] = useState('');
  useEffect(() => {
    let bekor = false;
    setD(null); setXato('');
    void aosrKorikOl(kompaniyaId, taqdimId).then((r) => { if (bekor) return; if (r.ok) setD({ ...r.natija, protokollar: r.natija.protokollar ?? [], fotolar: r.natija.fotolar ?? [], ishlar: r.natija.ishlar ?? [] }); else setXato(r.error); });
    return () => { bekor = true; };
  }, [kompaniyaId, taqdimId]);
  if (xato) return <p role="alert" className="fz-note fz-note--warn">{xato}</p>;
  if (!d) return <div className="skel h-16 rounded-xl" aria-label={t('Yuklanmoqda…')} />;
  return (
    <section className="fz-card space-y-3 p-3" data-testid="aosr-dalillar" aria-label={t('Akt dalillari')}>
      <div>
        <h3 className="text-sm font-semibold">{t('Laboratoriya protokollari')} ({d.protokollar.length})</h3>
        {d.protokollar.length === 0
          ? <p className="fz-note fz-note--warn mt-1">{t('Aktga laboratoriya protokoli ulanmagan')}</p>
          : <ul className="mt-1 divide-y divide-border text-[13px]">{d.protokollar.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-1">
              <span className="font-medium">№ {p.raqam ?? '—'}</span>
              <span className="text-text-dim">{kun(p.sana)} · {p.sinov_turi ?? '—'} · {[p.konstruksiya, p.marka].filter(Boolean).join(' ') || '—'}</span>
              <span className={p.natija === 'mos_emas' ? 'fz-chip fz-chip--danger' : 'fz-chip'}>{t(NATIJA_NOM[p.natija ?? ''] ?? '—')}</span>
              {p.document_id != null
                ? <a className="ml-auto text-accent underline" href={hujjatYuklabOlishUrl(p.document_id)} target="_blank" rel="noreferrer">{p.fayl || t('Faylni ochish')}</a>
                : <span className="ml-auto text-text-mute">{t('fayl yuklanmagan')}</span>}
            </li>))}</ul>}
      </div>
      <div>
        <h3 className="text-sm font-semibold">{t('Fotolar')} ({d.fotolar.length})</h3>
        {d.fotolar.length === 0
          ? <p className="fz-note mt-1">{t('Aktga foto biriktirilmagan')}</p>
          : <div className="mt-1 flex flex-wrap gap-2">{d.fotolar.map((f) => (
            <a key={f.document_id} href={hujjatYuklabOlishUrl(f.document_id)} target="_blank" rel="noreferrer">
              <img src={hujjatYuklabOlishUrl(f.document_id)} alt={t('Foto')} className="h-20 w-20 rounded-md border border-border object-cover" loading="lazy" />
            </a>))}</div>}
      </div>
      {d.ishlar.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">{t('Bog‘langan smeta ishlari')} ({d.ishlar.length})</h3>
          <ul className="mt-1 text-[13px] text-text-dim">{d.ishlar.slice(0, 12).map((x) => <li key={x.qator_id}>{[x.kod, x.nom, x.birlik].filter(Boolean).join(' · ')}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

const MUAMMO_NOM: Record<F2Muammo, string> = {
  akt_yoq: 'Yashirin ish, imzolangan АОСР yo‘q',
  akt_kutmoqda: 'Yashirin ish, АОСР hali tasdiqlanmagan',
  hajm_oshgan: 'F2 hajmi faktdan katta (tekshirib ko‘ring)',
};

export function F2Tekshiruvi({ kompaniyaId, taqdimId, aktId }: { kompaniyaId: number; taqdimId?: number | null; aktId?: number | null }) {
  const [d, setD] = useState<F2Tekshiruv | null>(null);
  const [xato, setXato] = useState('');
  useEffect(() => {
    let bekor = false;
    setD(null); setXato('');
    void f2TekshiruvOl(kompaniyaId, { taqdimId, aktId }).then((r) => { if (bekor) return; if (r.ok && r.natija.xulosa) setD({ ...r.natija, muammolar: r.natija.muammolar ?? [] }); else setXato(r.ok ? '' : r.error); });
    return () => { bekor = true; };
  }, [kompaniyaId, taqdimId, aktId]);
  if (xato) return <p role="alert" className="fz-note fz-note--warn">{xato}</p>;
  if (!d) return <div className="skel h-16 rounded-xl" aria-label={t('Yuklanmoqda…')} />;
  const x = d.xulosa;
  const toza = d.muammolar.length === 0;
  return (
    <section className={`fz-card space-y-2 p-3 ${toza ? '' : 'border-warn/40'}`} data-testid="f2-tekshiruv" aria-label={t('F2 tekshiruvi')}>
      <h3 className="text-sm font-semibold">{t('F2 tekshiruvi: fakt va yashirin ishlar')}</h3>
      <p className="text-[13px] text-text-dim">
        {t('Yashirin ishlar')}: {x.yashirin_qator} · {t('АОСР tasdiqlangan')}: {x.akt_tasdiqlangan} · {t('kutmoqda')}: {x.akt_kutmoqda} · {t('АОСР yo‘q')}: {x.akt_yoq}
        {x.fakt_korinadi && x.hajm_oshgan != null ? ` · ${t('hajmi faktdan katta')}: ${x.hajm_oshgan}` : ''}
      </p>
      {!x.fakt_korinadi && <p className="fz-note">{t('Pudratchi fakt hajmini ko‘rishga ruxsat bermagan: faqat АОСР qamrovi tekshirildi.')}</p>}
      {toza
        ? <p className="fz-check__q fz-check__q--ok text-ok">✓ {t('Ogohlantirish yo‘q')}</p>
        : (
          <div className="fz-table-wrap max-h-72">
            <table className="fz-table min-w-[640px]">
              <thead><tr><th>{t('Ish')}</th><th>{t('Birlik')}</th><th className="fz-c-num">{t('F2 hajmi')}</th><th className="fz-c-num">{t('Fakt hajmi')}</th><th>{t('Ogohlantirish')}</th></tr></thead>
              <tbody>{d.muammolar.map((m) => (
                <tr key={`${m.qator_id}-${m.muammo}`}>
                  <td>{[m.kod, m.nom].filter(Boolean).join(' · ') || '—'}</td><td>{m.birlik ?? '—'}</td>
                  <td className="fz-c-num">{m.f2_hajm ?? '—'}</td><td className="fz-c-num">{m.fakt_hajm ?? '—'}</td>
                  <td><span className="fz-chip fz-chip--warn">{t(MUAMMO_NOM[m.muammo])}</span></td>
                </tr>))}</tbody>
            </table>
          </div>)}
      <p className="text-[11px] text-text-mute">{t('Bu ogohlantirish, qaror bloklanmaydi.')}</p>
    </section>
  );
}
