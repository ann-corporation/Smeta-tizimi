import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Lock, LockOpen, Plus, Save } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import { buxDavr, buxHisobSaqla, buxMoslikSaqla, buxXato, type BuxHolat, type BuxHisob } from '../../api/t2-bux-hisob';
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
};

function oylar(n = 6, d = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-01`; });
}

/** Sozlama: hisoblar rejasi, avto-provodka qoidalari, davrni yopish (ogohlantirish asosida). */
export function Sozlama({ kid, holat, onOzgardi, yozadi, tasdiqlaydi }: { kid: number; holat: BuxHolat; onOzgardi: () => void; yozadi: boolean; tasdiqlaydi: boolean }) {
  const [xato, setXato] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <XatoQator xato={xato} />
      <DavrYopish kid={kid} holat={holat} onOzgardi={onOzgardi} tasdiqlaydi={tasdiqlaydi} setXato={setXato} />
      <Qoidalar kid={kid} holat={holat} onOzgardi={onOzgardi} tasdiqlaydi={tasdiqlaydi} setXato={setXato} />
      <Reja kid={kid} holat={holat} onOzgardi={onOzgardi} yozadi={yozadi} setXato={setXato} />
    </div>
  );
}

function DavrYopish({ kid, holat, onOzgardi, tasdiqlaydi, setXato }: { kid: number; holat: BuxHolat; onOzgardi: () => void; tasdiqlaydi: boolean; setXato: (x: string | null) => void }) {
  const [og, setOg] = useState<{ oy: string; royxat: Array<{ kod: string; xabar: string }> } | null>(null);
  const holatOy = useMemo(() => new Map(holat.davrlar.map((d) => [d.oy, d.holat])), [holat.davrlar]);
  const amal = async (oy: string, a: 'yop' | 'och', tasdiq: boolean) => {
    const r = await buxDavr({ kompaniyaId: kid, oy, amal: a, tasdiq, operationId: yangiOperationId() });
    if (r.code === 'OGOHLANTIRISH') { setOg({ oy, royxat: r.ogohlantirishlar ?? [] }); return; }
    if (!r.ok) { setXato(buxXato(r)); return; }
    setOg(null); setXato(null); toast(a === 'yop' ? t('Oy yopildi') : t('Oy qayta ochildi'), 'ok'); onOzgardi();
  };
  return (
    <section className="space-y-2" aria-label={t('Davrni yopish')}>
      <h3 className="text-[13px] font-semibold">{t('Davrni yopish')}<Izoh matn={t('Yopilgan oyga yangi provodka tushsa tizim to‘xtatmaydi, faqat ogohlantiradi. Yopish uchun «tasdiqlash» ruxsati kerak.')} /></h3>
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

function Qoidalar({ kid, holat, onOzgardi, tasdiqlaydi, setXato }: { kid: number; holat: BuxHolat; onOzgardi: () => void; tasdiqlaydi: boolean; setXato: (x: string | null) => void }) {
  const faol = holat.hisoblar.filter((h) => h.faol);
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
      <h3 className="text-[13px] font-semibold">{t('Provodka qoidalari')}<Izoh matn={t('Qaysi hujjat qaysi hisoblarga yoziladi. O‘zgartirsangiz, tarix saqlanadi: eski provodkalar storno qilinib, yangi hisoblarga qayta yoziladi.')} /></h3>
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
      {faol.map((h) => <option key={h.kod} value={h.kod}>{h.kod} · {h.nom_uz}</option>)}
    </select>
  );
}

function Reja({ kid, holat, onOzgardi, yozadi, setXato }: { kid: number; holat: BuxHolat; onOzgardi: () => void; yozadi: boolean; setXato: (x: string | null) => void }) {
  const [yangi, setYangi] = useState({ kod: '', nom_uz: '', nom_ru: '', tur: 'aktiv', ka: false });
  const op = useRef(yangiOperationId());
  const yoz = async (h: { kod: string; nom_uz: string; nom_ru: string; tur: string; ka: boolean; faol: boolean }) => {
    const r = await buxHisobSaqla({ kompaniyaId: kid, kod: h.kod, nomUz: h.nom_uz, nomRu: h.nom_ru, tur: h.tur, kontragentAnalitika: h.ka, faol: h.faol, operationId: op.current });
    op.current = yangiOperationId();
    if (!r.ok) { setXato(buxXato(r)); return false; }
    setXato(null); onOzgardi(); return true;
  };
  return (
    <section className="space-y-2" aria-label={t('Hisoblar rejasi')}>
      <h3 className="text-[13px] font-semibold">{t('Hisoblar rejasi')}<Izoh matn={t('O‘zbekiston NSBU № 21 asosidagi namuna reja. Kodlarni rasmiy reja bilan solishtiring; nomini o‘zgartirish, yangi hisob qo‘shish va keraksizini o‘chirish (faolsizlantirish) mumkin.')} /></h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[12.5px]" aria-label={t('Hisoblar ro‘yxati')}>
          <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th className={th}>{t('Kod')}</th><th className={th}>{t('Nomi')}</th><th className={th}>{t('Turi')}</th><th className={th}>{t('Kontragent bo‘yicha')}<Izoh matn={t('Belgilangan hisob kontragentlar kesimida yuritiladi (xaridor, yetkazuvchi).')} /></th><th className={th}>{t('Faol')}</th></tr></thead>
          <tbody>
            {holat.hisoblar.map((h) => (
              <tr key={h.kod} className={`border-t border-border/50 ${h.faol ? '' : 'text-text-mute'}`}>
                <td className={`${td} font-medium`}>{h.kod}</td><td className={td}>{h.nom_uz}<span className="block text-[10.5px] text-text-mute">{h.nom_ru}</span></td>
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
