/**
 * TekshiruvPanel - F-2 dagi QR skaner qilinganda ochiladigan texnadzor tekshiruv paneli (`/tekshiruv/:token`, telefon uchun).
 * F-2 qatorlari smeta tartibida, bo'limlari bilan. Har qatorga: izoh, taklif hajm, belgi (olib tashlansin / hajm noto'g'ri / hujjat kerak /
 * qabul), rang. Yetishmagan qatorni smetadan qidirib QO'SHISHNI TAKLIF qilish mumkin. Umumiy holat: Ko'rib chiqildi / Qaytarildi / Qabul.
 * HECH NARSA F-2 ga to'g'ridan-to'g'ri yozilmaydi: hammasi taklif; PTO F-2 qoralama muharririda har birini hal qiladi.
 * Kirish: sessiya shart; ruxsat serverda (PTO a'zosi | texnadzor tomon granti | PTO bergan bir martalik kod `?k=`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ClipboardCheck, LogIn, Plus, Search, ShieldQuestion } from 'lucide-react';
import { t } from '../i18n/til';
import { tokenMi } from '../lib/imzo/yadro';
import { tekshiruvHolat, tekshiruvKodBer, tekshiruvKodOl, tekshiruvOchish, tekshiruvQidir, tekshiruvSaqla, tekshiruvXatoMatni, type TaklifYuki } from '../api/t2-tekshiruv';
import { BAYROQLAR, HUJJAT_TURLARI, RANGLAR, bolimlarga, takliflarQatorBoyicha, tekshiruvHavolasi, type Bayroq, type PanelJavob, type PanelQator, type PanelTaklif, type Rang, type TekshiruvHolat } from '../lib/tekshiruv/yadro';

const RANG_STIL: Record<Rang, string> = { qizil: '#cf222e', sariq: '#bf8700', yashil: '#1a7f37', kok: '#0969da' };
const BAYROQ_MATN: Record<Bayroq, string> = { olib_tashlansin: 'Olib tashlansin', hajm_notogri: 'Hajm noto‘g‘ri', hujjat_kerak: 'Hujjat kerak', qabul: 'Qabul' };
const QAROR_MATN = { kutilmoqda: 'PTO qarori kutilmoqda', qabul: 'PTO qabul qildi', rad: 'PTO rad etdi', keyinroq: 'PTO keyinroq ko‘radi' } as const;
const HOLAT_MATN: Record<TekshiruvHolat, string> = { qoralama: 'Qoralama', korib_chiqildi: 'Ko‘rib chiqildi', qaytarildi: 'Qaytarildi', qabul: 'Qabul qilindi' };

const Qobiq = ({ children }: { children: React.ReactNode }) => (
  <main className="min-h-screen px-4 py-4 flex justify-center" style={{ background: 'var(--bg, #f6f8fa)', color: 'var(--text, #1f2328)' }}>
    <div className="w-full flex flex-col gap-3" style={{ maxWidth: 720 }}>{children}</div>
  </main>
);
const Karta = ({ children, rang }: { children: React.ReactNode; rang?: string }) => (
  <section className="rounded-lg border p-3 flex flex-col gap-2" style={{ background: 'var(--surface, #fff)', borderColor: 'var(--border, #d0d7de)', ...(rang ? { borderLeft: `4px solid ${rang}` } : {}) }}>{children}</section>
);
const Chip = ({ on, onClick, children, rang }: { on: boolean; onClick: () => void; children: React.ReactNode; rang?: string }) => (
  <button type="button" onClick={onClick} aria-pressed={on} className="rounded-full border px-3 text-[13px]" style={{ minHeight: 36, borderColor: rang ?? 'var(--border, #d0d7de)', background: on ? (rang ?? '#0969da') : 'transparent', color: on ? '#fff' : 'inherit' }}>{children}</button>
);
interface Saqla { (y: TaklifYuki): Promise<void> }
const sonMatn = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 6 }));

/** Bitta qator (yoki "qo'shish" taklifi) uchun muharrir. Saqlash = taklif yozuvi; bo'sh saqlash = taklifni olib tashlash. */
function TaklifMuharriri({ qator, joriy, saqla, yop, qosh }: { qator: { qator_id: number; nom: string | null }; joriy: PanelTaklif | null; saqla: Saqla; yop: () => void; qosh: boolean }) {
  const [bayroq, setBayroq] = useState<Bayroq | null>(joriy?.bayroq ?? null);
  const [rang, setRang] = useState<Rang | null>(joriy?.rang ?? null);
  const [izoh, setIzoh] = useState(joriy?.izoh ?? '');
  const [hajm, setHajm] = useState(joriy?.taklif_hajm != null ? String(joriy.taklif_hajm) : '');
  const [hujjat, setHujjat] = useState(joriy?.hujjat_turi ?? '');
  const [band, setBand] = useState(false);
  const hajmSon = hajm.trim() === '' ? null : Number(hajm.replace(',', '.'));
  const hajmXato = hajmSon != null && (!Number.isFinite(hajmSon) || hajmSon < 0);
  const hujjatKerak = bayroq === 'hujjat_kerak' && !hujjat.trim();
  const yubor = async () => {
    setBand(true);
    try { await saqla({ qator_id: qator.qator_id, bayroq: bayroq ?? (hajmSon != null ? 'hajm_notogri' : null), izoh: izoh.trim() || null, taklif_hajm: hajmSon, rang, hujjat_turi: bayroq === 'hujjat_kerak' ? hujjat.trim() : null, qosh }); yop(); }
    finally { setBand(false); }
  };
  return (
    <div className="flex flex-col gap-2 pt-2" style={{ borderTop: '1px dashed var(--border, #d0d7de)' }}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('Belgi')}>
        {BAYROQLAR.map((b) => <Chip key={b} on={bayroq === b} onClick={() => setBayroq(bayroq === b ? null : b)}>{t(BAYROQ_MATN[b])}</Chip>)}
      </div>
      {bayroq === 'hujjat_kerak' && (
        <div className="flex flex-col gap-1">
          <input className="fz-input" list="tekshiruv-hujjat-turlari" value={hujjat} onChange={(e) => setHujjat(e.target.value)} maxLength={80} placeholder={t('Qaysi hujjat kerak (lab xulosasi, akt razbivka, faktura…)')} aria-label={t('Kerakli hujjat turi')} />
          <datalist id="tekshiruv-hujjat-turlari">{HUJJAT_TURLARI.map((h) => <option key={h} value={t(h)} />)}</datalist>
        </div>
      )}
      <label className="flex flex-col gap-1 text-[13px]">{t('Taklif qilingan hajm')}
        <input className="fz-input" inputMode="decimal" value={hajm} onChange={(e) => setHajm(e.target.value)} aria-invalid={hajmXato} placeholder={t('masalan: 1 (fakt 1 km)')} />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">{t('Izoh')}
        <textarea className="fz-input" rows={2} maxLength={1000} value={izoh} onChange={(e) => setIzoh(e.target.value)} placeholder={t('hajm loyiha bilan mos emas, lab xulosasi kerak…')} />
      </label>
      <div className="flex flex-wrap gap-2 items-center" role="group" aria-label={t('Rang')}>
        {RANGLAR.map((r) => <Chip key={r} rang={RANG_STIL[r]} on={rang === r} onClick={() => setRang(rang === r ? null : r)}>{r}</Chip>)}
      </div>
      <div className="flex gap-2">
        <button type="button" className="fz-btn fz-btn--primary" disabled={band || hajmXato || hujjatKerak} onClick={() => void yubor()}>{t('Saqlash')}</button>
        <button type="button" className="fz-btn" onClick={yop}>{t('Yopish')}</button>
      </div>
    </div>
  );
}

