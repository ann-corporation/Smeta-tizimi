/**
 * PodvalKonstruktor.tsx — nakrutka podvalini qatorma-qator tuzish (egasi Q6, 2026-10-01).
 *
 * Doira: kompaniya (sukut) / shartnoma / obyekt. Maxsus podval bo'lmasa — standart kaskad
 * (koeffitsientlardan) amal qiladi; "Maxsus podval yaratish" standartdan nusxa oladi.
 * Qator turlari: foiz (baza × %), summa (belgilangan, masalan shartnoma bo'yicha), jami.
 * Oxirgi qator — ВСЕГО. Obyekt tanlansa — uning kategoriya summalarida jonli hisob.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { t2NakrutkaKoefOl, t2ObyektNakrutka, type NakrutkaKoeffitsientlar } from '../../api/t2-nakrutka';
import { sbPodvallarOl, sbPodvalSaqla, sbPodvalOchir, podvalTanla, type PodvalYozuv } from '../../api/t2-nakrutka-podval';
import { yangiOperationId } from '../../api/supabase';
import {
  hadNomi, podvalBelgilanganSumma, podvalHisobla, podvalKf, podvalTekshir, standartPodval, yangiKod,
  type Podval, type PodvalHad, type PodvalQator,
} from '../../lib/nakrutka-konstruktor';
import { NAKRUTKA_KATLAR, type KatSummalar, type NakrutkaKat } from '../../lib/nakrutka-podval';
import { FmtN } from '../../lib/format';

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
          <button key={i} type="button" onClick={() => ishora(i)} title="Bosing — ishorani almashtirish (+/−)"
            className={'rounded border px-1.5 py-0.5 text-[11px] ' + ((h.k ?? 1) < 0 ? 'border-danger/50 text-danger' : 'border-border text-text')}>
            {hadNomi(h, podval)}
          </button>
        ))}
        <button type="button" onClick={() => setOchiq((x) => !x)} className="rounded border border-dashed border-border px-1.5 py-0.5 text-[11px] text-text-mute">± baza</button>
      </div>
      {ochiq && (
        <div className="absolute z-20 mt-1 w-72 max-h-64 overflow-y-auto rounded border bg-surface-1 p-2 shadow-lg text-[12px] space-y-1">
          <div className="font-semibold text-text-mute">Kategoriyalar (to‘g‘ri xarajat)</div>
          {NAKRUTKA_KATLAR.map((k) => (
            <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={bor({ kat: k }) >= 0} onChange={() => almashtir({ kat: k })} /> {k}</label>
          ))}
          <div className="font-semibold text-text-mute pt-1">Yuqoridagi qatorlar</div>
          {oldingilar.length === 0 && <div className="text-text-mute">—</div>}
          {oldingilar.map((q) => (
            <label key={q.kod} className="flex items-center gap-1.5"><input type="checkbox" checked={bor({ qator: q.kod }) >= 0} onChange={() => almashtir({ qator: q.kod })} /> {q.nom}</label>
          ))}
          <button type="button" className="mt-1 text-[11px] text-accent" onClick={() => setOchiq(false)}>Yopish</button>
        </div>
      )}
    </div>
  );
}

export function PodvalKonstruktor({ companyId, contractId, objectId }: { companyId: number; contractId: number | null; objectId: number | null }) {
  const [royxat, setRoyxat] = useState<PodvalYozuv[]>([]);
  const [koef, setKoef] = useState<Partial<NakrutkaKoeffitsientlar>>({});
  const [kat, setKat] = useState<Partial<KatSummalar> | null>(null);
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
    if (!objectId) { setKat(null); return; }
    void t2ObyektNakrutka(objectId, contractId).then((r) => {
      const c = r.ok ? r.cats : null;
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
  const hisob = kat ? podvalHisobla(korinadigan, kat) : null;
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
    if (!tahrir) return;
    if (xatolar.length) { setXabar('Avval xatolarni tuzating'); return; }
    setBand(true);
    const r = await sbPodvalSaqla({ kompaniyaId: companyId, doira: doiraParam, nom: tahrir.nom ?? 'Подвал', qatorlar: tahrir.qatorlar, id: tahrir.id, kutilganVersiya: aynanDoira?.versiya, operationId: tahrir.id ? undefined : yangiOperationId() });
    setBand(false);
    setXabar(r.ok ? '✓ Saqlandi — shu doiradagi barcha hujjatlar endi shu podval bilan chiqadi' : r.sabab === 'versiya' ? 'Podval boshqa joyda o‘zgargan — sahifani yangilang' : r.error || 'Xato');
    if (r.ok) await yukla();
  };
  const standartgaQayt = async () => {
    if (!aynanDoira || !window.confirm('Maxsus podval o‘chirilib, bu doira standart kaskadga qaytsinmi? (tarix saqlanadi)')) return;
    const r = await sbPodvalOchir(companyId, aynanDoira.id, aynanDoira.versiya);
    setXabar(r.ok ? 'Standartga qaytarildi' : r.error || 'Xato');
    if (r.ok) { setTahrir(null); await yukla(); }
  };

  const manba = amaldagi
    ? (amaldagi.obyekt_id ? `obyekt «${amaldagi.obyekt ?? amaldagi.obyekt_id}»` : amaldagi.shartnoma_id ? `shartnoma ${amaldagi.shartnoma ?? amaldagi.shartnoma_id}` : 'kompaniya') + ' maxsus podvali'
    : 'standart kaskad (koeffitsientlardan)';

  return (
    <div className="border rounded-lg p-3 bg-surface-1 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Podval konstruktori</h3>
        <div className="inline-flex overflow-hidden rounded border text-[12px]">
          {(['kompaniya', 'shartnoma', 'obyekt'] as const).map((d) => {
            const mumkin = d === 'kompaniya' || (d === 'shartnoma' && !!contractId) || (d === 'obyekt' && !!objectId);
            return <button key={d} type="button" disabled={!mumkin} onClick={() => setDoira(d)}
              className={'px-2.5 py-1 disabled:opacity-40 ' + (doira === d ? 'bg-accent/15 text-accent font-medium' : 'text-text-mute')}>{DOIRA_NOMI[d]}</button>;
          })}
        </div>
      </div>
      <p className="text-xs text-text-mute">Amalda: <b className="text-text">{manba}</b>. Tartib: obyekt → shartnoma → kompaniya → standart. Standart foizlar yuqoridagi koeffitsientlardan.</p>

      {!tahrir && (
        <button type="button" onClick={() => setTahrir({ ...structuredClone(amaldagi ? { versiya: 1 as const, nom: amaldagi.nom, qatorlar: amaldagi.qatorlar } : standart), id: undefined, nom: `Подвал — ${DOIRA_NOMI[doira]}` })}
          className="inline-flex items-center gap-1 rounded border px-2.5 py-1 text-[12px]"><Plus size={13} /> Shu doira uchun maxsus podval yaratish (amaldagidan nusxa)</button>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[12px] border-collapse">
          <thead><tr className="text-text-mute text-left">
            {tahrir && <th className="px-1 py-1 w-14" />}
            <th className="px-1 py-1">Statya</th><th className="px-1 py-1 w-20">Turi</th><th className="px-1 py-1 w-24">% / summa</th>
            <th className="px-1 py-1">Baza</th><th className="px-1 py-1 w-36 text-right">Hisob (obyekt)</th>{tahrir && <th className="w-8" />}
          </tr></thead>
          <tbody>
            {korinadigan.qatorlar.map((q, i) => {
              const oxirgi = i === korinadigan.qatorlar.length - 1;
              const v = hisob?.qiymat[q.kod];
              return (
                <tr key={q.kod} className={'border-t border-border/60 align-top ' + (q.tur === 'jami' ? 'font-semibold bg-surface-2/40' : '')}>
                  {tahrir && <td className="px-1 py-1 whitespace-nowrap">
                    <button type="button" disabled={i === 0 || oxirgi} onClick={() => kochir(i, -1)} className="disabled:opacity-20"><ArrowUp size={13} /></button>
                    <button type="button" disabled={oxirgi || i >= korinadigan.qatorlar.length - 2} onClick={() => kochir(i, 1)} className="disabled:opacity-20"><ArrowDown size={13} /></button>
                  </td>}
                  <td className="px-1 py-1">
                    {tahrir ? <input className="w-full border rounded px-1.5 py-0.5" value={q.nom} onChange={(e) => qatorYangila(i, { nom: e.target.value })} /> : q.nom}
                    {tahrir && q.tur !== 'jami' && <input className="mt-1 w-full border rounded px-1.5 py-0.5 text-[11px] text-text-mute" placeholder="Asos (shartnoma bandi, xat …)" value={q.izoh ?? ''} onChange={(e) => qatorYangila(i, { izoh: e.target.value })} />}
                    {!tahrir && q.izoh && <div className="text-[11px] text-text-mute">{q.izoh}</div>}
                  </td>
                  <td className="px-1 py-1">{TUR_NOMI[q.tur]}</td>
                  <td className="px-1 py-1">
                    {q.tur === 'foiz' && (tahrir && !q.koefKod
                      ? <input className="w-full border rounded px-1.5 py-0.5 text-right" inputMode="decimal" value={q.foiz ?? ''} onChange={(e) => qatorYangila(i, { foiz: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) })} />
                      : <span className="tabular-nums" title={q.koefKod ? 'Standart foiz — yuqoridagi koeffitsientlardan' : ''}>{q.foiz == null ? '—' : q.foiz + ' %'}</span>)}
                    {q.tur === 'summa' && (tahrir
                      ? <input className="w-full border rounded px-1.5 py-0.5 text-right" inputMode="decimal" placeholder="noma’lum" value={q.summa ?? ''} onChange={(e) => qatorYangila(i, { summa: e.target.value === '' ? null : Number(e.target.value.replace(/\s/g, '').replace(',', '.')) })} />
                      : <span className="tabular-nums">{q.summa == null ? 'noma’lum' : <FmtN val={q.summa} />}</span>)}
                  </td>
                  <td className="px-1 py-1">
                    {q.tur === 'summa' ? <span className="text-text-mute">—</span> : tahrir
                      ? <BazaTanlagich qator={q} oldingilar={korinadigan.qatorlar.slice(0, i)} podval={korinadigan} onChange={(b) => qatorYangila(i, { baza: b })} />
                      : <span className="text-text-mute">{(q.baza ?? []).map((h) => hadNomi(h, korinadigan)).join(' + ').replace(/\+ −/g, '−')}</span>}
                  </td>
                  <td className="px-1 py-1 text-right tabular-nums">{hisob ? (v == null ? <span className="text-warning">noma’lum</span> : <FmtN val={v} />) : ''}</td>
                  {tahrir && <td className="px-1 py-1">{!oxirgi && <button type="button" onClick={() => ochirQator(i)} className="text-text-mute hover:text-danger" title="Qatorni olib tashlash"><Trash2 size={13} /></button>}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tahrir && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => qosh('foiz')} className="rounded border px-2 py-1 text-[12px]">+ foiz qator</button>
          <button type="button" onClick={() => qosh('summa')} className="rounded border px-2 py-1 text-[12px]">+ belgilangan summa</button>
          <button type="button" onClick={() => qosh('jami')} className="rounded border px-2 py-1 text-[12px]">+ oraliq jami</button>
          <input className="border rounded px-2 py-1 text-[12px] min-w-[200px]" value={tahrir.nom ?? ''} onChange={(e) => setTahrir((t) => (t ? { ...t, nom: e.target.value } : t))} placeholder="Podval nomi" />
          <div className="flex-1" />
          {aynanDoira && <button type="button" onClick={standartgaQayt} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[12px] text-text-mute"><RotateCcw size={13} /> Standartga qaytarish</button>}
          <button type="button" onClick={() => setTahrir(aynanDoira ? { versiya: 1, nom: aynanDoira.nom, qatorlar: aynanDoira.qatorlar, id: aynanDoira.id } : null)} className="rounded border px-2 py-1 text-[12px]">Bekor</button>
          <button type="button" disabled={band || xatolar.length > 0} onClick={saqla} className="inline-flex items-center gap-1 rounded bg-accent px-3 py-1 text-[12px] text-white disabled:opacity-50"><Save size={13} /> Saqlash</button>
        </div>
      )}
      {xatolar.length > 0 && <ul className="text-[12px] text-danger list-disc pl-5">{xatolar.map((x, i) => <li key={i}>{x.kod ? `«${x.kod}»: ` : ''}{x.xabar}</li>)}</ul>}
      {xabar && <p className="text-[12px]">{xabar}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-[11px]">
        {NAKRUTKA_KATLAR.map((k) => (
          <div key={k} className="border rounded px-2 py-1"><div className="text-text-mute">Kf {k}</div><div className="tabular-nums font-medium">{kf[k].toFixed(6)}</div></div>
        ))}
      </div>
      {belgilangan !== 0 && (
        <p className="text-[11px] text-text-mute">Belgilangan summalar ({belgilangan == null ? 'noma’lum bor' : belgilangan.toLocaleString('ru-RU')}) koeffitsientlarga kirmaydi — hujjat podvalida alohida qator bo‘lib chiqadi.</p>
      )}
    </div>
  );
}
