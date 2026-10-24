import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CircleHelp, CircleSlash, Save, Search, Trash2, TriangleAlert } from 'lucide-react';
import { yangiOperationId, type T2Qator, type T2QatorHolat } from '../../api/supabase';
import { sbFaktYoz } from '../../api/t2-fakt';
import { t2ObyektNakrutka, type NakrutkaKoeffitsientlar } from '../../api/t2-nakrutka';
import { t } from '../../i18n/til';
import { useHotkeys } from '../../lib/hotkeys/useHotkeys';
import { xotiraIndeks, xotiraMosla, xotiraQidiruv, type XotiraNatija, type XotiraNomzod } from '../../lib/xotira-fakt/moslash';
import { qatorlarniOqi } from '../../lib/xotira-fakt/parse';
import { savatHajmi, savatJami, savatPaketi, savatdanOlish, savatgaQosh, type SavatQator } from '../../lib/xotira-fakt/savat';
import { miqdorBoshlang, nomzodHajmi } from '../../lib/xotira-fakt/tanlash';
import { jurnalQur } from '../../lib/fakt-jurnal';
import { toast } from '../../umumiy/ui/Toast';
import { BoshqaJoydan, type YaratilganQator } from './BoshqaJoydan';
import { IshAbcModal } from './IshAbcModal';
import { katalogBoshlang } from '../../lib/xotira-fakt/boshqaJoy';

const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 }));
const pul = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 0 }));

/** Bitta matn qatorining ekran holati. */
interface QatorUI { aktiv: number; miqdor: string; qidiruv: string; qoshildi: boolean }

const BELGI = {
  aniq: { Ikon: Check, sinf: 'text-ok' },
  taklif: { Ikon: CircleHelp, sinf: 'text-warn' },
  topilmadi: { Ikon: CircleSlash, sinf: 'text-danger' },
} as const;

function belgiNom(h: keyof typeof BELGI): string { return h === 'aniq' ? t('Aniq moslik') : h === 'taklif' ? t('Taklif: tanlang') : t('Smetadan topilmadi'); }

