/**
 * TestF2.tsx — TIZIM_02: SMETA / FAKT / F2 / QOLDIQ
 * ═══════════════════════════════════════════════════════════════════
 *
 * Reja (TIZIM_02_TAHLIL_VA_REJA.md) E bosqichi. Tizim_01 dagi eng
 * qimmatli ish sikli shu: smeta → bajarilgani (FAKT) → topshirilgani
 * (F2) → qoldiq.
 *
 * ⚠️ UCH QAT'IY QOIDA — tarixdan olingan, takrorlanmasin:
 *
 *  1. F2 O'Z NARXIDA. Akt summasi aktning o'z narxidan hisoblanadi,
 *     smeta narxidan EMAS. Avval smeta narxi ishlatilgani uchun akt
 *     2.11 mlrd bo'lsa panel 2.43 mlrd ko'rsatgan.
 *
 *  2. MANFIY HAJM RUXSAT. ПЕРЕРАСЧЁТ korrektirovkasi manfiy keladi.
 *     Tizim_01 da 4 joyda `>0` to'sig'i bor edi va bunday qatorlar jim
 *     tushib qolardi.
 *
 *  3. REESTR KAFOLATI. Hujjatda yozilgan jami ↔ bazaga tushgan jami
 *     solishtiriladi. Hujjat jami noma'lum bo'lsa «mos» DEB
 *     AYTILMAYDI — tekshirishning ikkinchi tomoni yo'q.
 *
 * Bu sahifa hozircha FAQAT O'QIYDI. F2 import yo'li keyingi qadam.
 */
import { useCallback, useEffect, useState } from 'react';
import { matnSora } from '../umumiy/ui/Tasdiq';
import {
  AlertTriangle, CheckCircle, RefreshCw, FileText, TrendingUp, Search,
  Plus, Ban, XCircle,
} from 'lucide-react';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { FmtN } from '../lib/format';
import {
  sbOqi, sbT2ObyektlarOlKomp, sbT2AktYarat, sbT2AktTasdiqlash, sbT2AktBekor,
  sbT2AktReestrOl, yangiOperationId, type T2Obyekt, type AktNatija, type T2AktReestr,
} from '../api/supabase';
import { toast } from '../umumiy/ui/Toast';
import { useKompaniya } from './KompaniyaTanlov';

type QatorHolat = {
  id: number; tur: string; raqam: string | null; nom: string | null;
  birlik: string | null; kat: string | null;
  smeta_summa: number | null; fakt_summa: number; f2_summa: number;
  qoldiq_summa: number | null; f2_mumkin_summa: number;
  /* Yozish uchun: chegara SUMMA emas, HAJM bo'yicha tekshiriladi */
  smeta_hajm: number | null; smeta_narx: number | null;
  fakt_hajm: number; f2_hajm: number; f2_mumkin_hajm: number;
};

/* ⚠️ 2026-08-27: mahalliy shakl o'rniga `sbT2AktReestrOl` ning haqiqiy
   javob turi (`T2AktReestr`) ishlatiladi — ikkisi ajralib ketmasin. */
type Reestr = T2AktReestr;

const REESTR_RANG: Record<string, string> = {
  mos: 'text-ok',
  farq: 'text-danger',
  jami_nomalum: 'text-warn',
};
const REESTR_MATN: Record<string, string> = {
  mos: 'mos',
  farq: 'FARQ BOR',
  jami_nomalum: 'hujjat jami noma\'lum',
};

