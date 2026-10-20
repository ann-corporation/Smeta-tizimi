import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { useEffect, useState } from 'react';
import { sbT2DaraxtOl, sbT2ObyektlarOlKomp, yangiOperationId, type T2Obyekt, type T2Qator } from '../../api/supabase';
import { sbT2QoshimchaIshYarat, sbT2ZamenaIshYarat, sbT2ResursBolaQosh } from '../../api/t2-additional-replacement';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';

// T2-PTO-CLOSURE-007: qo'shimcha ish / zamena / resurs qo'shish uchun ish
// haqiqiy backend (t2_qoshimcha_ish_yarat_v1/t2_zamena_ish_yarat_v1/
// t2_resurs_bola_qosh_v1) bilan ulangan birinchi UI. Holat.tsx'ning GAS-nom
// asosidagi daraxtidan MUSTAQIL — o'z raqamli obyekt/qator manbasiga ega,
// shu bilan Holat.tsx'ning hali hal qilinmagan GAS-nom↔t2_obyekt.id
// muammosini butunlay chetlab o'tadi.

type Amal = 'additional' | 'replacement' | 'resource';

function qatorNomi(q: T2Qator): string {
  return `${'  '.repeat(q.daraja ?? 0)}${q.kod ? q.kod + ' ' : ''}${q.nom || ''} [${q.tur}]`;
}

