import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Coins, CreditCard, Crown, ReceiptText, ShieldCheck } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { yangiOperationId } from '../../api/supabase';
import { narxHisob, tokenHolatOl, tokenXato, tolovSorovYarat, type NarxTafsilot, type TokenHarakat, type TokenHolat } from '../../api/t2-token';
import { t, tilLocale } from '../../i18n/til';
import { balansOlchov, kunlikSarf, type KunSarf } from '../../lib/token-korinish';

const TUR_NOMI: Record<TokenHarakat['tur'], string> = { oylik: 'Obuna (oylik)', toldirish: 'Sotib olindi', bonus: 'Bonus', sarf: 'Sarf', qaytarish: 'Qaytarildi', tuzatish: 'Tuzatish' };
const HOLAT_NOMI: Record<string, string> = { kutilmoqda: 'Kutilmoqda', tasdiqlandi: 'Tasdiqlandi', rad: 'Rad etildi', bekor: 'Bekor qilindi' };
const son = (x: number | null | undefined) => (x == null ? '—' : Number(x).toLocaleString(tilLocale(), { maximumFractionDigits: 2 }));
const kirit = 'rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] text-text outline-none focus:border-accent';
/* Mijozga: narx qanday shakllanishi — tannarx/foyda tilga olinmaydi (egasi 2026-10-27). */
const QANDAY_HISOB_KALIT = 'Narx tizim hisoblagan kataklar soni boʻyicha. Har sarfning hisobi pastda koʻrinadi. Bir xil hujjatni qayta yuklash bepul; xato boʻlsa token qaytadi; maʼlumot kiritish bepul.';
const HOLAT_MUHR: Record<string, string> = { kutilmoqda: 'fz-stamp--warn', tasdiqlandi: 'fz-stamp--ok', rad: 'fz-stamp--danger', bekor: '' };

