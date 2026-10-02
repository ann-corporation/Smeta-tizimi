import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Coins, CreditCard, Crown, ReceiptText, ShieldCheck } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { yangiOperationId } from '../../api/supabase';
import { narxHisob, tokenHolatOl, tokenXato, tolovSorovYarat, type NarxTafsilot, type TokenHarakat, type TokenHolat } from '../../api/t2-token';
import { t, tilLocale } from '../../i18n/til';

const TUR_NOMI: Record<TokenHarakat['tur'], string> = { oylik: 'Obuna (oylik)', toldirish: 'Sotib olindi', bonus: 'Bonus', sarf: 'Sarf', qaytarish: 'Qaytarildi', tuzatish: 'Tuzatish' };
const HOLAT_NOMI: Record<string, string> = { kutilmoqda: 'Kutilmoqda', tasdiqlandi: 'Tasdiqlandi', rad: 'Rad etildi', bekor: 'Bekor qilindi' };
const son = (x: number | null | undefined) => (x == null ? '—' : Number(x).toLocaleString(tilLocale(), { maximumFractionDigits: 2 }));
const kirit = 'rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] text-text outline-none focus:border-accent';

/** Sarf hisobining to'liq izohi: nima uchun, qancha birlik, tannarx, foyda, yakuniy narx. */
function HisobIzoh({ h, meta }: { h: NarxTafsilot; meta: TokenHarakat['meta'] }) {
  return (
    <div className="grid gap-x-6 gap-y-0.5 text-[12px] text-text-dim md:grid-cols-2">
      {meta?.sabab && <div className="md:col-span-2 text-text">{String(meta.sabab)}</div>}
      <div>{t('Amal')}: <b className="text-text">{t(h.nom)}</b></div>
      <div>{t('Hajm')}: <b className="text-text">{son(h.birlik_soni)}</b> {t('birlik')} ({son(h.qism)} × {son(h.birlik)})</div>
      <div>{t('Tannarx')}: {son(h.asos_som)} + {son(h.qism)} × {son(h.birlik_som)} = <b className="text-text">{son(h.tannarx_som)} {t('soʻm')}</b></div>
      <div>{t('Foyda')}: {son(h.foyda_foiz)}% {h.min_som ? `· ${t('min')} ${son(h.min_som)}` : ''} {h.max_som ? `· ${t('max')} ${son(h.max_som)}` : ''}</div>
      <div>{t('Yakuniy narx')}: <b className="text-text">{son(h.yakuniy_som)} {t('soʻm')}</b></div>
      <div>{t('Token')}: {son(h.yakuniy_som)} ÷ {son(h.token_som)} = <b className="text-text">{son(h.token)}</b></div>
    </div>
  );
}

/**
 * Tokenlar va obuna (egasi, 2026-10-02): balans, token sotib olish, narxlar (tannarx + foyda), har sarfning
 * "nima uchun" izohi. Superadmin amallari — Boshqaruv panelida.
 */