function Sessiya({ companyId, fixedObjectId }: { companyId: number; fixedObjectId?: number }) {
  const [objects, setObjects] = useState<T2Obyekt[]>([]);
  const [objectId, setObjectId] = useState(fixedObjectId ? String(fixedObjectId) : '');
  const [rows, setRows] = useState<T2Qator[]>([]);
  const [loading, setLoading] = useState(false);

  const [amal, setAmal] = useState<Amal>('additional');
  const [parentId, setParentId] = useState('');
  const [oldId, setOldId] = useState('');
  const [resTur, setResTur] = useState<'rs' | 'mat' | 'ob'>('rs');
  const [kod, setKod] = useState('');
  const [nom, setNom] = useState('');
  const [birlik, setBirlik] = useState('');
  const [hajm, setHajm] = useState('');
  const [sabab, setSabab] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

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
    if (!fixedObjectId) return;
    setObjectId(String(fixedObjectId)); setRows([]); setParentId(''); formniTozala(); setError(''); setDone('');
    void daraxtniYukla(String(fixedObjectId));
  }, [fixedObjectId]);

  function formniTozala() {
    setKod(''); setNom(''); setBirlik(''); setHajm(''); setSabab(''); setOldId('');
  }

  async function daraxtniYukla(id: string) {
    setLoading(true);
    try {
      const r = await sbT2DaraxtOl(Number(id));
      if (!r.ok) throw new Error('Smeta o‘qilmadi.');
      setRows((r.qatorlar || []) as T2Qator[]);
    } catch (e) { setError(e instanceof Error ? e.message : 'O‘qish bajarilmadi.'); }
    finally { setLoading(false); }
  }

  async function obyektTanla(id: string) {
    setObjectId(id); setRows([]); setParentId(''); formniTozala(); setError(''); setDone('');
    if (!id) return;
    await daraxtniYukla(id);
  }

  const parent = rows.find(r => String(r.id) === parentId);
  const eskiNomzodlar = parent ? rows.filter(r => r.ota_id === parent.id && r.tur !== 'rz') : [];

  async function yaratish() {
    if (!parent) { setError('Ota qator tanlanmagan.'); return; }
    if (typeof parent.versiya !== 'number') { setError('Ota qator versiyasi noaniq — daraxtni qayta yuklang.'); return; }
    if (amal === 'replacement' && !oldId) { setError('Almashtiriladigan qator tanlanmagan.'); return; }
    if (!nom.trim() || !birlik.trim() || !sabab.trim()) { setError('Nom, birlik va sabab majburiy.'); return; }
    const hajmSoni = hajm.trim() === '' ? undefined : Number(hajm.replace(/[^\d.-]/g, ''));
    if (amal !== 'resource' && (hajmSoni === undefined || !Number.isFinite(hajmSoni) || hajmSoni <= 0)) {
      setError('Hajm musbat son bo‘lishi shart.'); return;
    }
    setBusy(true); setError(''); setDone('');
    const asos = {
      kompaniyaId: companyId, obyektId: Number(objectId), otaQatorId: parent.id,
      nom: nom.trim(), birlik: birlik.trim(), hajm: hajmSoni as number,
      kod: kod.trim() || undefined, sabab: sabab.trim(),
      operationId: yangiOperationId(), expectedVersion: parent.versiya,
    };
    try {
      const r = amal === 'additional' ? await sbT2QoshimchaIshYarat(asos)
        : amal === 'replacement' ? await sbT2ZamenaIshYarat({ ...asos, almashtirilayotganQatorId: Number(oldId) })
        : await sbT2ResursBolaQosh({ ...asos, tur: resTur, hajm: hajmSoni });
      if (!r.ok) { setError(r.xabar || r.error || 'Saqlanmadi.'); return; }
      formniTozala();
      await daraxtniYukla(objectId);
      setDone('O‘zgarish muvaffaqiyatli yaratildi.');
    } catch { setError('Tarmoq xatosi — qayta urinib ko‘ring.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 p-1">
      {!fixedObjectId && <label className="block text-sm">Obyekt
        <select aria-label="Obyekt" className="ml-2 border rounded px-2 py-1"
          value={objectId} onChange={e => void obyektTanla(e.target.value)}>
          <option value="">Tanlang</option>
          <ObyektOptionlari obyektlar={objects} />
        </select>
      </label>}
      {loading && <p role="status">Smeta yuklanmoqda…</p>}
      {objectId && !loading && (
        <>
          <label className="block text-sm">Amal
            <select aria-label="Amal" className="ml-2 border rounded px-2 py-1"
              value={amal} onChange={e => { setAmal(e.target.value as Amal); formniTozala(); }}>
              <option value="additional">Qo‘shimcha ish (BL)</option>
              <option value="replacement">Zamena</option>
              <option value="resource">Resurs qo‘shish</option>
            </select>
          </label>
          <label className="block text-sm">Ota qator
            <select aria-label="Ota qator" className="ml-2 border rounded px-2 py-1"
              value={parentId} onChange={e => { setParentId(e.target.value); setOldId(''); }}>
              <option value="">Tanlang</option>
              {rows.map(r => <option key={r.id} value={r.id}>{qatorNomi(r)}</option>)}
            </select>
          </label>
          {amal === 'replacement' && (
            <label className="block text-sm">Almashtiriladigan qator
              <select aria-label="Almashtiriladigan qator" className="ml-2 border rounded px-2 py-1"
                value={oldId} onChange={e => setOldId(e.target.value)} disabled={!parent}>
                <option value="">Tanlang</option>
                {eskiNomzodlar.map(r => <option key={r.id} value={r.id}>{qatorNomi(r)}</option>)}
              </select>
            </label>
          )}
          {amal === 'resource' && (
            <label className="block text-sm">Resurs turi
              <select aria-label="Resurs turi" className="ml-2 border rounded px-2 py-1"
                value={resTur} onChange={e => setResTur(e.target.value as 'rs' | 'mat' | 'ob')}>
                <option value="rs">RS</option><option value="mat">MAT</option><option value="ob">OB</option>
              </select>
            </label>
          )}
          <label className="block text-sm">Kod
            <input aria-label="Kod" className="ml-2 border rounded px-2 py-1" value={kod} onChange={e => setKod(e.target.value)} />
          </label>
          <label className="block text-sm">Nom
            <input aria-label="Nom" className="ml-2 border rounded px-2 py-1" value={nom} onChange={e => setNom(e.target.value)} />
          </label>
          <label className="block text-sm">Birlik
            <input aria-label="Birlik" className="ml-2 border rounded px-2 py-1" value={birlik} onChange={e => setBirlik(e.target.value)} />
          </label>
          {amal !== 'resource' && (
            <label className="block text-sm">Hajm
              <input aria-label="Hajm" type="number" className="ml-2 border rounded px-2 py-1" value={hajm} onChange={e => setHajm(e.target.value)} />
            </label>
          )}
          <label className="block text-sm">Sabab
            <input aria-label="Sabab" className="ml-2 border rounded px-2 py-1" value={sabab} onChange={e => setSabab(e.target.value)} />
          </label>
          {error && <p role="alert" className="text-danger">{error}</p>}
          {done && <p role="status">{done}</p>}
          <button className="karta px-3 py-1.5"
            disabled={busy || !parentId || (amal === 'replacement' && !oldId)}
            onClick={() => void yaratish()}>
            {busy ? 'Yozilmoqda…' : 'Yaratish'}
          </button>
        </>
      )}
    </div>
  );
}

export default function AdditionalReplacementNative({ obyektId }: { obyektId?: number } = {}) {
  const { joriy, yuklanmoqda } = useKompaniya();
  if (yuklanmoqda) return <p>Kompaniya yuklanmoqda…</p>;
  if (!joriy?.id) return <p>Kompaniyani tanlang.</p>;
  return <Sessiya key={`${joriy.id}:${obyektId ?? 'all'}`} companyId={joriy.id} fixedObjectId={obyektId} />;
}
