/**
 * FotoLenta — obyekt foto-dalil lentasi (ekotizim V3, P2): sana yoki razdel bo'yicha guruhlangan fotolar,
 * davr/razdel filtri, yuklash (FotoDalil), «foto-hisobot» eksporti (Excel / chop etish-PDF).
 * Yangi mexanizm YO'Q: fayl — kanonik hujjat yo'li (R2), bog'lash — t2_foto_dalil, AI — aiHisobli (token yechadi).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { useT2ObyektlarRoyxati } from '../../api/t2-obyektlar-kesh';
import { useT2Daraxt } from '../../umumiy/daraxt/useT2Daraxt';
import { fotoBlobOl, fotoRoyxatOl, type FotoRoyxat } from '../../api/t2-foto-dalil';
import { FotoDalil, type FotoNomzod } from '../../components/foto-dalil/FotoDalil';
import { fotoGuruhla, fotoIzohi, fotoUrl, manbaNomi, oyOraligi, type FotoElement } from '../../lib/foto-dalil';
import { fotoHisobotHtml, fotoHisobotXlsx, hisobotKalit } from '../../lib/foto-hisobot';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';

function yuklab(bytes: Uint8Array, nom: string) {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a'); a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function FotoLenta() {
  const { joriy } = useKompaniya();
  const [params, setParams] = useSearchParams();
  const obyektId = Number(params.get('obyekt')); const valid = Number.isSafeInteger(obyektId) && obyektId > 0;
  const { obyektlar } = useT2ObyektlarRoyxati(joriy?.id ?? null);
  const { rows } = useT2Daraxt(valid ? obyektId : null);
  const [rejim, setRejim] = useState<'sana' | 'razdel'>('sana');
  const [oy, setOy] = useState(''); const [razdelId, setRazdelId] = useState<number | null>(null);
  const [data, setData] = useState<FotoRoyxat | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [eksport, setEksport] = useState(false);
  const [versiya, setVersiya] = useState(0);
  const oraliq = useMemo(() => (oy ? oyOraligi(oy) : null), [oy]);
  const obyektNomi = obyektlar.find((o) => o.id === obyektId)?.nom ?? `#${obyektId}`;

  /* AI taklifi uchun nomzodlar: obyektning yuqori razdellari (arzon, ma'noli); aniq ish tanlash — fakt/АОСР sahifasidagi FotoDalil da. */
  const nomzodlar: FotoNomzod[] = useMemo(() => (rows ?? []).filter((r) => r.tur === 'rz' && r.ota_id == null).slice(0, 40).map((r) => ({ tur: 'qator', id: r.id, nom: `${r.kod ?? ''} ${r.nom ?? ''}`.trim() })), [rows]);

  const yukla = useCallback(async () => {
    if (!valid || !joriy?.id) { setData(null); return; }
    setXato(null);
    try { setData(await fotoRoyxatOl(joriy.id, obyektId, { razdelId, dan: oraliq?.[0] ?? null, gacha: oraliq?.[1] ?? null, limit: 200 })); }
    catch (e) { setXato((e as Error).message); }
  }, [valid, joriy?.id, obyektId, razdelId, oraliq]);
  useEffect(() => { void yukla(); }, [yukla, versiya]);

  const guruhlar = useMemo(() => fotoGuruhla(data?.fotolar ?? [], rejim), [data, rejim]);
  /* Hisobot uchun tanlangan davrning BARCHA fotosi (lenta sahifalangan bo'lishi mumkin) */
  const hisobotFotolari = async () => (joriy?.id ? (await fotoRoyxatOl(joriy.id, obyektId, { razdelId, dan: oraliq?.[0] ?? null, gacha: oraliq?.[1] ?? null, limit: 500 })).fotolar : []);

  /* Hisobot chiqarish PULLIK (mavjud hujjat-token yo'li: hujjatTokenBilan); xesh barqaror kalitdan — qayta yuklash bepul. Yuklash (upload) bepul. */
  const tokenBilanBer = async (fotolar: FotoElement[], hujjat: string, yetkaz: Parameters<typeof hujjatTokenBilan>[1]) => {
    if (!joriy?.id) return false;
    const r = await hujjatTokenBilan({ kompaniyaId: joriy.id, bytes: hisobotKalit(fotolar, { obyektId, dan: oraliq?.[0] ?? null, gacha: oraliq?.[1] ?? null }),
      hujjat, sabab: `Foto-hisobot: ${obyektNomi}`, obyekt: obyektId, yacheykalar: 0 }, yetkaz);
    toast(r.ok ? (r.xabar || t('Foto-hisobot tayyor')) : r.xabar, r.ok ? 'ok' : 'warn');
    return r.ok;
  };
  const excel = async () => {
    setEksport(true);
    try {
      const fotolar = await hisobotFotolari();
      const r = await fotoHisobotXlsx(fotolar, { obyektNomi, dan: oraliq?.[0] ?? null, gacha: oraliq?.[1] ?? null }, fotoBlobOl);
      await tokenBilanBer(fotolar, 'Foto-hisobot (Excel)', () => yuklab(r.bytes, r.faylNomi));
    } catch (e) { toast((e as Error).message, 'warn'); } finally { setEksport(false); }
  };
  const chop = async () => {
    const w = window.open('', '_blank'); if (!w) { toast(t('Oyna ochilmadi — brauzerda oynalarga ruxsat bering'), 'warn'); return; }
    setEksport(true);
    try {
      const fotolar = await hisobotFotolari();
      const r = await fotoHisobotHtml(fotolar, { obyektNomi, dan: oraliq?.[0] ?? null, gacha: oraliq?.[1] ?? null }, fotoBlobOl);
      const ok = await tokenBilanBer(fotolar, 'Foto-hisobot (PDF)', () => { w.document.open(); w.document.write(r.html); w.document.close(); setTimeout(() => w.print(), 400); });
      if (!ok) w.close();
    } catch (e) { w.close(); toast((e as Error).message, 'warn'); } finally { setEksport(false); }
  };

  return (
    <Sahifa sarlavha="Foto-dalil" tavsif="Obyekt fotolari: sana va razdel bo‘yicha lenta, foto-hisobot">
      <div className="flex flex-col gap-3">
        <section className="fz-card flex flex-wrap items-end gap-2 p-3">
          <label className="min-w-[240px] flex-1 text-[12px] font-medium text-text-dim">{t('Obyekt')}
            <select aria-label={t('Obyekt')} value={valid ? obyektId : ''} onChange={(e) => setParams(e.target.value ? { obyekt: e.target.value } : {})} className="input mt-1.5 block h-9 w-full px-2 text-[13px] text-text">
              <option value="">{t('-- obyektni tanlang --')}</option>
              <ObyektOptionlari obyektlar={obyektlar} />
            </select>
          </label>
          <label className="text-[12px] font-medium text-text-dim">{t('Oy')}
            <input type="month" value={oy} onChange={(e) => setOy(e.target.value)} className="input mt-1.5 block h-9 px-2 text-[13px] text-text" />
          </label>
          <label className="text-[12px] font-medium text-text-dim">{t('Razdel')}
            <select value={razdelId ?? ''} onChange={(e) => setRazdelId(e.target.value ? Number(e.target.value) : null)} className="input mt-1.5 block h-9 px-2 text-[13px] text-text">
              <option value="">{t('Hammasi')}</option>
              {(data?.razdellar ?? []).filter((r) => r.razdel_id != null).map((r) => <option key={r.razdel_id} value={r.razdel_id!}>{r.nom} ({r.soni})</option>)}
            </select>
          </label>
          <div role="group" aria-label={t('Guruhlash')} className="flex gap-1">
            {(['sana', 'razdel'] as const).map((k) => <button key={k} type="button" aria-pressed={rejim === k} onClick={() => setRejim(k)} className={`fz-btn fz-btn--sm ${rejim === k ? 'fz-btn--primary' : ''}`}>{k === 'sana' ? t('Sana bo‘yicha') : t('Razdel bo‘yicha')}</button>)}
          </div>
          <div className="ml-auto flex gap-2">
            <button type="button" className="fz-btn" disabled={!valid || eksport} onClick={() => void excel()}><Download size={14} aria-hidden /> {t('Foto-hisobot (Excel)')}</button>
            <button type="button" className="fz-btn" disabled={!valid || eksport} onClick={() => void chop()}><Printer size={14} aria-hidden /> {t('Foto-hisobot (PDF)')}</button>
          </div>
        </section>
        {!valid && <section className="fz-note fz-note--info"><span>{t('Avval obyektni tanlang.')}</span></section>}
        {xato && <section role="alert" className="fz-note fz-note--danger"><span>{xato}</span></section>}
        {valid && joriy?.id && (
          <section className="fz-card p-3">
            <FotoDalil kompaniyaId={joriy.id} obyektId={obyektId} nomzodlar={nomzodlar} onChange={() => setVersiya((v) => v + 1)} ixcham />
          </section>
        )}
        {valid && data && (
          <section aria-label={t('Foto lentasi')} className="flex flex-col gap-3">
            <p className="text-[12px] text-text-dim">{t('Jami')}: {data.jami}</p>
            {!guruhlar.length && <p className="text-[12px] text-text-dim">{t('Bu davrda foto yo‘q')}</p>}
            {guruhlar.map((g) => (
              <div key={g.kalit} className="fz-card p-3">
                <h3 className="mb-2 text-[13px] font-semibold">{g.sarlavha} <span className="font-normal text-text-dim">({g.fotolar.length})</span></h3>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {g.fotolar.map((f) => (
                    <li key={f.id} className="text-[11px]">
                      <img src={fotoUrl(f.document_id)} alt={fotoIzohi(f)} loading="lazy" className="aspect-square w-full rounded border object-cover" />
                      <div className="mt-0.5 truncate" title={f.manba_nom ?? ''}>{rejim === 'sana' ? (f.razdel_nom || '—') : f.sana} · {manbaNomi(f.manba_turi)}</div>
                      {fotoIzohi(f) && <div className="truncate italic text-text-dim" title={fotoIzohi(f)}>{fotoIzohi(f)}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}
      </div>
    </Sahifa>
  );
}

export default FotoLenta;
