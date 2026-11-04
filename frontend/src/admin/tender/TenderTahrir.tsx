/** Tender qoralamasi: lotlar/pozitsiyalar (zayavkadan import), byudjet (QQS bilan), muddat, baholash usuli va mezon vaznlari, taklif qilinadigan yetkazuvchilar. */
import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { OpsMaydon, OpsOyna } from '../../components/kompaniya-ops/OpsUi';
import { sbT2ObyektlarOlKomp, type T2Obyekt } from '../../api/supabase';
import { sbZayavkalarOl, type ProcurementRequest } from '../../api/t2-zayavka';
import {
  TENDER_TURLAR, TENDER_VALYUTALAR, tenderSaqla, tenderYetkazuvchilarOl,
  type BaholashUsuli, type TenderDoira, type TenderQatorYozuv, type TenderTafsilot, type TenderTur, type TenderYetkazuvchi, type Valyuta,
} from '../../api/t2-tender';
import { MEZONLAR, meyorXato, type Meyor } from '../../lib/tender/taqqoslash';
import { TENDER_QQS_SUKUT } from '../../lib/tender/pul';
import { TENDERGA_YARAYDI, zayavkadanQatorlar } from '../../lib/tender/zayavka';
import { yangiOperationId } from '../../api/supabase';
import { MEZON_NOM, isoDanLokal, lokaldanIso, tenderXato, turNomi } from './tender-ui';

type Qator = { nom: string; birlik: string; miqdor: string; lot_no: string; talab_sana: string; yetkazish_joyi: string; spets: string; zayavka_id?: number; resurs_kodi?: string };
const bosh = (): Qator => ({ nom: '', birlik: '', miqdor: '', lot_no: '1', talab_sana: '', yetkazish_joyi: '', spets: '' });
const son = (v: string): number | null => { const n = Number(v.replace(',', '.')); return v.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null; };

