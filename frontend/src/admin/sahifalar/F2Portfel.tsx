/**
 * F2 PORTFELI (egasi 2026-11-05): shartnoma yoki obyekt bo'yicha BARCHA F2 lar (barcha oylar) — obyekt → oy, holat va raqam,
 * har akt: QQS bilan (asosiy) · ustamali · ustamasiz; obyekt va shartnoma jamilari: tasdiqlangan / qoralamalar / hammasi.
 * Bekor qilingan F2 ko'rinadi (kulrang), jamiga kirmaydi. F2 reestri sahifasining bo'limi (yangi menyu yo'q, oylik paket yonida).
 *
 * Jonli: nusxa saqlanmaydi — har ochilishda va sahifaga qaytilganda joriy aktlar qayta o'qiladi (F2 tayyorlash, storno, tasdiqlash
 * shu zahoti ko'rinadi). Muzlatilgan nusxa faqat «Shartnoma oylik paketi → Topshirildi» arxivida (eskirgani u yerda belgilanadi).
 * Pul — yagona yadro (`lib/f2-akt-eksport` → `f2Baholash`): aktning o'z podvali bo'lsa o'shaniki, yo'q — smeta podvali.
 * «Yuklab olish» — BITTA Excel: «Свод» + har akt Ф-2 varag'i (F2 tarixi bilan bir xil generator). Token: har Ф-2 F2 tarixidagi
 * kalit bilan (avval to'langan bo'lsa bepul), Свод — mazmun xeshi bilan (aynan shu mazmun qayta yuklansa bepul).
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { t, tilLocale } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { QiymatUchlik } from '../../umumiy/ui/QiymatUchlik';
import type { ReestrMalumot } from '../../api/t2-f2-reestr';
import { portfelObyektOl, type PortfelObyektMalumot } from '../../api/f2-oylik-paket';
import { f2HujjatKaliti } from '../../api/f2-hujjat-kontekst';
import { mazmunXeshi, tokenBilan } from '../../api/t2-token';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { rasmiyKitob } from '../../lib/hujjat-yozuvchi';
import { f2HujjatVaraqlar } from '../../lib/f2-hujjat';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { barchaShartnomalar } from '../../lib/f2-oylik-paket/shartnoma';
import type { OyJami, PaketAkt } from '../../lib/f2-oylik-paket/oylik';
import {
  aktVaraqNomi, portfelAktlari, portfelAktMoliya, portfelAktTayyor, portfelEksportAktlari, portfelGuruhla, type PortfelJami, type PortfelKesim,
} from '../../lib/f2-oylik-paket/portfel';
import { portfelKitob, portfelSvodVaraq, type PortfelAktVaraq } from '../../lib/f2-oylik-paket/portfel-eksport';
import type { Summa } from '../../lib/f2-reestr/reestr';

const pul = (n: number) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BOSQICH_NOMI = { tasdiqlangan: 'Tasdiqlangan', jarayonda: 'Qoralama / tekshiruvda', rad: 'Rad etilgan', bekor: 'Bekor qilingan' } as const;
const BOSQICH_RANG = { tasdiqlangan: 'text-ok', jarayonda: 'text-warn', rad: 'text-danger', bekor: 'text-text-mute' } as const;
const malum = (s: Summa) => (s.soni - s.nomalum > 0 ? s.malum : null);
const uchlik = (j: OyJami) => ({ qqsBilan: malum(j.jami), ustamali: malum(j.ustamali), ustamasiz: malum(j.ustamasiz), taxminiy: j.taxminiy > 0, nomalum: 0, sabab: null });
const nomalumSoni = (j: OyJami) => Math.max(j.jami.nomalum, j.ustamali.nomalum, j.ustamasiz.nomalum);

function Son({ v, taxminiy = false, kuchli = false }: { v: number | null | undefined; taxminiy?: boolean; kuchli?: boolean }) {
  if (v == null) return <span className="text-warn">{t('noma’lum')}</span>;
  return <span className={`tabular-nums ${kuchli ? 'font-semibold' : ''}`}>{taxminiy ? '≈ ' : ''}{pul(v)}</span>;
}
function JamiSon({ s, kuchli = false }: { s: Summa; kuchli?: boolean }) {
  const v = malum(s);
  return <span className={`tabular-nums ${kuchli ? 'font-semibold' : ''}`}>{v == null ? '—' : pul(v)}
    {s.nomalum > 0 && <span className="block text-[10.5px] font-normal text-warn">{t('+ {n} ta summasi noma’lum', { n: s.nomalum })}</span>}</span>;
}

/** Jami qatori (obyekt yoki shartnoma): QQS bilan · ustamali · ustamasiz. */
function JamiQator({ nom, j, kuchli = false }: { nom: string; j: OyJami; kuchli?: boolean }) {
  return <tr className={`border-t border-border/60 ${kuchli ? 'bg-surface-2/60 font-semibold' : 'bg-surface-2/30'}`}>
    <td className="px-2 py-1.5" colSpan={3}>{nom} <span className="text-[11px] font-normal text-text-mute">({t('{n} ta', { n: j.soni })})</span></td>
    <td className="px-2 py-1.5 text-right"><JamiSon s={j.jami} kuchli /></td>
    <td className="px-2 py-1.5 text-right"><JamiSon s={j.ustamali} /></td>
    <td className="px-2 py-1.5 text-right"><JamiSon s={j.ustamasiz} /></td>
    <td />
  </tr>;
}
function GuruhJamilari({ sarlavha, j, kuchli = false }: { sarlavha: string; j: PortfelJami; kuchli?: boolean }) {
  return <>
    <JamiQator nom={`${sarlavha} — ${t('tasdiqlangan')}`} j={j.tasdiqlangan} kuchli={kuchli} />
    {j.qoralama.soni > 0 && <JamiQator nom={`${sarlavha} — ${t('qoralamalar')}`} j={j.qoralama} />}
    {j.qoralama.soni > 0 && <JamiQator nom={`${sarlavha} — ${t('hammasi')}`} j={j.hammasi} />}
  </>;
}