export function Tokenlar() {
  const { joriy } = useKompaniya();
  const kid = joriy?.id ?? null;
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

  const sarfJami = useMemo(() => (h?.harakatlar ?? []).filter((x) => x.tur === 'sarf').reduce((s, x) => s - x.miqdor, 0), [h]);
  const f2Misol = useMemo(() => narxHisob(h?.narxlar.find((n) => n.amal === 'f2_hujjat'), 792, h?.sozlama), [h]);

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
      {!kid && <section className="karta p-4 text-text-dim">{t('Avval kompaniyani tanlang.')}</section>}
      {xato && <section role="alert" className="karta border-danger/40 p-4 text-danger">{xato}</section>}
      {h && (
        <div className="space-y-3">
          {h.superadmin && (
            <Link to="/admin/boshqaruv" className="karta flex items-center gap-2 border-accent/40 p-3 text-[13px] text-text hover:border-accent">
              <Crown size={15} className="text-accent" />{t('Toʻlovlarni tasdiqlash, narx va foyda foizi — Boshqaruv panelida')}
            </Link>
          )}
          <section className="grid gap-3 md:grid-cols-3">
            <div className="karta p-4">
              <div className="flex items-center gap-2 text-[12px] uppercase tracking-wide text-text-mute"><Coins size={14} className="text-accent" />{t('Balans')}</div>
              <div className="mt-1 text-3xl font-bold tabular-nums text-text" aria-label={t('Token balansi')}>{son(h.balans)}</div>
              <div className="text-[12px] text-text-dim">{t('token ≈ {s} soʻm · oxirgi sarf: {n} token', { s: son(h.balans * h.sozlama.token_som), n: son(sarfJami) })}</div>
            </div>
            <div className="karta p-4">
              <div className="flex items-center gap-2 text-[12px] uppercase tracking-wide text-text-mute"><ShieldCheck size={14} className="text-accent" />{t('Obuna')}</div>
              <div className="mt-1 text-xl font-semibold text-text">{h.obuna ? t(h.obuna.nom) : t('Obuna yoʻq')}</div>
              <div className="text-[12px] text-text-dim">{h.obuna && h.obuna.oylik_token > 0 ? t('{n} token/oy', { n: son(h.obuna.oylik_token) }) : t('Tokenlarni paket bilan sotib oling')}</div>
            </div>
            <div className="karta p-4 text-[12px] text-text-dim">
              <div className="mb-1 text-[12px] uppercase tracking-wide text-text-mute">{t('Qanday hisoblanadi')}</div>
              {t('Narx = tannarx (hujjat hajmi boʻyicha) + foyda. Har sarfning toʻliq hisobi pastda koʻrinadi. Bir xil hujjatni qayta yuklash bepul; xato boʻlsa token qaytadi; maʼlumot kiritish bepul.')}
              {f2Misol && <div className="mt-1 text-text">{t('Masalan: F2 (792 yacheyka) = {s} soʻm = {n} token', { s: son(f2Misol.yakuniy_som), n: son(f2Misol.token) })}</div>}
            </div>
          </section>

          <section className="karta p-4" aria-label={t('Token sotib olish')}>
            <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-text"><CreditCard size={15} className="text-accent" />{t('Token sotib olish')}</h2>
            <div className="grid gap-2 md:grid-cols-4">
              {h.paketlar.map((p) => (
                <button key={p.kod} type="button" onClick={() => setPaket(p.kod)} aria-pressed={paket === p.kod}
                  className={`rounded-lg border p-3 text-left ${paket === p.kod ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}`}>
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
                  className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{t('Toʻladim — tasdiqlashga yuborish')}</button>
              </div>
              <p className="text-[11px] text-text-mute">{t('Payme va Click orqali avtomatik toʻlov — tez orada (pul tushishi bilan tokenlar oʻzi yoziladi).')}</p>
            </div>
            {h.sorovlar.length > 0 && (
              <table className="mt-3 w-full text-[12px]"><tbody>
                {h.sorovlar.map((s) => (
                  <tr key={s.id} className="border-t border-border/60">
                    <td className="py-1 text-text-mute">#{s.id} · {new Date(s.vaqt).toLocaleString(tilLocale())}</td>
                    <td className="py-1 text-text">{son(s.token)} {t('token')} · {son(s.summa_som)} {t('soʻm')}</td>
                    <td className={`py-1 text-right ${s.holat === 'tasdiqlandi' ? 'text-ok' : s.holat === 'rad' ? 'text-danger' : 'text-warn'}`}>{t(HOLAT_NOMI[s.holat] ?? s.holat)}{s.sabab ? ` — ${s.sabab}` : ''}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </section>

          <section className="karta p-4" aria-label={t('Narxlar')}>
            <h2 className="mb-2 text-[14px] font-semibold text-text">{t('Amallar narxi')}</h2>
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th>{t('Amal')}</th><th>{t('Qanday hisoblanadi')}</th><th className="text-right">{t('Misol')}</th></tr></thead>
              <tbody>
                {h.narxlar.filter((n) => n.faol).map((n) => {
                  const misolN = n.tur === 'ai' ? 10000 : n.amal === 'f2_hujjat' || n.amal === 'hujjat' ? 800 : 20000;
                  const m = narxHisob(n, misolN, h.sozlama);
                  return (
                    <tr key={n.amal} className="border-t border-border/60 align-top">
                      <td className="py-1.5 text-text">{t(n.nom)}{n.izoh && <div className="text-[11px] text-text-mute">{t(n.izoh)}</div>}</td>
                      <td className="py-1.5 text-[12px] text-text-dim">
                        {n.asos_som || n.birlik_som
                          ? t('{a} soʻm + har {b} birlikka {c} soʻm, foyda {f}%', { a: son(n.asos_som), b: son(n.birlik), c: son(n.birlik_som), f: son(n.foyda_foiz ?? h.sozlama.foyda_foiz) })
                          : t('Bepul')}
                        {n.min_som ? ` · ${t('min')} ${son(n.min_som)}` : ''}{n.max_som ? ` · ${t('max')} ${son(n.max_som)}` : ''}
                      </td>
                      <td className="py-1.5 text-right text-[12px] tabular-nums text-text-dim">{m && m.token > 0 ? `${son(misolN)} → ${son(m.yakuniy_som)} ${t('soʻm')} = ${son(m.token)} ${t('token')}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="karta p-4" aria-label={t('Harakatlar')}>
            <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-text"><ReceiptText size={15} className="text-accent" />{t('Token nimaga sarflandi (oʻzgarmas daftar)')}</h2>
            {h.harakatlar.length === 0 ? <p className="text-[12px] text-text-mute">{t('Hali harakat yoʻq.')}</p> : (
              <table className="w-full text-[12px]"><tbody>
                {h.harakatlar.map((x) => {
                  const hisob = x.meta?.hisob;
                  return (
                    <Fragment key={x.id}>
                      <tr className="border-t border-border/60">
                        <td className="w-5 py-1">{hisob && (
                          <button type="button" aria-label={t('Hisobni koʻrsatish')} onClick={() => setOchiq(ochiq === x.id ? null : x.id)} className="text-text-mute hover:text-text">
                            {ochiq === x.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>)}</td>
                        <td className="py-1 text-text-mute">{new Date(x.yaratildi).toLocaleString(tilLocale())}</td>
                        <td className="py-1 text-text">
                          {t(TUR_NOMI[x.tur])}{x.amal ? ` · ${t(h.narxlar.find((n) => n.amal === x.amal)?.nom ?? x.amal)}` : ''}
                          {x.meta?.sabab ? ` — ${String(x.meta.sabab)}` : x.izoh ? ` — ${x.izoh}` : ''}
                          {x.qaytarilgan && <span className="ml-1 text-ok">({t('qaytarilgan')})</span>}
                          {x.kim && <span className="ml-1 text-text-mute">· {x.kim}</span>}
                        </td>
                        <td className={`py-1 text-right font-semibold tabular-nums ${x.miqdor < 0 ? 'text-danger' : 'text-ok'}`}>{x.miqdor > 0 ? '+' : ''}{son(x.miqdor)}</td>
                      </tr>
                      {ochiq === x.id && hisob && <tr><td /><td colSpan={3} className="pb-2"><HisobIzoh h={hisob} meta={x.meta} /></td></tr>}
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
