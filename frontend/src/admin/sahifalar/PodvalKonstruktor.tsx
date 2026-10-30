import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { reportMoneyValidity } from '../../lib/money-input';
/**
 * PodvalKonstruktor.tsx — nakrutka podvalini qatorma-qator tuzish (egasi Q6, 2026-10-01).
 *
 * Doira: kompaniya (sukut) / shartnoma / obyekt. Maxsus podval bo'lmasa — standart kaskad
 * (koeffitsientlardan) amal qiladi; "Maxsus podval yaratish" standartdan nusxa oladi.
 * Qator turlari: foiz (baza × %), summa (belgilangan, masalan shartnoma bo'yicha), jami.
 * Oxirgi qator — ВСЕГО. Obyekt tanlansa — uning kategoriya summalarida jonli hisob.
 */
import { useEffect, useMemo, useState, useRef } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { t2NakrutkaKoefOl, t2ObyektNakrutka, type NakrutkaKoeffitsientlar } from '../../api/t2-nakrutka';
import { sbPodvallarOl, sbPodvalSaqla, sbPodvalOchir, podvalTanla, type PodvalYozuv } from '../../api/t2-nakrutka-podval';
import { yangiOperationId } from '../../api/supabase';
import {
  hadNomi, podvalBelgilanganSumma, podvalHisobla, podvalKf, podvalTekshir, standartPodval, yangiKod,
  type Podval, type PodvalHad, type PodvalQator,
} from '../../lib/nakrutka-konstruktor';
import { NAKRUTKA_KATLAR, podvalQiymatYaxlit, type KatSummalar, type NakrutkaKat } from '../../lib/nakrutka-podval';
import { kaskadCats, svodYaxlitQqs, type SvodYaxlit } from '../../lib/svod-yaxlit';
import { podvalNdsFoizi } from '../../lib/hisob-yadro';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { kfUstamaFoiz } from '../../lib/narx-korinish';

type Doira = 'kompaniya' | 'shartnoma' | 'obyekt';
const DOIRA_NOMI: Record<Doira, string> = { kompaniya: 'Kompaniya (sukut)', shartnoma: 'Shartnoma', obyekt: 'Obyekt (smeta)' };
const TUR_NOMI: Record<PodvalQator['tur'], string> = { foiz: 'Foiz', summa: 'Summa', jami: 'Jami' };

function BazaTanlagich({ qator, oldingilar, podval, onChange }: {
  qator: PodvalQator; oldingilar: PodvalQator[]; podval: Podval; onChange: (b: PodvalHad[]) => void;
}) {
  const baza = qator.baza ?? [];
  const bor = (h: PodvalHad) => baza.findIndex((x) => ('kat' in x && 'kat' in h && x.kat === h.kat) || ('qator' in x && 'qator' in h && x.qator === h.qator));
  const almashtir = (h: PodvalHad) => {
    const i = bor(h);
    onChange(i >= 0 ? baza.filter((_, j) => j !== i) : [...baza, h]);
  };
  const ishora = (i: number) => onChange(baza.map((x, j) => (j === i ? { ...x, k: (x.k ?? 1) < 0 ? 1 : -1 } : x)));
  const [ochiq, setOchiq] = useState(false);
  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1 min-h-[26px] items-center">
        {baza.map((h, i) => (
          <button key={i} type="button" onClick={() => ishora(i)} title={t('Bosing — ishorani almashtirish (+/−)')}
            className={'fz-chip border ' + ((h.k ?? 1) < 0 ? 'fz-chip--danger border-danger/50' : 'border-border text-text')}>
            {hadNomi(h, podval)}
          </button>
        ))}
        <button type="button" onClick={() => setOchiq((x) => !x)} className="fz-chip border border-dashed border-border-strong bg-transparent text-text-mute">{t('± baza')}</button>
      </div>
      {ochiq && (
        <div className="absolute z-20 mt-1 w-72 max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface-2 p-2 text-[12px] space-y-1" style={{ boxShadow: 'var(--shadow-pop)' }}>
          <div className="fz-panel__h">{t('Kategoriyalar (to‘g‘ri xarajat)')}</div>
          {NAKRUTKA_KATLAR.map((k) => (
            <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={bor({ kat: k }) >= 0} onChange={() => almashtir({ kat: k })} /> {k}</label>
          ))}
          <div className="fz-panel__h pt-1">{t('Yuqoridagi qatorlar')}</div>
          {oldingilar.length === 0 && <div className="text-text-mute">—</div>}
          {oldingilar.map((q) => (
            <label key={q.kod} className="flex items-center gap-1.5"><input type="checkbox" checked={bor({ qator: q.kod }) >= 0} onChange={() => almashtir({ qator: q.kod })} /> {q.nom}</label>
          ))}
          <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm mt-1" onClick={() => setOchiq(false)}>{t('Yopish')}</button>
        </div>
      )}
    </div>
  );
}