function QatorKarta({ q, takliflar, saqla, mening }: { q: PanelQator; takliflar: PanelTaklif[]; saqla: Saqla; mening: boolean }) {
  const [ochiq, setOchiq] = useState(false);
  const t0 = takliflar[0] ?? null;
  const qulf = t0 != null && t0.qaror !== 'kutilmoqda';
  return (
    <Karta rang={t0?.rang ? RANG_STIL[t0.rang] : undefined}>
      <button type="button" className="text-left bg-transparent border-0 p-0 flex flex-col gap-1" style={{ minHeight: 44, color: 'inherit' }} onClick={() => setOchiq((v) => !v)} aria-expanded={ochiq}>
        <span className="text-[12px] opacity-70">{q.kod ?? ''} · {q.tur.toUpperCase()}</span>
        <span className="text-[14px] font-medium">{q.nom}</span>
        <span className="text-[13px]">{sonMatn(q.hajm)} {q.birlik ?? ''}</span>
      </button>
      {takliflar.map((x) => (
        <div key={x.id} className="text-[13px] flex flex-col gap-1">
          <div className="flex flex-wrap gap-2 items-center">
            {x.bayroq && <span className="rounded px-2" style={{ background: '#ddf4ff' }}>{t(BAYROQ_MATN[x.bayroq])}{x.hujjat_turi ? ` · ${x.hujjat_turi}` : ''}</span>}
            {x.taklif_hajm != null && <span className="rounded px-2" style={{ background: '#fff8c5' }}>{t('Taklif')}: {sonMatn(x.taklif_hajm)}</span>}
            {x.qaror !== 'kutilmoqda' && <span className="rounded px-2" style={{ background: x.qaror === 'qabul' ? '#dafbe1' : '#ffebe9' }}>{t(QAROR_MATN[x.qaror])}</span>}
          </div>
          {x.izoh && <p className="m-0">{x.izoh}</p>}
          {x.qaror_sabab && <p className="m-0 opacity-80">{t('PTO izohi')}: {x.qaror_sabab}</p>}
        </div>
      ))}
      {ochiq && mening && !qulf && <TaklifMuharriri qator={{ qator_id: q.qator_id, nom: q.nom }} joriy={t0} saqla={saqla} yop={() => setOchiq(false)} qosh={false} />}
      {ochiq && qulf && <p className="m-0 text-[12px] opacity-70">{t('PTO hal qilgan taklif o‘zgarmaydi.')}</p>}
    </Karta>
  );
}

