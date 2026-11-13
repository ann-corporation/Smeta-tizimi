/**
 * Slichitelniy SIKLI — hujjatdan keyingi qadam (egasi 2026-11-14): «к доплате» qatorlaridan Ф-2 qoralama, «к снятию» qatorlaridan
 * tuzatuvchi (minus) Ф-2 qoralama. Hisob — mavjud `faktPereraschetHisobla/farqYuk` (ishora bo'yicha bo'lingan, `lib/slichitelniy-tsikl.ts`),
 * yozish — mavjud `t2_akt_yarat_v2` (F2 qoralama). TASDIQLAMAYDI: tasdiqlash F2 tarixida, egasi tomonidan. Asl smeta va tasdiqlangan
 * aktlar o'zgarmaydi.
 */
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilePlus2, RefreshCw } from 'lucide-react';
import { sbOqi, sbT2AktYaratV2, yangiOperationId } from '../../api/supabase';
import { t2ToliqOqiParallel } from '../../api/t2-toliq-oqish';
import { tokenBilan } from '../../api/t2-token';
import { PERERASCHET_USTUNLAR, type PQator } from '../../lib/pereraschet';
import { faktPereraschetHisobla } from '../../lib/pereraschet-fakt';
import { slichitelniyTsiklYuki } from '../../lib/slichitelniy-tsikl';
import { bloklarmi, dublikatTekshiruv } from '../../lib/f2-dublikat/tekshiruv';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { useUstamaliSumma } from '../../umumiy/ui/useUstamaliSumma';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { useObyektF2Aktlari } from './F2DublikatPanel';

type Tur = 'doplata' | 'snyatie';