export function PodvalKonstruktor({ companyId, contractId, objectId }: { companyId: number; contractId: number | null; objectId: number | null }) {
  const moneyScope = useRef<HTMLDivElement>(null);
  const [royxat, setRoyxat] = useState<PodvalYozuv[]>([]);
  const [koef, setKoef] = useState<Partial<NakrutkaKoeffitsientlar>>({});
  const [kat, setKat] = useState<Partial<KatSummalar> | null>(null);
  /** Svod yaxlit (belgi bo'lsa): kat shunda kaskad kategoriyalari, yaxlit ИТОГО-4 ga ustamasiz. */
  const [svodYaxlit, setSvodYaxlit] = useState<SvodYaxlit | null>(null);
  const [doira, setDoira] = useState<Doira>(objectId ? 'obyekt' : contractId ? 'shartnoma' : 'kompaniya');
  const [tahrir, setTahrir] = useState<(Podval & { id?: number; versiya?: number }) | null>(null);
  const [xabar, setXabar] = useState('');
  const [band, setBand] = useState(false);

  const yukla = async () => {
    const [r, k] = await Promise.all([sbPodvallarOl(companyId), t2NakrutkaKoefOl(companyId, contractId)]);
    setRoyxat(r.ok ? r.qatorlar ?? [] : []);
    setKoef(k.ok ? k.koeffitsientlar : {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [companyId, contractId]);
  useEffect(() => { setDoira(objectId ? 'obyekt' : contractId ? 'shartnoma' : 'kompaniya'); }, [objectId, contractId]);
  useEffect(() => {
    if (!objectId) { setKat(null); setSvodYaxlit(null); return; }
    void t2ObyektNakrutka(objectId, contractId).then((r) => {
      const c = r.ok ? kaskadCats(r) ?? r.cats : null;
      setSvodYaxlit(r.ok ? r.svod_yaxlit ?? null : null);
      // Server bucket: МАТ = МАТ+КАБ+М/К+БЕЗ — konstruktorda alohida kategoriyalar.
      setKat(c ? { ЧЕЛ: c.chel, МАШ: c.mash, МАТ: c.mat - c.kab - c.mk - c.bez, ОБ: c.ob, КАБ: c.kab, 'М/К': c.mk, 'БЕЗ СКЛАД': c.bez } : null);
    });
  }, [objectId, contractId]);

  const doiraParam = doira === 'obyekt' ? { obyektId: objectId } : doira === 'shartnoma' ? { shartnomaId: contractId } : {};
  const aynanDoira = royxat.find((p) =>
    doira === 'obyekt' ? p.obyekt_id === objectId
      : doira === 'shartnoma' ? p.shartnoma_id === contractId && p.obyekt_id == null
        : p.obyekt_id == null && p.shartnoma_id == null) ?? null;
  const amaldagi = podvalTanla(royxat, { obyektId: doira === 'obyekt' ? objectId : null, shartnomaId: contractId });
  const standart = useMemo(() => standartPodval(koef), [koef]);

  useEffect(() => {
    setTahrir(aynanDoira ? { versiya: 1, nom: aynanDoira.nom, qatorlar: aynanDoira.qatorlar, id: aynanDoira.id } : null);
    setXabar('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aynanDoira?.id, aynanDoira?.versiya, doira]);

  const korinadigan: Podval = tahrir ?? (amaldagi ? { versiya: 1, nom: amaldagi.nom, qatorlar: amaldagi.qatorlar } : standart);
  const xatolar = tahrir ? podvalTekshir(tahrir) : [];
  const hisob0 = kat ? podvalHisobla(korinadigan, kat) : null;
  const hisob = hisob0 && svodYaxlit ? { ...hisob0, qiymat: podvalQiymatYaxlit(hisob0.qiymat, korinadigan, svodYaxlitQqs(svodYaxlit, podvalNdsFoizi(korinadigan))) } : hisob0;
  const kf = podvalKf(korinadigan);
  const belgilangan = podvalBelgilanganSumma(korinadigan);

  const qatorYangila = (i: number, p: Partial<PodvalQator>) => setTahrir((t) => (t ? { ...t, qatorlar: t.qatorlar.map((q, j) => (j === i ? { ...q, ...p } : q)) } : t));
  const kochir = (i: number, d: -1 | 1) => setTahrir((t) => {
    if (!t) return t;
    const q = [...t.qatorlar]; const j = i + d;
    if (j < 0 || j >= q.length) return t;
    [q[i], q[j]] = [q[j], q[i]];
    return { ...t, qatorlar: q };
  });
  const ochirQator = (i: number) => setTahrir((t) => (t ? { ...t, qatorlar: t.qatorlar.filter((_, j) => j !== i).map((q) => ({ ...q, baza: q.baza?.filter((h) => !('qator' in h) || h.qator !== t.qatorlar[i].kod) })) } : t));
  const qosh = (tur: PodvalQator['tur']) => setTahrir((t) => {
    if (!t) return t;
    const kod = yangiKod(t, tur === 'foiz' ? 'foiz' : tur === 'summa' ? 'summa' : 'jami');
    const oldingi = t.qatorlar[t.qatorlar.length - 2];
    const yangi: PodvalQator = tur === 'summa'
      ? { kod, nom: 'Новая статья (фиксированная сумма)', tur, summa: null }
      : tur === 'foiz'
        ? { kod, nom: 'Новая статья, %', tur, foiz: null, baza: oldingi ? [{ qator: oldingi.kod }] : [{ kat: 'ЧЕЛ' as NakrutkaKat }] }
        : { kod, nom: 'Промежуточный итог', tur, baza: oldingi ? [{ qator: oldingi.kod }] : [] };
    const q = [...t.qatorlar];
    q.splice(Math.max(0, q.length - 1), 0, yangi);
    return { ...t, qatorlar: q };
  });

  const saqla = async () => {
    if (!reportMoneyValidity(moneyScope.current)) return;
    if (!tahrir) return;
    if (xatolar.length) { setXabar('Avval xatolarni tuzating'); return; }
    setBand(true);
    const r = await sbPodvalSaqla({ kompaniyaId: companyId, doira: doiraParam, nom: tahrir.nom ?? 'Подвал', qatorlar: tahrir.qatorlar, id: tahrir.id, kutilganVersiya: aynanDoira?.versiya, operationId: tahrir.id ? undefined : yangiOperationId() });
    setBand(false);
    setXabar(r.ok ? '✓ Saqlandi — shu doiradagi barcha hujjatlar endi shu podval bilan chiqadi' : r.sabab === 'versiya' ? 'Podval boshqa joyda o‘zgargan — sahifani yangilang' : r.error || 'Xato');
    if (r.ok) await yukla();
  };
  const standartgaQayt = async () => {
    if (!aynanDoira) return;
    if (!(await tasdiqSora({ sarlavha: t('Standartga qaytarish'), matn: t('Maxsus podval o‘chirilib, bu doira standart kaskadga qaytsinmi? (tarix saqlanadi)'), tasdiqMatni: t('Standartga qaytarish'), xavfli: true }))) return;
    const r = await sbPodvalOchir(companyId, aynanDoira.id, aynanDoira.versiya);
    setXabar(r.ok ? 'Standartga qaytarildi' : r.error || 'Xato');
    if (r.ok) { setTahrir(null); await yukla(); }
  };

  const manba = amaldagi
    ? (amaldagi.obyekt_id ? `obyekt «${amaldagi.obyekt ?? amaldagi.obyekt_id}»` : amaldagi.shartnoma_id ? `shartnoma ${amaldagi.shartnoma ?? amaldagi.shartnoma_id}` : 'kompaniya') + ' maxsus podvali'
    : 'standart kaskad (koeffitsientlardan)';

  return (
    <section ref={moneyScope} className="fz-card">
      <div className="fz-card__head flex-wrap">
        <div><h3 className="fz-card__title">{t('Podval konstruktori')}</h3><p className="fz-card__sub">{t('Hujjat podvali qatorma-qator: foiz, belgilangan summa, oraliq jami. Oxirgi qator — ВСЕГО.')}</p></div>
        <div className="inline-flex gap-0.5 rounded-[var(--radius-sm)] border border-border bg-surface-2 p-0.5" role="group" aria-label={t('Podval doirasi')}>
          {(['kompaniya', 'shartnoma', 'obyekt'] as const).map((d) => {
            const mumkin = d === 'kompaniya' || (d === 'shartnoma' && !!contractId) || (d === 'obyekt' && !!objectId);
            return <button key={d} type="button" disabled={!mumkin} onClick={() => setDoira(d)}
              aria-pressed={doira === d} className={'fz-btn fz-btn--sm ' + (doira === d ? 'border-transparent bg-accent/15 text-text' : 'fz-btn--ghost')}>{t(DOIRA_NOMI[d])}</button>;
          })}
        </div>
      </div>
      <div className="fz-card__body flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-text-dim">
        <span>{t('Amalda:')}</span><span className={`fz-stamp ${amaldagi ? 'fz-stamp--info' : 'fz-stamp--draft'}`}>{amaldagi ? t('Maxsus podval') : t('Standart kaskad')}</span><b className="text-text">{manba}</b>
        <span className="text-text-mute">{t('Ustunlik tartibi: obyekt → shartnoma → kompaniya → standart. Standart foizlar yuqoridagi koeffitsientlardan.')}</span>
      </div>

      {!tahrir && (
        <button type="button" onClick={() => setTahrir({ ...structuredClone(amaldagi ? { versiya: 1 as const, nom: amaldagi.nom, qatorlar: amaldagi.qatorlar } : standart), id: undefined, nom: `Подвал — ${DOIRA_NOMI[doira]}` })}
          className="fz-btn self-start"><Plus size={13} /> {t('Shu doira uchun maxsus podval yaratish (amaldagidan nusxa)')}</button>
      )}

      <div className="fz-table-wrap">
        <table className="fz-table min-w-[860px]">
          <thead><tr>
            {tahrir && <th className="w-14" />}
            <th>{t('Statya')}</th><th className="w-20">{t('Turi')}</th><th className="w-28 fz-c-num">{t('% / summa')}</th>
            <th>{t('Baza')}</th><th className="w-36 fz-c-num">{t('Hisob (obyekt)')}</th>{tahrir && <th className="w-8" />}
          </tr></thead>
          <tbody>
            {korinadigan.qatorlar.map((q, i) => {
              const oxirgi = i === korinadigan.qatorlar.length - 1;
              const v = hisob?.qiymat[q.kod];
              return (
                <tr key={q.kod} className={q.tur === 'jami' ? 'fz-row-total' : ''}>
                  {tahrir && <td className="whitespace-nowrap">
                    <button type="button" disabled={i === 0 || oxirgi} onClick={() => kochir(i, -1)} className="disabled:opacity-20"><ArrowUp size={13} /></button>
                    <button type="button" disabled={oxirgi || i >= korinadigan.qatorlar.length - 2} onClick={() => kochir(i, 1)} className="disabled:opacity-20"><ArrowDown size={13} /></button>
                  </td>}
                  <td>
                    {tahrir ? <input className="h-7 w-full px-1.5" value={q.nom} onChange={(e) => qatorYangila(i, { nom: e.target.value })} /> : q.nom}
                    {tahrir && q.tur !== 'jami' && <input className="mt-1 h-6 w-full px-1.5 text-[11px] text-text-dim" placeholder={t('Asos (shartnoma bandi, xat …)')} value={q.izoh ?? ''} onChange={(e) => qatorYangila(i, { izoh: e.target.value })} />}
                    {!tahrir && q.izoh && <div className="text-[11px] text-text-mute">{q.izoh}</div>}
                  </td>
                  <td><span className={`fz-chip ${q.tur === 'jami' ? 'fz-chip--accent' : ''}`}>{t(TUR_NOMI[q.tur])}</span></td>
                  <td className="fz-c-num">
                    {q.tur === 'foiz' && (tahrir && !q.koefKod
                      ? <input className="h-7 w-full px-1.5 text-right" inputMode="decimal" value={q.foiz ?? ''} onChange={(e) => qatorYangila(i, { foiz: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) })} />
                      : <span className="tabular-nums" title={q.koefKod ? t('Standart foiz — yuqoridagi koeffitsientlardan') : ''}>{q.foiz == null ? '—' : q.foiz + ' %'}</span>)}
                    {q.tur === 'summa' && (tahrir
                      ? <MoneyInput numericValue className="h-7 w-full px-1.5 text-right" inputMode="decimal" placeholder={t('noma’lum')} value={q.summa ?? ''} onValueChange={(moneyValue) => qatorYangila(i, { summa: moneyValue === '' ? null : Number(moneyValue.replace(/\s/g, '').replace(',', '.')) })} />
                      : <span className="tabular-nums">{q.summa == null ? <span className="text-warn">{t('noma’lum')}</span> : <FmtN val={q.summa} />}</span>)}
                  </td>
                  <td>
                    {q.tur === 'summa' ? <span className="text-text-mute">—</span> : tahrir
                      ? <BazaTanlagich qator={q} oldingilar={korinadigan.qatorlar.slice(0, i)} podval={korinadigan} onChange={(b) => qatorYangila(i, { baza: b })} />
                      : <span className="text-text-mute">{(q.baza ?? []).map((h) => hadNomi(h, korinadigan)).join(' + ').replace(/\+ −/g, '−')}</span>}
                  </td>
                  <td className="fz-c-num">{hisob ? (v == null ? <span className="text-warn">{t('noma’lum')}</span> : <FmtN val={v} />) : <span className="text-text-mute">—</span>}</td>
                  {tahrir && <td>{!oxirgi && <button type="button" onClick={() => ochirQator(i)} className="text-text-mute hover:text-danger" title={t('Qatorni olib tashlash')} aria-label={t('Qatorni olib tashlash')}><Trash2 size={13} /></button>}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {svodYaxlit && hisob && <div className="fz-note text-[12px]" data-testid="podval-svod-yaxlit">{t('Svod yaxlit bo‘limlari ({n}) ustamasiz qo‘shildi: {s} so‘m (ҚҚС siz) — summa svodning o‘zidan, ustama hisoblanmaydi.', { n: String(svodYaxlit.bolimlar.length), s: svodYaxlit.qqssiz.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) })}</div>}

      {tahrir && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => qosh('foiz')} className="fz-btn fz-btn--sm">{t('+ foiz qator')}</button>
          <button type="button" onClick={() => qosh('summa')} className="fz-btn fz-btn--sm">{t('+ belgilangan summa')}</button>
          <button type="button" onClick={() => qosh('jami')} className="fz-btn fz-btn--sm">{t('+ oraliq jami')}</button>
          <input className="h-7 min-w-[200px] px-2 text-[12px]" value={tahrir.nom ?? ''} onChange={(e) => setTahrir((x) => (x ? { ...x, nom: e.target.value } : x))} placeholder={t('Podval nomi')} />
          <div className="flex-1" />
          {aynanDoira && <button type="button" onClick={() => void standartgaQayt()} className="fz-btn fz-btn--danger fz-btn--sm"><RotateCcw size={13} /> {t('Standartga qaytarish')}</button>}
          <button type="button" onClick={() => setTahrir(aynanDoira ? { versiya: 1, nom: aynanDoira.nom, qatorlar: aynanDoira.qatorlar, id: aynanDoira.id } : null)} className="fz-btn fz-btn--ghost fz-btn--sm">{t('Bekor')}</button>
          <button type="button" disabled={band || xatolar.length > 0} onClick={() => void saqla()} className="fz-btn fz-btn--primary fz-btn--sm"><Save size={13} /> {t('Saqlash')}</button>
        </div>
      )}
      {xatolar.length > 0 && <ul className="fz-note fz-note--danger list-disc pl-8">{xatolar.map((x, i) => <li key={i}>{x.kod ? `«${x.kod}»: ` : ''}{x.xabar}</li>)}</ul>}
      {xabar && <p className="fz-note text-[12px]" role="status">{xabar}</p>}

      <div className="fz-panel">
        <div className="fz-panel__h"><span>{t('Kategoriya koeffitsientlari (ustama %)')}</span><span>{t('1 so‘m to‘g‘ri xarajat → ВСЕГО')}</span></div>
        <div className="fz-bars">
          {NAKRUTKA_KATLAR.map((k) => { const kk = kf[k]; const u = kk == null ? null : kfUstamaFoiz(kk); const kfMax = Math.max(1e-9, ...NAKRUTKA_KATLAR.map((x) => kf[x] ?? 0)); return (
            <div key={k} className="fz-bars__q" title={`Kf ${k} = ${kk == null ? '—' : kk.toFixed(6)}`}>
              <span>{k} <small className="font-mono text-text-mute">kf {kk == null ? '—' : kk.toFixed(6)}</small></span><b>{u == null ? '—' : `+${u.toFixed(2)}%`}</b>
              <i style={{ ['--w' as string]: `${Math.max(0, ((kk ?? 0) / kfMax) * 100)}%` }} />
            </div>); })}
        </div>
      </div>
      {belgilangan !== 0 && (
        <p className="fz-note fz-note--info">{t('Belgilangan summalar ({s}) koeffitsientlarga kirmaydi — hujjat podvalida alohida qator bo‘lib chiqadi.', { s: belgilangan == null ? t('noma’lum bor') : belgilangan.toLocaleString('ru-RU') })}</p>
      )}
      </div>
    </section>
  );
}