/** Tugma/maydon ustida Enter bosilganda «nomzodni qo‘sh» ishlamasligi kerak (tugma o‘zi bosiladi, matn maydoni o‘zi boshqaradi). */
const interaktivmi = (e: Event) => { const el = e.target as HTMLElement | null; return !!el && ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A'].includes(el.tagName); };

/**
 * «Xotiradan» rejimi (egasi 2026-10-24): bajarilgan ishlar smetadagi tartibda emas, egasining xotirasida — erkin matn,
 * har qator bitta ish; tizim obyekt smetasining BARCHA qatorlaridan 3-5 nomzod ko‘rsatadi, egasi tanlaydi, o‘ngda fakt savati.
 * Yozish — mavjud `fakt_yoz_v2` (bitta hujjat); asl smeta qatorlariga tegilmaydi; hajm oshsa faqat belgi (bloklanmaydi).
 */
export function XotiradanFakt({ kompaniyaId, obyektId, rows, states, holatniYangila, tuzilmaniYangila }: {
  kompaniyaId: number; obyektId: number; rows: T2Qator[]; states: T2QatorHolat[]; holatniYangila: () => unknown; tuzilmaniYangila: () => unknown;
}) {
  const navigate = useNavigate();
  const [matn, setMatn] = useState('');
  const [natijalar, setNatijalar] = useState<XotiraNatija[]>([]);
  const [ui, setUi] = useState<Record<number, QatorUI>>({});
  const [aktivQator, setAktivQator] = useState(0);
  const [savat, setSavat] = useState<SavatQator[]>([]);
  const [nk, setNk] = useState<NakrutkaKoeffitsientlar | null>(null);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [boshqa, setBoshqa] = useState<number | null>(null);
  const [katalog, setKatalog] = useState<number | null>(null);
  const [yaratilgan, setYaratilgan] = useState<YaratilganQator[]>([]);
  const bolimlar = useMemo(() => jurnalQur(rows, states).bolimlar, [rows, states]);
  const matnRef = useRef<HTMLTextAreaElement>(null);
  const operationId = useRef(yangiOperationId());
  const ind = useMemo(() => xotiraIndeks(rows, states), [rows, states]);
  const jami = useMemo(() => savatJami(savat, nk), [savat, nk]);

  // Ustama koeffitsientlari (obyekt shartnomasi bo‘yicha); o‘qilmasa — faqat ustamasiz jami.
  useEffect(() => {
    let bekor = false;
    void t2ObyektNakrutka(obyektId).then((r) => { if (!bekor) setNk(r.ok && r.koeffitsientlar ? r.koeffitsientlar : null); }).catch(() => { if (!bekor) setNk(null); });
    return () => { bekor = true; };
  }, [obyektId]);

  useEffect(() => {
    if (!savat.length) return;
    const k = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', k);
    return () => window.removeEventListener('beforeunload', k);
  }, [savat.length]);

  const moslash = () => {
    const q = qatorlarniOqi(matn);
    const n = xotiraMosla(q, ind, 5);
    setNatijalar(n);
    setUi(Object.fromEntries(n.map((x) => [x.qator.id, { aktiv: 0, miqdor: miqdorBoshlang(x.qator), qidiruv: '', qoshildi: false }])));
    setAktivQator(0);
  };

  /** Qatorning hozirgi nomzodlari: qo‘lda qidiruv kiritilgan bo‘lsa — shu qidiruv natijasi, aks holda avtomatik moslash. */
  const nomzodlar = (x: XotiraNatija): XotiraNomzod[] => {
    const s = ui[x.qator.id]?.qidiruv ?? '';
    return s.trim().length >= 2 ? xotiraQidiruv(ind, s, 5) : x.nomzodlar;
  };
  const yangila = (id: number, p: Partial<QatorUI>) => setUi((u) => ({ ...u, [id]: { ...(u[id] ?? { aktiv: 0, miqdor: '', qidiruv: '', qoshildi: false }), ...p } }));

  const keyingiHalQilinmagan = (dan: number): number => {
    for (let k = 1; k <= natijalar.length; k++) { const i = (dan + k) % natijalar.length; if (!ui[natijalar[i].qator.id]?.qoshildi) return i; }
    return dan;
  };

  const qosh = (qi: number, ni?: number) => {
    const x = natijalar[qi]; if (!x) return false;
    const u = ui[x.qator.id]; const nz = nomzodlar(x)[ni ?? u?.aktiv ?? 0];
    if (!nz || !u) return false;
    const h = nomzodHajmi(x.qator, nz, u.miqdor);
    if (h == null || h === 0) { toast(t('Miqdorni kiriting: son, foiz yoki “hammasi”.'), 'warn'); return false; }
    setSavat((s) => savatgaQosh(s, rows, nz, h, u.qidiruv.trim() ? 'qidiruv' : 'matn'));
    yangila(x.qator.id, { qoshildi: true });
    setAktivQator(keyingiHalQilinmagan(qi));
    return true;
  };

  const katalogSaqlandi = async (xabar: string, id?: number | null) => {
    const x = katalog != null ? natijalar[katalog] : null;
    if (x) {
      yangila(x.qator.id, { qoshildi: true });
      const b = katalogBoshlang(x.qator);
      setYaratilgan((a) => [...a, { id: id ?? null, nom: b.ish.nom, birlik: b.ish.birlik, hajm: Number(b.ish.hajm) || 0, jami: 0 }]);
    }
    if (katalog != null) setAktivQator(keyingiHalQilinmagan(katalog));
    setKatalog(null);
    toast(xabar, 'ok');
    await tuzilmaniYangila(); await holatniYangila();
  };

  const boshqaSaqlandi = async (y: YaratilganQator) => {
    const x = boshqa != null ? natijalar[boshqa] : null;
    if (x) yangila(x.qator.id, { qoshildi: true });
    setYaratilgan((a) => [...a, y]);
    if (boshqa != null) setAktivQator(keyingiHalQilinmagan(boshqa));
    setBoshqa(null);
    toast(t('Qoʻshimcha qator yaratildi va fakt yozildi: {nom}', { nom: y.nom }), 'ok');
    await tuzilmaniYangila(); await holatniYangila();
  };

  const saqla = async () => {
    const paket = savatPaketi(savat);
    if (!paket.length || saqlanmoqda) return;
    setSaqlanmoqda(true);
    try {
      const r = await sbFaktYoz({ obyektId, sana: new Date().toISOString().slice(0, 10), operationId: operationId.current, qatorlar: paket, izoh: `Xotiradan fakt: ${paket.length} qator` });
      if (!r.ok) { toast(r.error || r.xabar || t('Fakt saqlanmadi.'), 'danger'); return; }
      toast(t('Fakt saqlandi: {n} qator.', { n: paket.length }), 'ok');
      operationId.current = yangiOperationId();
      setSavat([]); setNatijalar([]); setUi({}); setMatn('');
      await holatniYangila();
    } catch { toast(t('Javob olinmadi. Qayta urinib koʻring.'), 'danger'); } finally { setSaqlanmoqda(false); }
  };

  const aktivNatija = natijalar[aktivQator];
  const aktivSoni = (qi: number) => nomzodlar(natijalar[qi]).length;
  const nomzodSur = (d: 1 | -1) => {
    if (!aktivNatija) return false;
    const n = aktivSoni(aktivQator); if (!n) return false;
    const u = ui[aktivNatija.qator.id]; const yangi = Math.max(0, Math.min(n - 1, (u?.aktiv ?? 0) + d));
    yangila(aktivNatija.qator.id, { aktiv: yangi });
  };
  const qatorSur = (d: 1 | -1) => { if (!natijalar.length) return false; setAktivQator((i) => Math.max(0, Math.min(natijalar.length - 1, i + d))); };

  useHotkeys('xotira-fakt', t('Xotiradan fakt'), [
    { id: 'xotira.moslash', keys: 'ctrl+enter', nom: t('Matnni smetaga moslash'), inInput: true, run: () => { moslash(); } },
    { id: 'xotira.saqla', keys: 'ctrl+s', nom: t('Saqlash'), inInput: true, run: () => { void saqla(); } },
    { id: 'xotira.pastga', keys: 'arrowdown', nom: t('Keyingi nomzod'), run: () => nomzodSur(1) },
    { id: 'xotira.tepaga', keys: 'arrowup', nom: t('Oldingi nomzod'), run: () => nomzodSur(-1) },
    { id: 'xotira.qatorPast', keys: 'ctrl+arrowdown', nom: t('Keyingi qator'), inInput: true, run: () => qatorSur(1) },
    { id: 'xotira.qatorTepa', keys: 'ctrl+arrowup', nom: t('Oldingi qator'), inInput: true, run: () => qatorSur(-1) },
    { id: 'xotira.qosh', keys: 'enter', nom: t('Nomzodni savatga qoʻshish'), run: (e) => { if (interaktivmi(e)) return false; return qosh(aktivQator); } },
    { id: 'xotira.keyingi', keys: 'n', nom: t('Keyingi hal qilinmagan qator'), run: () => { if (!natijalar.length) return false; setAktivQator(keyingiHalQilinmagan(aktivQator)); } },
    { id: 'xotira.boshqa', keys: 'b', nom: t('Boshqa joydan olish'), run: () => { if (!natijalar[aktivQator]) return false; setBoshqa(aktivQator); } },
    { id: 'xotira.matn', keys: '/', nom: t('Matn maydoniga oʻtish'), run: () => { matnRef.current?.focus(); } },
  ], boshqa == null && katalog == null);

  const maydonKlavisha = (e: KeyboardEvent<HTMLInputElement>, qi: number) => {
    if (e.key === 'Enter') { e.preventDefault(); qosh(qi); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setAktivQator(qi); const x = natijalar[qi]; const u = ui[x.qator.id]; const n = aktivSoni(qi); yangila(x.qator.id, { aktiv: Math.max(0, Math.min(n - 1, (u?.aktiv ?? 0) + (e.key === 'ArrowDown' ? 1 : -1))) }); }
  };

  const qatorlarSoni = natijalar.length;
  const hal = natijalar.filter((x) => ui[x.qator.id]?.qoshildi).length;

  return (
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_380px]" data-testid="xotiradan-fakt">
      <section className="karta flex min-h-0 flex-col gap-3 p-3" aria-label={t('Xotiradan fakt')}>
        <label className="block text-[12px] font-medium text-text">
          {t('Bajarilgan ishlar (har qator — bitta ish)')}
          <textarea ref={matnRef} value={matn} onChange={(e) => setMatn(e.target.value)} rows={5} spellCheck={false}
            placeholder={t('masalan: kanal tubiga beton 120 m3')}
            className="input mt-1.5 block w-full resize-y p-2 font-mono text-[13px]" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={moslash} disabled={!matn.trim()} className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"><Search size={14} />{t('Smetaga moslash')}</button>
          <span className="text-[11px] text-text-mute">{t('Ctrl+Enter — moslash; ? — tugmalar roʻyxati')}</span>
          {qatorlarSoni > 0 && <span className="ml-auto text-[12px] text-text-dim" role="status">{t('{a} / {b} qator savatda', { a: hal, b: qatorlarSoni })}</span>}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-auto" aria-live="polite">
          {natijalar.map((x, qi) => {
            const u = ui[x.qator.id]; const nz = nomzodlar(x); const B = BELGI[nz.length ? x.holat : 'topilmadi']; const faol = qi === aktivQator;
            return (
              <article key={x.qator.id} onClick={() => setAktivQator(qi)} aria-current={faol ? 'true' : undefined}
                className={`rounded-xl border p-2.5 ${faol ? 'border-accent bg-accent/5' : 'border-border'} ${u?.qoshildi ? 'opacity-60' : ''}`}>
                <header className="flex flex-wrap items-center gap-2">
                  <B.Ikon size={16} className={B.sinf} aria-label={belgiNom(nz.length ? x.holat : 'topilmadi')} />
                  <b className="min-w-0 flex-1 truncate text-[13px] text-text">{x.qator.xom}</b>
                  <label className="flex items-center gap-1 text-[11px] text-text-dim">{t('Miqdor')}
                    <input aria-label={t('Miqdor')} value={u?.miqdor ?? ''} onChange={(e) => yangila(x.qator.id, { miqdor: e.target.value })} onKeyDown={(e) => maydonKlavisha(e, qi)} onFocus={() => setAktivQator(qi)}
                      placeholder={t('son, % yoki hammasi')} className="input h-8 w-28 px-2 text-right text-[12px]" />
                  </label>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setAktivQator(qi); setBoshqa(qi); }} className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-surface-2">{t('Boshqa joydan olish')}</button>
                  {u?.qoshildi && <span className="rounded bg-ok/15 px-1.5 py-0.5 text-[11px] text-ok">{t('Savatda')}</span>}
                </header>
                {(x.holat === 'topilmadi' || (u?.qidiruv ?? '') !== '') && (
                  <input aria-label={t('Smetadan qidirish')} value={u?.qidiruv ?? ''} onChange={(e) => yangila(x.qator.id, { qidiruv: e.target.value, aktiv: 0 })} placeholder={t('Nom yoki kod bilan qidiring')} className="input mt-2 h-8 w-full px-2 text-[12px]" />
                )}
                <ul className="mt-2 space-y-1" role="listbox" aria-label={t('Nomzodlar')}>
                  {nz.map((n, ni) => {
                    const tanlangan = (u?.aktiv ?? 0) === ni; const h = u ? nomzodHajmi(x.qator, n, u.miqdor) : null;
                    return (
                      <li key={n.qatorId} role="option" aria-selected={tanlangan} onClick={(e) => { e.stopPropagation(); setAktivQator(qi); yangila(x.qator.id, { aktiv: ni }); }} onDoubleClick={() => qosh(qi, ni)}
                        className={`cursor-pointer rounded-lg border px-2 py-1.5 text-[12px] ${tanlangan ? 'border-accent bg-surface-2' : 'border-transparent hover:bg-surface-2'}`}>
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[11px] text-text-mute" title={n.yol}>{n.yol || '—'}</div>
                            <div className="text-text">{n.kod ? <span className="mr-1 text-text-dim">{n.kod}</span> : null}{n.nom}</div>
                            <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-text-dim">
                              <span>{t('Smeta')}: {fmt(n.smetaHajm)} {n.birlik ?? ''}</span>
                              <span>{t('Fakt')}: {fmt(n.faktHajm)}</span>
                              <span>{t('F2 da')}: {fmt(n.f2Hajm)}</span>
                              <span className="font-medium text-text">{t('Qoldiq')}: {fmt(n.qoldiq)}</span>
                              {n.birlikMos === false && <span className="text-warn">{t('Birlik mos emas')}</span>}
                              {n.sigadi === false && <span className="inline-flex items-center gap-0.5 text-warn"><TriangleAlert size={11} />{t('Qoldiqdan oshadi')}</span>}
                            </div>
                          </div>
                          <div className="shrink-0 text-right text-[11px] text-text-dim">
                            <div>{n.ball}%</div>
                            {tanlangan && h != null && <div className="font-medium text-text">+{fmt(h)}</div>}
                          </div>
                          <button type="button" aria-label={t('Savatga qoʻshish')} onClick={(e) => { e.stopPropagation(); qosh(qi, ni); }} className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-surface-2">{t('Qoʻshish')}</button>
                        </div>
                      </li>
                    );
                  })}
                  {!nz.length && <li className="px-2 py-1 text-[12px] text-text-mute">{t('Mos qator topilmadi — yuqoridagi qidiruv maydonidan foydalaning.')}</li>}
                </ul>
              </article>
            );
          })}
          {!natijalar.length && <p className="p-3 text-[12px] text-text-mute">{t('Bajarilgan ishlarni yozing va “Smetaga moslash” ni bosing: har qator uchun obyekt smetasining hamma boʻlimlaridan nomzodlar chiqadi.')}</p>}
        </div>
      </section>

      <aside className="karta flex min-h-0 flex-col gap-2 p-3" aria-label={t('Fakt savati')}>
        <h3 className="text-[13px] font-semibold text-text">{t('Fakt savati')} <span className="font-normal text-text-mute">({savat.filter((x) => x.guruh == null).length})</span></h3>
        <div className="min-h-0 flex-1 space-y-1 overflow-auto">
          {savat.filter((x) => x.guruh == null).map((x) => (
            <div key={x.qatorId} className="rounded-lg border border-border p-2">
              <SavatSatr x={x} onHajm={(h) => setSavat((s) => savatHajmi(s, rows, x.qatorId, h))} onOlish={() => setSavat((s) => savatdanOlish(s, x.qatorId))} />
              {savat.filter((c) => c.guruh === x.qatorId).map((c) => (
                <div key={c.qatorId} className="ml-3 mt-1 border-l border-border pl-2"><SavatSatr x={c} kichik onHajm={(h) => setSavat((s) => savatHajmi(s, rows, c.qatorId, h))} /></div>
              ))}
            </div>
          ))}
          {!savat.length && <p className="text-[12px] text-text-mute">{t('Savat boʻsh. Ish tanlansa, uning materiallari ham norma boʻyicha birga qoʻshiladi; mehnat va mashina avtomatik hisoblanadi.')}</p>}
        </div>
        {yaratilgan.length > 0 && <div className="rounded-lg border border-ok/40 bg-ok/5 p-2 text-[11px] text-text-dim"><div className="font-semibold text-text">{t('Yangi qoʻshimcha qatorlar (fakt yozilgan)')}</div>{yaratilgan.map((y, i) => <div key={i} className="flex justify-between gap-2"><span className="truncate">{y.nom}</span><span className="shrink-0">{fmt(y.hajm)} {y.birlik}</span></div>)}</div>}
        <dl className="space-y-0.5 border-t border-border pt-2 text-[12px]">
          <div className="flex justify-between"><dt className="font-semibold text-text">{t('Ustamali jami')}</dt><dd className="font-semibold text-text">{pul(jami.ustamali)}</dd></div>
          <div className="flex justify-between text-[11px] text-text-mute"><dt>{t('Ustamasiz')}</dt><dd>{pul(jami.asos)}</dd></div>
          {jami.narxsiz > 0 && <div className="text-[11px] text-warn">{t('Narxsiz qatorlar: {n} — jamiga kirmaydi', { n: jami.narxsiz })}</div>}
        </dl>
        <div className="flex gap-2">
          <button type="button" onClick={() => void saqla()} disabled={!savat.length || saqlanmoqda} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"><Save size={14} />{saqlanmoqda ? t('Saqlanmoqda…') : t('Saqlash')}</button>
          <button type="button" onClick={() => navigate(`/admin/f2-tayyorlash?obyekt=${obyektId}`)} className="rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-[12px] font-semibold text-text hover:bg-accent/10">{t('F2 tayyorlash →')}</button>
        </div>
      </aside>
      {boshqa != null && natijalar[boshqa] && <BoshqaJoydan kompaniyaId={kompaniyaId} obyektId={obyektId} qator={natijalar[boshqa].qator} bolimlar={bolimlar} onYop={() => setBoshqa(null)} onSaqlandi={boshqaSaqlandi} onKatalog={() => { setKatalog(boshqa); setBoshqa(null); }} />}
      {katalog != null && natijalar[katalog] && <IshAbcModal kompaniyaId={kompaniyaId} obyektId={obyektId} sana={new Date().toISOString().slice(0, 10)} rejim={{ tur: 'additional' }}
        bolimlar={bolimlar.map((b) => ({ id: b.id, versiya: b.versiya, nom: `${'· '.repeat(b.daraja)}${b.nom}` }))} boshlang={katalogBoshlang(natijalar[katalog].qator)} onYop={() => setKatalog(null)} onSaqlandi={katalogSaqlandi} />}
    </div>
  );
}

