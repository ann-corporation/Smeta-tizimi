import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, RefreshCw, AlertTriangle, Building2, ShieldAlert, FileSignature, Inbox } from 'lucide-react';
import { sbOqi, sbT2DaraxtOl, sbT2KompaniyalarOl, sbT2ObyektlarOlKomp, type T2Kompaniya, type T2Obyekt } from '../../api/supabase';
import { sbT2F2TafsilotOl } from '../../api/t2-narx';
import { t, tilLocale } from '../../i18n/til';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { useHujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';
import { HujjatTomonlariPanel, useHujjatTomonlari } from '../../umumiy/hujjat/HujjatTomonlari';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { m29Hisobla, type M29Kirish, type M29Natija, type M29SmetaQator, type M29SkladQator } from '../../lib/m29';
import { m29Hujjat } from '../../lib/m29/export';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { M29Korinish } from '../../components/m29/M29Korinish';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { toast } from '../../umumiy/ui/Toast';
import { M29Chiqim } from './M29Chiqim';

/**
 * М-29 — материалы: расход по норме ↔ фактически (egasi 2026-09-28; Firuza ko'rinishi 2026-10-25).
 * Oylik va boshidan beri; ierarxiya: guruh → material → ishlar, har qavatda o'z jamisi. Har material qatorida
 * «norma = 100%» chizig'i va so'z bilan holat (ortiqcha 12% / tejaldi 8%), diqqat belgilari shu qatorning o'zida.
 * Pul ta'siri (tejash / ortiqcha) tepada — ustamali + ustamasiz. Sklad ma'lumoti yo'q bo'lsa — bitta aniq bo'sh holat.
 */
function Sessiya({ companyId }: { companyId: number }) {
  const workspace = usePTOWorkspace();
  const korinish = useHujjatKorinish();
  const [tomonlar, setTomonlar] = useHujjatTomonlari(companyId);
  const [objects, setObjects] = useState<T2Obyekt[]>([]);
  const [objectId, setObjectId] = useState('');
  const [kirish, setKirish] = useState<M29Kirish | null>(null);
  const [davr, setDavr] = useState('');
  const [busy, setBusy] = useState(false);
  const [xato, setXato] = useState('');
  const [ogoh, setOgoh] = useState('');
  const [pudratchi, setPudratchi] = useState<string | null>(null);

  useEffect(() => {
    let a = true;
    void sbT2ObyektlarOlKomp(companyId).then((r) => { if (a && r.ok) setObjects((r.qatorlar || []) as T2Obyekt[]); });
    void sbT2KompaniyalarOl().then((r) => {
      if (!a || !r.ok) return;
      const k = ((r.qatorlar || []) as T2Kompaniya[]).find((x) => x.id === companyId);
      setPudratchi(k?.toliq_nom || k?.nom || null);
    });
    return () => { a = false; };
  }, [companyId]);
  useEffect(() => {
    if (workspace.scope.objectId != null && objects.some((o) => o.id === workspace.scope.objectId)) setObjectId(String(workspace.scope.objectId));
  }, [objects, workspace.scope.objectId]);

  async function yukla(oid: number) {
    setBusy(true); setXato(''); setOgoh(''); setKirish(null);
    try {
      const [d, f, s] = await Promise.all([
        sbT2DaraxtOl(oid),
        sbT2F2TafsilotOl({ obyektId: oid, tur: 'f2' }),
        sbOqi<M29SkladQator>({ jadval: 't2_sklad_harakat', filtr: `obyekt_id=eq.${oid}&holat=eq.faol`, ustunlar: 'operatsiya,sana,nomi,birligi,obyomi', limit: 100000 }),
      ]);
      if (!d.ok) throw new Error(t('Smeta o‘qilmadi.'));
      if (!f.ok || f.toliq === false) throw new Error(t('F2 qatorlari to‘liq o‘qilmadi — M-29 chala ma’lumot ustida tuzilmaydi.'));
      if (!s.ok) setOgoh(t('Sklad harakatlari o‘qilmadi — «Фактически» ustuni bo‘sh (noma’lum) qoladi.'));
      const smeta = (d.qatorlar || []) as unknown as M29SmetaQator[];
      const f2 = (f.qatorlar || []).map((q) => ({ qator_id: q.qator_id, oy: String(q.oy), hajm: q.certified_quantity ?? q.hajm, akt_holat: q.akt_holat }));
      const sklad = s.ok ? (s.qatorlar || []) : [];
      setKirish({ smeta, f2, sklad });
      const oylar = [...new Set([
        ...f2.filter((x) => x.akt_holat === 'tasdiqlangan').map((x) => x.oy.slice(0, 7)),
        ...sklad.map((x) => String(x.sana).slice(0, 7)),
      ])].filter((x) => /^\d{4}-\d{2}$/.test(x)).sort();
      setDavr((old) => (old && oylar.includes(old) ? old : oylar[oylar.length - 1] ?? ''));
      if (!oylar.length) setOgoh(t('Bu obyektda tasdiqlangan F2 ham, sklad harakati ham yo‘q — M-29 bo‘sh bo‘ladi.'));
    } catch (e) { setXato(e instanceof Error ? e.message : t('Yuklanmadi.')); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (objectId) void yukla(Number(objectId)); }, [objectId]);

  const oylar = useMemo(() => {
    if (!kirish) return [];
    return [...new Set([
      ...kirish.f2.filter((x) => x.akt_holat === 'tasdiqlangan').map((x) => x.oy.slice(0, 7)),
      ...kirish.sklad.map((x) => String(x.sana).slice(0, 7)),
    ])].filter((x) => /^\d{4}-\d{2}$/.test(x)).sort().reverse();
  }, [kirish]);
  const natija: M29Natija | null = useMemo(() => (kirish && davr ? m29Hisobla(kirish, davr) : null), [kirish, davr]);
  const obyektNom = objects.find((o) => String(o.id) === objectId)?.nom ?? '';
  async function eksport(korish: boolean) {
    if (!natija) return;
    try {
      // Egasi 2026-09-30: hisobot oyidan oldingi har oy — alohida ustun (bitta M-29 hisobi har oy uchun).
      const oldingiOylar = kirish ? [...oylar].filter((m) => m < davr).sort().map((oy) => ({ oy, natija: m29Hisobla(kirish, oy) })) : [];
      const h = m29Hujjat(natija, { obyektNom, pudratchi, imzo: tomonlar, oldingiOylar });
      const tk = await hujjatTokenBilan({ kompaniyaId: companyId, bytes: h.bytes, hujjat: 'M-29', sabab: `М-29 · ${obyektNom} · ${davr}`, obyekt: objectId },
        () => { if (korish) korinish.ochish(h.bytes, h.faylNomi); else downloadBlob(h.bytes, h.faylNomi); });
      if (!tk.ok) toast(tk.xabar, 'danger'); else if (tk.xabar) toast(tk.xabar, 'ok');
    } catch (e) { setXato(e instanceof Error ? t('M-29 tuzilmadi: {x}', { x: e.message }) : t('M-29 tuzilmadi.')); }
  }
  const oid = Number(objectId);
  const oyNomi = (o: string) => davrNomi(o, tilLocale()) || o;
  const boshObyekt = !!objectId && !busy && !xato && !!kirish && !oylar.length;

  return (
    <>{korinish.oyna}<Sahifa
      sarlavha="М-29 · Materiallar: norma ↔ fakt"
      tavsif="Norma — tasdiqlangan F2 bo‘yicha (ish hajmi × norma) · haqiqiy — obyekt skladidan chiqim"
      amallar={<>
        <button type="button" className="fz-btn" disabled={!natija || busy} onClick={() => eksport(true)} title={t('Hujjatni saytda ko‘rish')}><Eye /> {t('Ko‘rish')}</button>
        <button type="button" className="fz-btn fz-btn--primary" disabled={!natija || busy} onClick={() => eksport(false)}><Download /> {t('Excel М-29')}</button>
      </>}
    >
      <div className="flex flex-col gap-3">
        <section className="fz-card grid gap-3 p-3 sm:grid-cols-[minmax(220px,2fr)_minmax(160px,1fr)_auto]">
          <label className="text-[12px] font-medium text-text-dim">{t('Obyekt')}
            <select aria-label={t('Obyekt')} value={objectId} onChange={(e) => { setObjectId(e.target.value); workspace.setObjectId(e.target.value ? Number(e.target.value) : null); }}
              className="mt-1 block h-8 w-full px-2 text-[13px]">
              <option value="">{t('Tanlang')}</option><ObyektOptionlari obyektlar={objects} />
            </select>
          </label>
          <label className="text-[12px] font-medium text-text-dim">{t('Hisobot oyi')}
            <select aria-label={t('Hisobot oyi')} value={davr} onChange={(e) => setDavr(e.target.value)} disabled={!oylar.length}
              className="mt-1 block h-8 w-full px-2 text-[13px]">
              {!oylar.length && <option value="">—</option>}
              {oylar.map((o) => <option key={o} value={o}>{oyNomi(o)}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <button type="button" className="fz-btn fz-btn--ghost" disabled={!objectId || busy} onClick={() => void yukla(oid)}><RefreshCw className={busy ? 'animate-spin' : ''} /> {t('Yangilash')}</button>
          </div>
        </section>

        {!objectId && <section className="fz-note fz-note--info"><Building2 /> {t('Obyektni tanlang — M-29 norma va sklad chiqimini shu obyekt bo‘yicha taqqoslaydi.')}</section>}
        {busy && <div className="skel min-h-[220px] rounded-xl" aria-label={t('Yuklanmoqda…')} />}
        {xato && <section role="alert" className="fz-note fz-note--danger"><ShieldAlert /> {xato}</section>}
        {ogoh && !boshObyekt && <section className="fz-note fz-note--warn"><AlertTriangle /> {ogoh}</section>}
        {boshObyekt && (
          <section className="fz-card flex flex-col items-center gap-2 px-6 py-12 text-center" data-testid="m29-bosh">
            <Inbox size={40} strokeWidth={1.5} className="text-text-mute" />
            <p className="font-medium text-text">{t('M-29 uchun ma’lumot yo‘q')}</p>
            <p className="max-w-lg text-[12.5px] text-text-dim">{t('Bu obyektda tasdiqlangan F2 ham, sklad harakati ham yo‘q. Avval F2 aktini tasdiqlang (norma shundan olinadi) va obyekt skladiga kirim/chiqim kiriting.')}</p>
          </section>
        )}
        {/* Egasi 2026-10-21 (ADR-3): ombor Fakt bilan emas — shu davr uchun bajarilgan M-29 bilan kamayadi. */}
        {natija && objectId && davr && (
          <M29Chiqim kompaniyaId={companyId} obyektId={oid} davr={davr}
            materiallar={natija.guruhlar.flatMap((g) => g.materiallar)} onYangilandi={() => void yukla(oid)} />
        )}

        {natija && <M29Korinish natija={natija} obyektId={oid} />}

        {objectId && (
          <section className="fz-panel" aria-label={t('Hujjat imzolari')}>
            <div className="fz-panel__h"><span className="inline-flex items-center gap-1.5"><FileSignature size={13} />{t('Excel М-29 imzo tomonlari')}</span></div>
            <HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} />
          </section>
        )}
      </div>
    </Sahifa></>
  );
}

export default function M29Native() {
  const { joriy, yuklanmoqda } = useKompaniya();
  if (yuklanmoqda) return <p className="p-6 text-text-dim">{t('Kompaniya yuklanmoqda…')}</p>;
  if (!joriy?.id) return <p className="p-6 text-text-dim">{t('Kompaniyani tanlang.')}</p>;
  return <Sessiya key={joriy.id} companyId={joriy.id} />;
}
