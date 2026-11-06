import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Plus, Repeat2, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { yangiOperationId } from '../../api/supabase';
import { ishAbcSaqla, ishTuriQidir, narxTakliflari, resursQidir, type IshTuriVariant, type ResursVariant } from '../../api/t2-ish-abc';
import { Taklifli } from '../../admin/sahifalar/IshAbcModal';
import { abcHisobla, engYaxshiNarx, katAniqla, MANBA_NOMI, son, type AbcResurs } from '../../lib/ish-abc';
import type { AlmashtirishBelgilaFn } from '../../lib/fakt-studio';
import { useHotkeys } from '../../lib/hotkeys/useHotkeys';
import { sarlavhaBilan } from '../../lib/hotkeys/core';
import { KatNishon } from '../../umumiy/ui/KatNishon';
import {
  birlikFarqli, bosForma, INLINE_TAB, INLINE_TURLAR, inlineTekshir, inlineXato, inlineYuklama, normaQollanadi, zamenaRejim,
  type InlineForma, type InlineKontekst, type InlineQator, type InlineTur,
} from '../../lib/fakt-inline-amal';

const fmt = (v: number | null | undefined, d = 3) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: d }));

const TAB = INLINE_TAB;
const TARTIB = INLINE_TURLAR;

/** Zamena juftligi belgisi: asl qatorda «zamena →», zamena qatorida «← o'rniga». Bosilsa (Enter) — juftiga o'tadi. */
export function ZamenaJuftBelgi({ yonalish, juftId, juftNom, onOt }: { yonalish: 'zamena' | 'asl'; juftId: number; juftNom: string | null; onOt: (id: number) => void }) {
  const matn = yonalish === 'zamena' ? t('zamena →') : t('← o‘rniga');
  const izoh = yonalish === 'zamena'
    ? t('Bu qator boshqasi bilan almashtirilgan — zamena qatoriga o‘tish: {nom}', { nom: juftNom ?? '' })
    : t('Bu qator asl qator o‘rniga yozilgan — asl qatorga o‘tish: {nom}', { nom: juftNom ?? '' });
  return <button type="button" onClick={() => onOt(juftId)} title={izoh} aria-label={izoh}
    data-testid={yonalish === 'zamena' ? `juft-zamena-${juftId}` : `juft-asl-${juftId}`}
    className="fz-chip border border-[var(--info)]/40 bg-[var(--info-soft)] text-[var(--info)] hover:brightness-110 focus-visible:outline focus-visible:outline-[var(--info)]">{matn}</button>;
}

/**
 * Qator OSTIDA ochiladigan panel (oyna emas): «Boshqasi bilan almashtirildi (zamena)», «Qo'shimcha ish», «Qo'shimcha material».
 * Yozuv — mavjud `ish_abc_saqla_v1` (IshAbcModal bilan bir xil; yangi pul formulasi yo'q). Ctrl+Enter — saqlash, Esc — yopish.
 */