function QatorQoshish({ token, saqla }: { token: string; saqla: Saqla }) {
  const [q, setQ] = useState('');
  const [natija, setNatija] = useState<Array<{ qator_id: number; kod: string | null; nom: string | null; birlik: string | null; tur: string }>>([]);
  const [tanlangan, setTanlangan] = useState<{ qator_id: number; nom: string | null } | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const qidir = async () => {
    setXato(null);
    const r = await tekshiruvQidir(token, q);
    if (r.ok) setNatija(r.qatorlar); else setXato(tekshiruvXatoMatni(r));
  };
  return (
    <Karta>
      <h2 className="m-0 text-[15px] font-semibold flex items-center gap-2"><Plus size={16} aria-hidden="true" /> {t('Yetishmagan qatorni qo‘shishni taklif qilish')}</h2>
      <div className="flex gap-2">
        <input className="fz-input flex-1" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void qidir(); }} placeholder={t('Smetadan nom yoki kod bo‘yicha qidirish')} aria-label={t('Smetadan qidirish')} />
        <button type="button" className="fz-btn" onClick={() => void qidir()} disabled={q.trim().length < 2} aria-label={t('Qidirish')}><Search size={14} aria-hidden="true" /></button>
      </div>
      {xato && <p role="alert" className="m-0 text-[13px]">{t(xato)}</p>}
      {natija.map((r) => (
        <button key={r.qator_id} type="button" className="text-left border rounded p-2 bg-transparent" style={{ minHeight: 44, borderColor: 'var(--border, #d0d7de)', color: 'inherit' }} onClick={() => setTanlangan({ qator_id: r.qator_id, nom: r.nom })}>
          <span className="text-[12px] opacity-70">{r.kod ?? ''} · {r.tur.toUpperCase()} · {r.birlik ?? ''}</span><br /><span className="text-[14px]">{r.nom}</span>
        </button>
      ))}
      {tanlangan && <><p className="m-0 text-[13px] font-medium">{tanlangan.nom}</p><TaklifMuharriri qator={tanlangan} joriy={null} qosh saqla={saqla} yop={() => { setTanlangan(null); setNatija([]); setQ(''); }} /></>}
    </Karta>
  );
}