export function SlichitelniyTsikl({ kompaniyaId, obyektId }: { kompaniyaId: number; obyektId: number }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PQator[] | null>(null);
  const [qoshimcha, setQoshimcha] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [xato, setXato] = useState('');
  const [raqam, setRaqam] = useState('');
  const [oy, setOy] = useState(() => new Date().toISOString().slice(0, 7));
  const [yozilmoqda, setYozilmoqda] = useState<Tur | null>(null);
  const [yangila, setYangila] = useState(0);
  const operationId = useRef<Record<Tur, string>>({ doplata: yangiOperationId(), snyatie: yangiOperationId() });
  const ustama = useUstamaliSumma(obyektId, { kompaniyaId });
  const { aktlar } = useObyektF2Aktlari(rows ? obyektId : null, yangila);

  const yukla = async () => {
    setBusy(true); setXato('');
    try {
      const [h, qs] = await Promise.all([
        t2ToliqOqiParallel<PQator>(sbOqi, { jadval: 't2_qator_holat', filtr: 'obyekt_id=eq.' + obyektId, ustunlar: PERERASCHET_USTUNLAR, limit: 200000 }, 'qator_id'),
        t2ToliqOqiParallel<{ id: number }>(sbOqi, { jadval: 't2_qator', filtr: `obyekt_id=eq.${obyektId}&qoshimcha=is.true`, ustunlar: 'id', limit: 200000, versiya: 'tarix' }, 'id'),
      ]);
      if (!h.ok || h.toliq === false) { setXato(t('Smeta qatorlari to‘liq o‘qilmadi — sikl chala ma’lumot ustida hisoblanmaydi.')); setRows(null); return; }
      if (!qs.ok || qs.toliq === false) { setXato(t('Qo‘shimcha (smetadan tashqari) qatorlar o‘qilmadi — qayta urinib ko‘ring.')); setRows(null); return; }
      setQoshimcha(new Set((qs.qatorlar ?? []).map((x) => Number(x.id))));
      setRows(h.qatorlar ?? []);
    } catch { setXato(t('Ma’lumotni yuklab bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.')); }
    finally { setBusy(false); }
  };

  const yaxlitIdlari = ustama.yaxlitIdlari;
  const yaxlitIdlar = useMemo(() => (rows ? yaxlitIdlari?.(rows.map((r) => ({ id: r.qator_id, ota_id: r.ota_id }))) : undefined), [rows, yaxlitIdlari]);
  const n = useMemo(() => (rows ? faktPereraschetHisobla(rows, { qoshimchaIdlar: qoshimcha, bolimId: null, yaxlitIdlar }) : null), [rows, qoshimcha, yaxlitIdlar]);
  const yuk = useMemo(() => (n ? slichitelniyTsiklYuki(n) : null), [n]);

  const yarat = async (tur: Tur) => {
    if (!yuk || yozilmoqda) return;
    const qatorlar = tur === 'doplata' ? yuk.doplata : yuk.snyatie;
    const jami = tur === 'doplata' ? yuk.doplataJami : yuk.snyatieJami;
    if (!qatorlar.length) return;
    const rq = raqam.trim();
    if (!rq) { toast(t('Qoralama raqamini kiriting (masalan 12-П).'), 'warn'); return; }
    const aktRaqam = `${rq}-${tur === 'doplata' ? 'Д' : 'К'}`;
    const masalalar = dublikatTekshiruv({ aktlar, oy, raqam: aktRaqam, jami, ozAktId: null, manbaAktIdlar: [] });
    if (bloklarmi(masalalar)) { toast(masalalar.filter((m) => m.daraja === 'blok').map((m) => m.matn).join('\n'), 'danger'); return; }
    const ogoh = masalalar.filter((m) => m.daraja === 'ogoh').map((m) => m.matn);
    const matn = tur === 'doplata'
      ? t('Ф-2 QORALAMASI yaratiladi «{r}»: к доплате — {n} qator (fakt Ф-2 dan ko‘p). Tasdiqlash — F2 tarixida, egasi tomonidan. Davom etasizmi?', { r: aktRaqam, n: String(qatorlar.length) })
      : t('TUZATUVCHI (minus) Ф-2 QORALAMASI yaratiladi «{r}»: к снятию — {n} qator (Ф-2 fakt dan ko‘p). Tasdiqlash — F2 tarixida, egasi tomonidan. Davom etasizmi?', { r: aktRaqam, n: String(qatorlar.length) });
    if (!(await tasdiqSora({ matn: [matn, ...ogoh].join('\n\n') }))) return;
    setYozilmoqda(tur);
    try {
      const birlik = qatorlar.length * 3;
      const r = await tokenBilan({ kompaniyaId, amal: 'f2_qoralama', birlikSoni: birlik, meta: { obyekt: obyektId, qator: qatorlar.length, yacheyka: birlik, manba: 'slichitelniy_tsikl', tur } }, async () => {
        const res = await sbT2AktYaratV2({ obyektId, oy: `${oy}-01`, operationId: operationId.current[tur], raqam: aktRaqam, qatorlar });
        if (!res.ok) throw new Error(res.error || res.xabar || 'F2 qoralama yaratilmadi.');
        return res;
      });
      if (!r.ok) { toast(r.xabar, 'danger'); return; }
      operationId.current = { ...operationId.current, [tur]: yangiOperationId() };
      setYangila((x) => x + 1);
      toast(t('Ф-2 qoralamasi yaratildi. Tasdiqlash — F2 tarixida.'), 'ok', undefined, 12000, { label: t('Ochish'), onClick: () => navigate(`/admin/f2-tarix?obyekt=${obyektId}`) });
    } catch { toast(t('Javob olinmadi. Qayta urinib ko‘ring.'), 'danger'); }
    finally { setYozilmoqda(null); }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="slichitelniy-tsikl">
      <p className="text-[12.5px] text-text-dim">
        {t('Slichitelniy hujjatidan keyingi qadam: fakt Ф-2 da ilgari olingandan ko‘p bo‘lgan qatorlardan — Ф-2 qoralama (к доплате); Ф-2 fakt dan ko‘p bo‘lgan qatorlardan — tuzatuvchi minus Ф-2 qoralama (к снятию). Qoralama yaratiladi, tasdiqlanmaydi.')}
      </p>
      <div>
        <button type="button" className="fz-btn" disabled={busy} onClick={() => void yukla()}>
          <RefreshCw size={14} aria-hidden="true" /> {busy ? t('Hisoblanmoqda…') : rows ? t('Qayta hisoblash') : t('Hisoblash')}
        </button>
      </div>
      {xato && <div role="alert" className="text-[12.5px] text-danger">{xato}</div>}
      {n && yuk && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-border p-3">
              <div className="text-[12px] font-semibold text-text-dim">К доплате (+) — {yuk.doplata.length} {t('qator')}</div>
              <SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={yuk.doplataJami} katKesim={n.plusKesim} />
            </div>
            <div className="rounded border border-border p-3">
              <div className="text-[12px] font-semibold text-text-dim">К снятию (−) — {yuk.snyatie.length} {t('qator')}</div>
              <SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={-yuk.snyatieJami} katKesim={n.minusKesim} />
            </div>
          </div>
          {yuk.sigmadi.soni > 0 && (
            <div className="text-[12px] text-text-mute">
              {t('{n} pozitsiya qoralamaga sig‘madi (hajm farqi 0, faqat narx farqi) — ular «Pereraschet» sahifasidagi to‘liq storno formatida.', { n: String(yuk.sigmadi.soni) })}
            </div>
          )}
          {n.tekshirish.length > 0 && (
            <div className="text-[12px] text-text-mute">
              {t('{n} pozitsiya tekshirishni talab qiladi (narx yoki Ф-2 summasi noma’lum) — pulga kirmaydi, 0 deb olinmaydi.', { n: String(n.tekshirish.length) })}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11.5px] text-text-dim">
              {t('Qoralama raqami')}
              <input className="fz-input w-36" value={raqam} onChange={(e) => setRaqam(e.target.value)} placeholder="12-П" />
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] text-text-dim">
              {t('Oy')}
              <input type="month" className="fz-input w-36" value={oy} onChange={(e) => setOy(e.target.value)} />
            </label>
            <button type="button" className="fz-btn" disabled={!yuk.doplata.length || yozilmoqda != null} onClick={() => void yarat('doplata')}>
              <FilePlus2 size={14} aria-hidden="true" /> {t('К доплате → Ф-2 qoralama')}
            </button>
            <button type="button" className="fz-btn" disabled={!yuk.snyatie.length || yozilmoqda != null} onClick={() => void yarat('snyatie')}>
              <FilePlus2 size={14} aria-hidden="true" /> {t('К снятию → tuzatuvchi Ф-2 qoralama')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
