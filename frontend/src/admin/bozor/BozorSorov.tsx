/**
 * Bozordan narx so'rash (xaridor, kompaniya a'zosi): zayavka / smeta qatori / narxsiz qatordan bir bosishda to'ldirilgan so'rov (havola parametrlari),
 * takliflar taqqos jadvali (narx QQS siz, muddat, yetkazish, reyting), bir nechta taklif bo'lsa O'RTACHA + ogohlantirish, g'olib tanlash
 * (mavjud buyurtma + narx manbasi), qabul va baho. Boshqa kompaniya ma'lumoti ko'rinmaydi.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { qatorSumma } from '../../lib/hisob-yadro';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { bzBaho, bzGolibTanla, bzQabul, bzSorovRoyxat, bzSorovYarat, bzTaqqos, type SorovQator, type Taqqos } from '../../api/t2-bozor';
import { BIRLIKLAR, ELON_TURLARI, HUDUDLAR } from '../../lib/bozor/katalog';
import { sorovBoshlangichOqi, yetkazishHavolasi } from '../../lib/bozor/havola';

const maydon = 'h-12 w-full rounded-lg border border-border px-3 text-[16px]';
const tugma = 'flex min-h-[48px] items-center justify-center rounded-xl px-4 text-[16px] font-semibold';
const HOLAT_NOM: Record<string, string> = { ochiq: 'Ochiq', tanlandi: 'Sotuvchi tanlandi', yetkazildi: 'Yetkazildi', qabul_qilindi: 'Qabul qilindi', bekor: 'Bekor' };
const XATO: Record<string, string> = {
  NOM_KERAK: 'Nom kiriting.', BIRLIK_KERAK: 'Birlikni tanlang.', HAJM_KERAK: 'Hajm 0 dan katta bo‘lsin.', PERMISSION_DENIED: 'Bu amal uchun ruxsatingiz yo‘q.',
  SOROV_YOPIQ: 'So‘rov allaqachon yopilgan.', QABUL_KERAK: 'Baho faqat qabul qilingandan keyin.', HOLAT: 'Hozirgi holatda bu amal mumkin emas.', OBYEKT_BEGONA: 'Obyekt kompaniyangizniki emas.',
};
const xabar = (c: string) => t(XATO[c] ?? 'Bajarib bo‘lmadi. Qayta urinib ko‘ring.');

function Forma({ kompaniyaId, onYaratildi }: { kompaniyaId: number; onYaratildi: (id: number) => void }) {
  const [p] = useSearchParams();
  const b = sorovBoshlangichOqi(p);
  const [nom, setNom] = useState(b?.nom ?? '');
  const [birlik, setBirlik] = useState(b?.birlik || 'dona');
  const [hajm, setHajm] = useState(b?.hajm != null ? String(b.hajm) : '');
  const [hudud, setHudud] = useState(b?.hudud ?? '');
  const [tur, setTur] = useState(b?.tur ?? 'tovar');
  const [muddat, setMuddat] = useState('');
  const [band, setBand] = useState(false);
  const yubor = async () => {
    setBand(true);
    const r = await bzSorovYarat(kompaniyaId, { nom, birlik, hajm, hudud: hudud || undefined, tur, muddat_sana: muddat || undefined, resurs_kodi: b?.resurs_kodi ?? undefined, zayavka_id: b?.zayavka_id, obyekt_id: b?.obyekt_id });
    setBand(false);
    if (r.ok) { toast(t('So‘rov bozorga yuborildi. Sotuvchilar narx beradi.'), 'ok'); onYaratildi(r.natija.id); } else toast(xabar(r.code), 'warn');
  };
  return (
    <div className="flex max-w-md flex-col gap-2 rounded-xl border border-border p-3">
      <h2 className="text-[17px] font-semibold">{t('Yangi so‘rov')}</h2>
      <div className="flex gap-1">{ELON_TURLARI.map((x) => <button key={x.kalit} type="button" onClick={() => setTur(x.kalit)} className={`h-11 flex-1 rounded-lg border text-[14px] ${tur === x.kalit ? 'border-blue-600 font-semibold' : 'border-border'}`}>{t(x.nom)}</button>)}</div>
      <input className={maydon} aria-label={t('Nima kerak')} placeholder={t('Nima kerak')} value={nom} onChange={(e) => setNom(e.target.value)} />
      <div className="flex gap-2">
        <input className={maydon} type="number" min={0} step="any" inputMode="decimal" aria-label={t('Hajm')} placeholder={t('Hajm')} value={hajm} onChange={(e) => setHajm(e.target.value)} />
        <select className="h-12 w-28 shrink-0 rounded-lg border border-border px-2" aria-label={t('Birlik')} value={birlik} onChange={(e) => setBirlik(e.target.value)}>{[...new Set([birlik, ...BIRLIKLAR])].map((x) => <option key={x}>{x}</option>)}</select>
      </div>
      <select className={maydon} aria-label={t('Hudud')} value={hudud} onChange={(e) => setHudud(e.target.value)}><option value="">{t('Hudud (obyekt joyi)')}</option>{HUDUDLAR.map((h) => <option key={h}>{h}</option>)}</select>
      <label className="flex flex-col gap-1 text-[13px] text-text-mute">{t('Kerakli sana')}<input className={maydon} type="date" value={muddat} onChange={(e) => setMuddat(e.target.value)} /></label>
      <button type="button" disabled={band || nom.trim().length < 2 || !(Number(hajm) > 0)} onClick={() => void yubor()} className={`${tugma} bg-blue-600 text-white`}>{t('Bozordan narx so‘rash')}</button>
      <p className="text-[12px] text-text-mute">{t('So‘rovda faqat nom, hajm, birlik va hudud ko‘rinadi — kompaniyangiz va smetangiz ko‘rinmaydi.')}</p>
    </div>
  );
}

function Taqqoslash({ kompaniyaId, sorovId, yangila }: { kompaniyaId: number; sorovId: number; yangila: () => void }) {
  const [d, setD] = useState<Taqqos | null>(null);
  const [band, setBand] = useState(false);
  const yukla = useCallback(async () => { const r = await bzTaqqos(kompaniyaId, sorovId); if (r.ok) setD(r.natija); }, [kompaniyaId, sorovId]);
  useEffect(() => { void yukla(); }, [yukla]);
  if (!d) return <p className="text-text-mute">{t('Yuklanmoqda…')}</p>;
  const ochiq = d.sorov.holat === 'ochiq';
  const tanla = async (id: number) => {
    setBand(true);
    const r = await bzGolibTanla(kompaniyaId, sorovId, id);
    setBand(false);
    if (!r.ok) { toast(xabar(r.code), 'warn'); return; }
    toast(r.natija.ogohlantirish === 'urtacha' ? t('Sotuvchi tanlandi. Narx manbasiga bozor o‘rtachasi yozildi (bir nechta taklif).') : t('Sotuvchi tanlandi. Narx manbasiga yozildi.'), 'ok');
    await yukla(); yangila();
  };
  return (
    <div className="flex flex-col gap-2">
      {d.ogohlantirish === 'urtacha' && <p role="status" className="rounded-lg bg-surface-2 p-2 text-[13px]">{t('Bir nechta taklif bor: narx manbasiga arifmetik o‘rtacha yoziladi (QQS siz)')}: <b><FmtN val={d.urtacha} /></b> / {d.sorov.birlik}.</p>}
      {d.takliflar.length === 0 ? <p className="text-text-mute">{t('Hozircha taklif yo‘q.')}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead><tr className="text-left text-text-mute"><th>{t('Sotuvchi')}</th><th className="text-right">{t('Narx (QQS siz)')}</th><th className="text-right">{t('Jami (QQS siz)')}</th><th>{t('Muddat')}</th><th>{t('Yetkazish')}</th><th>{t('Reyting')}</th><th /></tr></thead>
            <tbody>
              {d.takliflar.map((x) => (
                <tr key={x.id} className={`border-t border-border ${x.holat === 'tanlandi' ? 'bg-surface-2 font-semibold' : x.holat === 'rad' ? 'text-text-mute' : ''}`}>
                  <td>{x.sotuvchi_nom}{x.izoh ? <span className="block text-[12px] font-normal text-text-mute">{x.izoh}</span> : null}</td>
                  <td className="text-right tabular-nums"><FmtN val={x.narx_qqs_siz} /></td>
                  <td className="text-right tabular-nums"><FmtN val={qatorSumma(d.sorov.hajm, x.narx_qqs_siz)} /></td>
                  <td>{x.muddat_kun == null ? '—' : `${x.muddat_kun} ${t('kun')}`}</td>
                  <td>{x.yetkazish ? t('Ha') : t('Yo‘q')}</td>
                  <td>{x.reyting == null ? '—' : `★ ${x.reyting.toFixed(1)} (${x.reyting_soni})`}</td>
                  <td className="text-right">{ochiq && <button type="button" disabled={band} onClick={() => void tanla(x.id)} className="h-10 rounded-lg bg-blue-600 px-3 text-white">{t('Tanlash')}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.sorov.narx_manba_id != null && <p className="text-[13px] text-text-mute">{t('Narx manbasi yozildi')} (#{d.sorov.narx_manba_id}). <Link to="/admin/narx-manbalari" className="underline">{t('Narx manbalari')}</Link>{d.sorov.buyurtma_id != null ? ` · ${t('Buyurtma')} #${d.sorov.buyurtma_id}` : ` · ${t('Sotuvchi yakka shaxs: bitim shu so‘rovda yuradi.')}`}</p>}
    </div>
  );
}

export default function BozorSorov() {
  const { joriy } = useKompaniya();
  const kid = joriy?.id ?? 0;
  const [royxat, setRoyxat] = useState<SorovQator[]>([]);
  const [ochiq, setOchiq] = useState<number | null>(null);
  const [xato, setXato] = useState('');
  const yukla = useCallback(async () => {
    if (!kid) return;
    const r = await bzSorovRoyxat(kid);
    if (r.ok) { setRoyxat(r.natija.sorovlar); setXato(''); } else setXato(r.code);
  }, [kid]);
  useEffect(() => { void yukla(); }, [yukla]);
  if (!joriy) return <Sahifa sarlavha={t('Bozordan narx so‘rash')}><p className="p-4 text-text-mute">{t('Kompaniya tanlang.')}</p></Sahifa>;
  const qabul = async (id: number) => { const r = await bzQabul(kid, id); if (r.ok) { toast(t('Qabul qilindi.'), 'ok'); void yukla(); } else toast(xabar(r.code), 'warn'); };
  const baho = async (id: number, n: number) => { const r = await bzBaho(id, n); if (r.ok) { toast(t('Baho yuborildi.'), 'ok'); void yukla(); } else toast(xabar(r.code), 'warn'); };
  return (
    <Sahifa sarlavha={t('Bozordan narx so‘rash')} tavsif={t('Ochiq so‘rov yuboring, takliflarni taqqoslang, sotuvchini tanlang — buyurtma va narx manbasi avtomatik yoziladi.')}>
      <div className="flex flex-col gap-3 p-2">
        <Forma kompaniyaId={kid} onYaratildi={(id) => { setOchiq(id); void yukla(); }} />
        {xato && <p role="alert" className="text-warn">{xato === 'PERMISSION_DENIED' ? t('So‘rovlarni ko‘rish uchun xarid ruxsati kerak.') : t('Ro‘yxat yuklanmadi.')}</p>}
        <ul className="flex flex-col gap-2">
          {royxat.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
              <button type="button" onClick={() => setOchiq(ochiq === s.id ? null : s.id)} className="flex flex-wrap items-center justify-between gap-2 text-left">
                <span className="font-semibold">{s.nom} · <FmtN val={s.hajm} /> {s.birlik}</span>
                <span className="text-[13px] text-text-mute">{t(HOLAT_NOM[s.holat] ?? s.holat)} · {t('takliflar')}: {s.taklif_soni}</span>
              </button>
              {ochiq === s.id && <Taqqoslash kompaniyaId={kid} sorovId={s.id} yangila={() => void yukla()} />}
              <div className="flex flex-wrap gap-2">
                {s.holat === 'yetkazildi' && <button type="button" onClick={() => void qabul(s.id)} className={`${tugma} bg-blue-600 text-white`}>{t('Qabul qildim')}</button>}
                {s.holat === 'tanlandi' && <Link to={yetkazishHavolasi({ nom: s.nom, hajm: s.hajm, birlik: s.birlik, hudud: s.hudud })} className={`${tugma} border border-border`}>{t('Yetkazib berish kerak')}</Link>}
                {s.holat === 'qabul_qilindi' && !s.baholangan && [5, 4, 3, 2, 1].map((n) => <button key={n} type="button" onClick={() => void baho(s.id, n)} className="h-11 w-11 rounded-lg border border-border">{n}★</button>)}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Sahifa>
  );
}