export function TenderTahrir({ ochiq, kompaniyaId, tahrir, onYop, onSaqlandi }: {
  ochiq: boolean; kompaniyaId: number; tahrir: TenderTafsilot | null; onYop: () => void; onSaqlandi: (id: number) => void;
}) {
  const [sarlavha, setSarlavha] = useState('');
  const [tur, setTur] = useState<TenderTur>('material');
  const [doira, setDoira] = useState<TenderDoira>('taklif');
  const [muddat, setMuddat] = useState('');
  const [savolMuddat, setSavolMuddat] = useState('');
  const [valyuta, setValyuta] = useState<Valyuta>('UZS');
  const [qqs, setQqs] = useState(String(TENDER_QQS_SUKUT));
  const [byudjet, setByudjet] = useState('');
  const [byudjetKorsat, setByudjetKorsat] = useState(false);
  const [tolovSharti, setTolovSharti] = useState('');
  const [usuli, setUsuli] = useState<BaholashUsuli>('narx');
  const [meyor, setMeyor] = useState<Record<string, string>>({ narx: '60', muddat: '20', reyting: '20' });
  const [izoh, setIzoh] = useState('');
  const [obyektId, setObyektId] = useState('');
  const [qabul, setQabul] = useState<number[]>([]);
  const [qatorlar, setQatorlar] = useState<Qator[]>([bosh()]);
  const [yetkazuvchilar, setYetkazuvchilar] = useState<TenderYetkazuvchi[]>([]);
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [zayavkalar, setZayavkalar] = useState<ProcurementRequest[] | null>(null);
  const [zTanla, setZTanla] = useState<number[]>([]);
  const [zOchiq, setZOchiq] = useState(false);
  const [band, setBand] = useState(false);
  const [op, setOp] = useState(yangiOperationId());

  useEffect(() => {
    if (!ochiq) return;
    setOp(yangiOperationId());
    void tenderYetkazuvchilarOl(kompaniyaId).then((r) => { if (r.ok) setYetkazuvchilar(r.natija.qatorlar); });
    void sbT2ObyektlarOlKomp(kompaniyaId).then((r) => setObyektlar(r.qatorlar || []));
    if (tahrir) {
      const r = tahrir.rfq;
      setSarlavha(r.nom); setTur(r.tur); setDoira(r.doira); setMuddat(isoDanLokal(r.muddat)); setSavolMuddat(isoDanLokal(r.savol_muddat)); setValyuta(r.valyuta);
      setQqs(String(r.qqs_foiz)); setByudjet(r.byudjet_qqs_bilan == null ? '' : String(r.byudjet_qqs_bilan)); setByudjetKorsat(r.byudjet_korsatish); setTolovSharti(r.tolov_sharti ?? '');
      setUsuli(r.baholash_usuli); setMeyor(Object.fromEntries(Object.entries(r.meyor).map(([k, v]) => [k, String(v)]))); setIzoh(r.izoh ?? ''); setObyektId(r.obyekt_id ? String(r.obyekt_id) : '');
      setQabul(r.qabul_kompaniya_idlar ?? []);
      setQatorlar(tahrir.qatorlar.map((q) => ({ nom: q.nom, birlik: q.birlik, miqdor: String(q.miqdor), lot_no: String(q.lot_no), talab_sana: q.talab_sana ?? '', yetkazish_joyi: q.yetkazish_joyi ?? '',
        spets: q.spets ?? '', zayavka_id: q.zayavka_id ?? undefined, resurs_kodi: q.resurs_kodi ?? undefined })));
    }
  }, [ochiq, kompaniyaId, tahrir]);

  const meyorSon: Meyor = useMemo(() => { const m: Meyor = {}; for (const k of MEZONLAR) { const v = son(meyor[k] ?? ''); if (v != null && v > 0) m[k] = v; } return m; }, [meyor]);
  const yigindi = MEZONLAR.reduce((s, k) => s + (meyorSon[k] ?? 0), 0);
  const meyorXatosi = meyorXato(usuli, meyorSon);

  const zayavkaOch = async () => {
    setZOchiq(true);
    if (zayavkalar == null) { const r = await sbZayavkalarOl(kompaniyaId); if (r.error) toast(r.error, 'danger'); setZayavkalar(r.qatorlar || []); }
  };
  const zayavkaQosh = () => {
    const tanlangan = (zayavkalar ?? []).filter((z) => zTanla.includes(z.id));
    const { qatorlar: yangi, otkazildi } = zayavkadanQatorlar(tanlangan);
    const mavjud = new Set(qatorlar.map((q) => q.zayavka_id).filter(Boolean));
    setQatorlar((old) => [...old.filter((q) => q.nom.trim() || q.birlik.trim()), ...yangi.filter((y) => !mavjud.has(y.zayavka_id)).map((y) => ({ ...bosh(), nom: y.nom, birlik: y.birlik, miqdor: String(y.miqdor),
      lot_no: String(y.lot_no), talab_sana: y.talab_sana ?? '', zayavka_id: y.zayavka_id }))]);
    if (otkazildi.length) toast(t('{n} ta zayavka o‘tkazib yuborildi (birlik/qoldiq/holat noto‘g‘ri).', { n: otkazildi.length }), 'warn');
    setZOchiq(false); setZTanla([]);
  };
  const yangila = (i: number, p: Partial<Qator>) => setQatorlar((q) => q.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const saqla = async () => {
    if (sarlavha.trim().length < 3) { toast(t('Tender nomini yozing.'), 'warn'); return; }
    const yoz: TenderQatorYozuv[] = [];
    for (const q of qatorlar) {
      if (!q.nom.trim() && !q.birlik.trim() && !q.miqdor.trim()) continue;
      const m = son(q.miqdor);
      if (!q.nom.trim() || !q.birlik.trim() || m == null || m <= 0) { toast(t('Har pozitsiyada nom, birlik va miqdor (0 dan katta) bo‘lishi kerak.'), 'warn'); return; }
      yoz.push({ nom: q.nom.trim(), birlik: q.birlik.trim(), miqdor: m, lot_no: Math.max(1, Math.round(son(q.lot_no) ?? 1)), talab_sana: q.talab_sana || undefined,
        yetkazish_joyi: q.yetkazish_joyi.trim() || undefined, spets: q.spets.trim() || undefined, zayavka_id: q.zayavka_id, resurs_kodi: q.resurs_kodi });
    }
    if (!yoz.length) { toast(t('Kamida bitta pozitsiya kiriting.'), 'warn'); return; }
    if (meyorXatosi) { toast(t('Ball usulida mezon vaznlari yig‘indisi 100 bo‘lishi va narx mezoni bo‘lishi kerak.'), 'warn'); return; }
    if (doira === 'taklif' && qabul.length === 0) { toast(t('Taklif qilinadigan yetkazuvchilarni tanlang yoki «Ochiq» ni belgilang.'), 'warn'); return; }
    const q = son(qqs);
    if (q == null || q > 100) { toast(t('QQS stavkasi 0–100 bo‘lsin.'), 'warn'); return; }
    setBand(true);
    const r = await tenderSaqla(kompaniyaId, {
      rfqId: tahrir?.rfq.id ?? null, kutilganVersiya: tahrir?.rfq.versiya ?? null, tur, doira, qabulKompaniyaIdlar: doira === 'taklif' ? qabul : undefined,
      obyektId: obyektId ? Number(obyektId) : null, muddat: lokaldanIso(muddat),
      maydonlar: { sarlavha: sarlavha.trim(), izoh: izoh.trim() || undefined, byudjet_qqs_bilan: son(byudjet), byudjet_korsatish: byudjetKorsat, qqs_foiz: q, valyuta, baholash_usuli: usuli,
        meyor: meyorSon, savol_muddat: lokaldanIso(savolMuddat), tolov_sharti: tolovSharti.trim() || undefined },
      qatorlar: yoz,
    }, op);
    setBand(false);
    if (!r.ok || r.code) { toast(tenderXato(r), 'danger'); return; }
    toast(t('Qoralama saqlandi. Keyingi qadam — tasdiqqa yuborish.'), 'ok');
    onSaqlandi(r.id as number);
  };

  return (
    <>
      <OpsOyna ochiq={ochiq} onYop={onYop} band={band} kenglik={980} ikon={<ClipboardList />} sarlavha={tahrir ? t('Tenderni tahrirlash') : t('Yangi tender')}
        amallar={<>
          <button type="button" className="fz-btn fz-btn--ghost" onClick={onYop} disabled={band}>{t('Bekor qilish')}</button>
          <button type="button" className="fz-btn fz-btn--primary" onClick={() => void saqla()} disabled={band}><Save /> {t('Qoralamani saqlash')}</button>
        </>}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2"><OpsMaydon nom={t('Tender nomi')} majburiy><input type="text" maxLength={300} value={sarlavha} onChange={(e) => setSarlavha(e.target.value)} placeholder={t('Masalan: Obyekt uchun armatura va sement')} /></OpsMaydon></div>
          <OpsMaydon nom={t('Turi')}><select value={tur} onChange={(e) => setTur(e.target.value as TenderTur)}>{TENDER_TURLAR.map((x) => <option key={x} value={x}>{turNomi(x)}</option>)}</select></OpsMaydon>
          <OpsMaydon nom={t('Takliflarni qabul qilish muddati')} majburiy izoh={t('Muddat tugamaguncha takliflar sizga ko‘rinmaydi.')}><input type="datetime-local" value={muddat} onChange={(e) => setMuddat(e.target.value)} /></OpsMaydon>
          <OpsMaydon nom={t('Savol berish muddati')}><input type="datetime-local" value={savolMuddat} onChange={(e) => setSavolMuddat(e.target.value)} /></OpsMaydon>
          <OpsMaydon nom={t('Obyekt')}><select value={obyektId} onChange={(e) => setObyektId(e.target.value)}><option value="">{t('— tanlanmagan —')}</option>{obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}</select></OpsMaydon>
        </div>

        <fieldset className="rounded border border-border p-3">
          <legend className="px-1 text-[12px] font-medium text-text-dim">{t('Pul va shartlar')}</legend>
          <div className="grid gap-3 sm:grid-cols-4">
            <OpsMaydon nom={t('Byudjet (QQS bilan)')} izoh={t('Ixtiyoriy. Sukut bo‘yicha yetkazuvchilardan yashirin.')}><MoneyInput className="text-right" value={byudjet} onValueChange={setByudjet} /></OpsMaydon>
            <OpsMaydon nom={t('Valyuta')}><select value={valyuta} onChange={(e) => setValyuta(e.target.value as Valyuta)}>{TENDER_VALYUTALAR.map((v) => <option key={v}>{v}</option>)}</select></OpsMaydon>
            <OpsMaydon nom={t('QQS stavkasi, %')}><input type="number" min="0" max="100" className="text-right" value={qqs} onChange={(e) => setQqs(e.target.value)} /></OpsMaydon>
            <label className="flex items-end gap-2 pb-2 text-[12.5px]"><input type="checkbox" checked={byudjetKorsat} onChange={(e) => setByudjetKorsat(e.target.checked)} />{t('Byudjetni yetkazuvchilarga ko‘rsatish')}</label>
          </div>
          <div className="mt-3"><OpsMaydon nom={t('To‘lov sharti')}><input type="text" maxLength={500} value={tolovSharti} onChange={(e) => setTolovSharti(e.target.value)} placeholder={t('Masalan: 30% oldindan, 70% topshirgach 10 kun ichida')} /></OpsMaydon></div>
        </fieldset>

        <fieldset className="rounded border border-border p-3">
          <legend className="px-1 text-[12px] font-medium text-text-dim">{t('G‘olibni aniqlash usuli')}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <OpsMaydon nom={t('Usul')}><select value={usuli} onChange={(e) => setUsuli(e.target.value as BaholashUsuli)}><option value="narx">{t('Eng past narx (QQS bilan)')}</option><option value="ball">{t('Ball bilan (vaznli mezonlar)')}</option></select></OpsMaydon>
            {usuli === 'ball' && MEZONLAR.map((k) => <OpsMaydon key={k} nom={t(MEZON_NOM[k]) + ', %'}><input type="number" min="0" max="100" className="text-right" value={meyor[k] ?? ''} onChange={(e) => setMeyor({ ...meyor, [k]: e.target.value })} /></OpsMaydon>)}
          </div>
          {usuli === 'ball' && <p className={`mt-2 text-[12px] ${meyorXatosi ? 'text-danger' : 'text-ok'}`}>{t('Vaznlar yig‘indisi')}: {yigindi}% {meyorXatosi ? '— ' + t('100 bo‘lishi va narx mezoni bo‘lishi kerak') : ''}</p>}
        </fieldset>

        <fieldset className="rounded border border-border p-3">
          <legend className="px-1 text-[12px] font-medium text-text-dim">{t('Kimlar taklif beradi')}</legend>
          <div className="flex flex-wrap gap-4 text-[12.5px]">
            <label className="flex items-center gap-2"><input type="radio" name="doira" checked={doira === 'taklif'} onChange={() => setDoira('taklif')} />{t('Taklif qilingan yetkazuvchilar')}</label>
            <label className="flex items-center gap-2"><input type="radio" name="doira" checked={doira === 'ochiq'} onChange={() => setDoira('ochiq')} />{t('Ochiq e’lon (hamma ko‘radi)')}</label>
          </div>
          {doira === 'taklif' && (
            <div className="mt-2 grid max-h-40 gap-1 overflow-auto sm:grid-cols-2">
              {yetkazuvchilar.length === 0 && <p className="text-[12px] text-text-mute">{t('Faol aloqadagi yetkazuvchi yo‘q. Avval «Tomonlar» orqali aloqa o‘rnating yoki ochiq e’lonni tanlang.')}</p>}
              {yetkazuvchilar.map((y) => (
                <label key={y.kompaniya_id} className="flex items-center gap-2 rounded border border-border px-2 py-1 text-[12.5px]">
                  <input type="checkbox" checked={qabul.includes(y.kompaniya_id)} onChange={(e) => setQabul(e.target.checked ? [...qabul, y.kompaniya_id] : qabul.filter((x) => x !== y.kompaniya_id))} />
                  <span className="flex-1">{y.nom}</span>
                  <span className="text-[11px] text-text-mute">{y.reyting_ball == null ? t('baho yo‘q') : y.reyting_ball + ' / 5'}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset className="rounded border border-border p-3">
          <legend className="px-1 text-[12px] font-medium text-text-dim">{t('Pozitsiyalar (lotlar bo‘yicha)')}</legend>
          <div className="mb-2 flex flex-wrap gap-2">
            <button type="button" className="fz-btn fz-btn--sm" onClick={() => setQatorlar([...qatorlar, bosh()])}><Plus /> {t('Pozitsiya qo‘shish')}</button>
            <button type="button" className="fz-btn fz-btn--sm" onClick={() => void zayavkaOch()}><ClipboardList /> {t('Zayavkadan import')}</button>
          </div>
          <div className="space-y-2">
            {qatorlar.map((q, i) => (
              <div key={i} className="rounded border border-border p-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
                  <div className="col-span-2 sm:col-span-5"><OpsMaydon nom={t('Nomi')}><input type="text" maxLength={300} value={q.nom} onChange={(e) => yangila(i, { nom: e.target.value })} /></OpsMaydon></div>
                  <div className="sm:col-span-2"><OpsMaydon nom={t('Miqdor')}><input type="number" inputMode="decimal" min="0" step="any" className="text-right" value={q.miqdor} onChange={(e) => yangila(i, { miqdor: e.target.value })} /></OpsMaydon></div>
                  <div className="sm:col-span-2"><OpsMaydon nom={t('Birlik')}><input type="text" maxLength={40} value={q.birlik} onChange={(e) => yangila(i, { birlik: e.target.value })} /></OpsMaydon></div>
                  <div className="sm:col-span-1"><OpsMaydon nom={t('Lot')}><input type="number" min="1" max="50" className="text-right" value={q.lot_no} onChange={(e) => yangila(i, { lot_no: e.target.value })} /></OpsMaydon></div>
                  <div className="sm:col-span-2"><OpsMaydon nom={t('Kerak sana')}><input type="date" value={q.talab_sana} onChange={(e) => yangila(i, { talab_sana: e.target.value })} /></OpsMaydon></div>
                  <div className="col-span-2 sm:col-span-5"><OpsMaydon nom={t('Yetkazish joyi')}><input type="text" maxLength={300} value={q.yetkazish_joyi} onChange={(e) => yangila(i, { yetkazish_joyi: e.target.value })} /></OpsMaydon></div>
                  <div className="col-span-2 sm:col-span-6"><OpsMaydon nom={t('Texnik talab / marka')}><input type="text" maxLength={2000} value={q.spets} onChange={(e) => yangila(i, { spets: e.target.value })} /></OpsMaydon></div>
                  <div className="flex items-end justify-end sm:col-span-1"><button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={t('O‘chirish')} onClick={() => setQatorlar(qatorlar.filter((_, j) => j !== i))}><Trash2 /></button></div>
                </div>
                {q.zayavka_id && <span className="mt-1 inline-block text-[11px] text-text-mute">{t('Zayavka')} #{q.zayavka_id}</span>}
              </div>
            ))}
          </div>
        </fieldset>
        <OpsMaydon nom={t('Umumiy izoh / talablar')}><textarea rows={2} maxLength={2000} value={izoh} onChange={(e) => setIzoh(e.target.value)} /></OpsMaydon>
      </OpsOyna>

      <OpsOyna ochiq={zOchiq} onYop={() => setZOchiq(false)} kenglik={640} sarlavha={t('Zayavkalardan tanlang')} ikon={<ClipboardList />}
        amallar={<><button type="button" className="fz-btn fz-btn--ghost" onClick={() => setZOchiq(false)}>{t('Bekor qilish')}</button><button type="button" className="fz-btn fz-btn--primary" disabled={!zTanla.length} onClick={zayavkaQosh}>{t('Tenderga qo‘shish')} ({zTanla.length})</button></>}>
        {zayavkalar == null ? <p className="text-text-mute">{t('Yuklanmoqda…')}</p> : (() => {
          const royxat = zayavkalar.filter((z) => TENDERGA_YARAYDI.includes(z.status));
          return royxat.length === 0 ? <p className="text-[13px] text-text-mute">{t('Tasdiqlangan (yetkazilmagan) zayavka yo‘q.')}</p> : royxat.map((z) => (
            <label key={z.id} className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-[12.5px]">
              <input type="checkbox" checked={zTanla.includes(z.id)} onChange={(e) => setZTanla(e.target.checked ? [...zTanla, z.id] : zTanla.filter((x) => x !== z.id))} />
              <span className="flex-1">{z.itemText}</span><span className="tabular-nums text-text-mute">{z.remainingQty ?? z.requestedQty} {z.unit ?? ''}</span>
            </label>));
        })()}
      </OpsOyna>
    </>
  );
}