function urlParam(k: string): string | null { try { return new URLSearchParams(window.location.search).get(k); } catch { return null; } }

function PortfelIchi({ kompaniyaId, malumot, tashkilot, yangila }: { kompaniyaId: number; malumot: ReestrMalumot; tashkilot: string | null; yangila: () => void }) {
  const shartnomalar = useMemo(() => barchaShartnomalar(malumot), [malumot]);
  const obyektlar = useMemo(() => {
    const bor = new Set(malumot.aktlar.map((a) => a.obyekt_id));
    return malumot.obyektlar.filter((o) => bor.has(o.id)).sort((a, b) => a.nom.localeCompare(b.nom, 'ru'));
  }, [malumot]);
  const [kesim, setKesim] = useState<PortfelKesim | null>(() => {
    const sh = Number(urlParam('shartnoma')); const ob = Number(urlParam('portfel_obyekt'));
    if (Number.isSafeInteger(ob) && ob > 0) return { tur: 'obyekt', id: ob };
    if (Number.isSafeInteger(sh) && sh > 0) return { tur: 'shartnoma', id: sh };
    return null;
  });
  useEffect(() => {
    if (kesim) return;
    if (shartnomalar.length) setKesim({ tur: 'shartnoma', id: shartnomalar[0].id });
    else if (obyektlar.length) setKesim({ tur: 'obyekt', id: obyektlar[0].id });
  }, [kesim, shartnomalar, obyektlar]);

  const [hisob, setHisob] = useState<Map<number, { moliya: PaketAkt['moliya']; xato: boolean }>>(new Map());
  const [qoralamalar, setQoralamalar] = useState(false);
  const [band, setBand] = useState(false);
  const kesh = useRef(new Map<string, Promise<PortfelObyektMalumot>>());
  const versiya = useRef(0);
  useEffect(() => { kesh.current = new Map(); setHisob(new Map()); }, [kompaniyaId, malumot]);

  const asos = useMemo(() => (kesim ? portfelAktlari(malumot, kesim) : []), [malumot, kesim]);
  const rows: PaketAkt[] = useMemo(() => asos.map((r) => {
    const h = hisob.get(r.akt.id);
    return h ? { ...r, moliya: h.moliya, moliyaXato: h.xato } : r;
  }), [asos, hisob]);
  const portfel = useMemo(() => portfelGuruhla(rows), [rows]);
  const raqamlar = useMemo(() => new Map(malumot.aktlar.map((a) => [a.id, a.raqam ?? null] as const)), [malumot]);
  const asosKalit = asos.map((r) => `${r.akt.id}`).join(',');

  const obyektYukla = useCallback((obyektId: number, aktIdlar: number[]) => {
    const kalit = `${obyektId}|${[...aktIdlar].sort((a, b) => a - b).join(',')}`;
    let p = kesh.current.get(kalit);
    if (!p) {
      p = portfelObyektOl(kompaniyaId, obyektId, aktIdlar).catch((e) => { kesh.current.delete(kalit); throw e; });
      kesh.current.set(kalit, p);
    }
    return p;
  }, [kompaniyaId]);
  const guruh = useMemo(() => {
    const g = new Map<number, PaketAkt[]>();
    for (const r of asos) g.set(r.akt.obyekt_id, [...(g.get(r.akt.obyekt_id) ?? []), r]);
    return g;
  }, [asos]);

  useEffect(() => {
    const v = ++versiya.current;
    void (async () => {
      const navbat = [...guruh];
      let i = 0;
      await Promise.all(Array.from({ length: Math.min(3, navbat.length) }, async () => {
        while (i < navbat.length) {
          const [obyektId, aktlar] = navbat[i++];
          if (v !== versiya.current) return;
          const yangi = new Map<number, { moliya: PaketAkt['moliya']; xato: boolean }>();
          try {
            const m = await obyektYukla(obyektId, aktlar.map((r) => r.akt.id));
            for (const r of aktlar) yangi.set(r.akt.id, { moliya: portfelAktMoliya(m, r.akt, r.obyektNom, raqamlar), xato: false });
          } catch {
            for (const r of aktlar) yangi.set(r.akt.id, { moliya: null, xato: true });
          }
          if (v === versiya.current) setHisob((old) => new Map([...old, ...yangi]));
        }
      }));
    })();
  }, [asosKalit, obyektYukla]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jonli: boshqa oynada F2 tahrirlab qaytilganda reestr qayta o'qiladi (nusxa saqlanmaydi).
  useEffect(() => {
    const k = () => { if (document.visibilityState === 'visible') yangila(); };
    document.addEventListener('visibilitychange', k);
    return () => document.removeEventListener('visibilitychange', k);
  }, [yangila]);

  const hisoblanmoqda = rows.some((r) => r.bosqich !== 'bekor' && !r.moliya && !r.moliyaXato);
  const kesimNomi = useMemo(() => {
    if (!kesim) return '';
    if (kesim.tur === 'shartnoma') { const s = shartnomalar.find((x) => x.id === kesim.id); return s ? `№ ${s.raqam}${s.nom ? ` · ${s.nom}` : ''}` : `№ ${kesim.id}`; }
    return obyektlar.find((o) => o.id === kesim.id)?.nom ?? String(kesim.id);
  }, [kesim, shartnomalar, obyektlar]);

  async function yuklabOl() {
    if (band || !kesim) return;
    const eksport = portfelEksportAktlari(rows, qoralamalar);
    if (!eksport.length) { toast(t('Yuklab olish uchun tasdiqlangan F2 yo‘q'), 'warn'); return; }
    setBand(true);
    try {
      const aktVaraqlar: PortfelAktVaraq[] = [];
      const varaqNomi = new Map<number, string>();
      const kirmadi = new Map<number, string>();
      let imzo: PortfelObyektMalumot['kontekst']['imzo'] | undefined;
      for (const r of eksport) {
        try {
          const m = await obyektYukla(r.akt.obyekt_id, (guruh.get(r.akt.obyekt_id) ?? []).map((x) => x.akt.id));
          imzo ??= m.kontekst.imzo;
          const k = portfelAktTayyor(m, r.akt, r.obyektNom, raqamlar);
          if (!k) { kirmadi.set(r.akt.id, 'нет строк для вывода'); continue; }
          const nom = aktVaraqNomi(r);
          const x = f2HujjatVaraqlar(k.bolimlar, k.qatorlar, { ...k.opsiya, varaqNomi: nom });
          // Token — F2 tarixidagi «Ф-2 Excel» bilan aynan bir xil kalit va katak soni (bir F2 — bir marta to'lov).
          const yakka = rasmiyKitob(x.varaqlar, { tur: 'f2', formulasiz: true });
          const xesh = f2HujjatKaliti(r.akt.obyekt_id, r.akt.oy || '', r.akt.raqam) ?? `akt:${r.akt.id}:${await mazmunXeshi(yakka.bytes)}`;
          const q = await tokenBilan({ kompaniyaId, amal: 'f2_hujjat', birlikSoni: yakka.yacheykalar,
            meta: { hujjat: 'F2', sabab: `F2 №${r.akt.raqam || '—'} · ${r.obyektNom} · ${(r.akt.oy || '').slice(0, 7)}`.slice(0, 200), obyekt: r.akt.obyekt_id, akt: r.akt.id, yacheyka: yakka.yacheykalar, xesh } }, async () => true);
          if (!q.ok) { kirmadi.set(r.akt.id, `лист не сформирован: ${q.xabar}`); continue; }
          aktVaraqlar.push({ varaq: x.varaqlar[0], formulali: !k.opsiya.formulasiz });
          varaqNomi.set(r.akt.id, nom);
        } catch { kirmadi.set(r.akt.id, 'лист не сформирован: строки акта не прочитаны'); }
      }
      const kesimMatni = kesim.tur === 'shartnoma' ? `по договору ${kesimNomi}` : `по объекту: ${kesimNomi}`;
      const svod = portfelSvodVaraq(portfel, { kesimMatni, tashkilot, imzo, varaqlar: varaqNomi, kirmadi });
      const kitob = portfelKitob(svod, aktVaraqlar, { nom: kesimNomi, tashkilot });
      const r = await hujjatTokenBilan({ kompaniyaId, bytes: kitob.bytes, hujjat: 'F2_PORTFEL', sabab: `Свод Ф-2 ${kesimMatni}`, obyekt: kesim.tur === 'obyekt' ? kesim.id : null },
        () => downloadBlob(kitob.bytes, kitob.faylNomi));
      if (!r.ok) { toast(r.xabar, 'danger'); return; }
      toast(kirmadi.size ? t('Yuklandi; {n} ta F2 varag‘i kirmadi (Свод varag‘ida sababi)', { n: kirmadi.size }) : (r.xabar || t('Yuklandi')), kirmadi.size ? 'warn' : 'ok');
    } catch { toast(t('Portfelni yig‘ib bo‘lmadi.'), 'danger'); }
    finally { setBand(false); }
  }

  const sarlavha = 'px-2 py-2';
  return <section className="karta flex flex-col gap-3 p-3 text-[12px]" aria-label={t('F2 portfeli')}>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[180px]"><p className="text-[13px] font-semibold text-text">{t('F2 portfeli')}</p>
        <p className="text-[11px] text-text-mute">{t('Shartnoma yoki obyektning barcha F2 lari, barcha oylar; summalar jonli')}</p></div>
      <label>{t('Kesim')}
        <select aria-label={t('Kesim')} value={kesim?.tur ?? 'shartnoma'} className="input mt-1 block h-8"
          onChange={(e) => {
            if (e.target.value === 'obyekt') { if (obyektlar[0]) setKesim({ tur: 'obyekt', id: obyektlar[0].id }); }
            else if (shartnomalar[0]) setKesim({ tur: 'shartnoma', id: shartnomalar[0].id });
          }}>
          <option value="shartnoma" disabled={!shartnomalar.length}>{t('Shartnoma bo‘yicha')}</option><option value="obyekt">{t('Obyekt bo‘yicha')}</option></select></label>
      {kesim?.tur === 'shartnoma'
        ? <label>{t('Shartnoma')}
          <select aria-label={t('Shartnoma')} value={kesim.id} onChange={(e) => setKesim({ tur: 'shartnoma', id: Number(e.target.value) })} className="input mt-1 block h-8 max-w-[260px]">
            {shartnomalar.map((s) => <option key={s.id} value={s.id}>№ {s.raqam}{s.nom ? ` · ${s.nom}` : ''}</option>)}</select></label>
        : <label>{t('Obyekt')}
          <select aria-label={t('Obyekt')} value={kesim?.id ?? ''} onChange={(e) => setKesim({ tur: 'obyekt', id: Number(e.target.value) })} className="input mt-1 block h-8 max-w-[260px]">
            {obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}</select></label>}
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { kesh.current = new Map(); setHisob(new Map()); yangila(); }} disabled={band}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] disabled:opacity-50"><RefreshCw size={14} /> {t('Yangilash')}</button>
        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={qoralamalar} onChange={(e) => setQoralamalar(e.target.checked)} /> {t('Qoralamalarni ham qo‘shish')}</label>
        <button type="button" onClick={() => void yuklabOl()} disabled={band || !rows.length || hisoblanmoqda}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-[color:var(--on-accent)] disabled:opacity-50">
          <Download size={14} /> {band ? t('Yig‘ilmoqda…') : t('Yuklab olish (bitta Excel)')}</button>
      </span>
    </div>

    {rows.length > 0 && <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label={t('Portfel jamilari')}>
      {([['tasdiqlangan', t('Tasdiqlangan jami')], ['qoralama', t('Qoralamalar')], ['hammasi', t('Hammasi (bekorsiz)')]] as const).map(([k, nom]) =>
        <div key={k} className="rounded-lg border border-border/60 p-2" data-testid={`portfel-${k}`}>
          <p className="text-[11px] text-text-mute">{nom} · {t('{n} ta F2', { n: portfel.jami[k].soni })}</p>
          <QiymatUchlik q={uchlik(portfel.jami[k])} yuklanmoqda={hisoblanmoqda} nomalumSoni={nomalumSoni(portfel.jami[k])} />
        </div>)}
    </div>}
    {portfel.jami.bekorSoni > 0 && <p className="text-[11.5px] text-text-mute">{t('{n} ta bekor qilingan F2 ko‘rsatilgan, jamiga kirmaydi', { n: portfel.jami.bekorSoni })}</p>}
    {hisoblanmoqda && <p role="status" className="text-[11.5px] text-text-mute">{t('Summalar (ustamali, QQS) hisoblanmoqda…')}</p>}

    {rows.length === 0 ? <p className="text-text-mute">{t('Bu kesimda F2 yo‘q.')}</p> : <div className="overflow-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[960px] text-[12.5px]">
        <thead className="bg-surface-2/60 text-left text-[11px] text-text-dim"><tr>
          <th className={sarlavha}>{t('Oy')}</th><th className={sarlavha}>{t('F2 raqami')}</th><th className={sarlavha}>{t('Holat')}</th>
          <th className={`${sarlavha} text-right`}>{t('QQS bilan')}</th><th className={`${sarlavha} text-right`}>{t('Ustamali (QQS siz)')}</th>
          <th className={`${sarlavha} text-right`}>{t('Ustamasiz')}</th><th className={sarlavha}>{t('Amallar')}</th>
        </tr></thead>
        <tbody>
          {portfel.obyektlar.map((ob) => <Fragment key={ob.obyektId}>
            <tr className="border-t-2 border-border bg-surface-2/40"><td className="px-2 py-2 text-[13px] font-semibold text-text" colSpan={7}>{ob.nom}</td></tr>
            {ob.oylar.map((oy) => oy.aktlar.map((r, i) => {
              const m = r.moliya;
              const bekor = r.bosqich === 'bekor';
              const tahrir = r.akt.holat === 'qoralama' && (r.akt.lifecycle_status ?? 'draft') === 'draft';
              const q = `obyekt=${r.akt.obyekt_id}&akt=${r.akt.id}`;
              const tayyor = m || r.moliyaXato;
              return <tr key={r.akt.id} className={`border-t border-border/40 align-top ${bekor ? 'text-text-mute line-through opacity-60' : 'hover:bg-surface-2/40'}`}>
                <td className="whitespace-nowrap px-2 py-1.5">{i === 0 ? (oy.oy === '—' ? '—' : davrNomi(`${oy.oy}-01`, tilLocale()) || oy.oy) : ''}</td>
                <td className="px-2 py-1.5">{r.akt.raqam?.trim() ? `№ ${r.akt.raqam}` : <span className="text-warn">{t('raqamsiz')}</span>}</td>
                <td className={`px-2 py-1.5 ${BOSQICH_RANG[r.bosqich]}`}>{t(BOSQICH_NOMI[r.bosqich])}</td>
                <td className="px-2 py-1.5 text-right">{tayyor ? <Son v={m?.jami} taxminiy={m?.taxminiy} kuchli /> : '…'}</td>
                <td className="px-2 py-1.5 text-right">{tayyor ? <Son v={m?.ustamali} taxminiy={m?.taxminiy} /> : '…'}</td>
                <td className="px-2 py-1.5 text-right"><Son v={m ? m.ustamasiz : r.akt.hujjat_jami} /></td>
                <td className="whitespace-nowrap px-2 py-1.5 no-underline">
                  <a className="mr-2 text-accent underline" href={`/admin/f2-tarix?obyekt=${r.akt.obyekt_id}`}>{t('Ochish')}</a>
                  {tahrir && (r.akt.manba === 'import'
                    ? <a className="text-accent underline" href={`/admin/f2?${q}`}>✎ {t('Tahrirlash')}</a>
                    : <a className="text-accent underline" href={`/admin/f2-tayyorlash?${q}`}>✎ {t('Tizimda tahrirlash')}</a>)}
                </td>
              </tr>;
            }))}
            <GuruhJamilari sarlavha={t('Obyekt jami')} j={ob.jami} />
          </Fragment>)}
        </tbody>
        <tfoot className="border-t-2 border-border">
          <GuruhJamilari sarlavha={kesim?.tur === 'shartnoma' ? t('Shartnoma jami') : t('Jami')} j={portfel.jami} kuchli />
        </tfoot>
      </table>
    </div>}
  </section>;
}

