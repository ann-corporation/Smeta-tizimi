/**
 * TestAosr.tsx — Ijro hujjatlari: АОСР (ШНК 3.01.01-22 Прил.6) va laboratoriya.
 * ═══════════════════════════════════════════════════════════════════
 * 2026-08-27: birinchi reestr (T1 `45_Hujjatlar.js` dan). 2026-10-01 (egasi):
 * to'liq blank maydonlari, komissiya, Excel (egasining blanki tuzilmasida,
 * kompaniya logosi va kolontitul bilan), laboratoriya — alohida kompaniya
 * (kontragent, roli `laboratoriya`) protokollari, aktlarga bog'lash, invoys summalari.
 *
 * "Aktlar" varag'i:
 *   chap — bajarilgan (FAKT>0) ishlar: yashirin ish belgisi, akt bor/yo'q;
 *          belgilanganlardan yangi akt qoralamasi (ish tavsifi, materiallar);
 *   o'ng — akt reestri; tanlangan akt — to'liq forma + Excel.
 * "Laboratoriya" varag'i: protokollar ro'yxati, forma, aktlarga bog'lash, jami.
 * Qiymat yo'q bo'lsa — bo'sh qoladi (o'ylab topilmaydi); Excel'da to'ldirish chizig'i.
 */
import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Plus, Link2, Unlink, AlertTriangle, CheckCircle2, FileSpreadsheet, Save, FlaskConical, X } from 'lucide-react';
import { sbAosrCoverageOl, sbAosrBekor, sbAosrBogSaqla, type AosrCoverage } from '../api/t2-aosr';
import {
  sbAosrV2Ol, sbAosrYozV2, sbLabProtokollarOl, sbLabProtokolYoz, sbLabProtokolBekor, sbLabProtokolBogSaqla,
  sbKompaniyaLogoOl, SINOV_TURI_NOM, SINOV_NATIJA_NOM,
  type AosrV2, type AosrMalumot, type AosrKomissiyaYozuv, type LabProtokol, type LabProtokolMalumot, type SinovTuri, type SinovNatija,
} from '../api/t2-ijro';
import { sbKontragentlarOl, type Kontragent } from '../api/t2-kontragent';
import { sbT2ObyektlarOlKomp, yangiOperationId, type T2Obyekt } from '../api/supabase';
import { aosrExcel, aosrFaylNomi, aosrKomissiyaTartibi } from '../lib/aosr-export';
import { qoralamaTanlangandan } from '../lib/aosr-qoralama';
import { aosrReestrXlsx, labReestrXlsx } from '../lib/ijro-reestr-export';
import { toast } from '../umumiy/ui/Toast';
import { useKompaniya } from './KompaniyaTanlov';

const ROL_NOMI: Record<string, string> = {
  smo: 'Qurilish-montaj tashkiloti (СМО)', subpudratchi: 'Subpudratchi', bosh_pudratchi: 'Bosh pudratchi',
  texnadzor: 'Texnik nazorat (buyurtmachi)', loyihachi: 'Loyihachi (avtorlik nazorati)', boshqa: 'Boshqa',
};
const TUR_NOMI: Record<AosrV2['tur'], string> = { aosr: 'АОСР (yashirin ishlar)', oraliq_qabul: 'Oraliq qabul (mas’ul konstruksiyalar)', sinov: 'Sinov akti' };
const HOLAT_NOMI: Record<string, string> = { yangi: 'Qoralama', tasdiqlangan: 'Tasdiqlangan', qogoz: 'Qog‘ozda imzolangan', bekor: 'Bekor' };

const inp = 'w-full bg-zinc-800 border border-zinc-700 px-2 py-1.5 rounded text-white text-sm outline-none focus:border-amber-500/60';
const lbl = 'block text-[11px] text-zinc-400 mb-0.5';

type AktForma = AosrMalumot & { id?: number; versiya?: number };