export function FaktInlineAmal({ kompaniyaId, obyektId, sana, qator, kontekst, tur, onTur, onYop, onSaqlandi, onKengaytirilgan, almashtirishBelgila }: {
  kompaniyaId: number; obyektId: number; sana: string;
  qator: InlineQator; kontekst: InlineKontekst;
  tur: InlineTur; onTur: (tur: InlineTur) => void;
  onYop: () => void;
  /** Saqlangach: xabar va yangi qator id (bo'lsa). */
  onSaqlandi: (xabar: string, yangiId: number | null) => unknown;
  /** «Kengaytirilgan oyna» — resurslar tarkibi, normativ katalog, AI qidiruv (mavjud IshAbcModal). */
  onKengaytirilgan: (tur: InlineTur) => void;
  /** Birlik farqli zamena: «aslning qancha hajmini almashtiradi» (mavjud zamena_almashtirish_belgila_v1). */
  almashtirishBelgila?: AlmashtirishBelgilaFn;
}) {
  const [forma, setForma] = useState<InlineForma>(() => bosForma(qator, tur));
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const [korsat, setKorsat] = useState(false);
  const opRef = useRef(yangiOperationId());
  const panelRef = useRef<HTMLDivElement | null>(null);
  const nomRef = useRef<HTMLInputElement | null>(null);
  const tabRef = useRef(new Map<InlineTur, HTMLButtonElement>());

  // Tab yoki qator almashsa — toza forma va yangi amal ID (takroriy saqlash faqat bir xil forma ichida xavfsiz).
  // Faqat qator id / tur bo'yicha (holat yangilanishi — masalan boshqa qator fakti saqlanishi — yozilayotgan formani o'chirmasin).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setForma(bosForma(qator, tur)); setXato(''); setKorsat(false); opRef.current = yangiOperationId(); }, [qator.id, tur]);
  useEffect(() => { nomRef.current?.focus(); }, [tur, qator.id]);

  const rejim = tur === 'zamena' ? zamenaRejim(qator) : tur === 'qoshimcha_material' ? 'resurs' : 'ish';
  const resursZamena = tur === 'zamena' && rejim === 'resurs';
  const nq = resursZamena && normaQollanadi(forma, kontekst);
  const xatolar = useMemo(() => inlineTekshir(tur, qator, forma, kontekst), [tur, qator, forma, kontekst]);
  const sostavHisob = useMemo(() => abcHisobla(forma.hajm, forma.sostav), [forma.hajm, forma.sostav]);
  const ishNarxli = rejim === 'ish';
  /** Ish uchun narx faqat tarkibdan (resurslar) — tarkib yo'q bo'lsa narxsiz saqlanadi (NULL, 0 emas). */
  const narxsiz = ishNarxli ? forma.sostav.length === 0 || sostavHisob.narxsiz > 0 : son(forma.narx) == null;
  const almKerak = tur === 'zamena' && !!almashtirishBelgila && birlikFarqli(qator, forma);
  const ozgar = (p: Partial<InlineForma>) => setForma((o) => ({ ...o, ...p }));

  const ishQ = useMemo(() => (q: string) => ishTuriQidir(obyektId, q), [obyektId]);
  const resQ = useMemo(() => (q: string) => resursQidir(obyektId, q, forma.kat), [obyektId, forma.kat]);

  const ishTanla = (v: IshTuriVariant) => {
    const sostav: AbcResurs[] = v.sostav.map((c) => ({
      kat: katAniqla(c.kat, c.tur, c.birlik), kod: c.kod ?? '', nom: c.nom, birlik: c.birlik ?? '', hajm: '',
      norma: c.norma != null && c.norma > 0 ? String(c.norma) : '', narx: c.narx != null ? String(c.narx) : '', manba: c.narx != null ? 'smeta' : 'qolda',
    }));
    ozgar({ kod: v.kod ?? '', nom: v.nom, birlik: v.birlik ?? forma.birlik, sostav });
    const bosh = sostav.map((r, i) => (r.narx.trim() ? -1 : i)).filter((i) => i >= 0);
    if (bosh.length) void narxTakliflari(obyektId, bosh.map((i) => ({ nom: sostav[i].nom, birlik: sostav[i].birlik }))).then((vv) => {
      setForma((o) => (o.sostav !== sostav ? o : { ...o, sostav: o.sostav.map((r, i) => {
        const k = bosh.indexOf(i); const eng = k >= 0 ? engYaxshiNarx(vv[k] ?? []) : null;
        return eng ? { ...r, narx: String(eng.narx), manba: eng.manba } : r;
      }) }));
    }).catch(() => undefined);
  };
  const resursTanla = (v: ResursVariant) => {
    ozgar({ kod: v.kod ?? '', nom: v.nom, birlik: v.birlik ?? forma.birlik, kat: v.kat ? katAniqla(v.kat) : forma.kat,
      ...(v.narx != null ? { narx: String(v.narx), manba: v.narx_manba } : {}) });
    if (v.narx == null) void narxTakliflari(obyektId, [{ nom: v.nom, birlik: v.birlik ?? '' }]).then((vv) => {
      const eng = engYaxshiNarx(vv[0] ?? []);
      if (eng) setForma((o) => (o.nom === v.nom && !o.narx.trim() ? { ...o, narx: String(eng.narx), manba: eng.manba } : o));
    }).catch(() => undefined);
  };

  const saqla = async () => {
    if (band) return;
    if (xatolar.length) { setKorsat(true); return; }
    setBand(true); setXato('');
    try {
      const yuk = inlineYuklama({ kompaniyaId, obyektId, sana, operationId: opRef.current, tur, q: qator, f: forma, k: kontekst });
      const r = await ishAbcSaqla(yuk).catch(() => null);
      if (!r?.ok) { setXato(inlineXato(r)); return; }
      const id = Number((r as { qator_id?: unknown }).qator_id);
      const yangiId = Number.isSafeInteger(id) ? id : null;
      let qosh = '';
      const alm = almKerak ? son(forma.almHajm) : null;
      if (alm != null && alm > 0 && almashtirishBelgila && yangiId != null) {
        const m = await almashtirishBelgila(yangiId, alm).catch(() => null);
        qosh = m?.ok ? ` ${t('Almashtirilgan hajm: {n} {birlik}.', { n: String(alm), birlik: qator.birlik ?? '' })}` : ` ${t('Almashtirilgan hajm yozilmadi — keyin belgilang.')}`;
      }
      const asos = tur === 'zamena' ? t('Zamena saqlandi: «{nom}» → «{yangi}».', { nom: qator.nom, yangi: forma.nom.trim() })
        : tur === 'qoshimcha_ish' ? t('Qo‘shimcha ish saqlandi: «{nom}».', { nom: forma.nom.trim() })
        : t('Qo‘shimcha material saqlandi: «{nom}».', { nom: forma.nom.trim() });
      await onSaqlandi(`${asos}${narxsiz ? ` ${t('Narxsiz — summa keyin narxlanganda chiqadi.')}` : ''}${qosh}`, yangiId);
    } finally { setBand(false); }
  };

  const ichida = (e: KeyboardEvent | globalThis.KeyboardEvent) => !!panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target);
  // Panel ochiq paytida: Esc — yopish, Ctrl+Enter — saqlash (faqat fokus panel ichida; taklif ro'yxati ochiq bo'lsa Esc uni yopadi).
  useHotkeys('fakt-inline-panel', t('Qator ostidagi panel'), [
    { id: 'fakt.inline.saqla', keys: 'ctrl+enter', nom: t('Saqlash'), inInput: true, run: (e) => { if (!ichida(e)) return false; void saqla(); } },
    { id: 'fakt.inline.yop', keys: 'esc', nom: t('Yopish'), inInput: true, run: (e) => {
      if (!ichida(e)) return false;
      if (panelRef.current?.querySelector('[role="listbox"]')) return; // Taklifli o'zi yopadi
      onYop();
    } },
  ]);

  const tabKlav = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = TARTIB[(i + (e.key === 'ArrowRight' ? 1 : TARTIB.length - 1)) % TARTIB.length];
    onTur(n); tabRef.current.get(n)?.focus();
  };

  const inp = 'h-8 w-full rounded-[var(--radius-sm)] border border-border-strong bg-bg px-2 text-[12.5px] text-text outline-none focus:border-accent';
  const num = `${inp} text-right font-mono tabular-nums`;
  const lab = 'flex flex-col gap-1 text-[11.5px] font-medium text-text-dim';
  const natijaMatn = tur === 'zamena'
    ? t('Asl qator o‘zgarmaydi — «almashtirildi» deb belgilanadi, o‘rniga yangi qator fakti yoziladi.')
    : tur === 'qoshimcha_ish' ? t('Smetaga yangi ish qo‘shiladi (asl smeta o‘zgarmaydi) — «qo‘shimcha» belgisi bilan shu yerda ko‘rinadi.')
    : t('Yangi material qo‘shiladi (asl smeta o‘zgarmaydi) — «qo‘shimcha» belgisi bilan shu yerda ko‘rinadi.');
  const nomLabel = rejim === 'ish' ? t('Ish nomi yoki shifri (qidirish)') : t('Material / resurs nomi yoki shifri (qidirish)');

  return <div ref={panelRef} role="region" aria-label={t('Qator ostidagi amal: {nom}', { nom: qator.nom })} data-testid="fakt-inline-amal"
    className="mx-3 mb-2 mt-1 space-y-2 rounded-[var(--radius-md)] border border-accent/40 bg-surface-1 p-3 text-[12px]" style={{ boxShadow: 'var(--shadow-pop)' }}>
    <div className="flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label={t('Amal turi')} className="flex flex-wrap gap-1">
        {TARTIB.map((x, i) => <button key={x} ref={(el) => { if (el) tabRef.current.set(x, el); else tabRef.current.delete(x); }} type="button" role="tab" aria-selected={tur === x}
          tabIndex={tur === x ? 0 : -1} onClick={() => onTur(x)} onKeyDown={(e) => tabKlav(e, i)} data-testid={`inline-tab-${x}`}
          title={sarlavhaBilan(t(TAB[x].nom), [TAB[x].tugma, `alt+${TAB[x].tugma}`])}
          className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1 text-[12px] font-medium ${tur === x ? 'border-accent bg-accent/15 text-text' : 'border-border text-text-dim hover:bg-surface-3'}`}>
          {x === 'zamena' ? <Repeat2 size={13} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}{t(TAB[x].nom)}<kbd className="fz-kbd">{TAB[x].tugma.toUpperCase()}</kbd></button>)}
      </div>
      <button type="button" onClick={onYop} aria-label={t('Yopish')} title={sarlavhaBilan(t('Yopish'), 'esc')} className="ml-auto rounded p-1 text-text-mute hover:bg-surface-3"><X size={15} /></button>
    </div>

    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-2/60 px-2.5 py-1.5" data-testid="inline-asl">
      <span className="text-text-mute">{tur === 'zamena' ? t('Asl qator:') : t('Faol qator:')}</span>
      {qator.tur === 'bl' ? <span className="fz-kat bg-accent/15 text-[var(--accent-text)]">{t('ISH')}</span> : <KatNishon kat={qator.kat ?? katAniqla(null, qator.tur, qator.birlik)} />}
      {qator.kod && <span className="font-mono text-[11px] text-text-mute">{qator.kod}</span>}
      <b className="text-text">{qator.nom}</b>
      <span className="tabular-nums text-text-dim">{fmt(qator.smeta)} {qator.birlik ?? ''}</span>
    </div>
    <p className="text-[12px] text-text" data-testid="inline-natija-izoh">{natijaMatn}</p>

    {tur === 'zamena' && kontekst.zamenaYoq
      ? <p role="alert" className="rounded border border-warn/40 bg-warn/5 px-2.5 py-1.5 text-warn" data-testid="inline-zamena-yoq">{kontekst.zamenaYoq}</p>
      : <fieldset disabled={band} className="space-y-2">
        <div className="grid gap-2 md:grid-cols-[minmax(240px,2fr)_90px_110px_130px_110px]">
          <label className={lab}>{nomLabel}
            {rejim === 'ish'
              ? <Taklifli qiymat={forma.nom} onChange={(v) => ozgar({ nom: v, sostav: [] })} qidir={ishQ} tanla={ishTanla} ariaLabel={nomLabel} inputRef={(el) => { nomRef.current = el; }}
                  placeholder={t('kamida 3 harf — smeta va katalogdan')} className={inp}
                  render={(v: IshTuriVariant) => <div><div className="flex justify-between gap-3"><span className="font-medium text-text">{v.nom}</span><span className="shrink-0 text-text-mute">{v.birlik}</span></div>
                    <div className="mt-0.5 flex gap-3 text-[10px] text-text-mute"><span className="font-mono">{v.kod}</span><span>{t('{n} resurs', { n: String(v.sostav.length) })}</span></div></div>} />
              : <Taklifli qiymat={forma.nom} onChange={(v) => ozgar({ nom: v })} qidir={resQ} tanla={resursTanla} ariaLabel={nomLabel} inputRef={(el) => { nomRef.current = el; }}
                  placeholder={t('kamida 3 harf — smeta va katalogdan')} className={inp}
                  render={(v: ResursVariant) => <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-text">{v.nom}</div><div className="text-[10px] text-text-mute">{v.kat ?? '—'} · {v.birlik} {v.kod ? `· ${v.kod}` : ''}</div></div>
                    <div className="shrink-0 text-right font-mono text-text">{fmt(v.narx, 2)}</div></div>} />}
          </label>
          <label className={lab}>{t('Birlik')}<input value={forma.birlik} onChange={(e) => ozgar({ birlik: e.target.value })} aria-label={t('Birlik')} className={inp} /></label>
          {nq
            ? <label className={lab}>{t('Norma (ish birligiga)')}<input value={forma.norma} onChange={(e) => ozgar({ norma: e.target.value })} inputMode="decimal" aria-label={t('Norma')} className={num} />
                <span className="text-[10.5px] font-normal text-text-mute">{t('hajm = norma × ish hajmi ({h})', { h: fmt(kontekst.otaIshHajm) })}</span></label>
            : <label className={lab}>{t('Hajm')}<input value={forma.hajm} onChange={(e) => ozgar({ hajm: e.target.value })} inputMode="decimal" aria-label={t('Hajm')} className={num} /></label>}
          <label className={lab}>{ishNarxli ? t('Birlik narxi (tarkibdan)') : t('Birlik narxi (NDS siz)')}
            {ishNarxli
              ? <span className="flex h-8 items-center justify-end rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2 font-mono tabular-nums text-text-dim" data-testid="inline-ish-narx">{narxsiz ? t('narxsiz') : fmt(sostavHisob.ishNarxi, 2)}</span>
              : <input value={forma.narx} onChange={(e) => ozgar({ narx: e.target.value, manba: 'qolda' })} inputMode="decimal" placeholder={t('bo‘sh = narxsiz')} aria-label={t('Birlik narxi')} className={num} />}
            {!ishNarxli && son(forma.narx) != null && <span className="text-[10.5px] font-normal text-text-mute">{t('manba: {m}', { m: t(MANBA_NOMI[forma.manba]) })}</span>}
          </label>
          {!resursZamena && <label className={lab}>{t('Bugun bajarildi (fakt)')}<input value={forma.fakt} onChange={(e) => ozgar({ fakt: e.target.value })} inputMode="decimal" placeholder={t('ixtiyoriy')} aria-label={t('Bugun bajarildi (fakt)')} className={num} /></label>}
        </div>

        {almKerak && <label className={`${lab} max-w-md`}>{t('Asl qatorning qancha hajmini almashtiradi ({birlik}, ixtiyoriy)', { birlik: qator.birlik ?? '' })}
          <input value={forma.almHajm} onChange={(e) => ozgar({ almHajm: e.target.value })} inputMode="decimal" aria-label={t('Almashtiriladigan hajm')} className={num} /></label>}

        <div className="grid gap-2 md:grid-cols-[minmax(200px,1fr)_minmax(240px,2fr)]">
          {tur !== 'zamena' && <label className={lab}>{t('Qayerga qo‘shiladi')}
            <select value={kontekst.bolim ? forma.joy : 'tashqari'} onChange={(e) => ozgar({ joy: e.target.value as InlineForma['joy'] })} aria-label={t('Qayerga qo‘shiladi')} className={inp}>
              {kontekst.bolim && <option value="shu">{t('Shu bo‘lim: {nom}', { nom: kontekst.bolim.nom })}</option>}
              <option value="tashqari">{'«СМЕТАДАН ТАШҚАРИ ИШЛАР»'}</option>
            </select></label>}
          <label className={`${lab} ${tur === 'zamena' ? 'md:col-span-2' : ''}`}>{t('Sabab / izoh (majburiy)')}
            <input value={forma.izoh} onChange={(e) => ozgar({ izoh: e.target.value })} placeholder={t('masalan: loyihachi xati № …, buyurtmachi topshirig‘i')} aria-label={t('Sabab / izoh')} className={inp} /></label>
        </div>

        {ishNarxli && forma.sostav.length > 0 && <p className="text-[11px] text-text-mute" data-testid="inline-sostav">{t('Tarkib: {n} resurs, jami {s} so‘m (NDS siz).', { n: String(forma.sostav.length), s: fmt(sostavHisob.jami, 2) })}</p>}
        {narxsiz && <p className="text-[11px] text-warn" data-testid="inline-narxsiz">{ishNarxli
          ? t('Narx tarkibdan olinadi: ro‘yxatdan tanlansa — resurslari bilan narxlanadi; qo‘lda yozilsa narxsiz saqlanadi (keyin «Kengaytirilgan oyna»da narxlash mumkin).')
          : t('Narx kiritilmagan — narxsiz saqlanadi (0 emas); summa narxlanganda chiqadi.')}</p>}
      </fieldset>}

    {korsat && xatolar.length > 0 && <ul role="alert" className="list-disc rounded border border-warn/40 bg-warn/5 py-1.5 pl-6 pr-3 text-warn" data-testid="inline-xatolar">{xatolar.map((x) => <li key={x}>{x}</li>)}</ul>}
    {xato && <p role="alert" className="rounded border border-danger/40 bg-danger/5 px-2.5 py-1.5 text-danger" data-testid="inline-server-xato">{xato}</p>}

    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onKengaytirilgan(tur)} className="inline-flex items-center gap-1 text-[11.5px] text-[var(--accent-text)] underline-offset-2 hover:underline" data-testid="inline-kengaytirilgan"
        title={t('Resurslar tarkibi, normativ katalog va AI qidiruv bilan — eski oyna')}>{t('Kengaytirilgan oyna')} <ArrowRight size={12} aria-hidden="true" /></button>
      <div className="ml-auto flex items-center gap-2">
        <button type="button" onClick={onYop} disabled={band} className="fz-btn fz-btn--ghost"><ArrowLeft size={13} aria-hidden="true" />{t('Yopish')} <kbd className="fz-kbd">{'Esc'}</kbd></button>
        {!(tur === 'zamena' && kontekst.zamenaYoq) && <button type="button" onClick={() => void saqla()} disabled={band} className="fz-btn fz-btn--primary" data-testid="inline-saqla">
          {band ? t('Saqlanmoqda…') : t('Saqlash')} <kbd className="fz-kbd">{'Ctrl+Enter'}</kbd></button>}
      </div>
    </div>
  </div>;
}