/** F2 reestri sahifasidagi bo'lim: sukut bo'yicha yig'iq; `?portfel=1` (+ `shartnoma=ID` yoki `portfel_obyekt=ID`) bilan ochiq. */
export function F2Portfel(p: { kompaniyaId: number; malumot: ReestrMalumot; tashkilot: string | null; yangila: () => void }) {
  const [ochiq, setOchiq] = useState(() => urlParam('portfel') === '1');
  if (!ochiq) {
    return <section className="karta flex flex-wrap items-center gap-3 p-3 text-[12px]" aria-label={t('F2 portfeli')}>
      <div className="min-w-[200px] flex-1"><p className="text-[13px] font-semibold text-text">{t('F2 portfeli')}</p>
        <p className="text-[11px] text-text-mute">{t('Shartnoma va obyekt bo‘yicha barcha F2: jamilar doim ko‘rinadi, bitta Excel yuklab olish')}</p></div>
      <button type="button" onClick={() => setOchiq(true)} className="rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-[color:var(--on-accent)]">{t('Portfelni ochish')}</button>
    </section>;
  }
  return <div className="flex flex-col gap-1">
    <PortfelIchi {...p} />
    <button type="button" onClick={() => setOchiq(false)} className="self-end text-[11px] text-text-mute underline">{t('Yig‘ish')}</button>
  </div>;
}
