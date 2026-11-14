import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Lock, LockOpen, Plus, Save } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import { buxDavr, buxDavrBlok, buxHisobSaqla, buxHisobTasdiq, buxMoslikSaqla, buxShablonTanla, buxSozlamaOl, buxXato, type BuxHolat, type BuxHisob, type BuxSozlama } from '../../api/t2-bux-hisob';
import { Izoh, XatoQator } from './umumiy';
import { ddmmyyyy, kirit, td, th, yorliq } from './yordamchi';

const TURLAR: Array<[string, () => string]> = [
  ['aktiv', () => t('Aktiv')], ['passiv', () => t('Passiv')], ['aktiv_passiv', () => t('Aktiv-passiv')], ['daromad', () => t('Daromad')],
  ['xarajat', () => t('Xarajat')], ['balansdan_tashqari', () => t('Balansdan tashqari')],
];
/** Qoida kaliti → oddiy so'zlar bilan tushuntirish. */
const QOIDA_NOM: Record<string, () => string> = {
  'sotuv.realizatsiya': () => t('Forma-3: realizatsiya (QQS siz)'), 'sotuv.nds': () => t('Forma-3: chiqarilgan QQS'),
  'xarid.ombor': () => t('Ombor kirimi (QQS siz)'), 'xarid.ish': () => t('Subpudrat / xizmat dalolatnomasi (QQS siz)'), 'xarid.nds': () => t('Xarid QQS i'),
  'tolov.kirim': () => t('Buyurtmachidan kelgan to‘lov'), 'tolov.chiqim': () => t('Kontragentga to‘langan to‘lov'),
  'boshlangich.kreditor': () => t('Kreditor boshlang‘ich qoldig‘i'), 'ish_haqi.hisoblash': () => t('Ish haqi hisoblandi (Kadrlar — keyin)'),
  'ish_haqi.tolash': () => t('Ish haqi to‘landi (Kadrlar — keyin)'), 'param.nds_foiz': () => t('QQS stavkasi, %'),
  'taqdim.f2': () => t('Qabul qilingan Forma-2: kapital qo‘yilma (QQS siz)'), 'taqdim.nds': () => t('Qabul qilingan Forma-2: kiruvchi QQS'),
  'xarajat.chel': () => t('Xarajat: mehnat (ЧЕЛ)'), 'xarajat.mash': () => t('Xarajat: mexanizm (МАШ)'), 'xarajat.ob': () => t('Xarajat: uskuna (ОБ)'),
  'xarajat.mat': () => t('Xarajat: material (МАТ) — o‘chirilgan'), 'xarajat.sub': () => t('Xarajat: subpudrat (SUB) — o‘chirilgan'), 'xarajat.otk': () => t('Xarajat: boshqa (OTK) — o‘chirilgan'),
};

