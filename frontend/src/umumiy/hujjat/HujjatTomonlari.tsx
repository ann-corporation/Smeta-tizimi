/**
 * HujjatTomonlari — PTO hujjatlari imzo blokidagi tomonlar nomi (H3).
 *
 * Egasi (2026-10-26): imzochilar OBYEKT bo'yicha va har tomon o'zinikini o'zi tayinlaydi
 * (buyurtmachi — o'z odamlarini, pudratchi — o'zinikini). `useHujjatTomonlari(kompaniyaId, obyektId)`:
 *  - obyekt berilsa: tayinlangan imzochi (razdel → obyekt → loyiha merosi; razdelId ixtiyoriy) > shartnoma tomoni > bo'sh; `saqla` faqat chaqiruvchi
 *    yoza oladigan rollarni saqlaydi; uchinchi qiymat — panel uchun tafsilot.
 *  - obyekt yo'q (null): eski kompaniya darajasidagi sukut (endi asosan tuzuvchi/tekshiruvchi uchun).
 * tuzuvchi/tekshiruvchi hujjat tayyorlovchining o'z odamlari — har doim kompaniya sukutidan.
 * Bo'sh qoldirilsa hujjatda to'ldirish chizig'i chiqadi — nom hech qachon o'ylab topilmaydi.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { kompaniyaSozlamaOl, kompaniyaSozlamaYoz } from '../../api/kompaniya-sozlama';
import { imzochiTarixOl, obyektImzochiSaqla, obyektImzochilarOl, type ImzochiDaraja, type ImzochiMaydonlar, type ImzochiRol, type ImzochiTarixQator, type ObyektImzochi, type ObyektImzochilar } from '../../api/obyekt-imzochi';
import { shartnomaLiniyaOl, type Liniya } from '../../api/t2-shartnoma-liniya';
import { IMZO_TOMONLARI, obyektImzoNomlari, shartnomaImzoNomlari } from '../../lib/obyekt-imzochi';
import type { ImzoNomlar } from '../../lib/hujjat-yozuvchi';
import { t } from '../../i18n/til';
import './hujjat-korinish.css';

const kalit = (kompaniyaId: number | null | undefined) => `hujjat-tomonlari:${kompaniyaId ?? 'umumiy'}`;

function oqi(kompaniyaId: number | null | undefined): ImzoNomlar {
  try {
    const x = JSON.parse(globalThis.localStorage?.getItem(kalit(kompaniyaId)) || '{}');
    return x && typeof x === 'object' ? x as ImzoNomlar : {};
  } catch { return {}; }
}

const bosh = (x: ImzoNomlar) => !Object.values(x).some((v) => typeof v === 'string' && v.trim());
const SAQLASH_KECHIKISH = 800;

/**
 * Kompaniya darajasidagi sukut. Server-backed (kompaniya sozlamasi `hujjat.imzo_tomonlari`), lekin AVVAL localStorage (tezkor, oflayn-xavfsiz).
 * Server qiymati kelsa — o'sha ustun; serverda yo'q, mahalliy bor va yozish mumkin bo'lsa — bir marta yuklanadi.
 * API 404/403/tarmoq xatosi — jim, mahalliy rejimda qoladi. Oddiy fetch (QueryClient shart emas).
 */
