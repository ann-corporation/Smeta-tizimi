import { useMemo, useState } from 'react';
import { CalendarPlus, Check, Save, Wand2 } from 'lucide-react';
import { t } from '../../i18n/til';
import { yangiOperationId } from '../../api/supabase';
import { hrKalendarSaqla, hrTabelSaqla, type HrOy, type HrTatil, type HrXodimlarJavob } from '../../api/t2-hr';
import { TABEL_BELGILAR, TABEL_NOMI, bayramlarYil, ishKunlariK, tabelJamlari, tatildanTaklif, type TabelBelgi } from '../../lib/hr/hisob';
import { yozNatija, type Qayta } from './umumiy';

const HAFTA = ['', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
const BELGI_RANG: Record<TabelBelgi, { rang: string; fon: string }> = {
  K: { rang: 'var(--ok)', fon: 'var(--ok-soft)' }, N: { rang: 'var(--danger)', fon: 'var(--danger-soft)' },
  O: { rang: 'var(--info)', fon: 'var(--info-soft)' }, B: { rang: 'var(--warn)', fon: 'var(--warn-soft)' }, D: { rang: 'var(--text-mute)', fon: 'var(--surface-2)' },
};
const TURI_NOMI: Record<string, string> = { ish: 'Ish', dam: 'Dam', bayram: 'Bayram' };
const TATIL_NOMI: Record<HrTatil['tur'], string> = { otpusk: 'Otpusk', otgul: 'Otgul', kasal: 'Kasal' };

export function HrTabel({ kid, oy, d, o, qayta }: { kid: number; oy: string; d: HrXodimlarJavob; o: HrOy; qayta: Qayta }) {
  const xodimlar = useMemo(() => d.xodimlar.filter((x) => x.hr_bor), [d.xodimlar]);
  const [tahrir, setTahrir] = useState<Record<number, Record<string, string>>>({});
  const [holatlar, setHolatlar] = useState<Record<number, 'qoralama' | 'tasdiqlangan'>>({});
  const saqlangan = (id: number) => o.tabel.find((x) => x.kadr_id === id);
  const kunlari = (id: number) => tahrir[id] ?? saqlangan(id)?.kunlar ?? {};
  const grafikOf = (id: number): 5 | 6 => xodimlar.find((x) => x.kadr_id === id)?.grafik ?? 5;
  const turi = (sana: string, g: 5 | 6) => { const k = o.kunlar.find((x) => x.sana === sana); return k ? (g === 6 ? k.tur6 : k.tur5) : 'ish'; };

  const bos = (id: number, kun: number) => {
    if (saqlangan(id)?.yopiq) return;
    const joriy = kunlari(id)[String(kun)] as TabelBelgi | undefined;
    const i = joriy ? TABEL_BELGILAR.indexOf(joriy) : -1;
    const yangi = { ...kunlari(id) };
    if (i + 1 >= TABEL_BELGILAR.length) delete yangi[String(kun)]; else yangi[String(kun)] = TABEL_BELGILAR[i + 1];
    setTahrir((p) => ({ ...p, [id]: yangi }));
  };
  const hammasiK = (id: number) => setTahrir((p) => ({ ...p, [id]: { ...kunlari(id), ...ishKunlariK(o.kunlar, grafikOf(id)) } }));
  const tatildan = () => setTahrir((p) => {
    const n = { ...p };
    for (const x of xodimlar) {
      if (saqlangan(x.kadr_id)?.yopiq) continue;
      const mavjud = kunlari(x.kadr_id);
      const taklif = tatildanTaklif(o.tatillar, x.kadr_id, o.kunlar, grafikOf(x.kadr_id), mavjud);
      if (Object.keys(taklif).length) n[x.kadr_id] = { ...mavjud, ...taklif };
    }
    return n;
  });
  const ozgargan = Object.keys(tahrir).length + Object.keys(holatlar).length;
  const saqla = async (tasdiq: boolean) => {
    const idlar = new Set([...Object.keys(tahrir).map(Number), ...Object.keys(holatlar).map(Number), ...(tasdiq ? xodimlar.map((x) => x.kadr_id) : [])]);
    const qatorlar = [...idlar].filter((id) => !saqlangan(id)?.yopiq).map((id) => ({
      kadr_id: id, kunlar: kunlari(id), holat: tasdiq ? ('tasdiqlangan' as const) : (holatlar[id] ?? saqlangan(id)?.holat ?? ('qoralama' as const)),
    }));
    if (!qatorlar.length) return;
    const r = await hrTabelSaqla({ kompaniyaId: kid, oy, qatorlar, operationId: yangiOperationId() });
    if (yozNatija(r, tasdiq ? 'Tabel tasdiqlandi' : 'Tabel saqlandi')) { setTahrir({}); setHolatlar({}); await qayta(); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-text-mute">
        {TABEL_BELGILAR.map((b) => <span key={b} className="fz-chip" style={{ color: BELGI_RANG[b].rang }}>{b} — {t(TABEL_NOMI[b])}</span>)}
        <span>{t('Katakni bosing: bo‘sh → K → N → O → B → D → bo‘sh')}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fz-btn" onClick={tatildan}><Wand2 size={14} /> {t('Tasdiqlangan tatildan to‘ldirish')}</button>
        <button type="button" className="fz-btn fz-btn--primary" disabled={!ozgargan} onClick={() => void saqla(false)}><Save size={14} /> {t('Saqlash')}</button>
        <button type="button" className="fz-btn" onClick={() => void saqla(true)}><Check size={14} /> {t('Tabelni tasdiqlash')}</button>
        <span className="text-[12px] text-text-mute">{t('Norma: 5 kunlik {a} kun / {b} soat; 6 kunlik {c} kun', { a: o.norma['5'].kun, b: o.norma['5'].soat, c: o.norma['6'].kun })}</span>
      </div>
      <div className="fz-table-wrap max-h-[64vh]">
        <table className="fz-table whitespace-nowrap">
          <thead><tr>
            <th className="sticky left-0 z-[2]" style={{ minWidth: 200 }}>{t('F.I.O')}</th>
            <th className="fz-c-num">K</th><th className="fz-c-num">N</th><th className="fz-c-num">O</th><th className="fz-c-num">B</th><th className="fz-c-num">D</th>
            {o.kunlar.map((k) => <th key={k.sana} className="text-center" style={{ padding: '0 2px', minWidth: 26, color: k.tur5 === 'ish' && k.tur6 === 'ish' ? undefined : 'var(--text-mute)' }} title={k.nom ?? t(TURI_NOMI[k.tur5])}>{Number(k.sana.slice(8))}<div className="text-[9px]">{t(HAFTA[k.hafta])}</div></th>)}
          </tr></thead>
          <tbody>
            {xodimlar.map((x) => {
              const kn = kunlari(x.kadr_id); const j = tabelJamlari(kn); const yopiq = !!saqlangan(x.kadr_id)?.yopiq;
              return (
                <tr key={x.kadr_id}>
                  <td className="sticky left-0 z-[1]" style={{ background: 'var(--surface)' }}>
                    <div className="flex items-center gap-2"><span className="truncate font-medium text-text">{x.ism}</span>
                      {yopiq ? <span className="fz-chip">{t('Yopiq')}</span> : <button type="button" className="fz-btn fz-btn--ghost" onClick={() => hammasiK(x.kadr_id)} title={t('Hamma ish kuniga K')}>{t('K⟶')}</button>}
                      {saqlangan(x.kadr_id)?.holat === 'tasdiqlangan' && <span className="fz-chip fz-chip--accent">{t('Tasdiq')}</span>}</div></td>
                  {TABEL_BELGILAR.map((b) => <td key={b} className="fz-c-num">{j[b]}</td>)}
                  {o.kunlar.map((k) => {
                    const kun = Number(k.sana.slice(8)); const b = kn[String(kun)] as TabelBelgi | undefined; const s = b ? BELGI_RANG[b] : null;
                    const ish = turi(k.sana, x.grafik ?? 5) === 'ish';
                    return (
                      <td key={k.sana} className="text-center" style={{ padding: 2 }}>
                        <button type="button" disabled={yopiq} onClick={() => bos(x.kadr_id, kun)} aria-label={t('{kun}-kun belgisi', { kun })}
                          className="mx-auto flex h-6 w-6 items-center justify-center rounded-sm border text-[11px] font-semibold"
                          style={{ color: s?.rang ?? 'var(--text-mute)', background: s?.fon ?? (ish ? 'transparent' : 'var(--surface-2)'), borderColor: s ? 'transparent' : 'var(--border)' }}>{b ?? (ish ? '·' : '')}</button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {xodimlar.length === 0 && <tr><td colSpan={6 + o.kunlar.length} className="py-8 text-center text-text-dim">{t('Avval «Xodimlar» bo‘limida HR kartasini to‘ldiring.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HrKalendar({ kid, oy, d, o, qayta }: { kid: number; oy: string; d: HrXodimlarJavob; o: HrOy; qayta: Qayta }) {
  const [tahrir, setTahrir] = useState<Record<string, { tur: string; nom: string }>>({});
  const istisno = (sana: string) => tahrir[sana] ?? o.istisnolar.find((x) => x.sana === sana) ?? { tur: '', nom: '' };
  const [tatil, setTatil] = useState({ kadr: '', tur: 'otpusk' as HrTatil['tur'], dan: '', gacha: '', izoh: '' });
  const xodimlar = d.xodimlar.filter((x) => x.hr_bor);
  const nomi = (id: number) => d.xodimlar.find((x) => x.kadr_id === id)?.ism ?? `#${id}`;

  const saqla = async () => {
    const kunlar = Object.entries(tahrir).map(([sana, v]) => ({ sana, tur: (v.tur || null) as 'bayram' | 'dam' | 'ish' | null, nom: v.nom || null }));
    if (!kunlar.length) return;
    const r = await hrKalendarSaqla({ kompaniyaId: kid, kunlar, operationId: yangiOperationId() });
    if (yozNatija(r, 'Kalendar saqlandi')) { setTahrir({}); await qayta(); }
  };
  const standart = async () => {
    const yil = Number(oy.slice(0, 4));
    const kunlar = bayramlarYil(yil).map((b) => ({ sana: b.sana, tur: 'bayram' as const, nom: b.nom }));
    const r = await hrKalendarSaqla({ kompaniyaId: kid, kunlar, operationId: yangiOperationId() });
    if (yozNatija(r, 'Standart bayramlar kalendarga yozildi')) await qayta();
  };
  const tatilQosh = async () => {
    const r = await hrKalendarSaqla({ kompaniyaId: kid, tatillar: [{ kadr_id: Number(tatil.kadr), tur: tatil.tur, dan: tatil.dan, gacha: tatil.gacha || tatil.dan, izoh: tatil.izoh || null }], operationId: yangiOperationId() });
    if (yozNatija(r, 'Tatil rejalandi')) { setTatil({ ...tatil, dan: '', gacha: '', izoh: '' }); await qayta(); }
  };
  const tatilHolat = async (x: HrTatil, holat: HrTatil['holat']) => {
    const r = await hrKalendarSaqla({ kompaniyaId: kid, tatillar: [{ id: x.id, kadr_id: x.kadr_id, tur: x.tur, dan: x.dan, gacha: x.gacha, holat, izoh: x.izoh }], operationId: yangiOperationId() });
    if (yozNatija(r, 'Tatil yangilandi')) await qayta();
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-md border border-border bg-surface p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-[14px] font-semibold text-text">{t('Ish kalendari')}</h3>
          <span className="text-[12px] text-text-mute">{t('Oylik norma: 5 kunlik {a} kun / {b} soat; 6 kunlik {c} kun / {e} soat', { a: o.norma['5'].kun, b: o.norma['5'].soat, c: o.norma['6'].kun, e: o.norma['6'].soat })}</span>
          <button type="button" className="fz-btn" onClick={() => void standart()}><CalendarPlus size={14} /> {t('Standart bayramlarni qo‘shish ({yil})', { yil: oy.slice(0, 4) })}</button>
          <button type="button" className="fz-btn fz-btn--primary" disabled={!Object.keys(tahrir).length} onClick={() => void saqla()}><Save size={14} /> {t('Saqlash')}</button>
        </div>
        <p className="mb-2 text-[12px] text-text-mute">{t('Bayramlar ma’lumot sifatida saqlanadi va tahrirlanadi. Hayit va hukumat qarori bilan ko‘chirilgan kunlarni qo‘lda belgilang (bayram / dam / ko‘chirilgan ish kuni).')}</p>
        <div className="fz-table-wrap max-h-[50vh]">
          <table className="fz-table whitespace-nowrap">
            <thead><tr><th>{t('Sana')}</th><th>{t('Hafta kuni')}</th><th>{t('5 kunlik')}</th><th>{t('6 kunlik')}</th><th>{t('Istisno')}</th><th>{t('Izoh')}</th></tr></thead>
            <tbody>
              {o.kunlar.map((k) => {
                const v = istisno(k.sana);
                return (
                  <tr key={k.sana} style={{ background: k.tur5 !== 'ish' && k.tur6 !== 'ish' ? 'var(--surface-2)' : undefined }}>
                    <td>{k.sana}</td><td>{t(HAFTA[k.hafta])}</td><td>{t(TURI_NOMI[k.tur5])}</td><td>{t(TURI_NOMI[k.tur6])}</td>
                    <td><select className="input h-7 px-1 text-[12px]" value={v.tur} aria-label={t('Istisno')} onChange={(e) => setTahrir((p) => ({ ...p, [k.sana]: { tur: e.target.value, nom: v.nom ?? '' } }))}>
                      <option value="">{t('— standart —')}</option><option value="bayram">{t('Bayram')}</option><option value="dam">{t('Dam')}</option><option value="ish">{t('Ish kuni')}</option></select></td>
                    <td><input className="input h-7 w-56 px-2 text-[12px]" value={v.nom ?? ''} aria-label={t('Izoh')} onChange={(e) => setTahrir((p) => ({ ...p, [k.sana]: { tur: v.tur, nom: e.target.value } }))} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-border bg-surface p-3">
        <h3 className="mb-2 text-[14px] font-semibold text-text">{t('Tatil va otgul rejasi')}</h3>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Xodim')}
            <select className="input h-8 px-2 text-[13px]" value={tatil.kadr} onChange={(e) => setTatil({ ...tatil, kadr: e.target.value })}><option value="">{t('— xodim —')}</option>{xodimlar.map((x) => <option key={x.kadr_id} value={x.kadr_id}>{x.ism}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Turi')}
            <select className="input h-8 px-2 text-[13px]" value={tatil.tur} onChange={(e) => setTatil({ ...tatil, tur: e.target.value as HrTatil['tur'] })}>{(Object.keys(TATIL_NOMI) as HrTatil['tur'][]).map((k) => <option key={k} value={k}>{t(TATIL_NOMI[k])}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Dan')}<input type="date" className="input h-8 px-2 text-[13px]" value={tatil.dan} onChange={(e) => setTatil({ ...tatil, dan: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Gacha')}<input type="date" className="input h-8 px-2 text-[13px]" value={tatil.gacha} onChange={(e) => setTatil({ ...tatil, gacha: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-[12px] text-text-mute">{t('Izoh')}<input className="input h-8 w-48 px-2 text-[13px]" value={tatil.izoh} onChange={(e) => setTatil({ ...tatil, izoh: e.target.value })} /></label>
          <button type="button" className="fz-btn fz-btn--primary" disabled={!tatil.kadr || !tatil.dan} onClick={() => void tatilQosh()}>{t('Rejalash')}</button>
        </div>
        <div className="fz-table-wrap">
          <table className="fz-table whitespace-nowrap">
            <thead><tr><th>{t('Xodim')}</th><th>{t('Turi')}</th><th>{t('Dan')}</th><th>{t('Gacha')}</th><th>{t('Holat')}</th><th>{t('Izoh')}</th><th aria-label={t('Amal')} /></tr></thead>
            <tbody>
              {o.tatillar.map((x) => (
                <tr key={x.id}>
                  <td>{nomi(x.kadr_id)}</td><td>{t(TATIL_NOMI[x.tur])}</td><td>{x.dan}</td><td>{x.gacha}</td>
                  <td>{x.holat === 'tasdiqlangan' ? t('Tasdiqlangan') : t('Reja')}</td><td>{x.izoh ?? ''}</td>
                  <td className="flex gap-1">
                    {x.holat !== 'tasdiqlangan' && <button type="button" className="fz-btn fz-btn--ghost" onClick={() => void tatilHolat(x, 'tasdiqlangan')}>{t('Tasdiqlash')}</button>}
                    <button type="button" className="fz-btn fz-btn--ghost" onClick={() => void tatilHolat(x, 'bekor')}>{t('Bekor qilish')}</button>
                  </td>
                </tr>
              ))}
              {o.tatillar.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-text-dim">{t('Bu oyda tatil rejalashtirilmagan.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