export default function TekshiruvPanel() {
  const { token = '' } = useParams();
  const [sp] = useSearchParams();
  const kod = sp.get('k');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['tekshiruv', token], enabled: tokenMi(token), retry: false, queryFn: () => tekshiruvOchish(token) });
  const [xabar, setXabar] = useState<string | null>(null);
  const [kodYuborildi, setKodYuborildi] = useState(false);
  const [berilgan, setBerilgan] = useState<string | null>(null);
  const holatIzoh = useRef<HTMLTextAreaElement>(null);

  // Bir martalik kod bilan kelgan bo'lsa: ruxsat yo'q bo'lganda kod avtomatik ishlatiladi (bir marta).
  const kodXato = q.data && !q.data.ok && q.data.code === 'RUXSAT_YOQ';
  useEffect(() => {
    if (!kodXato || !kod || kodYuborildi || !tokenMi(kod)) return;
    setKodYuborildi(true);
    void tekshiruvKodOl(token, kod).then((r) => { if (r.ok) void qc.invalidateQueries({ queryKey: ['tekshiruv', token] }); else setXabar(tekshiruvXatoMatni(r)); });
  }, [kodXato, kod, kodYuborildi, token, qc]);

  const d = useMemo<PanelJavob | null>(() => (q.data && q.data.ok ? ({ ...q.data } as PanelJavob) : null), [q.data]);
  const takliflar = useMemo(() => takliflarQatorBoyicha(d?.takliflar ?? []), [d]);
  const bolimlar = useMemo(() => bolimlarga(d?.qatorlar ?? []), [d]);
  const mening = d?.rol === 'tekshiruvchi' || d?.rol === 'pto';
  const mHolat = d?.tekshiruvlar.find((x) => x.meniki)?.holat ?? 'qoralama';

  if (!tokenMi(token)) return <Qobiq><Karta><h1 className="m-0 text-[18px] flex items-center gap-2"><ShieldQuestion size={20} aria-hidden="true" /> {t('Topilmadi')}</h1></Karta></Qobiq>;
  if (q.isLoading) return <Qobiq><Karta><p className="m-0" role="status">{t('Yuklanmoqda…')}</p></Karta></Qobiq>;
  if (!d) {
    const x = q.data && !q.data.ok ? q.data : null;
    return (
      <Qobiq><Karta>
        <h1 className="m-0 text-[18px] flex items-center gap-2"><ShieldQuestion size={20} aria-hidden="true" /> {t('Texnik nazorat tekshiruvi')}</h1>
        <p role="alert" className="m-0 text-[14px]">{t(xabar ?? (x ? tekshiruvXatoMatni(x) : 'Bajarib bo‘lmadi. Keyinroq urinib ko‘ring.'))}</p>
        {x?.code === 'SESSIYA_YOQ' && <Link to="/" className="fz-btn fz-btn--primary self-start"><LogIn size={14} aria-hidden="true" /> {t('Kirish')}</Link>}
        {x?.code === 'RUXSAT_YOQ' && <p className="m-0 text-[13px] opacity-80">{t('Ruxsat berish uchun PTO sizga bir martalik havola yuboradi yoki buyurtmachi tomoningizga ruxsat beradi.')}</p>}
      </Karta></Qobiq>
    );
  }

  const yangila = () => qc.invalidateQueries({ queryKey: ['tekshiruv', token] });
  const saqla = async (y: TaklifYuki) => {
    const r = await tekshiruvSaqla(token, y);
    if (!r.ok) { setXabar(tekshiruvXatoMatni(r)); throw new Error(r.code); }
    setXabar(null); await yangila();
  };
  const holatQoy = async (h: TekshiruvHolat) => {
    const r = await tekshiruvHolat(token, h, holatIzoh.current?.value ?? null);
    setXabar(r.ok ? null : tekshiruvXatoMatni(r)); if (r.ok) await yangila();
  };
  const kodBer = async () => {
    const r = await tekshiruvKodBer(token, null, 72);
    if (r.ok) setBerilgan(tekshiruvHavolasi(window.location.origin, token, r.kod)); else setXabar(tekshiruvXatoMatni(r));
  };

  return (
    <Qobiq>
      <Karta>
        <h1 className="m-0 text-[18px] font-semibold flex items-center gap-2"><ClipboardCheck size={20} aria-hidden="true" /> {t('Texnik nazorat tekshiruvi')}</h1>
        <p className="m-0 text-[14px]">{d.obyekt.nom} · {t('F-2')} № {d.akt.raqam ?? d.akt.id} · {(d.akt.oy ?? '').slice(0, 7)} · {d.kompaniya}</p>
        <p className="m-0 text-[12px] opacity-70">{t('Siz faqat taklif yozasiz: F-2 ga PTO qaror qilgandan keyingina o‘zgartirish kiradi.')}</p>
        {d.akt.eskirgan && <p role="status" className="m-0 text-[13px] flex items-center gap-2" style={{ color: '#9a6700' }}><AlertTriangle size={16} aria-hidden="true" /> {t('F-2 shu QR chiqarilgandan keyin o‘zgargan (versiya {a} → {b}). Qatorlar joriy F-2 dan.', { a: d.bog.akt_versiya, b: d.akt.versiya })}</p>}
        {xabar && <p role="alert" className="m-0 text-[13px]" style={{ color: '#cf222e' }}>{t(xabar)}</p>}
      </Karta>

      {d.rol === 'pto' && (
        <Karta>
          <p className="m-0 text-[13px]">{t('Siz PTO tomonidansiz: takliflarni F-2 qoralama muharririda hal qilasiz.')}</p>
          <div className="flex flex-wrap gap-2">
            <Link className="fz-btn fz-btn--primary" to={`/admin/f2-tayyorlash?obyekt=${d.obyekt.id}&akt=${d.akt.id}`}>{t('F-2 muharririni ochish')}</Link>
            <button type="button" className="fz-btn" onClick={() => void kodBer()}>{t('Tekshiruvchiga bir martalik havola')}</button>
          </div>
          {berilgan && <input className="fz-input" readOnly value={berilgan} onFocus={(e) => e.currentTarget.select()} aria-label={t('Bir martalik havola')} />}
          <p className="m-0 text-[12px] opacity-70">{t('Takliflar')}: {d.takliflar.length} · {t('Tekshiruvchilar')}: {d.tekshiruvlar.map((x) => `${x.tekshiruvchi} (${t(HOLAT_MATN[x.holat])})`).join(', ') || '—'}</p>
        </Karta>
      )}

      {bolimlar.map((b) => (
        <div key={b.bolim} className="flex flex-col gap-2">
          {b.bolim && <h2 className="m-0 mt-2 text-[14px] font-semibold">{b.bolim}</h2>}
          {b.qatorlar.map((x) => <QatorKarta key={x.akt_qator_id} q={x} takliflar={takliflar.get(x.qator_id) ?? []} saqla={saqla} mening={mening && d.rol === 'tekshiruvchi'} />)}
        </div>
      ))}
      {d.qatorlar.length === 0 && <Karta><p className="m-0 text-[14px]">{t('Bu F-2 da qator yo‘q.')}</p></Karta>}

      {d.rol === 'tekshiruvchi' && <QatorQoshish token={token} saqla={saqla} />}
      {/* PTO "qo'shish" takliflarini ham ko'radi (qatori F-2 da yo'q): */}
      {d.takliflar.filter((x) => x.qosh).map((x) => (
        <Karta key={x.id} rang="#0969da"><span className="text-[12px] opacity-70">{t('Qo‘shish taklifi')} · {x.kod ?? ''}</span><span className="text-[14px]">{x.nom}</span>{x.izoh && <p className="m-0 text-[13px]">{x.izoh}</p>}{x.taklif_hajm != null && <span className="text-[13px]">{t('Taklif')}: {sonMatn(x.taklif_hajm)} {x.birlik ?? ''}</span>}{x.qaror !== 'kutilmoqda' && <span className="text-[13px]">{t(QAROR_MATN[x.qaror])}{x.qaror_sabab ? ` — ${x.qaror_sabab}` : ''}</span>}</Karta>
      ))}

      {d.rol === 'tekshiruvchi' && (
        <Karta>
          <h2 className="m-0 text-[15px] font-semibold flex items-center gap-2"><CheckCircle2 size={16} aria-hidden="true" /> {t('Umumiy xulosa')}: {t(HOLAT_MATN[mHolat])}</h2>
          <textarea ref={holatIzoh} className="fz-input" rows={2} maxLength={2000} placeholder={t('Umumiy izoh (ixtiyoriy)')} aria-label={t('Umumiy izoh')} defaultValue={d.tekshiruvlar.find((x) => x.meniki)?.izoh ?? ''} />
          <div className="flex flex-wrap gap-2">
            {(['korib_chiqildi', 'qaytarildi', 'qabul'] as const).map((h) => <button key={h} type="button" className={h === 'qabul' ? 'fz-btn fz-btn--primary' : 'fz-btn'} style={{ minHeight: 44 }} onClick={() => void holatQoy(h)}>{t(HOLAT_MATN[h])}</button>)}
          </div>
        </Karta>
      )}
    </Qobiq>
  );
}