export default function TestAosr() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [varaq, setVaraq] = useState<'akt' | 'lab'>('akt');
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [obyektId, setObyektId] = useState<number | null>(null);
  const [aktlar, setAktlar] = useState<AosrV2[]>([]);
  const [coverage, setCoverage] = useState<AosrCoverage[]>([]);
  const [protokollar, setProtokollar] = useState<LabProtokol[]>([]);
  const [lablar, setLablar] = useState<Kontragent[]>([]);
  const [belgilangan, setBelgilangan] = useState<Set<number>>(new Set());
  const [forma, setForma] = useState<AktForma | null>(null);
  const [pForma, setPForma] = useState<(LabProtokolMalumot & { id?: number; versiya?: number; aosr_ids?: number[] }) | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [faqatAktsiz, setFaqatAktsiz] = useState(false);

  useEffect(() => {
    if (!kompaniyaId) { setObyektlar([]); return; }
    sbT2ObyektlarOlKomp(kompaniyaId).then((r) => {
      const q = r.ok ? r.qatorlar ?? [] : [];
      setObyektlar(q);
      setObyektId((eski) => (eski && q.some((o) => o.id === eski) ? eski : q[0]?.id ?? null));
    });
    sbKontragentlarOl(kompaniyaId).then((r) => setLablar((r.qatorlar ?? []).filter((k) => k.mavqe === 'laboratoriya')));
  }, [kompaniyaId]);

  const yukla = () => {
    if (!obyektId || !kompaniyaId) return;
    setYuklanmoqda(true);
    Promise.all([sbAosrV2Ol(kompaniyaId, obyektId), sbAosrCoverageOl(obyektId), sbLabProtokollarOl(kompaniyaId, obyektId)]).then(([a, c, p]) => {
      setYuklanmoqda(false);
      setAktlar(a.ok ? a.qatorlar ?? [] : []);
      setCoverage(c.ok ? c.qatorlar ?? [] : []);
      setProtokollar(p.ok ? p.qatorlar ?? [] : []);
      setBelgilangan(new Set());
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { yukla(); setForma(null); setPForma(null); }, [obyektId, kompaniyaId]);

  const faolAktlar = aktlar.filter((a) => a.holat !== 'bekor');
  const yashirinAktsiz = coverage.filter((c) => c.yashirin && !c.akt_bor).length;
  const korinadiganIshlar = faqatAktsiz ? coverage.filter((c) => !c.akt_bor) : coverage;

  /** Oxirgi aktning komissiyasi — yangi akt uchun sukut (har safar qayta yozmaslik uchun). */
  const oxirgiKomissiya = (): AosrKomissiyaYozuv[] => {
    const a = faolAktlar.find((x) => Array.isArray(x.komissiya) && x.komissiya.length);
    return a ? a.komissiya.map((k) => ({ ...k })) : aosrKomissiyaTartibi('subpudratchisiz', []).map((k) => ({ rol: String(k.rol) }));
  };
  const keyingiRaqam = () => {
    const sonlar = faolAktlar.map((a) => Number(String(a.raqam ?? '').replace(/\D+/g, ''))).filter((n) => Number.isFinite(n) && n > 0);
    return String((sonlar.length ? Math.max(...sonlar) : 0) + 1);
  };

  const yangiAkt = (tanlanganlardan: boolean) => {
    const q = tanlanganlardan ? coverage.filter((c) => belgilangan.has(c.qator_id)) : [];
    const oxirgi = faolAktlar[0];
    setForma(({
      tur: 'aosr', raqam: keyingiRaqam(), sana: new Date().toISOString().slice(0, 10), blank_varianti: oxirgi?.blank_varianti ?? 'subpudratchisiz',
      loyiha_tashkiloti: oxirgi?.loyiha_tashkiloti ?? '', chetlanishlar: 'Нет', komissiya: oxirgiKomissiya(),
      ...(q.length ? qoralamaTanlangandan(q) : {}),
    }));
  };

  const saqla = async () => {
    if (!forma || !obyektId || !kompaniyaId) return;
    if (!String(forma.ish_nomi ?? '').trim()) { toast('Ish nomini kiriting', 'warn'); return; }
    setSaqlanmoqda(true);
    const { id, versiya, ...malumot } = forma;
    const r = await sbAosrYozV2({ kompaniyaId, obyektId, malumot, id, kutilganVersiya: versiya, operationId: id ? undefined : yangiOperationId() });
    setSaqlanmoqda(false);
    if (!r.ok) { toast(r.sabab === 'versiya' ? 'Akt boshqa joyda o‘zgargan — qayta yuklang' : r.error || 'Xato', 'danger'); return; }
    // Yangi akt belgilangan ishlardan yaratilgan bo'lsa — ularni darhol bog'laymiz.
    if (!id && r.id && belgilangan.size) await sbAosrBogSaqla([r.id], Array.from(belgilangan));
    toast('✓ Akt saqlandi', 'ok');
    setForma(null);
    yukla();
  };

  const excel = async (a: AosrV2) => {
    try {
      const logo = kompaniyaId ? await sbKompaniyaLogoOl(kompaniyaId) : null;
      const bytes = await aosrExcel({
        tur: a.tur, raqam: a.raqam, sana: a.sana, ishNomi: a.ish_nomi, obyektNomi: a.obyekt,
        ishTavsifi: a.ish_tavsifi, smoNomi: joriy?.nom ?? null, loyihaTashkiloti: a.loyiha_tashkiloti,
        loyihaHujjati: a.loyiha_hujjati, materiallar: a.materiallar, chetlanishlar: a.chetlanishlar,
        boshlanishSana: a.boshlanish_sana, tugashSana: a.tugash_sana, keyingiIshlar: a.keyingi_ishlar,
        blankVarianti: a.blank_varianti, komissiya: a.komissiya ?? [],
        protokollar: protokollar.filter((p) => p.aosr_ids?.includes(a.id)).map((p) => ({
          raqam: p.raqam, sana: p.sana, laboratoriya: p.laboratoriya, sinovTuri: p.sinov_turi, natija: p.natija,
        })),
        logo: logo ? { base64: logo.data_b64, ext: logo.mime === 'image/png' ? 'png' : 'jpeg' } : null,
      });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const el = document.createElement('a');
      el.href = url; el.download = aosrFaylNomi(a.obyekt, a.raqam, a.sana); el.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast('Excel yasalmadi: ' + (e instanceof Error ? e.message : String(e)), 'danger');
    }
  };

  /** Reestr Excel (РЕЕСТР АОСР / РЕЕСТР ПРОТОКОЛОВ) — joriy obyekt bo'yicha. */
  const reestr = (tur: 'aosr' | 'lab') => {
    try {
      const obyektNomi = obyektlar.find((o) => o.id === obyektId)?.nom ?? 'Объект';
      const imzo = { pudratchi: joriy?.nom };
      const { bytes, faylNomi } = tur === 'aosr' ? aosrReestrXlsx(aktlar, { obyektNomi, imzo }) : labReestrXlsx(protokollar, { obyektNomi, imzo });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const el = document.createElement('a');
      el.href = url; el.download = faylNomi; el.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast('Reestr yasalmadi: ' + (e instanceof Error ? e.message : String(e)), 'danger');
    }
  };

  const ulash = async () => {
    if (!forma?.id || belgilangan.size === 0) { toast('Aktni oching va kamida bitta ish belgilang', 'warn'); return; }
    const r = await sbAosrBogSaqla([forma.id], Array.from(belgilangan));
    if (r.ok) { toast('✓ ' + (r.yangi_boglanish ?? 0) + ' ta ish ulandi', 'ok'); yukla(); }
    else toast(r.error || 'Xato', 'danger');
  };

  const bekorQil = async (a: AosrV2) => {
    if (!window.confirm(`Akt № ${a.raqam ?? ''} bekor qilinsinmi? (o'chirilmaydi, tarixda qoladi)`)) return;
    const r = await sbAosrBekor(a.id, a.versiya);
    if (r.ok) { toast('Akt bekor qilindi', 'ok'); setForma(null); yukla(); }
    else toast(r.error || 'Xato', 'danger');
  };

  /* ── Laboratoriya ── */
  const pSaqla = async () => {
    if (!pForma || !obyektId || !kompaniyaId) return;
    if (!String(pForma.raqam ?? '').trim()) { toast('Protokol raqamini kiriting', 'warn'); return; }
    setSaqlanmoqda(true);
    const { id, versiya, aosr_ids, ...malumot } = pForma;
    const r = await sbLabProtokolYoz({ kompaniyaId, obyektId, malumot, id, kutilganVersiya: versiya, operationId: id ? undefined : yangiOperationId() });
    if (r.ok && r.id) {
      const eski = protokollar.find((p) => p.id === r.id);
      const b = await sbLabProtokolBogSaqla(kompaniyaId, r.id, aosr_ids ?? [], eski?.qator_ids ?? []);
      if (!b.ok) toast('Protokol saqlandi, lekin aktlarga bog‘lanmadi: ' + (b.error || ''), 'warn');
    }
    setSaqlanmoqda(false);
    if (!r.ok) { toast(r.sabab === 'versiya' ? 'Protokol boshqa joyda o‘zgargan — qayta yuklang' : r.error || 'Xato', 'danger'); return; }
    toast('✓ Protokol saqlandi', 'ok');
    setPForma(null);
    yukla();
  };
  const pBekor = async (p: LabProtokol) => {
    if (!kompaniyaId || !window.confirm(`Protokol № ${p.raqam} bekor qilinsinmi?`)) return;
    const r = await sbLabProtokolBekor(kompaniyaId, p.id, p.versiya);
    if (r.ok) { toast('Protokol bekor qilindi', 'ok'); setPForma(null); yukla(); } else toast(r.error || 'Xato', 'danger');
  };
  const labJami = useMemo(() => {
    const m = new Map<string, { soni: number; summa: number | null; nomalum: number; mosEmas: number }>();
    for (const p of protokollar) {
      const k = p.laboratoriya ?? '— laboratoriya ko‘rsatilmagan —';
      const x = m.get(k) ?? { soni: 0, summa: 0, nomalum: 0, mosEmas: 0 };
      x.soni++;
      if (p.summa == null) x.nomalum++; else x.summa = (x.summa ?? 0) + Number(p.summa);
      if (p.natija === 'mos_emas') x.mosEmas++;
      m.set(k, x);
    }
    return [...m.entries()];
  }, [protokollar]);

  const f = (k: keyof AktForma) => (e: { target: { value: string } }) => setForma((x) => (x ? { ...x, [k]: e.target.value } : x));
  const pf = (k: keyof LabProtokolMalumot) => (e: { target: { value: string } }) => setPForma((x) => (x ? { ...x, [k]: e.target.value } : x));

  return (
    <div className="p-4 bg-zinc-900 text-white min-h-screen">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
        <h1 className="text-xl font-bold text-amber-400 flex items-center gap-2"><ClipboardList /> Ijro hujjatlari</h1>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded border border-zinc-700 text-xs">
            <button onClick={() => setVaraq('akt')} className={'px-3 py-1.5 ' + (varaq === 'akt' ? 'bg-amber-600/30 text-amber-100' : 'bg-zinc-800 text-zinc-400')}>Aktlar (АОСР)</button>
            <button onClick={() => setVaraq('lab')} className={'px-3 py-1.5 inline-flex items-center gap-1 ' + (varaq === 'lab' ? 'bg-amber-600/30 text-amber-100' : 'bg-zinc-800 text-zinc-400')}><FlaskConical size={13} /> Laboratoriya</button>
          </div>
          <select className="bg-zinc-800 border border-zinc-700 p-1.5 rounded text-white text-sm max-w-xs" value={obyektId ?? ''} onChange={(e) => setObyektId(Number(e.target.value))}>
            {obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
        </div>
      </div>

      {yashirinAktsiz > 0 && varaq === 'akt' && (
        <div className="mb-3 flex items-center gap-2 rounded border border-amber-600/40 bg-amber-900/15 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle size={14} /> {yashirinAktsiz} ta yashirin ish bajarilgan, lekin АОСР yo‘q. F2 bloklanmaydi — faqat ogohlantirish.
        </div>
      )}

      {yuklanmoqda ? <div className="text-zinc-500 animate-pulse">Yuklanmoqda…</div> : varaq === 'akt' ? (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
          {/* CHAP: bajarilgan ishlar */}
          <div className="bg-black border border-zinc-800 rounded-lg overflow-hidden">
            <div className="p-2.5 bg-zinc-800 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-sm">Bajarilgan ishlar</h2>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-zinc-400 flex items-center gap-1"><input type="checkbox" checked={faqatAktsiz} onChange={(e) => setFaqatAktsiz(e.target.checked)} /> faqat aktsiz</label>
                <button onClick={() => yangiAkt(true)} disabled={belgilangan.size === 0}
                  className="bg-emerald-700 hover:bg-emerald-600 px-2.5 py-1 rounded text-xs flex items-center gap-1 disabled:opacity-40"><Plus size={13} /> Belgilanganlardan akt ({belgilangan.size})</button>
                <button onClick={ulash} disabled={!forma?.id || belgilangan.size === 0}
                  className="bg-amber-700 hover:bg-amber-600 px-2.5 py-1 rounded text-xs flex items-center gap-1 disabled:opacity-40" title="Ochiq aktga ulash"><Link2 size={13} /> Ochiq aktga ulash</button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-zinc-800">
              {korinadiganIshlar.length === 0 && <div className="p-4 text-center text-zinc-500 text-sm">Bajarilgan ish topilmadi</div>}
              {korinadiganIshlar.map((c) => (
                <label key={c.qator_id} className={'p-2.5 flex items-center gap-3 cursor-pointer ' + (c.yashirin && !c.akt_bor ? 'bg-amber-900/10' : '')}>
                  <input type="checkbox" checked={belgilangan.has(c.qator_id)} onChange={() => setBelgilangan((s) => { const n = new Set(s); if (n.has(c.qator_id)) n.delete(c.qator_id); else n.add(c.qator_id); return n; })} className="w-4 h-4" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate" title={c.nom ?? ''}>{c.nom}</div>
                    <div className="text-[11px] text-zinc-500">{c.kod} · {c.kat} · {c.fakt_hajm} {c.birlik}</div>
                  </div>
                  {c.yashirin && <span title="Yashirin ish — akt talab qilinadi" className="text-amber-400"><AlertTriangle size={15} /></span>}
                  {c.akt_bor
                    ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 flex items-center gap-1"><CheckCircle2 size={11} /> akt</span>
                    : <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">aktsiz</span>}
                </label>
              ))}
            </div>
          </div>

          {/* O'NG: reestr + forma */}
          <div className="bg-black border border-zinc-800 rounded-lg overflow-hidden">
            <div className="p-2.5 bg-zinc-800 flex items-center justify-between">
              <h2 className="font-bold text-sm">Akt reestri ({faolAktlar.length})</h2>
              <button onClick={() => reestr('aosr')} disabled={!faolAktlar.length} className="ml-auto mr-2 text-emerald-400 hover:text-emerald-300 disabled:opacity-40 text-xs flex items-center gap-1" title="РЕЕСТР АОСР (Excel)"><FileSpreadsheet size={14} /> Reestr</button>
              <button onClick={() => yangiAkt(false)} className="bg-emerald-700 hover:bg-emerald-600 px-2.5 py-1 rounded text-xs flex items-center gap-1"><Plus size={13} /> Yangi akt</button>
            </div>
            {forma ? (
              <div className="p-3 space-y-2.5 max-h-[75vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-amber-300">{forma.id ? `Akt № ${forma.raqam ?? ''}` : 'Yangi akt'}</div>
                  <button onClick={() => setForma(null)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div><span className={lbl}>Turi</span><select className={inp} value={forma.tur ?? 'aosr'} onChange={f('tur')}>{Object.entries(TUR_NOMI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div><span className={lbl}>Raqam</span><input className={inp} value={forma.raqam ?? ''} onChange={f('raqam')} /></div>
                  <div><span className={lbl}>Akt sanasi</span><input type="date" className={inp} value={forma.sana ?? ''} onChange={f('sana')} /></div>
                  <div><span className={lbl}>Blank</span><select className={inp} value={forma.blank_varianti ?? 'subpudratchisiz'} onChange={f('blank_varianti')}><option value="subpudratchisiz">Subpudratchisiz</option><option value="subpudratchili">Subpudratchili</option></select></div>
                </div>
                <div><span className={lbl}>Ish nomi (sarlavha) *</span><input className={inp} value={forma.ish_nomi ?? ''} onChange={f('ish_nomi')} /></div>
                <div><span className={lbl}>1. Taqdim etilgan ishlar (har qator — alohida band)</span><textarea rows={3} className={inp} value={forma.ish_tavsifi ?? ''} onChange={f('ish_tavsifi')} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className={lbl}>2. Loyiha tashkiloti</span><input className={inp} value={forma.loyiha_tashkiloti ?? ''} onChange={f('loyiha_tashkiloti')} /></div>
                  <div><span className={lbl}>Chizmalar № / sana</span><input className={inp} value={forma.loyiha_hujjati ?? ''} onChange={f('loyiha_hujjati')} /></div>
                </div>
                <div><span className={lbl}>3. Qo‘llangan materiallar (sertifikat/hujjat havolasi bilan)</span><textarea rows={2} className={inp} value={forma.materiallar ?? ''} onChange={f('materiallar')} /></div>
                <div><span className={lbl}>4. Loyihadan chetlanishlar</span><input className={inp} value={forma.chetlanishlar ?? ''} onChange={f('chetlanishlar')} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className={lbl}>5. Boshlanish</span><input type="date" className={inp} value={forma.boshlanish_sana ?? ''} onChange={f('boshlanish_sana')} /></div>
                  <div><span className={lbl}>Tugash</span><input type="date" className={inp} value={forma.tugash_sana ?? ''} onChange={f('tugash_sana')} /></div>
                </div>
                <div><span className={lbl}>Keyingi ishlarga ruxsat (ishlar va konstruksiyalar)</span><input className={inp} value={forma.keyingi_ishlar ?? ''} onChange={f('keyingi_ishlar')} /></div>

                <div className="rounded border border-zinc-800 p-2">
                  <div className="flex items-center justify-between mb-1.5"><span className="text-xs font-semibold text-zinc-300">Komissiya va imzolar</span>
                    <button className="text-[11px] text-amber-300 hover:text-amber-200" onClick={() => setForma((x) => (x ? { ...x, komissiya: [...(x.komissiya ?? []), { rol: 'boshqa' }] } : x))}>+ a’zo</button></div>
                  {(forma.komissiya ?? []).map((k, i) => {
                    const set = (p: Partial<AosrKomissiyaYozuv>) => setForma((x) => (x ? { ...x, komissiya: (x.komissiya ?? []).map((y, j) => (j === i ? { ...y, ...p } : y)) } : x));
                    return (
                      <div key={i} className="grid grid-cols-[1.1fr_1fr_1fr_1.2fr_auto] gap-1.5 mb-1.5">
                        <select className={inp} value={k.rol} onChange={(e) => set({ rol: e.target.value })}>{Object.entries(ROL_NOMI).map(([r, n]) => <option key={r} value={r}>{n}</option>)}</select>
                        <input className={inp} placeholder="F.I.Sh." value={k.fio ?? ''} onChange={(e) => set({ fio: e.target.value })} />
                        <input className={inp} placeholder="Lavozim" value={k.lavozim ?? ''} onChange={(e) => set({ lavozim: e.target.value })} />
                        <input className={inp} placeholder="Tashkilot" value={k.tashkilot ?? ''} onChange={(e) => set({ tashkilot: e.target.value })} />
                        <button className="text-zinc-500 hover:text-red-400 px-1" onClick={() => setForma((x) => (x ? { ...x, komissiya: (x.komissiya ?? []).filter((_, j) => j !== i) } : x))}><X size={14} /></button>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <select className={inp + ' max-w-[200px]'} value={forma.holat ?? 'yangi'} onChange={f('holat')}>{['yangi', 'tasdiqlangan', 'qogoz'].map((h) => <option key={h} value={h}>{HOLAT_NOMI[h]}</option>)}</select>
                  <button onClick={saqla} disabled={saqlanmoqda} className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium flex items-center gap-1 disabled:opacity-50"><Save size={14} /> Saqlash</button>
                </div>
              </div>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto divide-y divide-zinc-800">
                {faolAktlar.length === 0 && <div className="p-4 text-center text-zinc-500 text-sm">Akt yo‘q — chapdan ishlarni belgilab akt yarating</div>}
                {faolAktlar.map((a) => (
                  <div key={a.id} className="p-2.5 hover:bg-zinc-800/50 cursor-pointer" onClick={() => setForma({ ...a, komissiya: Array.isArray(a.komissiya) ? a.komissiya : [], holat: a.holat === 'bekor' ? 'yangi' : a.holat })}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-200 truncate">№ {a.raqam || '—'} · {a.ish_nomi || '—'}</div>
                        <div className="text-[11px] text-zinc-500">{TUR_NOMI[a.tur]} · {a.sana ?? 'sana yo‘q'} · {a.boglangan_ish_soni} ish · {a.protokol_soni} protokol · {HOLAT_NOMI[a.holat]}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); void excel(a); }} className="text-emerald-400 hover:text-emerald-300 p-1" title="Excel (blank)"><FileSpreadsheet size={15} /></button>
                        <button onClick={(e) => { e.stopPropagation(); void bekorQil(a); }} className="text-zinc-500 hover:text-red-400 p-1" title="Bekor qilish"><Unlink size={14} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── LABORATORIYA ── */
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
          <div className="bg-black border border-zinc-800 rounded-lg overflow-hidden">
            <div className="p-2.5 bg-zinc-800 flex items-center justify-between">
              <h2 className="font-bold text-sm">Laboratoriya protokollari ({protokollar.length})</h2>
              <button onClick={() => reestr('lab')} disabled={!protokollar.length} className="ml-auto mr-2 text-emerald-400 hover:text-emerald-300 disabled:opacity-40 text-xs flex items-center gap-1" title="РЕЕСТР ПРОТОКОЛОВ (Excel)"><FileSpreadsheet size={14} /> Reestr</button>
              <button onClick={() => setPForma({ sinov_turi: 'beton', natija: 'kutilmoqda', laboratoriya_id: lablar[0]?.id ?? null, sana: new Date().toISOString().slice(0, 10), aosr_ids: [] })}
                className="bg-emerald-700 hover:bg-emerald-600 px-2.5 py-1 rounded text-xs flex items-center gap-1"><Plus size={13} /> Protokol</button>
            </div>
            {lablar.length === 0 && (
              <div className="m-3 rounded border border-zinc-700 p-2 text-xs text-zinc-400">Laboratoriya kompaniyasi yo‘q. Kontragentlar ro‘yxatiga «laboratoriya» roli bilan qo‘shing.</div>
            )}
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-zinc-900 text-zinc-400 sticky top-0"><tr>
                  <th className="p-1.5 text-left">№ / sana</th><th className="p-1.5 text-left">Laboratoriya</th><th className="p-1.5 text-left">Sinov</th>
                  <th className="p-1.5 text-left">Konstruksiya · marka</th><th className="p-1.5 text-right">Hajm</th><th className="p-1.5 text-left">Natija</th>
                  <th className="p-1.5 text-right">Summa</th><th className="p-1.5 text-center">Akt</th></tr></thead>
                <tbody className="divide-y divide-zinc-800">
                  {protokollar.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-800/50 cursor-pointer" onClick={() => setPForma({ ...p, aosr_ids: p.aosr_ids ?? [] })}>
                      <td className="p-1.5">{p.raqam}<div className="text-zinc-500">{p.sana ?? '—'}</div></td>
                      <td className="p-1.5">{p.laboratoriya ?? '—'}</td>
                      <td className="p-1.5">{SINOV_TURI_NOM[p.sinov_turi]}</td>
                      <td className="p-1.5">{p.konstruksiya ?? '—'}{p.marka ? ' · ' + p.marka : ''}</td>
                      <td className="p-1.5 text-right tabular-nums">{p.hajm == null ? '' : Number(p.hajm).toLocaleString('ru-RU') + ' ' + (p.birlik ?? '')}</td>
                      <td className={'p-1.5 ' + (p.natija === 'mos_emas' ? 'text-red-400 font-semibold' : p.natija === 'mos' ? 'text-emerald-300' : 'text-zinc-400')}>{SINOV_NATIJA_NOM[p.natija]}</td>
                      <td className="p-1.5 text-right tabular-nums">{p.summa == null ? '' : Number(p.summa).toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</td>
                      <td className="p-1.5 text-center">{p.aosr_ids?.length ? p.aosr_ids.map((id) => aktlar.find((a) => a.id === id)?.raqam ?? id).join(', ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {labJami.length > 0 && (
              <div className="border-t border-zinc-800 p-2.5 text-xs space-y-1">
                <div className="font-semibold text-zinc-300">Laboratoriyalar bo‘yicha jami</div>
                {labJami.map(([nom, x]) => (
                  <div key={nom} className="flex justify-between gap-2 text-zinc-400">
                    <span>{nom} · {x.soni} protokol{x.mosEmas ? <b className="text-red-400"> · {x.mosEmas} mos emas</b> : null}</span>
                    <span className="tabular-nums">{x.nomalum ? `${x.nomalum} ta summasiz · ` : ''}{(x.summa ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-black border border-zinc-800 rounded-lg p-3">
            {!pForma ? <div className="text-sm text-zinc-500">Protokolni tanlang yoki yangisini qo‘shing.</div> : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between"><div className="text-sm font-semibold text-amber-300">{pForma.id ? `Protokol № ${pForma.raqam ?? ''}` : 'Yangi protokol'}</div>
                  <button onClick={() => setPForma(null)} className="text-zinc-500 hover:text-white"><X size={16} /></button></div>
                <div><span className={lbl}>Laboratoriya</span>
                  <select className={inp} value={pForma.laboratoriya_id ?? ''} onChange={(e) => setPForma((x) => (x ? { ...x, laboratoriya_id: e.target.value ? Number(e.target.value) : null } : x))}>
                    <option value="">— tanlanmagan —</option>{lablar.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}</select></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className={lbl}>Protokol № *</span><input className={inp} value={pForma.raqam ?? ''} onChange={pf('raqam')} /></div>
                  <div><span className={lbl}>Sana</span><input type="date" className={inp} value={pForma.sana ?? ''} onChange={pf('sana')} /></div>
                  <div><span className={lbl}>Sinov turi</span><select className={inp} value={pForma.sinov_turi ?? 'beton'} onChange={(e) => setPForma((x) => (x ? { ...x, sinov_turi: e.target.value as SinovTuri } : x))}>{Object.entries(SINOV_TURI_NOM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div><span className={lbl}>Natija</span><select className={inp} value={pForma.natija ?? 'kutilmoqda'} onChange={(e) => setPForma((x) => (x ? { ...x, natija: e.target.value as SinovNatija } : x))}>{Object.entries(SINOV_NATIJA_NOM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div><span className={lbl}>Konstruksiya</span><input className={inp} value={pForma.konstruksiya ?? ''} onChange={pf('konstruksiya')} placeholder="Фундамент Фм-1" /></div>
                  <div><span className={lbl}>Marka / klass</span><input className={inp} value={pForma.marka ?? ''} onChange={pf('marka')} placeholder="B25" /></div>
                  <div><span className={lbl}>Hajm</span><input className={inp} inputMode="decimal" value={pForma.hajm ?? ''} onChange={(e) => setPForma((x) => (x ? { ...x, hajm: e.target.value === '' ? null : (e.target.value.replace(',', '.') as unknown as number) } : x))} /></div>
                  <div><span className={lbl}>Birlik</span><input className={inp} value={pForma.birlik ?? ''} onChange={pf('birlik')} placeholder="м3" /></div>
                  <div><span className={lbl}>Invoys №</span><input className={inp} value={pForma.invoys_raqam ?? ''} onChange={pf('invoys_raqam')} /></div>
                  <div><span className={lbl}>Invoys sanasi</span><input type="date" className={inp} value={pForma.invoys_sana ?? ''} onChange={pf('invoys_sana')} /></div>
                  <div className="col-span-2"><span className={lbl}>Summa (bo‘sh — noma’lum)</span><input className={inp} inputMode="decimal" value={pForma.summa ?? ''} onChange={(e) => setPForma((x) => (x ? { ...x, summa: e.target.value === '' ? null : (e.target.value.replace(/\s/g, '').replace(',', '.') as unknown as number) } : x))} /></div>
                </div>
                <div><span className={lbl}>Izoh</span><input className={inp} value={pForma.izoh ?? ''} onChange={pf('izoh')} /></div>
                <div><span className={lbl}>Qaysi aktlarga ilova</span>
                  <div className="max-h-32 overflow-y-auto rounded border border-zinc-800 p-1.5 space-y-0.5">
                    {faolAktlar.length === 0 && <div className="text-[11px] text-zinc-500">Akt yo‘q</div>}
                    {faolAktlar.map((a) => (
                      <label key={a.id} className="flex items-center gap-1.5 text-xs text-zinc-300">
                        <input type="checkbox" checked={pForma.aosr_ids?.includes(a.id) ?? false}
                          onChange={(e) => setPForma((x) => (x ? { ...x, aosr_ids: e.target.checked ? [...(x.aosr_ids ?? []), a.id] : (x.aosr_ids ?? []).filter((y) => y !== a.id) } : x))} />
                        № {a.raqam ?? '—'} · {a.ish_nomi ?? ''}
                      </label>
                    ))}
                  </div></div>
                <div className="flex justify-between pt-1">
                  {pForma.id ? <button onClick={() => { const p = protokollar.find((x) => x.id === pForma.id); if (p) void pBekor(p); }} className="text-xs text-zinc-500 hover:text-red-400">Bekor qilish</button> : <span />}
                  <button onClick={pSaqla} disabled={saqlanmoqda} className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium flex items-center gap-1 disabled:opacity-50"><Save size={14} /> Saqlash</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
