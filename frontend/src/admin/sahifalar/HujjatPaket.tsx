/**
 * Hujjatlar paketi (universal; egasi 2026-11-19): F-2 reestridagi ikki alohida paket (oylik paket, F-2 portfeli) o'rniga BITTA - Disk bilan
 * bevosita bog'langan. Nomzodlar serverdan (Disk + akt reestri), filtr, uch holatli daraxt (Loyiha > Shartnoma > Obyekt > Oy > Tur), hujjat belgisi,
 * jonli son va token bahosi (faqat yasaladiganlar; Diskdagi versiya BEPUL), chiqish: ZIP (Disk ierarxiyasi) yoki bitta Excel (varaqlar).
 * Mantiq lib/hujjat-paket (toza, testlangan); yasash - mavjud /api/hujjat-yarat (token, Disk).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Download, RefreshCw } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { paketNomzodOl, saytYetkazuvchi } from '../../api/hujjat-paket';
import { narxHisob, tokenHolatOl, type TokenHolat } from '../../api/t2-token';
import {
  daraxtQur, hujjatniAlmashtir, nomzodSuz, paketReja, qoidaBilanAjrat, sukutTanlov, tanlovniTozala, tokenBahosi, tugunUchligi, tugunniAlmashtir, TUR_NOMI, TUR_TARTIB,
  type DaraxtTugun, type Nomzod, type PaketFiltr, type PaketHolat,
} from '../../lib/hujjat-paket/nomzod';
import { paketExcel, paketYigish, paketZipi } from '../../lib/hujjat-paket/yigish';

function Uchlik({ holat, onClick, nom }: { holat: 'hammasi' | 'qisman' | 'yoq'; onClick: () => void; nom: string }) {
  const r = useRef<HTMLInputElement>(null);
  useEffect(() => { if (r.current) r.current.indeterminate = holat === 'qisman'; }, [holat]);
  return <input ref={r} type="checkbox" aria-label={nom} checked={holat === 'hammasi'} onChange={onClick} />;
}

const KO_P = (qiymatlar: string[], tanlangan: string[], ozgar: (v: string[]) => void, nom: (v: string) => string) => (
  <div className="flex flex-wrap gap-x-3 gap-y-1">
    {qiymatlar.map((v) => (
      <label key={v} className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={tanlangan.includes(v)} onChange={() => ozgar(tanlangan.includes(v) ? tanlangan.filter((x) => x !== v) : [...tanlangan, v])} />{nom(v)}
      </label>
    ))}
  </div>
);

export function HujjatPaket(p: { kompaniyaId: number; tashkilot?: string | null; /** Oldindan tanlangan filtr (masalan Diskdagi papkadan «Paket yasash»). */ boshFiltr?: PaketFiltr }) {
  const [royxat, setRoyxat] = useState<Nomzod[] | null>(null);
  const [kesilgan, setKesilgan] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [filtr, setFiltr] = useState<PaketFiltr>(p.boshFiltr ?? {});
  const [tanlov, setTanlov] = useState<Set<string>>(new Set());
  const [ochiq, setOchiq] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<'zip' | 'excel'>('zip');
  const [jarayon, setJarayon] = useState<string | null>(null);
  const [tokenH, setTokenH] = useState<TokenHolat | null>(null);

  const yukla = useCallback(async () => {
    setXato(null);
    const r = await paketNomzodOl(p.kompaniyaId, {});
    if (!r.ok) { setXato(r.xabar); setRoyxat([]); return; }
    setRoyxat(r.nomzodlar); setKesilgan(r.kesilgan);
    setTanlov((eski) => (eski.size ? tanlovniTozala(eski, r.nomzodlar) : sukutTanlov(qoidaBilanAjrat(r.nomzodlar).yaroqli)));
  }, [p.kompaniyaId]);
  useEffect(() => { void yukla(); }, [yukla]);
  useEffect(() => { void tokenHolatOl(p.kompaniyaId).then((r) => { if (r.ok) setTokenH(r.natija); }); }, [p.kompaniyaId]);

  const korinadi = useMemo(() => nomzodSuz(royxat ?? [], filtr), [royxat, filtr]);
  const { yaroqli, rad } = useMemo(() => qoidaBilanAjrat(korinadi), [korinadi]);
  const daraxt = useMemo(() => daraxtQur(yaroqli), [yaroqli]);
  const reja = useMemo(() => paketReja(yaroqli, tanlov), [yaroqli, tanlov]);
  const narx = useMemo(() => {
    const n = tokenH?.narxlar.find((x) => x.amal === 'hujjat');
    return n && tokenH?.sozlama ? (k: number) => narxHisob(n, k, tokenH.sozlama)?.token ?? null : null;
  }, [tokenH]);
  const baho = useMemo(() => tokenBahosi(reja, narx), [reja, narx]);

  // Filtr variantlari (ro'yxatning o'zidan: ierarxiyani qayta so'ramaydi)
  const variantlar = useMemo(() => {
    const u = <T,>(f: (n: Nomzod) => [T, string] | null) => { const m = new Map<T, string>(); for (const n of royxat ?? []) { const x = f(n); if (x) m.set(x[0], x[1]); } return [...m.entries()]; };
    return {
      loyiha: u((n) => (n.loyiha_id != null ? [n.loyiha_id, n.loyiha_nom ?? `#${n.loyiha_id}`] : null)),
      shartnoma: u((n) => (n.shartnoma_id != null ? [n.shartnoma_id, `№${n.shartnoma_raqam ?? n.shartnoma_id}`] : null)),
      obyekt: u((n) => (n.obyekt_id != null ? [n.obyekt_id, n.obyekt_nom ?? `#${n.obyekt_id}`] : null)),
      tur: TUR_TARTIB.filter((x) => (royxat ?? []).some((n) => n.tur === x)),
    };
  }, [royxat]);
  const sonlar = (k: 'loyihaIds' | 'shartnomaIds' | 'obyektIds') => (filtr[k] ?? []).map(String);
  const sonOzgar = (k: 'loyihaIds' | 'shartnomaIds' | 'obyektIds') => (v: string[]) => setFiltr((f) => ({ ...f, [k]: v.map(Number) }));

  const yigish = async () => {
    if (!reja.hujjatlar.length) { toast(t('Hujjat tanlanmagan'), 'warn'); return; }
    setJarayon('0/' + reja.hujjatlar.length);
    try {
      const y = await paketYigish(reja, saytYetkazuvchi(p.kompaniyaId), { tayyor: (b, j) => setJarayon(`${b}/${j}`) });
      const sarlavha = `${t('HUJJATLAR PAKETI')}${p.tashkilot ? ` · ${p.tashkilot}` : ''}`;
      if (!y.fayllar.length) { toast(y.xatolar[0] ?? t('Hujjat yasalmadi'), 'danger'); return; }
      if (format === 'zip') downloadBlob(paketZipi(y, { sarlavha, reja }).bytes, `hujjatlar-paketi.zip`, 'application/zip');
      else {
        const e = await paketExcel(y, { sarlavha });
        downloadBlob(e.bytes, 'hujjatlar-paketi.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }
      toast(y.xatolar.length ? t('Paket tayyor, {n} ta hujjat kiritilmadi (Tarkibga qarang)', { n: y.xatolar.length }) : t('Paket tayyor'), y.xatolar.length ? 'warn' : 'ok');
      void yukla(); // yasalganlar endi Diskda
    } finally { setJarayon(null); }
  };

  const tugun = (tg: DaraxtTugun, chuqur: number): ReactNode => {
    const u = tugunUchligi(tg, tanlov); const och = ochiq.has(tg.id);
    return (
      <li key={tg.id} style={{ marginLeft: chuqur ? 16 : 0 }}>
        <div className="flex items-center gap-1 py-0.5">
          <button type="button" aria-label={och ? t('Yig‘ish') : t('Ochish')} onClick={() => setOchiq((s) => { const y = new Set(s); if (y.has(tg.id)) y.delete(tg.id); else y.add(tg.id); return y; })}>
            {och ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <Uchlik holat={u} nom={`paket:${tg.nom}`} onClick={() => setTanlov((s) => tugunniAlmashtir(tg, s))} />
          <span className="text-sm">{tg.nom}</span>
          <span className="text-xs opacity-60">({tg.barg.filter((k) => tanlov.has(k)).length}/{tg.barg.length})</span>
        </div>
        {och && <ul>{tg.bolalar.map((b) => tugun(b, chuqur + 1))}
          {tg.hujjatlar.map((n) => (
            <li key={n.kalit} className="flex items-center gap-2 py-0.5" style={{ marginLeft: 20 }}>
              <input type="checkbox" aria-label={`paket:${n.sarlavha}`} checked={tanlov.has(n.kalit)} onChange={() => setTanlov((s) => hujjatniAlmashtir(n.kalit, s))} />
              <span className="text-sm">{n.sarlavha}</span>
              <span className="text-xs opacity-70">{n.holat === 'qoralama' ? t('qoralama') : n.holat === 'tasdiqlangan' ? t('tasdiqlangan') : ''}</span>
              <span className="text-xs opacity-70">{n.yasash ? t('yasaladi') : `Disk v${n.versiya ?? 1}`}</span>
            </li>
          ))}</ul>}
      </li>
    );
  };

  return (
    <section className="fz-card" aria-label={t('Hujjatlar paketi')}>
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{t('Hujjatlar paketi')}</h2>
        <button type="button" className="fz-btn" onClick={() => void yukla()}><RefreshCw size={14} /> {t('Yangilash')}</button>
      </header>
      <p className="text-sm opacity-80">{t('Tayyor hujjatlar Diskdan olinadi (bepul); yo‘qlari yasaladi va Diskka yoziladi.')}</p>
      {xato && <p role="alert" className="text-sm text-red-600">{xato}</p>}
      {kesilgan && <p className="text-sm">{t('Ro‘yxat juda uzun — filtr bilan toraytiring.')}</p>}
      {royxat && (
        <div className="grid gap-2 my-2">
          {variantlar.loyiha.length > 0 && <div><b className="text-sm">{t('Loyiha')}:</b>{KO_P(variantlar.loyiha.map(([k]) => String(k)), sonlar('loyihaIds'), sonOzgar('loyihaIds'), (v) => variantlar.loyiha.find(([k]) => String(k) === v)?.[1] ?? v)}</div>}
          {variantlar.shartnoma.length > 0 && <div><b className="text-sm">{t('Shartnoma')}:</b>{KO_P(variantlar.shartnoma.map(([k]) => String(k)), sonlar('shartnomaIds'), sonOzgar('shartnomaIds'), (v) => variantlar.shartnoma.find(([k]) => String(k) === v)?.[1] ?? v)}</div>}
          {variantlar.obyekt.length > 0 && <div><b className="text-sm">{t('Obyekt')}:</b>{KO_P(variantlar.obyekt.map(([k]) => String(k)), sonlar('obyektIds'), sonOzgar('obyektIds'), (v) => variantlar.obyekt.find(([k]) => String(k) === v)?.[1] ?? v)}</div>}
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm">{t('Oydan')} <input type="month" value={filtr.oyDan ?? ''} onChange={(e) => setFiltr((f) => ({ ...f, oyDan: e.target.value || null }))} /></label>
            <label className="text-sm">{t('Oygacha')} <input type="month" value={filtr.oyGacha ?? ''} onChange={(e) => setFiltr((f) => ({ ...f, oyGacha: e.target.value || null }))} /></label>
          </div>
          <div><b className="text-sm">{t('Hujjat turi')}:</b>{KO_P(variantlar.tur, [...(filtr.turlar ?? [])], (v) => setFiltr((f) => ({ ...f, turlar: v })), (v) => TUR_NOMI[v] ?? v)}</div>
          <div><b className="text-sm">{t('Holat')}:</b>{KO_P(['qoralama', 'tasdiqlangan'], [...(filtr.holatlar ?? [])], (v) => setFiltr((f) => ({ ...f, holatlar: v as PaketHolat[] })), (v) => (v === 'qoralama' ? t('Qoralama') : t('Tasdiqlangan')))}</div>
        </div>
      )}
      {royxat && !royxat.length && !xato && <p className="text-sm">{t('Paketga kiradigan hujjat topilmadi.')}</p>}
      <ul>{daraxt.map((d) => tugun(d, 0))}</ul>
      {rad.length > 0 && <p className="text-xs opacity-70">{t('Qoida bo‘yicha kiritilmaydi (taxminiy yoki oyga ikkinchi F-2): {n} ta', { n: rad.length })}</p>}
      <footer className="flex flex-wrap items-center gap-3 mt-2">
        <span className="text-sm" data-testid="paket-son">{t('Tanlandi: {n} · Diskdan: {d} (bepul) · Yasaladi: {y}', { n: reja.hujjatlar.length, d: reja.diskdan.length, y: reja.yasash.length })}</span>
        <span className="text-sm" data-testid="paket-token">{baho.token == null ? t('Token: ≈ {k} katak', { k: baho.katak }) : t('Token: ≈ {n}', { n: baho.token })}</span>
        <select aria-label={t('Chiqish')} value={format} onChange={(e) => setFormat(e.target.value as 'zip' | 'excel')}>
          <option value="zip">{t('ZIP (papkalar)')}</option><option value="excel">{t('Bitta Excel (varaqlar)')}</option>
        </select>
        <button type="button" className="fz-btn fz-btn--primary" disabled={!!jarayon || !reja.hujjatlar.length} onClick={() => void yigish()}>
          <Download size={14} /> {jarayon ? t('Yig‘ilmoqda {j}', { j: jarayon }) : t('Paketni yuklab olish')}
        </button>
      </footer>
    </section>
  );
}