function useKompaniyaImzoSukut(kompaniyaId: number | null | undefined): [ImzoNomlar, (next: ImzoNomlar) => void] {
  const [nomlar, setNomlar] = useState<ImzoNomlar>(() => oqi(kompaniyaId));
  const yozishRef = useRef(false);
  const taymer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kutilgan = useRef<ImzoNomlar | null>(null);

  const serverga = useCallback((kid: number, qiymat: ImzoNomlar) => {
    void kompaniyaSozlamaYoz({ kompaniya_id: kid, kalit: 'hujjat.imzo_tomonlari', qiymat: bosh(qiymat) ? null : { ...qiymat } }).catch(() => { /* jim — mahalliy saqlangan */ });
  }, []);

  useEffect(() => {
    setNomlar(oqi(kompaniyaId));
    yozishRef.current = false;
    kutilgan.current = null;
    if (kompaniyaId == null) return;
    let bekor = false;
    kompaniyaSozlamaOl(kompaniyaId).then((s) => {
      if (bekor) return;
      yozishRef.current = s.yozish_mumkin;
      const sv = s.sozlamalar['hujjat.imzo_tomonlari']?.qiymat;
      if (sv && typeof sv === 'object') {
        if (kutilgan.current) return; // foydalanuvchi allaqachon tahrirlayapti
        const x = sv as ImzoNomlar;
        setNomlar(x);
        try { globalThis.localStorage?.setItem(kalit(kompaniyaId), JSON.stringify(x)); } catch { /* xotira yopiq */ }
      } else if (s.yozish_mumkin) {
        const lokal = oqi(kompaniyaId);
        if (!bosh(lokal)) serverga(kompaniyaId, lokal);
      }
    }).catch(() => { /* jim — mahalliy rejim */ });
    return () => { bekor = true; };
  }, [kompaniyaId, serverga]);

  useEffect(() => () => {
    if (taymer.current) clearTimeout(taymer.current);
  }, []);

  const saqla = useCallback((next: ImzoNomlar) => {
    setNomlar(next);
    try { globalThis.localStorage?.setItem(kalit(kompaniyaId), JSON.stringify(next)); } catch { /* xotira yopiq — faqat shu sessiya */ }
    if (kompaniyaId == null) return;
    kutilgan.current = next;
    if (taymer.current) clearTimeout(taymer.current);
    taymer.current = setTimeout(() => {
      taymer.current = null;
      const q = kutilgan.current;
      kutilgan.current = null;
      if (q && yozishRef.current) serverga(kompaniyaId, q);
    }, SAQLASH_KECHIKISH);
  }, [kompaniyaId, serverga]);
  return [nomlar, saqla];
}

export type ImzoSaqlashNatija = { ok: true } | { ok: false; code: string };
/** Obyekt rejimi tafsiloti (panel uchun). */
export type ImzoTafsilot = {
  yuklanmoqda: boolean;
  /** Server kodi/xato matni; null — yaxshi. Xato bo'lsa hech bir tomon tahrirlanmaydi. */
  xato: string | null;
  mening_tomonim: ImzochiRol | null;
  egasi: boolean;
  /** Obyekt loyihaga bog'langanmi (aks holda «butun loyiha» darajasi yo'q). */
  loyihaBor: boolean;
  /** Hujjat razdel kontekstiga egami (aks holda «faqat shu razdel» darajasi yo'q). */
  razdelId: number | null;
  imzochilar: ObyektImzochi[];
  /** Kompaniya oldin kiritgan nomlar, eng yangisi birinchi. */
  tarix: ImzochiTarixQator[];
  saqlaRol: (rol: ImzochiRol, daraja: ImzochiDaraja, m: ImzochiMaydonlar) => Promise<ImzoSaqlashNatija>;
};