function SavatSatr({ x, kichik, onHajm, onOlish }: { x: SavatQator; kichik?: boolean; onHajm: (h: number) => void; onOlish?: () => void }) {
  const [matn, setMatn] = useState(String(x.hajm));
  useEffect(() => { setMatn(String(x.hajm)); }, [x.hajm]);
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className={`${kichik ? 'text-[11px] text-text-dim' : 'text-[12px] text-text'}`}>{x.kod ? <span className="mr-1 text-text-mute">{x.kod}</span> : null}{x.nom}</div>
        <div className="text-[11px] text-text-mute">{x.birlik ?? ''}{x.oshdi && <span className="ml-2 inline-flex items-center gap-0.5 text-warn"><TriangleAlert size={11} />{t('Qoldiqdan oshdi')}</span>}{x.narx == null && <span className="ml-2 text-warn">{t('Narxsiz')}</span>}</div>
      </div>
      <input aria-label={t('Hajm')} value={matn} onChange={(e) => setMatn(e.target.value)} onBlur={() => { const v = Number(matn.replace(',', '.')); if (Number.isFinite(v) && v !== x.hajm) onHajm(v); else setMatn(String(x.hajm)); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="input h-7 w-24 px-2 text-right text-[12px]" />
      {onOlish && <button type="button" aria-label={t('Savatdan olish')} onClick={onOlish} className="rounded p-1 text-text-mute hover:text-danger"><Trash2 size={14} /></button>}
    </div>
  );
}
