/**
 * Forma 3 — SHARTNOMA rejimi paneli (Nakopitelniy sahifasining o'z bo'limi; yangi sahifa/menyu emas).
 * Oqim: shartnoma + oy → shartnomaning barcha obyektlari tasdiqlangan F2 aktlari (band emaslari oldindan belgilangan) →
 * bitta tugma «Forma 3 yaratish»: manbalar yig'iladi, Excel quriladi, server yozuvi (t2_forma3, obyekt NULL) yaratiladi,
 * hujjat token bilan beriladi. Hisob — forma3-export.ts (har obyekt O'Z nakrutkasi bilan).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { t } from '../../i18n/til';
import { sbT2ShartnomalarOl, zakazchikRekvizit, type Shartnoma } from '../../api/t2-shartnoma';
import { yangiOperationId, type T2Kompaniya } from '../../api/supabase';
import { forma3ShartnomaAktlarOl, forma3ShartnomaRoyxatOl, forma3Yarat, type Forma3ShartnomaAktlar, type Forma3ShartnomaRoyxatQator } from '../../api/t2-document-control';
import { forma3ShartnomaHujjat, type Forma3Rekvizit, type F3ShartnomaYigindi } from '../../lib/forma3-export';
import { Forma3EsfBolim } from './Forma3EsfBolim';
import { f3AktTanlov, f3OyChegarasi, f3YuboriladiganAktlar } from '../../lib/forma3-shartnoma';
import { forma3ShartnomaManbalari } from '../../lib/oylik-hujjat/forma3-shartnoma';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { toast } from '../../umumiy/ui/Toast';
import type { ImzoNomlar } from '../../lib/hujjat-yozuvchi';
import { raqamTozala } from '../../lib/raqam-belgi';

export type F3Rejim = 'obyekt' | 'shartnoma';

/** «Obyekt | Shartnoma» almashtirgich. */
export function Forma3RejimTanlagich({ qiymat, onChange, disabled }: { qiymat: F3Rejim; onChange: (x: F3Rejim) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label={t('Forma 3 rejimi')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="fz-kpi__label">{t('Forma 3')}</span>
      <div style={{ display: 'inline-flex', gap: 4 }}>
        {(['obyekt', 'shartnoma'] as const).map((x) => (
          <button key={x} type="button" disabled={disabled} aria-pressed={qiymat === x} onClick={() => onChange(x)}
            className={`fz-btn fz-btn--sm ${qiymat === x ? 'fz-btn--primary' : 'fz-btn--ghost'}`}>
            {x === 'obyekt' ? t('Obyekt') : t('Shartnoma')}
          </button>
        ))}
      </div>
    </div>
  );
}

const bugunOy = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function Forma3ShartnomaPanel({ companyId, pudratchi, kompaniyalar, imzo, boshShartnomaId }: {
  companyId: number;
  pudratchi: Forma3Rekvizit | null;
  kompaniyalar: ReadonlyArray<T2Kompaniya>;
  imzo?: ImzoNomlar;
  /** Sahifada tanlangan obyektning shartnomasi (bo'lsa — dastlabki tanlov). */
  boshShartnomaId?: number | null;
}) {
  const [shartnomalar, setShartnomalar] = useState<Shartnoma[]>([]);
  const [shartnomaId, setShartnomaId] = useState<number | null>(boshShartnomaId ?? null);
  const [oy, setOy] = useState(bugunOy());
  const [royxat, setRoyxat] = useState<Forma3ShartnomaAktlar | null>(null);
  const [belgilangan, setBelgilangan] = useState<Set<number>>(new Set());
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [ishlayapti, setIshlayapti] = useState('');
  const [xato, setXato] = useState('');
  const [diqqat, setDiqqat] = useState<Array<{ nom: string; sabab: string }>>([]);
  /** Bir tanlov — bir operation_id: tarmoq uzilsa qayta bosish ikkinchi F3 yaratmaydi (server `takror`). */
  const opId = useRef<{ kalit: string; id: string } | null>(null);
  /** ESF tayyorlash (P4): oxirgi yaratilgan F3 ning yig'indisi — ESF qatorlari shundan AYNAN ko'chiriladi. */
  const esfManba = useRef<{ yigindi: F3ShartnomaYigindi; zakazchik: Forma3Rekvizit } | null>(null);
  const [esf, setEsf] = useState<{ yigindi: F3ShartnomaYigindi; zakazchik: Forma3Rekvizit; forma3Id: number | null; raqam?: string | null; holat?: Forma3ShartnomaRoyxatQator['esf_holat']; tashqiId?: string | null; shartnomaId: number; oy: string } | null>(null);
  const [f3lar, setF3lar] = useState<Forma3ShartnomaRoyxatQator[]>([]);

  useEffect(() => {
    let active = true;
    void sbT2ShartnomalarOl(companyId, false).then((r) => { if (active && r.ok) setShartnomalar((r.qatorlar ?? []).filter((s) => s.holat !== 'bekor')); }).catch(() => undefined);
    return () => { active = false; };
  }, [companyId]);
  useEffect(() => { if (boshShartnomaId != null) setShartnomaId((x) => x ?? boshShartnomaId); }, [boshShartnomaId]);

  const chegara = useMemo(() => f3OyChegarasi(oy), [oy]);
  const yukla = async () => {
    setXato(''); setDiqqat([]); setRoyxat(null); setBelgilangan(new Set());
    if (shartnomaId == null || !chegara) return;
    setYuklanmoqda(true);
    try {
      const r = await forma3ShartnomaAktlarOl({ shartnomaId, davrBoshi: chegara.boshi, davrOxiri: chegara.oxiri });
      setRoyxat(r);
      setBelgilangan(new Set(f3AktTanlov(r.aktlar).tanlangan));
    } catch (e) {
      setXato(t('F2 aktlar ro‘yxati o‘qilmadi: {s}', { s: e instanceof Error ? e.message : '—' }));
    } finally { setYuklanmoqda(false); }
  };
  useEffect(() => { void yukla(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [shartnomaId, oy]);
  const f3Royxat = async () => {
    if (shartnomaId == null) { setF3lar([]); return; }
    try { const r = await forma3ShartnomaRoyxatOl(shartnomaId); setF3lar(r.forma3lar ?? []); } catch { setF3lar([]); }
  };
  useEffect(() => { setEsf(null); void f3Royxat(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [shartnomaId]);

  /** Mavjud Forma 3 uchun ESF bo'limini ochadi: F3 ning o'z aktlari va davri bo'yicha manbalar qayta yig'iladi (summa yangidan o'ylab topilmaydi). */
  const esfOch = async (f: Forma3ShartnomaRoyxatQator) => {
    setXato('');
    if (!shartnomaId) return;
    const shartnoma = shartnomalar.find((x) => x.id === shartnomaId);
    if (!shartnoma) return;
    const fOy = f.davr_boshi.slice(0, 7);
    setIshlayapti(t('Manbalar yig‘ilmoqda…'));
    try {
      const r = await forma3ShartnomaAktlarOl({ shartnomaId, davrBoshi: f.davr_boshi, davrOxiri: f.davr_oxiri });
      const m = await forma3ShartnomaManbalari({
        kompaniyaId: companyId,
        obyektlar: r.obyektlar.map((o) => ({ id: o.obyekt_id, nom: o.nom ?? `#${o.obyekt_id}` })),
        oy: fOy, tanlangan: new Set(f.aktlar),
        onProgress: (n, jami, nom) => setIshlayapti(t('Obyektlar o‘qilmoqda: {n} / {jami} {nom}', { n, jami, nom })),
      });
      if (!m.ok) { setXato(m.xato); return; }
      const zakazchik = zakazchikRekvizit(shartnoma, (id) => kompaniyalar.find((x) => x.id === id)) as Forma3Rekvizit;
      const h = forma3ShartnomaHujjat(m.obyektlar, { davr: fOy, shartnomaRaqam: shartnoma.raqam, shartnomaNom: shartnoma.nom, shartnomaSumma: shartnoma.jami_nds_bilan ?? shartnoma.summa_bez_nds, imzo, pudratchi, zakazchik });
      setEsf({ yigindi: h.yigindi, zakazchik, forma3Id: f.id, raqam: f.raqam, holat: f.esf_holat, tashqiId: f.esf_tashqi_id, shartnomaId, oy: fOy });
    } catch {
      setXato(t('Forma 3 fayli tuzilmadi. Hujjat manbalari va bog‘lanishlarini tekshiring.'));
    } finally { setIshlayapti(''); }
  };

  const tanlov = useMemo(() => (royxat ? f3AktTanlov(royxat.aktlar) : null), [royxat]);
  const yuboriladi = useMemo(() => (royxat ? f3YuboriladiganAktlar(royxat.aktlar, belgilangan) : []), [royxat, belgilangan]);
  const sh = shartnomalar.find((x) => x.id === shartnomaId) ?? null;

  const yarat = async () => {
    setXato(''); setDiqqat([]);
    if (!sh || !royxat || !chegara) return;
    if (!yuboriladi.length) { setXato(t('Hech bo‘lmasa bitta tasdiqlangan F2 akt belgilang.')); return; }
    setIshlayapti(t('Manbalar yig‘ilmoqda…'));
    try {
      const m = await forma3ShartnomaManbalari({
        kompaniyaId: companyId,
        obyektlar: royxat.obyektlar.map((o) => ({ id: o.obyekt_id, nom: o.nom ?? `#${o.obyekt_id}` })),
        oy, tanlangan: new Set(yuboriladi),
        onProgress: (n, jami, nom) => setIshlayapti(t('Obyektlar o‘qilmoqda: {n} / {jami} {nom}', { n, jami, nom })),
      });
      if (!m.ok) { setXato(m.xato); return; }
      const zakazchik = zakazchikRekvizit(sh, (id) => kompaniyalar.find((x) => x.id === id)) as Forma3Rekvizit;
      const h = forma3ShartnomaHujjat(m.obyektlar, {
        davr: oy, shartnomaRaqam: sh.raqam, shartnomaNom: sh.nom, shartnomaSumma: sh.jami_nds_bilan ?? sh.summa_bez_nds,
        imzo, pudratchi, zakazchik,
      });
      setDiqqat(h.diqqat);
      esfManba.current = { yigindi: h.yigindi, zakazchik };
      // Server yozuvi (bitta F3: shartnoma_id, obyekt NULL, barcha tanlangan aktlar) — hujjat berilishidan OLDIN: band/begona akt bo'lsa fayl chiqmaydi.
      const kalit = `${shartnomaId}|${oy}|${yuboriladi.join(',')}`;
      if (opId.current?.kalit !== kalit) opId.current = { kalit, id: yangiOperationId() };
      setIshlayapti(t('Forma 3 yozuvi yaratilmoqda…'));
      let f3Id: number | null = null;
      try {
        const j = await forma3Yarat({ shartnomaId: sh.id, loyihaId: sh.loyiha_id, aktIds: yuboriladi, davrBoshi: chegara.boshi, davrOxiri: chegara.oxiri, operationId: opId.current.id });
        f3Id = Number(j.forma3_id) || null;
      } catch (e) {
        const kod = `${(e as { code?: string })?.code ?? ''} ${e instanceof Error ? e.message : ''}`;
        setXato(/FORMA3_AKT_BAND/.test(kod) ? t('Tanlangan F2 aktlardan biri allaqachon boshqa Forma 3 ga kiritilgan — ro‘yxatni yangilang.')
          : /FORMA3_AKT_INVALID/.test(kod) ? t('Tanlangan aktlar shartnoma/davrga mos kelmadi — ro‘yxatni yangilang.')
          : /DENIED|403/.test(kod) ? t('Forma 3 yaratish uchun ruxsat yo‘q (rahbar/buxgalter kerak).')
          : t('Forma 3 yozuvi yaratilmadi. Qayta urinib ko‘ring.'));
        void yukla();
        return;
      }
      const tk = await hujjatTokenBilan(
        { kompaniyaId: companyId, bytes: h.bytes, hujjat: 'F3', sabab: `Форма №3 (договор) · № ${raqamTozala(sh.raqam)} · ${oy}` },
        () => downloadBlob(h.bytes, h.faylNomi),
      );
      if (!tk.ok) { toast(tk.xabar, 'danger'); return; }
      if (tk.xabar) toast(tk.xabar, 'ok');
      toast(f3Id ? t('Forma 3 yaratildi (№ {id}): {n} ta F2 akt', { id: f3Id, n: yuboriladi.length }) : t('Forma 3 yaratildi'), 'ok');
      if (esfManba.current) setEsf({ ...esfManba.current, forma3Id: f3Id, shartnomaId: sh.id, oy });
      void yukla(); void f3Royxat();
    } catch (e) {
      setXato(e instanceof Error && e.message === 'MISSING_CERTIFIED_AMOUNT'
        ? t('Tasdiqlangan F2 manba summasi yetishmaydi. Manba hujjatni tekshiring; qiymat taxminan hisoblanmaydi.')
        : t('Forma 3 fayli tuzilmadi. Hujjat manbalari va bog‘lanishlarini tekshiring.'));
    } finally { setIshlayapti(''); }
  };

  return (
    <section className="fz-card" aria-label={t('Forma 3 — shartnoma bo‘yicha')} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div>
        <h2 className="fz-card__title">{t('Forma 3 — shartnoma bo‘yicha')}</h2>
        <p className="fz-card__sub">{t('Bitta Forma 3: shartnomaning barcha obyektlari, har obyekt o‘z nakrutkasi bilan.')}</p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 'var(--space-4)' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 260 }}>
          <span className="fz-kpi__label">{t('Shartnoma')}</span>
          <select className="input" aria-label={t('Shartnoma')} value={shartnomaId ?? ''} disabled={!!ishlayapti}
            onChange={(e) => setShartnomaId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('— tanlang —')}</option>
            {shartnomalar.map((s) => <option key={s.id} value={s.id}>№ {raqamTozala(s.raqam)}{s.nom ? ` — ${s.nom}` : ''}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="fz-kpi__label">{t('Hisobot oyi')}</span>
          <input className="input" type="month" aria-label={t('Hisobot oyi')} value={oy} disabled={!!ishlayapti} onChange={(e) => setOy(e.target.value)} />
        </label>
        <button type="button" className="fz-btn fz-btn--ghost" disabled={shartnomaId == null || yuklanmoqda || !!ishlayapti} onClick={() => void yukla()}>
          <RefreshCw className={yuklanmoqda ? 'animate-spin' : ''} /> {t('Yangilash')}
        </button>
      </div>

      {tanlov && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <p style={{ margin: 0, fontSize: 13 }}>
            {t('Obyektlar: {o}; tasdiqlangan F2 aktlar: {a}, shulardan boshqa Forma 3 da: {b}', { o: royxat?.obyektlar.length ?? 0, a: royxat?.aktlar.length ?? 0, b: tanlov.band.length })}
          </p>
          {tanlov.guruhlar.length === 0 && <p style={{ margin: 0 }}>{t('Bu oyda shartnoma obyektlarida tasdiqlangan F2 akt yo‘q.')}</p>}
          {tanlov.guruhlar.map((g) => (
            <fieldset key={g.obyekt_id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
              <legend style={{ fontSize: 12, padding: '0 4px' }}>{g.nom}</legend>
              {g.aktlar.map((a) => (
                <label key={a.akt_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, opacity: a.band ? 0.6 : 1 }}>
                  <input type="checkbox" disabled={a.band || !!ishlayapti} checked={!a.band && belgilangan.has(a.akt_id)}
                    onChange={(e) => setBelgilangan((s) => { const n = new Set(s); if (e.target.checked) n.add(a.akt_id); else n.delete(a.akt_id); return n; })} />
                  <span>{t('Ф-2 № {r}', { r: a.raqam ?? a.akt_id })} · {a.oy.slice(0, 7)}</span>
                  {a.band && <span className="fz-kpi__label">{t('boshqa Forma 3 da (№ {id})', { id: a.forma3_id ?? '—' })}</span>}
                </label>
              ))}
            </fieldset>
          ))}
          <div>
            <button type="button" className="fz-btn fz-btn--primary" disabled={!yuboriladi.length || !!ishlayapti || sh == null} onClick={() => void yarat()}>
              <FileSpreadsheet /> {t('Forma 3 yaratish')}
            </button>
          </div>
        </div>
      )}
      {(yuklanmoqda || ishlayapti) && <p role="status" style={{ margin: 0 }}>{ishlayapti || t('Yuklanmoqda…')}</p>}
      {f3lar.length > 0 && (
        <div role="group" aria-label={t('Shartnomaning Forma 3 lari')} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="fz-kpi__label">{t('Mavjud Forma 3 lar (ESF tayyorlash uchun tanlang)')}</span>
          {f3lar.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span>{t('Forma 3 № {id}', { id: f.raqam ?? f.id })} · {f.davr_boshi.slice(0, 7)}{f.esf_holat ? ` · ESF: ${f.esf_holat}` : ''}</span>
              <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" disabled={!!ishlayapti} onClick={() => void esfOch(f)}>{t('ESF tayyorlash')}</button>
            </div>
          ))}
        </div>
      )}
      {esf && sh && esf.shartnomaId === sh.id && (
        <Forma3EsfBolim key={esf.forma3Id ?? 'yangi'} kompaniyaId={companyId} boshHolat={esf.holat ?? null} boshTashqiId={esf.tashqiId ?? ''} forma3Id={esf.forma3Id} forma3Raqam={esf.raqam} oy={esf.oy} shartnoma={sh} yigindi={esf.yigindi} pudratchi={pudratchi} zakazchik={esf.zakazchik}
          qqsFoiz={esf.yigindi.obyektlar.find((o) => o.ndsFoiz != null)?.ndsFoiz ?? null} />
      )}
      {xato && <div role="alert" className="fz-note fz-note--danger"><AlertTriangle /><span>{xato}</span></div>}
      {diqqat.length > 0 && (
        <details className="fz-note fz-note--warn" style={{ display: 'block' }}>
          <summary style={{ cursor: 'pointer' }}>{t('Форма № 3 diqqatlar: {n} ta (hujjatda ham yozilgan)', { n: diqqat.length })}</summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20, listStyle: 'disc' }}>
            {diqqat.slice(0, 12).map((d, i) => <li key={i}><b>{d.nom}</b> — {d.sabab}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