export function useHujjatTomonlari(kompaniyaId: number | null | undefined, obyektId?: number | null, razdelId?: number | null): [ImzoNomlar, (next: ImzoNomlar) => void, ImzoTafsilot | null] {
  const [sukut, sukutSaqla] = useKompaniyaImzoSukut(kompaniyaId);
  const obyektRejim = kompaniyaId != null && obyektId != null && obyektId > 0;
  const razdel = obyektRejim && razdelId != null && razdelId > 0 ? razdelId : null;
  const [server, setServer] = useState<{ kalit: string; data: ObyektImzochilar | null; xato: string | null; liniya: Liniya | null; tarix: ImzochiTarixQator[] } | null>(null);
  const kalitJoriy = obyektRejim ? `${kompaniyaId}:${obyektId}:${razdel ?? ''}` : null;

  const yukla = useCallback(async (kid: number, oid: number, rid: number | null, birinchi: boolean) => {
    const [r, l, tarix] = await Promise.all([
      obyektImzochilarOl(kid, oid, rid),
      birinchi ? shartnomaLiniyaOl(kid).catch(() => null) : Promise.resolve(null),
      imzochiTarixOl(kid).catch(() => [] as ImzochiTarixQator[]),
    ]);
    return { r, l, tarix };
  }, []);

  useEffect(() => {
    if (!obyektRejim) return;
    let bekor = false;
    const kalit = `${kompaniyaId}:${obyektId}:${razdel ?? ''}`;
    void yukla(kompaniyaId as number, obyektId as number, razdel, true).then(({ r, l, tarix }) => {
      if (bekor) return;
      setServer({ kalit, data: r.ok ? r.natija : null, xato: r.ok ? null : (r.code ?? r.error), liniya: l?.ok ? l.natija : null, tarix });
    }).catch(() => { if (!bekor) setServer({ kalit, data: null, xato: 'TARMOQ', liniya: null, tarix: [] }); });
    return () => { bekor = true; };
  }, [obyektRejim, kompaniyaId, obyektId, razdel, yukla]);

  const joriy = server && server.kalit === kalitJoriy ? server : null;

  const nomlar = useMemo<ImzoNomlar>(() => {
    if (!obyektRejim) return sukut;
    return obyektImzoNomlari({ imzochilar: joriy?.data?.imzochilar, shartnoma: shartnomaImzoNomlari(joriy?.liniya, obyektId as number), kompaniya: sukut });
  }, [obyektRejim, sukut, joriy, obyektId]);

  const saqlaRol = useCallback(async (rol: ImzochiRol, daraja: ImzochiDaraja, m: ImzochiMaydonlar): Promise<ImzoSaqlashNatija> => {
    if (kompaniyaId == null || obyektId == null) return { ok: false, code: 'OBYEKT_YOQ' };
    const r = await obyektImzochiSaqla(kompaniyaId, obyektId, rol, daraja, razdel, m);
    if (!r.ok) return { ok: false, code: r.code ?? r.error };
    const yangi = await yukla(kompaniyaId, obyektId, razdel, false);
    setServer((eski) => ({ kalit: `${kompaniyaId}:${obyektId}:${razdel ?? ''}`, liniya: eski?.liniya ?? null, data: yangi.r.ok ? yangi.r.natija : eski?.data ?? null, xato: yangi.r.ok ? null : (yangi.r.code ?? yangi.r.error), tarix: yangi.tarix.length ? yangi.tarix : eski?.tarix ?? [] }));
    return { ok: true };
  }, [kompaniyaId, obyektId, razdel, yukla]);

  const saqla = useCallback((next: ImzoNomlar) => {
    if (!obyektRejim) { sukutSaqla(next); return; }
    // tuzuvchi/tekshiruvchi — kompaniya sukuti (eski tomon kalitlari endi saqlanmaydi).
    if ((next.tuzuvchi ?? '') !== (nomlar.tuzuvchi ?? '') || (next.tekshiruvchi ?? '') !== (nomlar.tekshiruvchi ?? '')) {
      sukutSaqla({ ...(next.tuzuvchi ? { tuzuvchi: next.tuzuvchi } : {}), ...(next.tekshiruvchi ? { tekshiruvchi: next.tekshiruvchi } : {}) });
    }
    // Tomonlar: faqat chaqiruvchi yoza oladigan va o'zgargan rollar; aniq «obyekt» darajasiga (hech qachon loyihaga siljimaydi).
    for (const k of IMZO_TOMONLARI) {
      if ((next[k] ?? '') === (nomlar[k] ?? '')) continue;
      if (joriy?.data?.imzochilar.find((x) => x.rol === k)?.yozish.obyekt !== true) continue;
      void saqlaRol(k, 'obyekt', { tashkilot: next[k] ?? '' });
    }
  }, [obyektRejim, sukutSaqla, nomlar, joriy, saqlaRol]);

  const tafsilot = useMemo<ImzoTafsilot | null>(() => (!obyektRejim ? null : {
    yuklanmoqda: joriy == null,
    xato: joriy?.xato ?? null,
    mening_tomonim: joriy?.data?.mening_tomonim ?? null,
    egasi: joriy?.data?.egasi ?? false,
    loyihaBor: joriy?.data?.loyiha_id != null,
    razdelId: joriy?.data?.razdel_id ?? null,
    imzochilar: joriy?.data?.imzochilar ?? [],
    tarix: joriy?.tarix ?? [],
    saqlaRol,
  }), [obyektRejim, joriy, saqlaRol]);

  return [nomlar, saqla, tafsilot];
}