export default function TestF2() {
  const { joriy, yuklanmoqda: kompYuk } = useKompaniya();
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [obyektId, setObyektId] = useState<number | null>(null);

  const [qatorlar, setQatorlar] = useState<QatorHolat[] | null>(null);
  const [reestr, setReestr] = useState<Reestr[]>([]);
  const [qidiruv, setQidiruv] = useState('');
  const [yuk, setYuk] = useState(false);
  const [xato, setXato] = useState('');

  /* ── HUJJAT YARATISH ──
   * Bu sahifa avval faqat o'qirdi. Endi yozadi ham — backend
   * (t2_akt_yarat / tasdiqlash / bekor) tayyor va sinovdan o'tgan. */
  const [ochiq, setOchiq] = useState(false);
  const [tur, setTur] = useState<'fakt' | 'f2'>('fakt');
  const [oy, setOy] = useState(() => new Date().toISOString().slice(0, 7));
  const [raqam, setRaqam] = useState('');
  const [kiritilgan, setKiritilgan] = useState<Record<number, string>>({});
  const [yubor, setYubor] = useState(false);
  const [natija, setNatija] = useState<AktNatija | null>(null);
  /* ⚠️ Oqim boshlanganda BIR MARTA yaratiladi va qayta urinishda
     O'ZGARMAYDI — aks holda takroriy so'rov ikkinchi hujjat yasardi. */
  const [opId, setOpId] = useState('');

  /** Shu qatorda hozir nechta olish mumkin (HAJM bo'yicha). */
  const qolgan = (r: QatorHolat) =>
    tur === 'fakt'
      ? (Number(r.smeta_hajm) || 0) - (Number(r.fakt_hajm) || 0)
      : Number(r.f2_mumkin_hajm) || 0;

  const yangiBoshla = () => {
    setOchiq(true); setNatija(null); setKiritilgan({});
    setOpId(yangiOperationId());
  };

  const yubormoq = async () => {
    if (!obyektId) return;
    const qat = Object.entries(kiritilgan)
      .map(([id, v]) => ({ qator_id: Number(id), hajm: v }))
      /* Bo'sh va nol tashlanadi, MANFIY qoladi — ПЕРЕРАСЧЁТ haqiqiy hujjat */
      .filter((x) => x.hajm !== '' && Number(x.hajm) !== 0 && Number.isFinite(Number(x.hajm)));
    if (!qat.length) { toast('Bironta qator kiritilmagan', 'warn'); return; }

    setYubor(true);
    const r = await sbT2AktYarat({
      obyektId, tur, oy: oy + '-01', qatorlar: qat,
      operationId: opId, raqam: raqam.trim() || undefined,
    });
    setYubor(false); setNatija(r);
    if (r.ok) {
      toast(r.takror ? 'Bu hujjat allaqachon yaratilgan'
                     : 'Hujjat yaratildi (qoralama)', 'ok');
      setOchiq(false); yukla();
    } else {
      toast(r.xabar || r.error || 'Yaratilmadi', 'danger', undefined, 9000);
    }
  };

  const tasdiqla = async (a: Reestr) => {
    const r = await sbT2AktTasdiqlash(a.id, a.versiya);
    setNatija(r);
    toast(r.ok ? (r.takror ? 'Allaqachon tasdiqlangan' : 'Tasdiqlandi')
               : (r.xabar || r.error || 'Tasdiqlanmadi'),
          r.ok ? 'ok' : 'danger', undefined, 9000);
    yukla();
  };

  const bekorQil = async (a: Reestr) => {
    const sabab = await matnSora({ matn: 'Bekor qilish sababi:', tasdiqMatni: 'Bekor qilish', xavfli: true });
    if (sabab == null) return;
    const r = await sbT2AktBekor(a.id, sabab, a.versiya);
    toast(r.ok ? 'Bekor qilindi' : (r.xabar || r.error || 'Bekor qilinmadi'),
          r.ok ? 'ok' : 'danger', undefined, 9000);
    yukla();
  };

  useEffect(() => {
    if (kompYuk) return;
    if (!joriy?.id) { setObyektlar([]); setObyektId(null); return; }
    sbT2ObyektlarOlKomp(joriy.id).then((r) => {
      if (!r.ok) return;
      const o = (r.qatorlar as T2Obyekt[]) || [];
      setObyektlar(o);
      setObyektId((oldingi) => oldingi ?? (o[0]?.id ?? null));
    });
  }, [joriy?.id, kompYuk]);

  const yukla = useCallback(async () => {
    if (!obyektId) return;
    setYuk(true); setXato('');

    const [q, r] = await Promise.all([
      sbOqi<QatorHolat>({
        jadval: 't2_qator_holat',
        /* Faqat bajariladigan turlar — razdel/blok jamlanma, ular
           bolalarining yig'indisi va ikki marta sanalardi. */
        filtr: 'obyekt_id=eq.' + obyektId + '&tur=in.(rs,mat,ob)',
        ustunlar: 'id,tur,raqam,nom,birlik,kat,smeta_summa,fakt_summa,' +
 'f2_summa,qoldiq_summa,f2_mumkin_summa,' +
 'smeta_hajm,smeta_narx,fakt_hajm,f2_hajm,f2_mumkin_hajm',
        tartib: 'raqam.asc', limit: 20000,
      }),
      sbT2AktReestrOl(obyektId),
    ]);

    setYuk(false);
    if (!q.ok) { setXato(q.error || 'O\'qilmadi'); return; }
    setQatorlar((q.qatorlar as QatorHolat[]) || []);
    setReestr(r.ok ? ((r.qatorlar as Reestr[]) || []) : []);
  }, [obyektId]);

  useEffect(() => { yukla(); }, [yukla]);

  const jami = (qatorlar || []).reduce((a, x) => ({
    smeta: a.smeta + (Number(x.smeta_summa) || 0),
    fakt: a.fakt + (Number(x.fakt_summa) || 0),
    f2: a.f2 + (Number(x.f2_summa) || 0),
  }), { smeta: 0, fakt: 0, f2: 0 });
  const qoldiq = jami.smeta - jami.fakt;
  const f2Mumkin = jami.fakt - jami.f2;

  const suz = (qatorlar || []).filter((x) => {
    const s = qidiruv.trim().toLowerCase();
    if (!s) return true;
    return String(x.nom || '').toLowerCase().includes(s);
  });
  /* Ish boshlangan qatorlar tepada — bo'sh ro'yxatni varaqlash foydasiz */
  const faol = suz.filter((x) => Number(x.fakt_summa) || Number(x.f2_summa));

  const KATAK = ({ nom, val, rang }: { nom: string; val: number; rang?: string }) => (
    <div className="karta p-3">
      <div className="text-[11px] text-text-dim mb-1">{nom}</div>
      <div className={'text-[15px] font-medium tabular-nums ' + (rang || 'text-text')}>
        <FmtN val={val} />
      </div>
    </div>
  );

  return (
    <Sahifa
      sarlavha="F2 / Fakt (Tizim_02)"
      tavsif="Smeta → bajarilgani → topshirilgani → qoldiq"
      amallar={
        <button onClick={yukla} disabled={yuk || !obyektId}
          className="h-9 px-3 inline-flex items-center gap-2 rounded-[10px] karta text-sm
                     text-text hover:border-[var(--accent)]/50 transition-colors
                     disabled:opacity-50">
          <RefreshCw size={15} className={yuk ? 'animate-spin' : ''} /> Yangilash
        </button>
      }
    >
      <div className="space-y-3">
        <div className="karta p-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <label className="text-[12px] font-medium text-text block mb-1.5">Obyekt</label>
            <select value={obyektId ?? ''} onChange={(e) => setObyektId(Number(e.target.value))}
              className="w-full bg-[var(--surface-2)] border border-border rounded-lg
                         px-3 py-2 text-[13px] text-text outline-none focus:border-accent/50">
              {!obyektlar.length && <option value="">— obyekt yo'q —</option>}
              {obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="text-[12px] font-medium text-text block mb-1.5">Qidiruv</label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute" />
              <input value={qidiruv} onChange={(e) => setQidiruv(e.target.value)}
                placeholder="resurs nomi…"
                className="w-full bg-[var(--surface-2)] border border-border rounded-lg
                           pl-7 pr-3 py-2 text-[13px] text-text outline-none focus:border-accent/50" />
            </div>
          </div>
        </div>

        {xato && (
          <div className="karta p-4 border-danger/40 bg-danger/5">
            <p className="text-[13px] text-danger flex items-center gap-2">
              <AlertTriangle size={15} /> {xato}
            </p>
          </div>
        )}

        {/* ── JAMLANMA ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <KATAK nom="СМЕТА" val={jami.smeta} />
          <KATAK nom="ФАКТ (bajarilgan)" val={jami.fakt} />
          <KATAK nom="Ф2 (topshirilgan)" val={jami.f2} />
          <KATAK nom="ҚОЛДИҚ (смета − факт)" val={qoldiq}
                 rang={qoldiq < 0 ? 'text-danger' : 'text-text'} />
          <KATAK nom="Ф2 МУМКИН (факт − ф2)" val={f2Mumkin}
                 rang={f2Mumkin < 0 ? 'text-danger' : 'text-ok'} />
        </div>

        {jami.fakt === 0 && jami.f2 === 0 && (
          <div className="karta p-4">
            <p className="text-[12px] text-text-mute">
              Bu obyektga hali FAKT yoki F2 kiritilmagan — shuning uchun bajarilgan
              va topshirilgan 0. Smeta esa{' '}
              <b className="text-text"><FmtN val={jami.smeta} /></b> so'm.
            </p>
          </div>
        )}

        {/* ── REESTR: qancha kirdi = qancha tushdi ── */}
        <div className="karta p-3">
          <p className="text-[12px] font-medium text-text mb-2 flex items-center gap-2">
            <FileText size={14} className="text-accent" />
            Hujjatlar reestri ({reestr.length})
            <button onClick={yangiBoshla} disabled={!obyektId}
              className="ml-auto px-3 py-1 rounded-lg bg-accent text-[var(--on-accent)] text-[12px]
                         font-medium hover:bg-accent/90 disabled:opacity-40
                         inline-flex items-center gap-1.5">
              <Plus size={13} /> Yangi hujjat
            </button>
          </p>
          <p className="text-[11px] text-text-mute mb-2">
            Har hujjat uchun: hujjatda yozilgan jami ↔ bazaga tushgan jami.
            Hujjat jami noma'lum bo'lsa «mos» deb aytilmaydi — tekshirishning
            ikkinchi tomoni yo'q.
          </p>
          {!reestr.length ? (
            <p className="text-[12px] text-text-mute italic">Hujjat kiritilmagan.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] min-w-[640px]">
                <thead>
                  <tr className="border-b border-border text-text-dim">
                    <th className="text-left py-1.5 font-medium w-16">Tur</th>
                    <th className="text-left py-1.5 font-medium w-24">Raqam</th>
                    <th className="text-left py-1.5 font-medium w-24">Oy</th>
                    <th className="text-right py-1.5 font-medium">Hujjatda</th>
                    <th className="text-right py-1.5 font-medium">Bazada</th>
                    <th className="text-right py-1.5 font-medium">Farq</th>
                    <th className="text-left py-1.5 font-medium w-36">Holat</th>
                    <th className="text-right py-1.5 font-medium w-32">Amal</th>
                  </tr>
                </thead>
                <tbody>
                  {reestr.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="py-1 text-text uppercase">{a.tur}</td>
                      <td className="py-1 text-text-dim">{a.raqam || '—'}</td>
                      <td className="py-1 text-text-mute">{String(a.oy).slice(0, 7)}</td>
                      <td className="py-1 text-right tabular-nums text-text-dim">
                        {a.hujjat_jami == null
                          ? <span className="text-warn">noma'lum</span>
                          : <FmtN val={Number(a.hujjat_jami)} />}
                      </td>
                      <td className="py-1 text-right tabular-nums text-text">
                        <FmtN val={Number(a.yozilgan_jami) || 0} />
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {a.farq == null ? '—' : <FmtN val={Number(a.farq)} />}
                      </td>
                      <td className={'py-1 ' + (REESTR_RANG[a.reestr_holat] || 'text-text-mute')}>
                        {REESTR_MATN[a.reestr_holat] || a.reestr_holat}
                        {!!a.manfiy_qator && (
                          <span className="text-text-mute"> · {a.manfiy_qator} manfiy</span>
                        )}
                        {!!a.narxsiz_qator && (
                          <span className="text-warn"> · {a.narxsiz_qator} narxsiz</span>
                        )}
                        <div className="text-[10px] text-text-mute">{a.holat}</div>
                      </td>
                      <td className="py-1 text-right whitespace-nowrap">
                        {a.holat === 'qoralama' && (
                          <button onClick={() => tasdiqla(a)}
                            className="text-[11px] text-ok hover:underline mr-2">
                            Tasdiqlash
                          </button>
                        )}
                        {a.holat !== 'bekor' && (
                          <button onClick={() => bekorQil(a)}
                            className="text-[11px] text-text-mute hover:text-danger
                                       inline-flex items-center gap-1">
                            <Ban size={11} /> Bekor
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── QATORLAR ── */}
        <div className="karta p-3">
          <p className="text-[12px] font-medium text-text mb-2 flex items-center gap-2">
            <TrendingUp size={14} className="text-accent" />
            Ish boshlangan qatorlar ({faol.length} / {suz.length})
          </p>
          {yuk && !qatorlar && <div className="skel h-24 rounded" />}
          {!!qatorlar && !faol.length && (
            <p className="text-[12px] text-text-mute italic">
              Hali bironta qatorga fakt yoki f2 kiritilmagan.
            </p>
          )}
          {!!faol.length && (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-[11px] min-w-[720px]">
                <thead className="sticky top-0 bg-[var(--surface-1)]">
                  <tr className="border-b border-border text-text-dim">
                    <th className="text-left py-1.5 font-medium w-14">№</th>
                    <th className="text-left py-1.5 font-medium">Resurs</th>
                    <th className="text-left py-1.5 font-medium w-16">Birlik</th>
                    <th className="text-right py-1.5 font-medium">Смета</th>
                    <th className="text-right py-1.5 font-medium">Факт</th>
                    <th className="text-right py-1.5 font-medium">Ф2</th>
                    <th className="text-right py-1.5 font-medium">Қолдиқ</th>
                    <th className="text-right py-1.5 font-medium">Ф2 мумкин</th>
                  </tr>
                </thead>
                <tbody>
                  {faol.slice(0, 400).map((x) => (
                    <tr key={x.id} className="border-b border-border last:border-0">
                      <td className="py-1 text-text-mute">{x.raqam || ''}</td>
                      <td className="py-1 text-text truncate max-w-[260px]">{x.nom}</td>
                      <td className="py-1 text-text-mute">{x.birlik}</td>
                      <td className="py-1 text-right tabular-nums text-text-dim">
                        <FmtN val={Number(x.smeta_summa) || 0} />
                      </td>
                      <td className="py-1 text-right tabular-nums text-text">
                        <FmtN val={Number(x.fakt_summa) || 0} />
                      </td>
                      <td className="py-1 text-right tabular-nums text-text">
                        <FmtN val={Number(x.f2_summa) || 0} />
                      </td>
                      <td className={'py-1 text-right tabular-nums ' +
                        (Number(x.qoldiq_summa) < 0 ? 'text-danger' : 'text-text-dim')}>
                        {x.qoldiq_summa == null ? '—' : <FmtN val={Number(x.qoldiq_summa)} />}
                      </td>
                      <td className={'py-1 text-right tabular-nums ' +
                        (Number(x.f2_mumkin_summa) < 0 ? 'text-danger' : 'text-ok')}>
                        <FmtN val={Number(x.f2_mumkin_summa) || 0} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {faol.length > 400 && (
                <p className="text-[10px] text-text-mute pt-1">
                  … va yana {faol.length - 400} ta
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── INVARIANT BUZILISHI ──
          * Baza yozishni RAD ETSA sabab shu yerda ko'rinadi. Buni
          * yashirib bo'lmaydi: odam nima uchun yozilmaganini bilmasa,
          * nosozlik deb o'ylab qayta-qayta bosadi. */}
        {natija && !natija.ok && !!natija.buzilish?.length && (
          <div className="karta p-3 border-danger/40 bg-danger/5">
            <p className="text-[12px] text-danger flex items-center gap-2 mb-1.5">
              <XCircle size={14} /> {natija.xabar}
            </p>
            <div className="max-h-48 overflow-auto space-y-0.5">
              {natija.buzilish.map((b, i) => (
                <p key={i} className="text-[11px] text-text-dim">
                  <span className="text-text">{b.nom}</span>{' — '}
                  {b.jami != null
                    ? <>jami <b>{b.jami}</b></>
                    : <>bor {b.bor}, qo'shilmoqda <b>{b.qoshilmoqda}</b></>}
                  {', chegara '}<b className="text-warn">{b.chegara}</b>
                </p>
              ))}
            </div>
            {natija.maslahat && (
              <p className="text-[11px] text-text-mute mt-1.5">{natija.maslahat}</p>
            )}
          </div>
        )}

        {/* ── YANGI HUJJAT ── */}
        {ochiq && (
          <div className="karta p-3">
            <p className="text-[12px] font-medium text-text mb-2">Yangi hujjat</p>

            <div className="flex flex-wrap items-end gap-2 mb-2">
              <div>
                <label className="text-[11px] text-text-dim block mb-1">Turi</label>
                <select value={tur}
                  onChange={(e) => { setTur(e.target.value as 'fakt' | 'f2'); setKiritilgan({}); }}
                  className="bg-[var(--surface-2)] border border-border rounded-lg px-2.5 py-1.5
                             text-[12px] text-text outline-none">
                  <option value="fakt">ФАКТ — bajarilgan ish</option>
                  <option value="f2">Ф2 — topshiriladigan</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-text-dim block mb-1">Oy</label>
                <input type="month" value={oy} onChange={(e) => setOy(e.target.value)}
                  className="bg-[var(--surface-2)] border border-border rounded-lg px-2.5 py-1.5
                             text-[12px] text-text outline-none" />
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="text-[11px] text-text-dim block mb-1">Hujjat №</label>
                <input value={raqam} onChange={(e) => setRaqam(e.target.value)}
                  placeholder="ixtiyoriy"
                  className="w-full bg-[var(--surface-2)] border border-border rounded-lg
                             px-2.5 py-1.5 text-[12px] text-text outline-none" />
              </div>
            </div>

            <div className="max-h-80 overflow-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-[var(--surface-1)]">
                  <tr className="border-b border-border text-text-dim">
                    <th className="text-left py-1.5 font-medium">Resurs</th>
                    <th className="text-left py-1.5 font-medium w-16">Бирлик</th>
                    <th className="text-right py-1.5 font-medium w-20">Смета</th>
                    <th className="text-right py-1.5 font-medium w-20">
                      {tur === 'fakt' ? 'Факт' : 'Ф2'}
                    </th>
                    <th className="text-right py-1.5 font-medium w-20">Қолган</th>
                    <th className="text-right py-1.5 font-medium w-24">Ҳажм</th>
                  </tr>
                </thead>
                <tbody>
                  {suz.slice(0, 400).map((r) => {
                    const q = qolgan(r);
                    return (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="py-1 text-text truncate max-w-[240px]" title={r.nom || ''}>
                          {r.nom}
                          {/* Narx o'zidan to'qilmaydi — narxsizligi ko'rinib tursin */}
                          {r.smeta_narx == null && <span className="text-warn ml-1">нарх йўқ</span>}
                        </td>
                        <td className="py-1 text-text-mute">{r.birlik}</td>
                        <td className="py-1 text-right tabular-nums text-text-dim">
                          {r.smeta_hajm ?? ''}
                        </td>
                        <td className="py-1 text-right tabular-nums text-text-dim">
                          {tur === 'fakt' ? r.fakt_hajm : r.f2_hajm}
                        </td>
                        <td className={'py-1 text-right tabular-nums ' +
                          (Math.abs(q) > 0.000001 ? 'text-ok' : 'text-text-mute')}>
                          {Math.round(q * 1e6) / 1e6}
                        </td>
                        <td className="py-1 text-right">
                          {/* ⚠️ type=text — `number` maydoni ba'zi brauzerlarda
                              manfiy va kasrni chetlab o'tadi, ПЕРЕРАСЧЁТ esa
                              aynan manfiy bo'ladi. */}
                          <input value={kiritilgan[r.id] ?? ''}
                            onChange={(e) => setKiritilgan((oldin) =>
                              ({ ...oldin, [r.id]: e.target.value }))}
                            placeholder="0"
                            className="w-20 text-right bg-[var(--surface-2)] border border-border
                                       rounded px-1.5 py-0.5 text-[11px] text-text outline-none
                                       focus:border-accent/50" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {suz.length > 400 && (
                <p className="text-[10px] text-text-mute pt-1">
                  … va yana {suz.length - 400} ta — yuqoridagi qidiruvdan foydalaning
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2
                            border-t border-border">
              <span className="text-[11px] text-text-mute">
                {Object.values(kiritilgan).filter((v) => v !== '' && Number(v) !== 0).length} qator
                {' · '}manfiy hajm mumkin (ПЕРЕРАСЧЁТ)
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setOchiq(false)}
                  className="px-3 py-1.5 rounded-lg border border-border text-[12px]
                             text-text-dim hover:bg-[var(--surface-3)]">
                  Bekor
                </button>
                <button onClick={yubormoq} disabled={yubor}
                  className="px-4 py-1.5 rounded-lg bg-accent text-[var(--on-accent)] text-[12px]
                             font-medium hover:bg-accent/90 disabled:opacity-40">
                  {yubor ? 'Yaratilmoqda…' : 'Hujjat yaratish'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="karta p-3 border-accent/30 bg-accent/5">
          <p className="text-[11px] text-text-dim flex items-start gap-2">
            <CheckCircle size={13} className="text-accent flex-shrink-0 mt-0.5" />
            <span>
              Hujjat <b>qoralama</b> bo'lib yaraladi va tasdiqlangach o'zgarmas
              bo'ladi. Nakopitelniy bazada hisoblanadi: <b>Ф2 ≤ ФАКТ ≤ СМЕТА</b>{' '}
              buzilsa yozilmaydi va qaysi qator buzgani aytiladi. Manfiy
              korrektirovka qabul qilinadi, narxsiz qator 0 emas <b>bo'sh</b> qoladi.
            </span>
          </p>
        </div>
      </div>
    </Sahifa>
  );
}
