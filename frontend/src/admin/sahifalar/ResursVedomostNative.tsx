import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { useEffect, useState } from 'react';
import { sbT2ObyektlarOlKomp, sbT2QatorHolatOl, type T2Obyekt, type T2QatorHolat } from '../../api/supabase';
import { resursVedomostHujjat, resursVedomostKategoriyalarga, type ResursVedomostKategoriya } from '../../lib/resurs-vedomost';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { useHujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';
import { HujjatTomonlariPanel, useHujjatTomonlari } from '../../umumiy/hujjat/HujjatTomonlari';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { FmtN } from '../../lib/format';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { toast } from '../../umumiy/ui/Toast';

// T2-PTO-CLOSURE-007 (Claude lane): egasining so'rovi bo'yicha — butun
// smeta+F2'dan kategoriya (ЧЕЛ/МАШ/МАТ/ОБ/КАБ/М-К) kesimida resurs
// vedomosti. Manba — `t2_qator_holat` (bu sessiyada certified_* ustuvor
// bo'lishi tuzatilgan), yangi hisob-kitob yo'q, faqat jamlanma. Holat.tsx
// bilan bir xil "ochish ixtiyoriy" naqsh — mavjud oqimga tegmaydi.

function Sessiya({ companyId, fixedObjectId }: { companyId: number; fixedObjectId?: number }) {
  const [objects, setObjects] = useState<T2Obyekt[]>([]);
  const [objectId, setObjectId] = useState(fixedObjectId ? String(fixedObjectId) : '');
  const [kategoriyalar, setKategoriyalar] = useState<ResursVedomostKategoriya[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [qidiruv, setQidiruv] = useState('');
  const [holatlar, setHolatlar] = useState<T2QatorHolat[]>([]);
  const [tomonlar, setTomonlar] = useHujjatTomonlari(companyId);

  useEffect(() => {
    let active = true;
    void sbT2ObyektlarOlKomp(companyId).then(r => {
      if (!active) return;
      setObjects(r.ok ? (r.qatorlar || []) as T2Obyekt[] : []);
      if (!r.ok) setError('Obyektlar o‘qilmadi.');
    });
    return () => { active = false; };
  }, [companyId]);

  useEffect(() => {
    if (fixedObjectId) void obyektTanla(String(fixedObjectId));
  }, [fixedObjectId]);

  async function obyektTanla(id: string) {
    setObjectId(id); setKategoriyalar([]); setError('');
    if (!id) return;
    setLoading(true);
    try {
      const r = await sbT2QatorHolatOl(Number(id));
      if (!r.ok) throw new Error('Ma’lumot o‘qilmadi.');
      const rows = (r.qatorlar || []) as T2QatorHolat[];
      setHolatlar(rows);
      setKategoriyalar(resursVedomostKategoriyalarga(rows));
    } catch (e) { setError(e instanceof Error ? e.message : 'O‘qish bajarilmadi.'); }
    finally { setLoading(false); }
  }

  const filtr = qidiruv.trim().toUpperCase();
  const korinadigan = kategoriyalar.map(k => ({
    ...k,
    qatorlar: filtr ? k.qatorlar.filter(r => r.nom.toUpperCase().includes(filtr)) : k.qatorlar,
  })).filter(k => k.qatorlar.length > 0);

  const korinish = useHujjatKorinish();
  async function hujjat(korish: boolean) {
    const nom = objects.find((o) => String(o.id) === objectId)?.nom || `Obyekt ${objectId}`;
    const h = resursVedomostHujjat(holatlar, { obyektNomi: nom, imzo: tomonlar });
    const t = await hujjatTokenBilan({ kompaniyaId: companyId, bytes: h.bytes, hujjat: 'RESURS_VEDOMOST', sabab: `Ресурсная ведомость · ${nom}`, obyekt: objectId },
      () => { if (korish) korinish.ochish(h.bytes, h.faylNomi); else downloadBlob(h.bytes, h.faylNomi); });
    if (!t.ok) toast(t.xabar, 'danger'); else if (t.xabar) toast(t.xabar, 'ok');
  }
  return (
    <div className="space-y-3 p-1">
      {korinish.oyna}
      {!fixedObjectId && <label className="block text-sm">Obyekt
        <select aria-label="Obyekt" className="ml-2 border rounded px-2 py-1"
          value={objectId} onChange={e => void obyektTanla(e.target.value)}>
          <option value="">Tanlang</option>
          <ObyektOptionlari obyektlar={objects} />
        </select>
      </label>}
      {loading && <p role="status">Yuklanmoqda…</p>}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {kategoriyalar.length > 0 && (
        <>
          <div className="flex flex-wrap items-start gap-3">
            <button type="button" className="h-8 rounded-lg border px-3 text-sm hover:border-accent/50"
              onClick={() => void hujjat(false)}>Ресурсная ведомость (Excel)</button>
            <button type="button" className="h-8 rounded-lg border px-3 text-sm hover:border-accent/50" title="Saytda hujjatdagiday ko‘rish"
              onClick={() => void hujjat(true)}>Ko‘rish</button>
            <div className="min-w-[260px] flex-1"><HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} /></div>
          </div>
          <label className="block text-sm">Resurs qidirish
            <input aria-label="Resurs qidirish" className="ml-2 border rounded px-2 py-1"
              value={qidiruv} onChange={e => setQidiruv(e.target.value)} />
          </label>
          {korinadigan.map(k => (
            <details key={k.kat} className="karta p-3" open>
              <summary className="cursor-pointer font-semibold text-sm flex items-center justify-between">
                <span>{k.kat} <span className="text-text-mute font-normal">({k.qatorlar.length} resurs)</span></span>
                <span className="text-[11px] text-text-mute font-normal">
                  Smeta: <FmtN val={k.jamiSmetaSumma} /> · F2: <FmtN val={k.jamiF2Summa} /> · Qoldiq: <FmtN val={k.jamiQoldiqSumma} />
                </span>
              </summary>
              {/* 8 ustun + uzun ruscha resurs nomlari: tor ekranda jadval
                  BUTUN sahifani gorizontal surib yubormasligi uchun o'z
                  konteyneri ichida suriladi. */}
              <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[640px] text-[12px]">
                <thead className="text-text-mute text-left">
                  <tr>
                    <th className="py-1">Resurs</th><th>Birlik</th>
                    <th className="text-right">Smeta hajm</th><th className="text-right">Smeta summa</th>
                    <th className="text-right">F2 hajm</th><th className="text-right">F2 summa</th>
                    <th className="text-right">Qoldiq hajm</th><th className="text-right">Qoldiq summa</th>
                  </tr>
                </thead>
                <tbody>
                  {k.qatorlar.map(r => (
                    <tr key={k.kat + '|' + r.nom + '|' + r.birlik} className="border-t border-border/60">
                      <td className="py-1">{r.kod ? r.kod + ' ' : ''}{r.nom}</td>
                      <td>{r.birlik || '—'}</td>
                      <td className="text-right tabular-nums"><FmtN val={r.smetaHajm} /></td>
                      <td className="text-right tabular-nums"><FmtN val={r.smetaSumma} /></td>
                      <td className="text-right tabular-nums"><FmtN val={r.f2Hajm} /></td>
                      <td className="text-right tabular-nums"><FmtN val={r.f2Summa} /></td>
                      <td className="text-right tabular-nums"><FmtN val={r.qoldiqHajm} /></td>
                      <td className="text-right tabular-nums"><FmtN val={r.qoldiqSumma} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </details>
          ))}
        </>
      )}
      {objectId && !loading && kategoriyalar.length === 0 && !error && (
        <p className="text-text-mute text-sm">Bu obyektda resurs qatori topilmadi.</p>
      )}
    </div>
  );
}

export default function ResursVedomostNative({ obyektId }: { obyektId?: number } = {}) {
  const { joriy, yuklanmoqda } = useKompaniya();
  if (yuklanmoqda) return <p>Kompaniya yuklanmoqda…</p>;
  if (!joriy?.id) return <p>Kompaniyani tanlang.</p>;
  return <Sessiya key={`${joriy.id}:${obyektId ?? 'all'}`} companyId={joriy.id} fixedObjectId={obyektId} />;
}