export const MAYDONLAR: Array<{ k: keyof ImzoNomlar; rol: string; ru: string; izoh?: string }> = [
  { k: 'zakazchik', rol: 'Buyurtmachi', ru: 'ЗАКАЗЧИК' },
  { k: 'pudratchi', rol: 'Pudratchi', ru: 'ПОДРЯДЧИК' },
  { k: 'subpudratchi', rol: 'Subpudratchi', ru: 'СУБПОДРЯДЧИК', izoh: '3 tomonlama bo‘lsa' },
  { k: 'texnadzor', rol: 'Texnik nazorat', ru: 'ТЕХНАДЗОР' },
  { k: 'tuzuvchi', rol: 'Tuzuvchi', ru: 'СОСТАВИЛ' },
];

function saqlashXatosi(code: string): string {
  if (code === 'NOT_YOUR_SIDE') return t('Bu tomonni faqat shu tomonning o‘zi tayinlay oladi.');
  if (code === 'ROL_BAND') return t('Bu rolni boshqa kompaniya allaqachon tayinlagan.');
  if (code === 'RAZDEL_TOPILMADI' || code === 'LOYIHA_YOQ') return t('Tanlangan daraja mavjud emas.');
  if (code === 'AZO_EMAS' || code === 'ROL_YETARLI_EMAS') return t('Bu amal uchun ruxsatingiz yo‘q.');
  return t('Saqlab bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.');
}

const DARAJA_NOM: Record<ImzochiDaraja, string> = { razdel: 'Faqat shu razdel', obyekt: 'Faqat shu obyekt', loyiha: 'Butun loyiha' };
const DARAJA_QISQA: Record<ImzochiDaraja, string> = { razdel: 'shu razdel', obyekt: 'shu obyekt', loyiha: 'butun loyiha' };

/**
 * Obyekt rejimi: bitta tomon bloki. O'z tomoni (yoki egasi uchun bo'sh tomon) — tahrirlanadi, DARAJANI foydalanuvchi tanlaydi
 * (faqat shu razdel / shu obyekt / butun loyiha) — bir daraja to'ldirilsa boshqasiga siljimaydi. Qolgan tomonlar — faqat o'qish.
 */