/** Oxirgi 30 kun: kunlik sarf ustunlari (firuza) va kirim belgisi (yashil). */
function SarfGrafik({ kunlar }: { kunlar: KunSarf[] }) {
  const max = Math.max(1, ...kunlar.map((k) => Math.max(k.sarf, k.kirim)));
  const jami = kunlar.reduce((s, k) => s + k.sarf, 0);
  return (
    <figure className="flex min-w-0 flex-col gap-2" aria-label={t('Oxirgi 30 kun sarfi')}>
      <figcaption className="flex items-baseline justify-between gap-2"><span className="fz-panel__h">{t('Oxirgi 30 kun sarfi')}</span><span className="text-[12px] text-text-mute">{t('jami {n} token', { n: son(jami) })}</span></figcaption>
      <div className="flex h-28 items-end gap-[3px] border-b border-border" role="img" aria-label={kunlar.filter((k) => k.sarf || k.kirim).map((k) => `${k.sana}: −${k.sarf} / +${k.kirim}`).join(', ') || t('Sarf yo‘q')}>
        {kunlar.map((k) => (
          <div key={k.sana} className="relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${k.sana} · ${t('sarf')} ${son(k.sarf)}${k.kirim ? ` · ${t('kirim')} +${son(k.kirim)}` : ''}`}>
            {k.kirim > 0 && <i className="absolute inset-x-0 mx-auto block h-1.5 w-1.5 rotate-45" style={{ bottom: `calc(${(k.kirim / max) * 100}% - 3px)`, background: 'var(--ok)' }} />}
            <i className="block w-full rounded-t-sm" style={{ height: `${(k.sarf / max) * 100}%`, minHeight: k.sarf ? 2 : 0, background: 'var(--accent)' }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] tabular-nums text-text-mute"><span>{kunlar[0]?.sana.slice(5)}</span><span>{kunlar[kunlar.length - 1]?.sana.slice(5)}</span></div>
      <div className="flex flex-wrap gap-3 text-[11.5px] text-text-mute">
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm" style={{ background: 'var(--accent)' }} />{t('sarf')}</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-1.5 w-1.5 rotate-45" style={{ background: 'var(--ok)' }} />{t('kirim (sotib olish, bonus, qaytarish)')}</span>
      </div>
    </figure>
  );
}

/** Sarf hisobining izohi: nima uchun, qancha birlik, yakuniy narx. Tannarx va foyda — faqat platforma superadminiga
 *  (egasi 2026-10-27; server ham ularni boshqalarga yubormaydi — functions/_shared/tizim-maxfiy.ts). */
function HisobIzoh({ h, meta, superadmin }: { h: NarxTafsilot; meta: TokenHarakat['meta']; superadmin: boolean }) {
  return (
    <div className="grid gap-x-6 gap-y-0.5 text-[12px] text-text-dim md:grid-cols-2">
      {meta?.sabab && <div className="md:col-span-2 text-text">{String(meta.sabab)}</div>}
      <div>{t('Amal')}: <b className="text-text">{t(h.nom)}</b></div>
      <div>{t('Hajm')}: <b className="text-text">{son(h.birlik_soni)}</b> {t('birlik')} ({son(h.qism)} × {son(h.birlik)})</div>
      {superadmin && <div>{t('Tannarx')}: {son(h.asos_som)} + {son(h.qism)} × {son(h.birlik_som)} = <b className="text-text">{son(h.tannarx_som)} {t('soʻm')}</b></div>}
      {superadmin && <div>{t('Foyda')}: {son(h.foyda_foiz)}% {h.min_som ? `· ${t('min')} ${son(h.min_som)}` : ''} {h.max_som ? `· ${t('max')} ${son(h.max_som)}` : ''}</div>}
      <div>{t('Yakuniy narx')}: <b className="text-text">{son(h.yakuniy_som)} {t('soʻm')}</b></div>
      <div>{t('Token')}: {son(h.yakuniy_som)} ÷ {son(h.token_som)} = <b className="text-text">{son(h.token)}</b></div>
    </div>
  );
}

/**
 * Tokenlar va obuna (egasi, 2026-10-02): balans, token sotib olish, amallar narxi, har sarfning "nima uchun" izohi.
 * Tannarx, foyda foizi va platforma ustamasi — faqat superadmin (egasi 2026-10-27). Superadmin amallari — Boshqaruv panelida.
 */
export function Tokenlar() {
  const { joriy } = useKompaniya();
  const kid = joriy?.id ?? null;
  const QANDAY_HISOB = t(QANDAY_HISOB_KALIT);
  const [h, setH] = useState<TokenHolat | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false);
  const yukla = useCallback(async () => {
    if (!kid) return;
    setYuk(true);
    const r = await tokenHolatOl(kid);
    setYuk(false);
    if (r.ok) { setH(r.natija); setXato(null); } else setXato(r.error);
  }, [kid]);
  useEffect(() => { void yukla(); }, [yukla]);

  const [paket, setPaket] = useState('');
  const [malumot, setMalumot] = useState('');
  const [band, setBand] = useState(false);
  const [ochiq, setOchiq] = useState<number | null>(null);
  const opId = useRef(yangiOperationId());
  useEffect(() => { if (h?.paketlar?.length && !paket) setPaket(h.paketlar[1]?.kod ?? h.paketlar[0].kod); }, [h, paket]);

  const kunlar = useMemo(() => kunlikSarf(h?.harakatlar ?? [], new Date()), [h]);
  const olchov = useMemo(() => balansOlchov(h?.balans ?? 0, kunlar), [h, kunlar]);
  const sarfJami = useMemo(() => (h?.harakatlar ?? []).filter((x) => x.tur === 'sarf').reduce((s, x) => s - x.miqdor, 0), [h]);
  // Real 43 qatorli F2: 792 to'ldirilgan katakdan 213 tasini tizim hisoblagan (formula) — faqat shular sanaladi.
  const f2Misol = useMemo(() => narxHisob(h?.narxlar.find((n) => n.amal === 'f2_hujjat'), 213, h?.sozlama), [h]);

  async function sotibOl() {
    if (!kid || !paket || band) return;
    setBand(true);
    const r = await tolovSorovYarat({ kompaniyaId: kid, paketKod: paket, usul: 'otkazma', tolovMalumot: malumot.trim(), operationId: opId.current });
    setBand(false);
    if (!r.ok) { toast(tokenXato(r), 'danger'); return; }
    opId.current = yangiOperationId(); setMalumot('');
    toast('So‘rov yuborildi — to‘lov tasdiqlangach tokenlar hisobingizga yoziladi', 'ok');
    await yukla();
  }

  return (
    <Sahifa sarlavha="Tokenlar va obuna" tavsif="Fayllarni qayta ishlash, hujjatlar va AI — tokenlar bilan" onYangila={() => void yukla()} yangilanmoqda={yuk}>
      {!kid && <section className="fz-card p-4 text-text-dim">{t('Avval kompaniyani tanlang.')}</section>}
      {xato && <section role="alert" className="fz-note fz-note--danger">{xato}</section>}
      {h && (
        <div className="space-y-3">
          {h.superadmin && (
            <Link to="/admin/boshqaruv" className="fz-note fz-note--info hover:border-accent">
              <Crown size={15} className="text-accent" />{t('Toʻlovlarni tasdiqlash, narx va foyda foizi — Boshqaruv panelida')}
            </Link>
          )}
          <section className="fz-card grid gap-5 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" aria-label={t('Balans')}>
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center gap-2"><Coins size={15} className="text-accent" /><span className="fz-panel__h">{t('Balans')}</span>
                <span className={`fz-stamp ${olchov.holat === 'tugagan' ? 'fz-stamp--danger' : olchov.holat === 'kam' ? 'fz-stamp--warn' : olchov.holat === 'yetarli' ? 'fz-stamp--ok' : ''}`}>{olchov.holat === 'tugagan' ? t('tugagan') : olchov.holat === 'kam' ? t('kam qoldi') : olchov.holat === 'yetarli' ? t('yetarli') : t('sarf yo‘q')}</span></div>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-[34px] font-semibold leading-none tabular-nums text-text" style={{ fontFamily: 'var(--font-display)' }} aria-label={t('Token balansi')}>{son(h.balans)}</span>
                <span className="text-[13px] text-text-dim">{t('token ≈ {s} soʻm · oxirgi sarf: {n} token', { s: son(h.balans * h.sozlama.token_som), n: son(sarfJami) })}</span>
              </div>
              <span className={`fz-meter fz-meter--lg ${olchov.holat === 'kam' || olchov.holat === 'tugagan' ? 'fz-meter--over' : ''}`} title={t('Balans 30 kunlik sarfga nisbatan')}>
                <span className="fz-meter__t"><i className="fz-meter__shu" style={{ width: `${olchov.ulush * 100}%` }} /></span>
                <span className="fz-meter__f">{olchov.kunlarga == null ? '—' : t('{n} kun', { n: olchov.kunlarga })}</span>
              </span>
              <span className="text-[12.5px] text-text-dim">{olchov.kunlarga == null
                ? t('Oxirgi 30 kunda sarf yo‘q — balans qancha vaqtga yetishini hisoblab bo‘lmaydi.')
                : t('Oxirgi 30 kun sur’atida (kuniga ≈ {k} token) balans ≈ {n} kunga yetadi.', { k: son(Math.round((olchov.kunlik ?? 0) * 10) / 10), n: olchov.kunlarga })}</span>
              <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                <div className="flex flex-col gap-0.5"><span className="fz-panel__h flex items-center gap-1.5"><ShieldCheck size={13} className="text-accent" />{t('Obuna')}</span>
                  <b className="text-[14px] text-text">{h.obuna ? t(h.obuna.nom) : t('Obuna yoʻq')}</b>
                  <span className="text-[12px] text-text-dim">{h.obuna && h.obuna.oylik_token > 0 ? t('{n} token/oy', { n: son(h.obuna.oylik_token) }) : t('Tokenlarni paket bilan sotib oling')}</span></div>
                <div className="flex flex-col gap-0.5"><span className="fz-panel__h">{t('30 kunlik sarf')}</span><b className="text-[14px] tabular-nums text-text">{son(olchov.sarf30)} {t('token')}</b>
                  <span className="text-[12px] text-text-dim">{t('≈ {s} soʻm', { s: son(olchov.sarf30 * h.sozlama.token_som) })}</span></div>
              </div>
            </div>
            <SarfGrafik kunlar={kunlar} />
          </section>
          <details className="fz-card p-4 text-[12.5px] text-text-dim">
            <summary className="cursor-pointer text-[13px] font-semibold text-text">{t('Qanday hisoblanadi')}</summary>
            <div className="mt-2 flex flex-col gap-1">
              <span>{h.superadmin ? t('Narx = tannarx (tizim hisoblagan kataklar soni boʻyicha) + foyda. Har sarfning toʻliq hisobi pastda koʻrinadi. Bir xil hujjatni qayta yuklash bepul; xato boʻlsa token qaytadi; maʼlumot kiritish bepul.') : QANDAY_HISOB}</span>
              <span>{t('Faqat tizim oʻzi hisoblab yozgan katak sanaladi (summa, jami, nakrutka — formula). Matn, ish nomlari va hujjatdan koʻchirilgan sonlar sanalmaydi. Tekshirish: Excel → «Выделить группу ячеек» → «Формулы».')}</span>
              {f2Misol && <span className="text-text">{t('Masalan: F2 (213 hisoblangan katak) = {s} soʻm = {n} token', { s: son(f2Misol.yakuniy_som), n: son(f2Misol.token) })}</span>}
            </div>
          </details>

          <section className="fz-card p-4" aria-label={t('Token sotib olish')}>
            <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-text"><CreditCard size={15} className="text-accent" />{t('Token sotib olish')}</h2>
            <div className="grid gap-2 md:grid-cols-4">
              {h.paketlar.map((p) => (
                <button key={p.kod} type="button" onClick={() => setPaket(p.kod)} aria-pressed={paket === p.kod}
                  className={`rounded-lg border p-3 text-left transition-colors ${paket === p.kod ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50 hover:bg-surface-2'}`}>
                  <div className="text-[13px] font-semibold text-text">{t(p.nom)}</div>
                  <div className="text-lg font-bold tabular-nums text-text">{son(p.narx_som)} {t('soʻm')}</div>
                  <div className="text-[11px] text-text-mute">{t('1 token = {s} soʻm', { s: son(p.narx_som / p.token) })}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-2 text-[13px]">
              <div className="rounded-lg border border-border p-3">
                <div className="text-[12px] text-text-mute">{t('Toʻlov rekvizitlari (karta yoki hisob raqamiga oʻtkazma)')}</div>
                <div className="whitespace-pre-wrap text-text">{h.sozlama.tolov_rekvizit || t('Administrator rekvizitlarni hali kiritmagan — u bilan bogʻlaning.')}</div>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 text-[12px] text-text-dim">{t('Toʻlov maʼlumoti (chek raqami, vaqt, karta oxirgi 4 raqami)')}
                  <input value={malumot} onChange={(e) => setMalumot(e.target.value)} className={`${kirit} mt-1 w-full`} aria-label={t('Toʻlov maʼlumoti')} />
                </label>
                <button type="button" disabled={band || !paket || malumot.trim().length < 4} onClick={() => void sotibOl()}
                  className="fz-btn fz-btn--primary">{t('Toʻladim — tasdiqlashga yuborish')}</button>
              </div>
              <p className="text-[11px] text-text-mute">{t('Payme va Click orqali avtomatik toʻlov — tez orada (pul tushishi bilan tokenlar oʻzi yoziladi).')}</p>
            </div>
            {h.sorovlar.length > 0 && (
              <div className="fz-table-wrap mt-3"><table className="fz-table">
                <thead><tr><th>{t('Soʻrov')}</th><th className="fz-c-num">{t('Token')}</th><th className="fz-c-num">{t('Summa, soʻm')}</th><th>{t('Holat')}</th></tr></thead>
                <tbody>{h.sorovlar.map((s) => (
                  <tr key={s.id}>
                    <td className="text-text-mute">#{s.id} · {new Date(s.vaqt).toLocaleString(tilLocale())}</td>
                    <td className="fz-c-num">{son(s.token)}</td>
                    <td className="fz-c-num">{son(s.summa_som)}</td>
                    <td><span className={`fz-stamp ${HOLAT_MUHR[s.holat] ?? ''}`}>{t(HOLAT_NOMI[s.holat] ?? s.holat)}</span>{s.sabab ? <span className="ml-2 text-text-mute">{s.sabab}</span> : null}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>

          <section className="fz-card" aria-label={t('Narxlar')}>
            <div className="fz-card__head"><h2 className="fz-card__title">{t('Amallar narxi')}</h2></div>
            <table className="fz-table">
              <thead><tr><th>{t('Amal')}</th><th>{t('Qanday hisoblanadi')}</th><th className="fz-c-num">{t('Misol')}</th></tr></thead>
              <tbody>
                {h.narxlar.filter((n) => n.faol).map((n) => {
                  const misolN = n.tur === 'ai' ? 10000 : n.amal === 'f2_hujjat' || n.amal === 'hujjat' ? 800 : 20000;
                  const m = narxHisob(n, misolN, h.sozlama);
                  return (
                    <tr key={n.amal} className="align-top">
                      <td className="text-text">{t(n.nom)}{n.izoh && <div className="text-[11px] text-text-mute">{t(n.izoh)}</div>}</td>
                      <td className="text-[12px] text-text-dim">
                        {n.asos_som || n.birlik_som
                          ? (h.superadmin
                            ? t('{a} soʻm + har {b} birlikka {c} soʻm, foyda {f}%', { a: son(n.asos_som), b: son(n.birlik), c: son(n.birlik_som), f: son(n.foyda_foiz ?? h.sozlama.foyda_foiz) })
                            : t('{a} soʻm + har {b} birlikka {c} soʻm', { a: son(n.asos_som), b: son(n.birlik), c: son(n.birlik_som) }))
                          : t('Bepul')}
                        {n.min_som ? ` · ${t('min')} ${son(n.min_som)}` : ''}{n.max_som ? ` · ${t('max')} ${son(n.max_som)}` : ''}
                      </td>
                      <td className="fz-c-num text-[12px] text-text-dim">{m && m.token > 0 ? `${son(misolN)} → ${son(m.yakuniy_som)} ${t('soʻm')} = ${son(m.token)} ${t('token')}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="fz-card" aria-label={t('Harakatlar')}>
            <div className="fz-card__head"><h2 className="fz-card__title flex items-center gap-2"><ReceiptText size={15} className="text-accent" />{t('Token nimaga sarflandi (oʻzgarmas daftar)')}</h2></div>
            {h.harakatlar.length === 0 ? <p className="p-4 text-[12px] text-text-mute">{t('Hali harakat yoʻq.')}</p> : (
              <table className="fz-table"><thead><tr><th aria-label={t('Hisob')} /><th>{t('Vaqt')}</th><th>{t('Harakat')}</th><th className="fz-c-num">{t('Token')}</th></tr></thead><tbody>
                {h.harakatlar.map((x) => {
                  const hisob = x.meta?.hisob;
                  return (
                    <Fragment key={x.id}>
                      <tr>
                        <td className="w-5">{hisob && (
                          <button type="button" aria-label={t('Hisobni koʻrsatish')} onClick={() => setOchiq(ochiq === x.id ? null : x.id)} className="text-text-mute hover:text-text">
                            {ochiq === x.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>)}</td>
                        <td className="whitespace-nowrap text-text-mute">{new Date(x.yaratildi).toLocaleString(tilLocale())}</td>
                        <td className="text-text">
                          {t(TUR_NOMI[x.tur])}{x.amal ? ` · ${t(h.narxlar.find((n) => n.amal === x.amal)?.nom ?? x.amal)}` : ''}
                          {x.meta?.sabab ? ` — ${String(x.meta.sabab)}` : x.izoh ? ` — ${x.izoh}` : ''}
                          {x.qaytarilgan && <span className="ml-1 text-ok">({t('qaytarilgan')})</span>}
                          {x.kim && <span className="ml-1 text-text-mute">· {x.kim}</span>}
                        </td>
                        <td className={`fz-c-num font-semibold ${x.miqdor < 0 ? 'text-danger' : 'text-ok'}`}>{x.miqdor > 0 ? '+' : ''}{son(x.miqdor)}</td>
                      </tr>
                      {ochiq === x.id && hisob && <tr><td /><td colSpan={3} className="pb-2"><HisobIzoh h={hisob} meta={x.meta} superadmin={h.superadmin} /></td></tr>}
                    </Fragment>
                  );
                })}
              </tbody></table>
            )}
          </section>
        </div>
      )}
    </Sahifa>
  );
}

export default Tokenlar;
