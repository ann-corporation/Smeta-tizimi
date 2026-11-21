/**
 * Hujjatlar paketi (egasi 2026-11-19, qayta yozildi): hujjatlar DOIM TAYYOR (Diskda, o'zgarsa fonda yangilanadi) - bu yerda faqat tanlab olish.
 * Ixcham filtr paneli (Shartnoma, Obyekt, Oy, Hujjat turi, Holat) + oddiy natija ro'yxati (obyekt · hujjat · oy · holat · Diskdagi versiya vaqti · «yangilanmoqda»).
 * Filtr va sahifalash SERVERDA (t2_hujjat_paket_royxat_v1); hammasini tanlash - server kalitlari bilan. Bitta tugma: «Yuklab olish (N)» - ZIP yoki bitta Excel;
 * token narxi yuklashdan oldin ko'rinadi (faqat to'lanmagan hujjatlar; qayta yuklash bepul). Saqlangan filtrlar («Texnadzor to'plami»).
 * Mantiq: lib/hujjat-paket/royxat.ts (toza, testlangan) + nomzod.ts / yigish.ts (reja, ZIP, Excel).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { filtrOchir, filtrSaqla, filtrlarOl, paketRoyxatOl, saytYetkazuvchi, tanlanganNomzodlar, SAHIFA_HAJMI, type SaqlanganFiltr, type Variantlar } from '../../api/hujjat-paket';
import { narxHisob, tokenHolatOl, type TokenHolat } from '../../api/t2-token';
import { paketReja, TUR_NOMI, type PaketFiltr } from '../../lib/hujjat-paket/nomzod';
import {
  BOSH_FILTR, FILTR_HOLATLARI, FILTR_TURLARI, HOLAT_NOMI, filtrBosh, filtrdanServerga, filtrniTozala, obyektQidir, oyOraligi, tanlanganlar, yangilikMatni, yuklashBahosi,
  type FiltrHolati, type RoyxatQator,
} from '../../lib/hujjat-paket/royxat';
import { obyektHolatlari, paketExcel, paketYigish, paketZipi, type HujjatHolati } from '../../lib/hujjat-paket/yigish';

const Chip = ({ yoqilgan, onClick, children }: { yoqilgan: boolean; onClick: () => void; children: string }) => (
  <button type="button" aria-pressed={yoqilgan} onClick={onClick} className={`fz-chip${yoqilgan ? ' fz-chip--on' : ''}`} style={{ padding: '2px 10px', borderRadius: 999, border: '1px solid currentColor', opacity: yoqilgan ? 1 : 0.6, fontSize: 13 }}>{children}</button>
);

const ozgartir = <T,>(r: readonly T[], v: T): T[] => (r.includes(v) ? r.filter((x) => x !== v) : [...r, v]);

export function HujjatPaket(p: { kompaniyaId: number; tashkilot?: string | null; /** Oldindan tanlangan filtr (masalan Diskdagi papkadan «Paket yasash»). */ boshFiltr?: PaketFiltr }) {
  const [filtr, setFiltr] = useState<FiltrHolati>(() => ({
    ...BOSH_FILTR, ...(p.boshFiltr ? {
      shartnomaId: p.boshFiltr.shartnomaIds?.[0] ?? null, obyektIds: [...(p.boshFiltr.obyektIds ?? [])], oyDan: p.boshFiltr.oyDan ?? null, oyGacha: p.boshFiltr.oyGacha ?? null,
      turlar: [...(p.boshFiltr.turlar ?? [])], holatlar: [...(p.boshFiltr.holatlar ?? [])],
    } : {}),
  }));
  const [qatorlar, setQatorlar] = useState<RoyxatQator[]>([]);
  const [jami, setJami] = useState(0);
  const [barcha, setBarcha] = useState<string[]>([]);
  const [variantlar, setVariantlar] = useState<Variantlar | null>(null);
  const [tanlov, setTanlov] = useState<Set<string>>(new Set());
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [qidiruv, setQidiruv] = useState('');
  const [format, setFormat] = useState<'zip' | 'excel'>('zip');
  const [jarayon, setJarayon] = useState<string | null>(null);
  const [holatlar, setHolatlar] = useState<HujjatHolati[]>([]);
  const [tokenH, setTokenH] = useState<TokenHolat | null>(null);
  const [saqlangan, setSaqlangan] = useState<SaqlanganFiltr[]>([]);
  const [filtrNomi, setFiltrNomi] = useState('');

  const serverFiltr = useMemo(() => filtrdanServerga(filtr), [filtr]);

  const yukla = useCallback(async (oldin = false) => {
    setYuklanmoqda(true); setXato(null);
    const r = await paketRoyxatOl(p.kompaniyaId, serverFiltr, 0, SAHIFA_HAJMI, oldin);
    setYuklanmoqda(false);
    if (!r.ok) { setXato(r.xabar); setQatorlar([]); setJami(0); setBarcha([]); return; }
    setQatorlar(r.nomzodlar); setJami(r.jami); setBarcha(r.barchaKalitlar);
    if (r.variantlar) setVariantlar(r.variantlar);
    setTanlov((eski) => new Set([...eski].filter((k) => r.barchaKalitlar.includes(k))));
  }, [p.kompaniyaId, serverFiltr]);
  useEffect(() => { void yukla(variantlar == null); /* variantlar faqat birinchi yuklashda */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yukla]);
  useEffect(() => { void tokenHolatOl(p.kompaniyaId).then((r) => { if (r.ok) setTokenH(r.natija); }); void filtrlarOl(p.kompaniyaId).then(setSaqlangan); }, [p.kompaniyaId]);

  const yana = async () => {
    const r = await paketRoyxatOl(p.kompaniyaId, serverFiltr, qatorlar.length, SAHIFA_HAJMI);
    if (r.ok) setQatorlar((q) => [...q, ...r.nomzodlar.filter((n) => !q.some((x) => x.kalit === n.kalit))]);
  };

  const narx = useMemo(() => {
    const n = tokenH?.narxlar.find((x) => x.amal === 'hujjat');
    return n && tokenH?.sozlama ? (k: number) => narxHisob(n, k, tokenH.sozlama)?.token ?? null : null;
  }, [tokenH]);
  const tanlangan = useMemo(() => tanlanganlar(qatorlar, tanlov), [qatorlar, tanlov]);
  const baho = useMemo(() => yuklashBahosi(tanlangan, narx), [tanlangan, narx]);
  const yuklanmagan = tanlov.size - tanlangan.length; // tanlangan, lekin hali sahifada ko'rinmagan (narx yuklashda aniqlanadi)

  const obyektlar = useMemo(() => (variantlar?.obyektlar ?? []).filter((o) => filtr.shartnomaId == null || o.shartnoma_id === filtr.shartnomaId).map((o) => ({ id: o.id, nom: o.nom ?? `#${o.id}` })), [variantlar, filtr.shartnomaId]);
  const takliflar = useMemo(() => obyektQidir(obyektlar, qidiruv, filtr.obyektIds), [obyektlar, qidiruv, filtr.obyektIds]);
  const obyektNomi = (id: number) => obyektlar.find((o) => o.id === id)?.nom ?? (variantlar?.obyektlar.find((o) => o.id === id)?.nom ?? `#${id}`);
  const ozgar = (q: Partial<FiltrHolati>) => setFiltr((f) => ({ ...f, ...q }));

  const yuklabOl = async () => {
    if (!tanlov.size) { toast(t('Hujjat tanlanmagan'), 'warn'); return; }
    setJarayon('…'); setHolatlar([]);
    try {
      const nomzodlar = (await tanlanganNomzodlar(p.kompaniyaId, serverFiltr, tanlov)).filter((n) => !n.takror && !n.taxminiy);
      const reja0 = paketReja(nomzodlar, new Set(nomzodlar.map((n) => n.kalit)));
      // F-2: har doim server orqali (token yuklab olishda, mazmun kaliti bo'yicha bir marta; Diskda tayyor bo'lsa - zudlik bilan). Boshqa turlar Diskdan - bepul.
      const reja = { diskdan: reja0.diskdan.filter((n) => n.tur !== 'f2'), yasash: [...reja0.yasash, ...reja0.diskdan.filter((n) => n.tur === 'f2')] };
      setJarayon('0/' + (reja.diskdan.length + reja.yasash.length));
      const y = await paketYigish(reja, saytYetkazuvchi(p.kompaniyaId), { tayyor: (b, j) => setJarayon(`${b}/${j}`) });
      const sarlavha = `${t('HUJJATLAR PAKETI')}${p.tashkilot ? ` · ${p.tashkilot}` : ''}`;
      setHolatlar(y.holatlar ?? []);
      if (!y.fayllar.length) { toast(y.xatolar[0] ?? t('Hujjat yasalmadi'), 'danger'); return; }
      if (format === 'zip') downloadBlob(paketZipi(y, { sarlavha, reja: { rad: [], olinmaydi: [] } }).bytes, 'hujjatlar-paketi.zip', 'application/zip');
      else { const e = await paketExcel(y, { sarlavha }); downloadBlob(e.bytes, 'hujjatlar-paketi.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); }
      toast(y.xatolar.length ? t('Paket tayyor, {n} ta hujjat kiritilmadi (Tarkibga qarang)', { n: y.xatolar.length }) : t('Paket tayyor'), y.xatolar.length ? 'warn' : 'ok');
      void yukla();
    } catch (e) { toast(e instanceof Error ? e.message : t('Hujjat yasalmadi'), 'danger'); }
    finally { setJarayon(null); }
  };

  const filtrniSaqla = async () => {
    const nom = filtrNomi.trim();
    if (!nom) { toast(t('Filtr nomini yozing'), 'warn'); return; }
    if (await filtrSaqla(p.kompaniyaId, nom, serverFiltr)) { setFiltrNomi(''); setSaqlangan(await filtrlarOl(p.kompaniyaId)); toast(t('Filtr saqlandi'), 'ok'); }
    else toast(t('Filtr saqlanmadi'), 'danger');
  };

  return (
    <section className="fz-card" aria-label={t('Hujjatlar paketi')}>
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{t('Hujjatlar paketi')}</h2>
        <button type="button" className="fz-btn" onClick={() => void yukla()} aria-label={t('Yangilash')}><RefreshCw size={14} /></button>
      </header>
      <p className="text-sm opacity-80">{t('Hujjatlar Diskda doim tayyor turadi va o‘zgarsa o‘zi yangilanadi. Keraklisini tanlab paket qiling.')}</p>

      <div className="grid gap-2 my-2" data-testid="paket-filtr">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm">{t('Shartnoma')}{' '}
            <select aria-label={t('Shartnoma')} value={filtr.shartnomaId ?? ''} onChange={(e) => ozgar({ shartnomaId: e.target.value ? Number(e.target.value) : null, obyektIds: [] })}>
              <option value="">{t('Hammasi')}</option>
              {(variantlar?.shartnomalar ?? []).map((s) => <option key={s.id} value={s.id}>{`№${s.raqam ?? s.id}`}</option>)}
            </select>
          </label>
          <label className="text-sm">{t('Oydan')} <input type="month" aria-label={t('Oydan')} value={filtr.oyDan ?? ''} onChange={(e) => { const o = oyOraligi(e.target.value || null, filtr.oyGacha); ozgar({ oyDan: o.dan, oyGacha: o.gacha }); }} /></label>
          <label className="text-sm">{t('Oygacha')} <input type="month" aria-label={t('Oygacha')} value={filtr.oyGacha ?? ''} onChange={(e) => { const o = oyOraligi(filtr.oyDan, e.target.value || null); ozgar({ oyDan: o.dan, oyGacha: o.gacha }); }} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-sm">{t('Obyekt')}:</b>
          {filtr.obyektIds.map((id) => <span key={id} className="text-sm" style={{ border: '1px solid currentColor', borderRadius: 999, padding: '1px 8px' }}>{obyektNomi(id)} <button type="button" aria-label={t('Olib tashlash')} onClick={() => ozgar({ obyektIds: filtr.obyektIds.filter((x) => x !== id) })}><X size={12} /></button></span>)}
          <span style={{ position: 'relative' }}>
            <input type="search" aria-label={t('Obyekt qidirish')} placeholder={t('Obyekt nomini yozing…')} value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} />
            {takliflar.length > 0 && <ul role="listbox" className="fz-card" style={{ position: 'absolute', zIndex: 5, minWidth: 220 }}>
              {takliflar.map((o) => <li key={o.id}><button type="button" role="option" aria-selected={false} className="text-sm" onClick={() => { ozgar({ obyektIds: [...filtr.obyektIds, o.id] }); setQidiruv(''); }}>{o.nom}</button></li>)}
            </ul>}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2"><b className="text-sm">{t('Hujjat turi')}:</b>
          {FILTR_TURLARI.map((x) => <Chip key={x} yoqilgan={filtr.turlar.includes(x)} onClick={() => ozgar({ turlar: ozgartir(filtr.turlar, x) })}>{TUR_NOMI[x] ?? x}</Chip>)}
        </div>
        <div className="flex flex-wrap items-center gap-2"><b className="text-sm">{t('Holat')}:</b>
          {FILTR_HOLATLARI.map((x) => <Chip key={x} yoqilgan={filtr.holatlar.includes(x)} onClick={() => ozgar({ holatlar: ozgartir(filtr.holatlar, x) })}>{t(HOLAT_NOMI[x] ?? x)}</Chip>)}
          {!filtrBosh(filtr) && <button type="button" className="text-sm underline" onClick={() => setFiltr(BOSH_FILTR)}>{t('Filtrni tozalash')}</button>}
        </div>
        <div className="flex flex-wrap items-center gap-2" data-testid="paket-saqlangan">
          <b className="text-sm">{t('Saqlangan filtrlar')}:</b>
          {saqlangan.map((s) => (
            <span key={s.id} className="text-sm" style={{ border: '1px solid currentColor', borderRadius: 999, padding: '1px 8px' }}>
              <button type="button" onClick={() => setFiltr(filtrniTozala(s.filtr))}>{s.nom}</button>{' '}
              <button type="button" aria-label={`${t('O‘chirish')}: ${s.nom}`} onClick={() => void filtrOchir(p.kompaniyaId, s.id).then(async () => setSaqlangan(await filtrlarOl(p.kompaniyaId)))}><Trash2 size={12} /></button>
            </span>
          ))}
          <input aria-label={t('Filtr nomi')} placeholder={t('Masalan: Texnadzor to‘plami')} value={filtrNomi} onChange={(e) => setFiltrNomi(e.target.value)} maxLength={60} />
          <button type="button" className="fz-btn" disabled={filtrBosh(filtr) || !filtrNomi.trim()} onClick={() => void filtrniSaqla()}><Save size={14} /> {t('Saqlash')}</button>
        </div>
      </div>

      {xato && <p role="alert" className="text-sm text-red-600">{xato}</p>}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span data-testid="paket-jami">{yuklanmoqda ? t('Yuklanmoqda…') : t('Topildi: {n}', { n: jami })}</span>
        <button type="button" className="underline" disabled={!barcha.length} onClick={() => setTanlov(new Set(barcha))}>{t('Hammasini tanlash')}</button>
        <button type="button" className="underline" disabled={!tanlov.size} onClick={() => setTanlov(new Set())}>{t('Tanlovni bekor qilish')}</button>
      </div>
      {!yuklanmoqda && !xato && !qatorlar.length && <p className="text-sm">{t('Hujjat topilmadi.')}</p>}
      <ul data-testid="paket-royxat" style={{ maxHeight: 420, overflow: 'auto' }}>
        {qatorlar.map((n) => (
          <li key={n.kalit} className="flex flex-wrap items-center gap-2 py-0.5 text-sm" style={n.takror ? { opacity: 0.5 } : undefined}>
            <input type="checkbox" aria-label={`paket:${n.sarlavha}`} disabled={n.takror || n.taxminiy} checked={tanlov.has(n.kalit)} onChange={() => setTanlov((s) => { const y = new Set(s); if (y.has(n.kalit)) y.delete(n.kalit); else y.add(n.kalit); return y; })} />
            <span>{n.obyekt_nom ?? '—'}</span><span>·</span><span>{n.sarlavha}</span><span>·</span><span>{n.oy ?? '—'}</span><span>·</span>
            <span>{t(HOLAT_NOMI[n.holat] ?? n.holat)}{n.takror ? ` (${t('oyga ikkinchi F-2')})` : ''}</span><span>·</span>
            <span className="opacity-80">{yangilikMatni(n)}</span>
            {n.yangilanmoqda && <span role="status" className="text-xs" style={{ border: '1px solid currentColor', borderRadius: 999, padding: '0 6px' }}>{t('yangilanmoqda')}</span>}
          </li>
        ))}
      </ul>
      {qatorlar.length < jami && <button type="button" className="fz-btn" onClick={() => void yana()}>{t('Yana {n} ta', { n: Math.min(SAHIFA_HAJMI, jami - qatorlar.length) })}</button>}

      {holatlar.length > 0 && (
        <div className="text-sm my-2" data-testid="paket-holat" role="status">
          <b>{t('Paket holati (obyektlar bo‘yicha)')}</b>
          <ul>
            {obyektHolatlari(holatlar).map((o) => (
              <li key={o.obyekt_id ?? 0}>
                {o.obyekt_nom}: {t('{n} ta tayyor', { n: o.tayyor })}
                {o.yangilandi > 0 ? `, ${t('{n} ta hozir yangilandi', { n: o.yangilandi })}` : ''}
                {o.eskirgan > 0 ? `, ${t('{n} ta eski versiya (fonda yangilanmoqda)', { n: o.eskirgan })}` : ''}
                {o.xato > 0 ? <span className="text-red-600">{`, ${t('{n} ta kirmadi', { n: o.xato })}`}</span> : null}
                {o.xatolar.length > 0 && <ul className="text-red-600">{o.xatolar.map((x) => <li key={x}>{x}</li>)}</ul>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-3 mt-2">
        <select aria-label={t('Chiqish')} value={format} onChange={(e) => setFormat(e.target.value as 'zip' | 'excel')}>
          <option value="zip">{t('ZIP (papkalar)')}</option><option value="excel">{t('Bitta Excel')}</option>
        </select>
        <span className="text-sm" data-testid="paket-token">
          {baho.token == null ? t('Token: narx hisoblanmoqda') : baho.token === 0 ? t('Bepul (to‘langan)') : t('Token: ≈ {n} ({k} ta yangi hujjat)', { n: baho.token, k: baho.tolanadigan })}
          {yuklanmagan > 0 ? ` · ${t('+{n} ta ro‘yxatda ko‘rinmagan (yuklashda aniqlanadi)', { n: yuklanmagan })}` : ''}
        </span>
        <button type="button" className="fz-btn fz-btn--primary" disabled={!!jarayon || !tanlov.size} onClick={() => void yuklabOl()}>
          <Download size={14} /> {jarayon ? t('Yig‘ilmoqda {j}', { j: jarayon }) : `${t('Yuklab olish')} (${tanlov.size}) — ${format === 'zip' ? 'ZIP' : 'Excel'}`}
        </button>
      </footer>
    </section>
  );
}