function TomonBlok({ m, qator, tafsilot, zaxira }: { m: (typeof MAYDONLAR)[number]; qator: ObyektImzochi | undefined; tafsilot: ImzoTafsilot; zaxira: string }) {
  const rol = m.k as ImzochiRol;
  const darajalar = (['razdel', 'obyekt', 'loyiha'] as ImzochiDaraja[]).filter((d) => (d === 'razdel' ? tafsilot.razdelId != null : d === 'loyiha' ? tafsilot.loyihaBor : true) && qator?.yozish[d] === true);
  const eff = qator?.effektiv ?? null;
  const [daraja, setDaraja] = useState<ImzochiDaraja>(() => (eff && darajalar.includes(eff.daraja) ? eff.daraja : 'obyekt'));
  const tanlangan = darajalar.includes(daraja) ? daraja : darajalar[0];
  const yozuv = tanlangan ? qator?.qatlamlar[tanlangan] ?? null : null;
  const [tashkilot, setTashkilot] = useState(yozuv?.tashkilot ?? '');
  const [lavozim, setLavozim] = useState(yozuv?.lavozim ?? '');
  const [fio, setFio] = useState(yozuv?.fio ?? '');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [saqlandi, setSaqlandi] = useState(false);
  useEffect(() => {
    setTashkilot(yozuv?.tashkilot ?? ''); setLavozim(yozuv?.lavozim ?? ''); setFio(yozuv?.fio ?? '');
  }, [tanlangan, yozuv?.tashkilot, yozuv?.lavozim, yozuv?.fio, yozuv?.yangilangan_at]);

  const yozish = !tafsilot.xato && tanlangan != null;
  const mening = tafsilot.mening_tomonim === rol;
  const matn = [eff?.tashkilot, eff?.lavozim, eff?.fio].map((x) => (x ?? '').trim()).filter(Boolean).join(', ');
  const ozgargan = tashkilot !== (yozuv?.tashkilot ?? '') || lavozim !== (yozuv?.lavozim ?? '') || fio !== (yozuv?.fio ?? '');
  const yorliq = (x: string) => `${t(m.rol)} (${m.ru}) — ${x}`;
  const takliflar = tafsilot.tarix.filter((x) => x.rol === rol);

  const yoz = async () => {
    if (!tanlangan) return;
    setBand(true); setXato(null); setSaqlandi(false);
    const r = await tafsilot.saqlaRol(rol, tanlangan, { tashkilot, lavozim, fio });
    setBand(false);
    if (r.ok) setSaqlandi(true); else setXato(saqlashXatosi(r.code));
  };
  const taklifTanla = (i: string) => {
    const x = takliflar[Number(i)];
    if (!x) return;
    setTashkilot(x.tashkilot ?? ''); setLavozim(x.lavozim ?? ''); setFio(x.fio ?? ''); setSaqlandi(false);
  };

  let chip: { sinf: string; matn: string } | null = null;
  if (eff?.manba === 'kiritilgan') chip = { sinf: 'fz-chip--warn', matn: tafsilot.egasi ? t('siz kiritgansiz — tasdiqlanmagan') : t('tasdiqlanmagan') };
  else if (eff?.manba === 'ozi') chip = { sinf: 'fz-chip--accent', matn: mening ? t('sizning tomoningiz') : t('o‘zi tayinlagan') };
  else if (mening) chip = { sinf: '', matn: t('sizning tomoningiz') };

  return (
    <div className={`ht-blok ${matn || zaxira ? 'ht-blok--bor' : ''}`} role="group" aria-label={`${t(m.rol)} (${m.ru})`}>
      <span className="ht-blok__rol"><b>{t(m.rol)}</b><i>{m.ru}</i>{chip && <span className={`fz-chip ${chip.sinf}`}>{chip.matn}</span>}</span>
      {m.izoh && <span className="ht-blok__izoh">{t(m.izoh)}</span>}
      {eff && <span className="ht-blok__izoh" data-testid={`daraja-${m.k}`}>{t('Belgilangan daraja')}: {t(DARAJA_QISQA[eff.daraja])}</span>}
      {yozish ? (
        <>
          <label className="ht-blok__izoh" htmlFor={`ht-daraja-${m.k}`}>{t('Qaysi darajaga saqlanadi')}</label>
          <select id={`ht-daraja-${m.k}`} className="ht-blok__input" value={tanlangan} onChange={(e) => { setDaraja(e.target.value as ImzochiDaraja); setSaqlandi(false); setXato(null); }}>
            {darajalar.map((d) => <option key={d} value={d}>{t(DARAJA_NOM[d])}</option>)}
          </select>
          {takliflar.length > 0 && (
            <select aria-label={yorliq(t('Oldin kiritilganlar'))} className="ht-blok__input" value="" onChange={(e) => taklifTanla(e.target.value)}>
              <option value="">{t('Oldin kiritilganlardan tanlash…')}</option>
              {takliflar.slice(0, 20).map((x, i) => <option key={i} value={i}>{[x.tashkilot, x.lavozim, x.fio].filter(Boolean).join(', ')}</option>)}
            </select>
          )}
          <input aria-label={yorliq(t('Tashkilot'))} value={tashkilot} onChange={(e) => { setTashkilot(e.target.value); setSaqlandi(false); }} placeholder={t('Tashkilot')} className="ht-blok__input" maxLength={200} />
          <input aria-label={yorliq(t('Lavozim'))} value={lavozim} onChange={(e) => { setLavozim(e.target.value); setSaqlandi(false); }} placeholder={t('Lavozim')} className="ht-blok__input" maxLength={200} />
          <input aria-label={yorliq(t('F.I.O.'))} value={fio} onChange={(e) => { setFio(e.target.value); setSaqlandi(false); }} placeholder={t('F.I.O.')} className="ht-blok__input" maxLength={200} />
          <span className="flex items-center gap-2">
            <button type="button" className="fz-btn fz-btn--sm" disabled={!ozgargan || band} onClick={() => void yoz()}>{t('Saqlash')}</button>
            {saqlandi && <span role="status">{t('Saqlandi')}</span>}
          </span>
          {!matn && zaxira && <span className="ht-blok__izoh">{t('Shartnomadan: {nom}', { nom: zaxira })}</span>}
          {ozgargan && !(yozuv?.tashkilot || yozuv?.lavozim || yozuv?.fio) && <span className="ht-blok__izoh">{t('Bo‘sh saqlansa — shu daraja tozalanadi, yuqori daraja qiymati qaytadi.')}</span>}
        </>
      ) : (
        <span className="ht-blok__matn" data-testid={`imzo-${m.k}`}>{matn || zaxira || ''}</span>
      )}
      {xato && <span role="alert" className="ht-blok__xato">{xato}</span>}
      {!yozish && !matn && !zaxira && <span className="ht-blok__chiziq" aria-hidden="true">{t('hujjatda chiziq bo‘ladi')}</span>}
    </div>
  );
}