function oylar(n = 6, d = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-01`; });
}

export type SozlamaBolim = 'reja' | 'qoida' | 'davr';

/** Sozlama bo'limlari: Hisoblar rejasi (план счетов), Qoidalar (правила проводок), Davrni yopish (закрытие периода). */
export function Sozlama({ kid, holat, onOzgardi, yozadi, tasdiqlaydi, bolim, versiya = 0 }: {
  kid: number; holat: BuxHolat; onOzgardi: () => void; yozadi: boolean; tasdiqlaydi: boolean; bolim: SozlamaBolim; versiya?: number;
}) {
  const [xato, setXato] = useState<string | null>(null);
  const [soz, setSoz] = useState<BuxSozlama | null>(null);
  useEffect(() => {
    let tirik = true;
    void buxSozlamaOl(kid).then((r) => { if (tirik && r.ok) setSoz(r.natija); });
    return () => { tirik = false; };
  }, [kid, versiya, holat]);
  return (
    <div className="space-y-6">
      <XatoQator xato={xato} />
      {bolim === 'davr' && <DavrYopish kid={kid} holat={holat} onOzgardi={onOzgardi} tasdiqlaydi={tasdiqlaydi} setXato={setXato} soz={soz} />}
      {bolim === 'qoida' && <Qoidalar kid={kid} holat={holat} onOzgardi={onOzgardi} tasdiqlaydi={tasdiqlaydi} setXato={setXato} soz={soz} />}
      {bolim === 'reja' && <Reja kid={kid} holat={holat} onOzgardi={onOzgardi} yozadi={yozadi} tasdiqlaydi={tasdiqlaydi} setXato={setXato} />}
    </div>
  );
}

function DavrYopish({ kid, holat, onOzgardi, tasdiqlaydi, setXato, soz }: { kid: number; holat: BuxHolat; onOzgardi: () => void; tasdiqlaydi: boolean; setXato: (x: string | null) => void; soz: BuxSozlama | null }) {
  const [og, setOg] = useState<{ oy: string; royxat: Array<{ kod: string; xabar: string }> } | null>(null);
  const blokYoq = async (blok: boolean) => {
    const r = await buxDavrBlok(kid, blok, yangiOperationId());
    if (!r.ok) { setXato(buxXato(r)); return; }
    setXato(null); toast(blok ? t('Yopiq oyga yozish bloklandi') : t('Yopiq oyga yozish faqat ogohlantiradi'), 'ok'); onOzgardi();
  };
  const holatOy = useMemo(() => new Map(holat.davrlar.map((d) => [d.oy, d.holat])), [holat.davrlar]);
  const amal = async (oy: string, a: 'yop' | 'och', tasdiq: boolean) => {
    const r = await buxDavr({ kompaniyaId: kid, oy, amal: a, tasdiq, operationId: yangiOperationId() });
    if (r.code === 'OGOHLANTIRISH') { setOg({ oy, royxat: r.ogohlantirishlar ?? [] }); return; }
    if (!r.ok) { setXato(buxXato(r)); return; }
    setOg(null); setXato(null); toast(a === 'yop' ? t('Oy yopildi') : t('Oy qayta ochildi'), 'ok'); onOzgardi();
  };
  return (
    <section className="space-y-2" aria-label={t('Davrni yopish')}>
      <h3 className="text-[13px] font-semibold">{t('Davrni yopish (закрытие периода)')}<Izoh matn={t('Yopilgan oyga provodka yozilmaydi (blok yoqilgan bo‘lsa). Yopish uchun «tasdiqlash» ruxsati kerak.')} /></h3>
      {soz && (
        <label className="flex items-center gap-2 text-[12.5px]">
          <input type="checkbox" aria-label={t('Yopiq oyga yozishni bloklash')} checked={soz.davr_blok} disabled={!tasdiqlaydi} onChange={(e) => void blokYoq(e.target.checked)} />
          {t('Yopiq oyga yozishni bloklash')}
          <Izoh matn={t('O‘chirilsa, yopiq oyga provodka tushganda tizim to‘xtatmaydi, faqat ogohlantiradi.')} />
        </label>
      )}
      {og && (
        <div role="alert" className="rounded-md border border-warn/50 bg-warn/10 p-2 text-[12.5px]">
          <p className="flex items-center gap-1 font-medium"><AlertTriangle size={14} /> {t('Yopishdan oldin ogohlantirish:')}</p>
          <ul className="ml-5 list-disc">{og.royxat.map((x) => <li key={x.kod}>{x.kod === 'PROVODKASIZ_HUJJAT' ? t('Bu oyda hali provodkaga aylanmagan hujjatlar bor («Hujjatlardan yangilash»).') : x.kod === 'OLDINGI_OY_OCHIQ' ? t('Oldingi oylardan yopilmagani bor.') : x.xabar}</li>)}</ul>
          <div className="mt-2 flex gap-2">
            <button type="button" className="fz-btn" onClick={() => void amal(og.oy, 'yop', true)}><Lock size={13} /> {t('Baribir yopish')}</button>
            <button type="button" className="fz-btn" onClick={() => setOg(null)}>{t('Bekor')}</button>
          </div>
        </div>
      )}
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {oylar().map((oy) => {
          const yopiq = holatOy.get(oy) === 'yopiq';
          return (
            <li key={oy} className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1 text-[12.5px]">
              <span>{oy.slice(0, 7)} {yopiq ? <span className="text-text-mute">· {t('yopiq')}</span> : <span className="text-ok">· {t('ochiq')}</span>}</span>
              {tasdiqlaydi && (yopiq
                ? <button type="button" className="fz-btn" onClick={() => void amal(oy, 'och', false)}><LockOpen size={12} /> {t('Qayta ochish')}</button>
                : <button type="button" className="fz-btn" onClick={() => void amal(oy, 'yop', false)}><Lock size={12} /> {t('Yopish')}</button>)}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const SHABLON_NOM: Record<string, () => string> = { pudratchi: () => t('Pudratchi (sotuvchi tomon)'), buyurtmachi: () => t('Buyurtmachi (xaridor tomon)') };

function Qoidalar({ kid, holat, onOzgardi, tasdiqlaydi, setXato, soz }: { kid: number; holat: BuxHolat; onOzgardi: () => void; tasdiqlaydi: boolean; setXato: (x: string | null) => void; soz: BuxSozlama | null }) {
  const faol = holat.hisoblar.filter((h) => h.faol);
  const shablonTanla = async (shablon: string) => {
    const r = await buxShablonTanla(kid, shablon, yangiOperationId());
    if (!r.ok) { setXato(buxXato(r)); return; }
    setXato(null); toast(t('Shablon tanlandi: {n} ta qoida qo‘shildi', { n: r.moslik_qoshildi ?? 0 }), 'ok'); onOzgardi();
  };
  const [tahrir, setTahrir] = useState<Record<string, { dt: string; kt: string; q: string }>>({});
  const op = useRef<Record<string, string>>({});
  const saqla = async (kalit: string) => {
    const x = tahrir[kalit]; if (!x) return;
    const r = await buxMoslikSaqla({ kompaniyaId: kid, kalit, dtKod: x.dt || null, ktKod: x.kt || null, qiymat: x.q === '' ? null : Number(x.q), operationId: op.current[kalit] ?? (op.current[kalit] = yangiOperationId()) });
    if (!r.ok) { setXato(buxXato(r)); return; }
    delete op.current[kalit]; setXato(null); setTahrir((a) => { const b = { ...a }; delete b[kalit]; return b; });
    toast(t('Qoida saqlandi. Keyingi «Hujjatlardan yangilash» eski provodkalarni storno qilib yangisini yozadi.'), 'ok'); onOzgardi();
  };
  return (
    <section className="space-y-2" aria-label={t('Provodka qoidalari')}>
      <h3 className="text-[13px] font-semibold">{t('Provodka qoidalari (правила проводок)')}<Izoh matn={t('Qaysi hujjat qaysi hisoblarga yoziladi. O‘zgartirsangiz, tarix saqlanadi: eski provodkalar storno qilinib, yangi hisoblarga qayta yoziladi. Debet/Kredit bo‘sh qoida — o‘chirilgan (provodka yozilmaydi).')} /></h3>
      {soz && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-text-mute">{t('Qoida shabloni (tomon turi):')}</span>
          <select aria-label={t('Qoida shabloni')} className={`${kirit} w-64`} value={soz.shablon} disabled={!tasdiqlaydi} onChange={(e) => void shablonTanla(e.target.value)}>
            {soz.shablonlar.map((s) => <option key={s.shablon} value={s.shablon}>{SHABLON_NOM[s.shablon]?.() ?? s.shablon}</option>)}
          </select>
          <Izoh matn={t('Shablon tanlansa, uning qoidalari qo‘shiladi (mavjud qoidalar o‘zgarmaydi). Keyin hammasini tahrirlash mumkin.')} />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[12.5px]" aria-label={t('Provodka qoidalari')}>
          <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th className={th}>{t('Hujjat')}</th><th className={th}>{t('Debet')}</th><th className={th}>{t('Kredit')}</th><th className={th} /></tr></thead>
          <tbody>{holat.moslik.map((m) => {
            const par = m.kalit.startsWith('param.'); const x = tahrir[m.kalit];
            const nom = QOIDA_NOM[m.kalit]?.() ?? m.izoh ?? m.kalit;
            return (
              <tr key={m.kalit} className="border-t border-border/50">
                <td className={td}>{nom}<span className="block text-[10.5px] text-text-mute">{m.kalit}</span></td>
                {par ? (
                  <td className={td} colSpan={2}>{tasdiqlaydi ? <input aria-label={nom} className={`${kirit} w-24`} inputMode="decimal" value={x?.q ?? String(m.qiymat ?? '')} onChange={(e) => setTahrir((a) => ({ ...a, [m.kalit]: { dt: '', kt: '', q: e.target.value } }))} /> : (m.qiymat ?? '—')}</td>
                ) : (<>
                  <td className={td}>{tasdiqlaydi ? <HisobTanla nom={`${nom} — ${t('Debet')}`} faol={faol} v={x?.dt ?? m.dt_kod ?? ''} on={(v) => setTahrir((a) => ({ ...a, [m.kalit]: { dt: v, kt: a[m.kalit]?.kt ?? m.kt_kod ?? '', q: '' } }))} /> : (m.dt_kod ?? '—')}</td>
                  <td className={td}>{tasdiqlaydi ? <HisobTanla nom={`${nom} — ${t('Kredit')}`} faol={faol} v={x?.kt ?? m.kt_kod ?? ''} on={(v) => setTahrir((a) => ({ ...a, [m.kalit]: { dt: a[m.kalit]?.dt ?? m.dt_kod ?? '', kt: v, q: '' } }))} /> : (m.kt_kod ?? '—')}</td>
                </>)}
                <td className={td}>{x && <button type="button" className="fz-btn" onClick={() => void saqla(m.kalit)}><Save size={12} /> {t('Saqlash')}</button>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

function HisobTanla({ nom, faol, v, on }: { nom: string; faol: BuxHisob[]; v: string; on: (v: string) => void }) {
  return (
    <select aria-label={nom} className={`${kirit} w-64`} value={v} onChange={(e) => on(e.target.value)}>
      <option value="">{t('— o‘chirilgan —')}</option>
      {faol.map((h) => <option key={h.kod} value={h.kod}>{h.kod} · {h.nom_uz}</option>)}
    </select>
  );
}

function Reja({ kid, holat, onOzgardi, yozadi, tasdiqlaydi, setXato }: { kid: number; holat: BuxHolat; onOzgardi: () => void; yozadi: boolean; tasdiqlaydi: boolean; setXato: (x: string | null) => void }) {
  const [yangi, setYangi] = useState({ kod: '', nom_uz: '', nom_ru: '', tur: 'aktiv', ka: false });
  const op = useRef(yangiOperationId());
  const tasdiq = async (kodlar: string[]) => {
    const r = await buxHisobTasdiq(kid, kodlar, yangiOperationId());
    if (!r.ok) { setXato(buxXato(r)); return; }
    setXato(null); toast(t('{n} ta hisob tasdiqlandi', { n: r.tasdiqlandi ?? 0 }), 'ok'); onOzgardi();
  };
  const tekshirilmagan = holat.hisoblar.filter((h) => h.tekshirilsin).map((h) => h.kod);
  const yoz = async (h: { kod: string; nom_uz: string; nom_ru: string; tur: string; ka: boolean; faol: boolean }) => {
    const r = await buxHisobSaqla({ kompaniyaId: kid, kod: h.kod, nomUz: h.nom_uz, nomRu: h.nom_ru, tur: h.tur, kontragentAnalitika: h.ka, faol: h.faol, operationId: op.current });
    op.current = yangiOperationId();
    if (!r.ok) { setXato(buxXato(r)); return false; }
    setXato(null); onOzgardi(); return true;
  };
  return (
    <section className="space-y-2" aria-label={t('Hisoblar rejasi')}>
      <h3 className="text-[13px] font-semibold">{t('Hisoblar rejasi (план счетов)')}<Izoh matn={t('O‘zbekiston NSBU № 21 asosidagi namuna reja. Kodlarni rasmiy reja bilan solishtiring; nomini o‘zgartirish, yangi hisob qo‘shish va keraksizini o‘chirish (faolsizlantirish) mumkin.')} /></h3>
      {tekshirilmagan.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-[12px] text-warn">
          <AlertTriangle size={13} /> {t('T — tekshirilsin: {n} ta hisob kodi buxgalter tomonidan rasmiy reja bilan hali tasdiqlanmagan.', { n: tekshirilmagan.length })}
          {tasdiqlaydi && <button type="button" className="fz-btn" onClick={() => void tasdiq(tekshirilmagan)}>{t('Hammasini tasdiqlash')}</button>}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[12.5px]" aria-label={t('Hisoblar ro‘yxati')}>
          <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th className={th}>{t('Kod')}</th><th className={th}>{t('Nomi')}</th><th className={th}>{t('Turi')}</th><th className={th}>{t('Kontragent bo‘yicha')}<Izoh matn={t('Belgilangan hisob kontragentlar kesimida yuritiladi (xaridor, yetkazuvchi).')} /></th><th className={th}>{t('Faol')}</th></tr></thead>
          <tbody>
            {holat.hisoblar.map((h) => (
              <tr key={h.kod} className={`border-t border-border/50 ${h.faol ? '' : 'text-text-mute'}`}>
                <td className={`${td} font-medium`}>{h.kod}{h.tekshirilsin && <span className="ml-1 rounded border border-warn/60 px-1 text-[10px] text-warn" title={t('T — tekshirilsin (buxgalter tasdiqlamagan)')}>T</span>}</td><td className={td}>{h.nom_uz}<span className="block text-[10.5px] text-text-mute">{h.nom_ru}</span></td>
                <td className={td}>{TURLAR.find(([k]) => k === h.tur)?.[1]() ?? h.tur}</td>
                <td className={td}>{h.kontragent_analitika ? t('Ha') : '—'}</td>
                <td className={td}>{yozadi
                  ? <input type="checkbox" aria-label={`${h.kod} ${t('faol')}`} checked={h.faol} onChange={(e) => void yoz({ kod: h.kod, nom_uz: h.nom_uz, nom_ru: h.nom_ru, tur: h.tur, ka: h.kontragent_analitika, faol: e.target.checked })} />
                  : (h.faol ? t('Ha') : t('Yo‘q'))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {yozadi && (
        <div className="fz-panel grid grid-cols-2 gap-2 sm:grid-cols-6" role="group" aria-label={t('Yangi hisob')}>
          <div><span className={yorliq}>{t('Kod (4 raqam)')}</span><input aria-label={t('Hisob kodi')} className={kirit} maxLength={4} inputMode="numeric" value={yangi.kod} onChange={(e) => setYangi({ ...yangi, kod: e.target.value.replace(/\D/g, '') })} /></div>
          <div><span className={yorliq}>{t('Nomi (o‘zbekcha)')}</span><input aria-label={t('Nomi o‘zbekcha')} className={kirit} value={yangi.nom_uz} onChange={(e) => setYangi({ ...yangi, nom_uz: e.target.value })} /></div>
          <div><span className={yorliq}>{t('Nomi (ruscha)')}</span><input aria-label={t('Nomi ruscha')} className={kirit} value={yangi.nom_ru} onChange={(e) => setYangi({ ...yangi, nom_ru: e.target.value })} /></div>
          <div><span className={yorliq}>{t('Turi')}</span><select aria-label={t('Hisob turi')} className={kirit} value={yangi.tur} onChange={(e) => setYangi({ ...yangi, tur: e.target.value })}>{TURLAR.map(([k, n]) => <option key={k} value={k}>{n()}</option>)}</select></div>
          <label className="flex items-end gap-1 text-[12px]"><input type="checkbox" checked={yangi.ka} onChange={(e) => setYangi({ ...yangi, ka: e.target.checked })} /> {t('Kontragent bo‘yicha')}</label>
          <div className="flex items-end"><button type="button" className="fz-btn" disabled={yangi.kod.length !== 4 || !yangi.nom_uz.trim() || !yangi.nom_ru.trim()} onClick={async () => { if (await yoz({ ...yangi, faol: true })) setYangi({ kod: '', nom_uz: '', nom_ru: '', tur: 'aktiv', ka: false }); }}><Plus size={13} /> {t('Qo‘shish')}</button></div>
        </div>
      )}
      <p className="text-[11px] text-text-mute">{t('Oxirgi provodka sanasi: {sana}', { sana: ddmmyyyy(holat.oxirgi_sana) || '—' })}</p>
    </section>
  );
}