/**
 * Yig'iladigan panel: hujjat imzo tomonlari — har tomon alohida blok (rol, hujjatdagi rus yozuvi, nom).
 * `tafsilot` berilsa (obyekt rejimi): har tomon o'z imzochisini o'zi tayinlaydi; boshqa tomonlar — faqat o'qish.
 */
export function HujjatTomonlariPanel({ qiymat, onChange, tafsilot }: { qiymat: ImzoNomlar; onChange: (next: ImzoNomlar) => void; tafsilot?: ImzoTafsilot | null }) {
  const tolgan = MAYDONLAR.filter((m) => (qiymat[m.k] ?? '').trim()).length;
  return (
    <details className="ht-panel">
      <summary className="ht-summary">
        <span className="ht-summary__h">{t('Hujjat imzolari')}</span>
        <span className={`fz-chip ${tolgan ? 'fz-chip--accent' : 'fz-chip--warn'}`}>{tolgan ? t('{a} / {b} tomon kiritilgan', { a: tolgan, b: MAYDONLAR.length }) : t('kiritilmagan (hujjatda chiziq)')}</span>
        {Boolean(qiymat.zakazchik || qiymat.pudratchi) && <span className="ht-summary__n">{[qiymat.zakazchik, qiymat.pudratchi].filter(Boolean).join(' / ')}</span>}
      </summary>
      {tafsilot && <p className="ht-hint">{t('Har tomon o‘z imzochisini o‘zi tayinlaydi.')}{tafsilot.yuklanmoqda ? ` ${t('Yuklanmoqda…')}` : ''}</p>}
      {tafsilot?.xato && <p className="ht-hint" role="alert">{t('Obyekt imzochilarini o‘qib bo‘lmadi — tomonlar tahrirlanmaydi.')}</p>}
      <div className="ht-grid">
        {MAYDONLAR.map((m) => {
          if (tafsilot && m.k !== 'tuzuvchi') {
            const qator = tafsilot.imzochilar.find((x) => x.rol === m.k);
            return <TomonBlok key={m.k} m={m} qator={qator} tafsilot={tafsilot} zaxira={qator?.effektiv ? '' : (qiymat[m.k] ?? '')} />;
          }
          const yorliq = `${t(m.rol)} (${m.ru})${m.izoh ? ` — ${t(m.izoh)}` : ''}`;
          const bor = (qiymat[m.k] ?? '').trim().length > 0;
          return (
            <label key={m.k} className={`ht-blok ${bor ? 'ht-blok--bor' : ''}`}>
              <span className="ht-blok__rol"><b>{t(m.rol)}</b><i>{m.ru}</i></span>
              {m.izoh && <span className="ht-blok__izoh">{t(m.izoh)}</span>}
              <input aria-label={yorliq} value={qiymat[m.k] ?? ''} onChange={(e) => onChange({ ...qiymat, [m.k]: e.target.value })}
                placeholder={t('tashkilot, lavozim, F.I.O.')} className="ht-blok__input" />
              <span className="ht-blok__chiziq" aria-hidden="true">{bor ? '' : t('hujjatda chiziq bo‘ladi')}</span>
            </label>
          );
        })}
      </div>
    </details>
  );
}
