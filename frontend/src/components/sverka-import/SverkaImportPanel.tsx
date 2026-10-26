/**
 * «1C akt-sverkani yuklash» (egasi 2026-10-26) — Nakopitelniy sahifasidagi kompaniya darajasidagi bo'lim.
 * Fayl brauzerda o'qiladi (serverga yuborilmaydi) → PREVIEW: yangi to'lovlar, yangi F3 sotuvlar, tizimda bor (takror), yo'qolgan/o'zgargan,
 * shartnoma topilmagan, saldo solishtiruvi → «Yozish» (partiyalab, idempotent). So'ng: Продажа ↔ F2 moslash, obyektlar kesimi,
 * to'lov taqsimoti, rasmiy F2 reestri. F2 (t2_akt) ga tegilmaydi.
 * Hisob — lib/sverka-1c/* (sof funksiyalar); yozish — api/t2-sverka-import.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, RefreshCw, Upload, Save, Trash2, CalendarClock } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { shartnomaSvodOl, sverkaYozuvYoz, sverkaXato } from '../../api/t2-nakopitelniy';
import { sbT2TolovOchir, sbT2TolovTahrir } from '../../api/t2-buxgalteriya';
import { yangiOperationId } from '../../api/supabase';
import { sverkaMoslashOl, sverkaImportYoz, sverkaImportXato, type SverkaImportQator } from '../../api/t2-sverka-import';
import { joriyShartnomaSummasi } from '../../lib/nakopitelniy-svod';
import { sverkaJadvalOqi } from '../../lib/sverka-1c/tahlil';
import { readXlsx } from '../../lib/f2-import-parse/xlsxReader';
import { blokKaliti, importReja, type ImportHolat, type ImportYozuv, type YuklanganFayl } from '../../lib/sverka-1c/reja';
import type { MoslashShartnoma, TizimShartnoma } from '../../lib/sverka-1c/turlar';
import { pul, qoldiqRang, raqamUstun, sanaKor } from './yordamchi';
import { SverkaMoslashBolimi } from './SverkaMoslashBolimi';
import { F2ReestrBolimi } from './F2ReestrBolimi';

type Tab = 'import' | 'moslash' | 'obyekt' | 'taqsimot' | 'reestr';

const HOLAT_NOM: Record<ImportHolat, string> = {
  yangi: 'Yangi', tizimda_bor: 'Tizimda bor', faylda_takror: 'Faylda takror', shartnoma_yoq: 'Shartnoma topilmadi', tushunilmadi: 'Tushunilmagan qator',
};
const TUR_NOM: Record<string, string> = { sotuv: 'Продажа (F3)', tolov: 'Оплата', qaytarim: 'Возврат', nomalum: '—' };

async function faylOqi(f: File): Promise<YuklanganFayl | null> {
  // Yagona o'quvchi (xlsx + eski .xls): f2-import-parse/xlsxReader.
  const wb = await readXlsx(new Uint8Array(await f.arrayBuffer()));
  for (const s of wb.sheets) {
    const tahlil = sverkaJadvalOqi(s.rows);
    if (tahlil && tahlil.bloklar.length) return { nom: f.name, tahlil };
  }
  return null;
}

export function SverkaImportPanel({ companyId }: { companyId: number }) {
  const [ochiq, setOchiq] = useState(false);
  const [tab, setTab] = useState<Tab>('import');
  const [shartnomalar, setShartnomalar] = useState<TizimShartnoma[]>([]);
  const [moslash, setMoslash] = useState<MoslashShartnoma[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [fayllar, setFayllar] = useState<YuklanganFayl[]>([]);
  const [tanlov, setTanlov] = useState<Record<string, number | null>>({});
  const [chiqarilgan, setChiqarilgan] = useState<Set<string>>(new Set());
  const [filtr, setFiltr] = useState<ImportHolat | 'hammasi'>('yangi');
  const [band, setBand] = useState(false);
  const [jarayon, setJarayon] = useState<string | null>(null);
  const [sanaTahrir, setSanaTahrir] = useState<Record<string, string>>({});

  const yukla = async () => {
    const [s, m] = await Promise.all([shartnomaSvodOl(companyId), sverkaMoslashOl(companyId)]);
    if (s.ok) {
      setShartnomalar(s.natija.shartnomalar.map((x) => ({
        id: x.id, raqam: x.raqam, jami_nds_bilan: x.jami_nds_bilan, obyektlar: x.obyektlar, joriySumma: joriyShartnomaSummasi(x).summa,
      })));
    }
    if (m.ok) { setMoslash(m.shartnomalar); setXato(null); } else setXato(m.error);
  };
  useEffect(() => { if (ochiq) void yukla(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ochiq, companyId]);

  const reja = useMemo(() => (moslash && fayllar.length ? importReja(fayllar, { shartnomalar, moslash }, tanlov) : null), [fayllar, shartnomalar, moslash, tanlov]);
  const shNom = (id: number | null) => (id == null ? '—' : `№ ${shartnomalar.find((s) => s.id === id)?.raqam ?? id}`);
  const yozilishi = useMemo(() => (reja ? reja.yozuvlar.filter((y) => y.holat === 'yangi' && !chiqarilgan.has(y.kalit)) : []), [reja, chiqarilgan]);
  // Bir faylda bor, boshqa (keyingi) faylda shu davr ichida yo'q qatorlar — 1C da o'zgargan bo'lishi mumkin
  const faylZiddiyat = useMemo(() => {
    const z = new Map<string, string>();
    if (!reja || fayllar.length < 2) return z;
    for (const y of reja.yozuvlar) {
      if (y.tur === 'nomalum') continue;
      for (const f of fayllar) {
        if (f.nom === y.fayl || !f.tahlil.davrDan || !f.tahlil.davrGacha || y.sana < f.tahlil.davrDan || y.sana > f.tahlil.davrGacha) continue;
        if (!f.tahlil.bloklar.some((b) => blokKaliti(b) === y.blokKalit)) continue;
        if (!reja.yozuvlar.some((x) => x.fayl === f.nom && x.kalit === y.kalit)) z.set(y.kalit, f.nom);
      }
    }
    return z;
  }, [reja, fayllar]);

  async function fayllarniTanla(list: FileList | null) {
    if (!list?.length) return;
    const yangi: YuklanganFayl[] = [];
    for (const f of Array.from(list)) {
      try {
        const r = await faylOqi(f);
        if (r) yangi.push(r); else toast(t('«{nom}» — akt-sverka sarlavhasi («Дата | Документ | Дебет | Кредит») topilmadi', { nom: f.name }), 'danger');
      } catch { toast(t('«{nom}» faylini o‘qib bo‘lmadi', { nom: f.name }), 'danger'); }
    }
    setFayllar((eski) => [...eski.filter((e) => !yangi.some((n) => n.nom === e.nom)), ...yangi]);
    setTab('import');
  }

  async function yoz() {
    if (!reja || band || !yozilishi.length) return;
    const sh = new Map(shartnomalar.map((s) => [s.id, s]));
    const qatorlar: SverkaImportQator[] = yozilishi.filter((y): y is ImportYozuv & { tur: 'sotuv' | 'tolov' | 'qaytarim'; shartnomaId: number } => y.tur !== 'nomalum' && y.shartnomaId != null)
      .map((y) => {
        const obyektlar = sh.get(y.shartnomaId)?.obyektlar ?? [];
        return {
          tur: y.tur, shartnoma_id: y.shartnomaId, sana: y.sana, summa: y.summa / 100, raqam: y.raqam,
          izoh: `1C: ${y.hujjat}`.slice(0, 500), operation_id: y.operationId,
          // Bitta obyektli shartnoma — to'lov o'sha obyektga; ko'p obyektli — null (taqsimot alohida, FIFO taklif bilan)
          obyekt_id: y.tur !== 'sotuv' && obyektlar.length === 1 ? obyektlar[0].id : null,
        };
      });
    const tolov = qatorlar.filter((q) => q.tur !== 'sotuv');
    const sotuv = qatorlar.filter((q) => q.tur === 'sotuv');
    if (!(await tasdiqSora({ matn: t('Tizimga yoziladi: {t} ta to‘lov ({ts} so‘m) va {s} ta F3 sotuv ({ss} so‘m). Davom etamizmi?', {
      t: String(tolov.length), ts: pul(tolov.reduce((a, q) => a + Math.round(q.summa * 100), 0)), s: String(sotuv.length), ss: pul(sotuv.reduce((a, q) => a + Math.round(q.summa * 100), 0)),
    }) }))) return;
    setBand(true);
    const r = await sverkaImportYoz(companyId, qatorlar, (y, j) => setJarayon(t('Yozilmoqda: {y} / {j}', { y: String(y), j: String(j) })));
    setBand(false); setJarayon(null);
    if (!r.ok) { toast(t(sverkaImportXato(r.error)), 'danger'); return; }
    const xatolar = r.natija.filter((n) => n.holat === 'xato');
    toast(t('Yozildi: yangi {y}, takror {k}, xato {x}', { y: String(r.yangi), k: String(r.takror), x: String(r.xato) }), r.xato ? 'warn' : 'ok');
    if (xatolar.length) toast(xatolar.slice(0, 3).map((x) => t(sverkaImportXato(x.code))).join('; '), 'danger');
    await yukla();
  }

  async function yoqolganBekor(y: { tur: 'sotuv' | 'tolov'; id: number; shartnomaId: number; versiya: number }) {
    if (!(await tasdiqSora({ matn: t('Yozuv bekor qilinadi (o‘chirilmaydi, tarixda qoladi). Davom etamizmi?'), xavfli: true }))) return;
    const r = y.tur === 'sotuv'
      ? await sverkaYozuvYoz({ kompaniyaId: companyId, shartnomaId: y.shartnomaId, tur: 'f3_sotuv', yozuvId: y.id, kutilganVersiya: y.versiya, malumot: { holat: 'bekor' }, operationId: yangiOperationId() })
      : await sbT2TolovOchir(y.id, y.versiya);
    if (!r.ok) { toast(t(sverkaXato(r as { error?: string })), 'danger'); return; }
    toast(t('Bekor qilindi'), 'ok'); await yukla();
  }
  async function yoqolganSana(y: { tur: 'sotuv' | 'tolov'; id: number; shartnomaId: number; versiya: number }, sana: string) {
    if (!sana) { toast(t('Yangi sanani kiriting'), 'danger'); return; }
    const r = y.tur === 'sotuv'
      ? await sverkaYozuvYoz({ kompaniyaId: companyId, shartnomaId: y.shartnomaId, tur: 'f3_sotuv', yozuvId: y.id, kutilganVersiya: y.versiya, malumot: { sotuv_sana: sana, davr_boshi: sana, davr_oxiri: sana }, operationId: yangiOperationId() })
      : await sbT2TolovTahrir({ tolovId: y.id, sana, kutilganVersiya: y.versiya });
    if (!r.ok) { toast(t(sverkaXato(r as { error?: string })), 'danger'); return; }
    toast(t('Sana o‘zgartirildi'), 'ok'); await yukla();
  }

  const korinadigan = reja ? reja.yozuvlar.filter((y) => filtr === 'hammasi' || y.holat === filtr) : [];
  const tabTugma = (k: Tab, nom: string) => (
    <button key={k} type="button" className={`fz-btn fz-btn--sm${tab === k ? ' fz-btn--primary' : ''}`} aria-pressed={tab === k} onClick={() => setTab(k)}>{t(nom)}</button>
  );

  return (
    <section className="fz-card" aria-label={t('1C akt-sverkani yuklash')}>
      <div className="fz-card__head">
        <div>
          <h2 className="fz-card__title">{t('1C akt-sverka: to‘lov, F3 (sotuv) va F2 bilan moslash')}</h2>
          <p className="fz-card__sub">{t('1C dan chiqqan «Акт сверки» faylini yuklang: to‘lovlar va Продажа (F3) tizimga yoziladi, F2 bilan farq ko‘rinadi. F2 o‘zgarmaydi.')}</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <label className="fz-btn fz-btn--primary" style={{ cursor: 'pointer' }}>
            <Upload />{t('1C akt-sverkani yuklash')}
            <input type="file" accept=".xls,.xlsx" multiple hidden onChange={(e) => { setOchiq(true); void fayllarniTanla(e.target.files); e.target.value = ''; }} />
          </label>
          {ochiq
            ? <button type="button" className="fz-btn" onClick={() => void yukla()}><RefreshCw />{t('Yangilash')}</button>
            : <button type="button" className="fz-btn" onClick={() => setOchiq(true)}><FileSpreadsheet />{t('Moslashni ochish')}</button>}
        </div>
      </div>
      {ochiq && (
        <div className="fz-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {xato && <div role="alert" className="fz-note fz-note--danger"><AlertTriangle /><span>{t('Moslash ma’lumotini o‘qib bo‘lmadi (server yangilanishi qo‘llanmagan bo‘lishi mumkin)')}: {xato}</span></div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {tabTugma('import', 'Import (preview)')}{tabTugma('moslash', 'Продажа ↔ F2')}{tabTugma('obyekt', 'Obyektlar bo‘yicha')}
            {tabTugma('taqsimot', 'To‘lov taqsimoti')}{tabTugma('reestr', 'F2 reestri')}
          </div>

          {tab === 'import' && !reja && <div className="fz-note fz-note--info"><span>{t('Fayl tanlang (bir nechta davr bo‘lsa — hammasini birga; takrorlar avtomatik ajratiladi).')}</span></div>}
          {tab === 'import' && reja && (
            <>
              <div className="fz-panel">
                <div className="fz-panel__h"><span>{t('Fayllar')}</span>
                  <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" style={{ marginLeft: 'auto' }} onClick={() => { setFayllar([]); setTanlov({}); setChiqarilgan(new Set()); }}><Trash2 />{t('Tozalash')}</button></div>
                {reja.faylJami.map((j) => (
                  <div key={j.fayl} style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'baseline' }}>
                    <b>{j.fayl}</b><span>{sanaKor(j.davrDan)} – {sanaKor(j.davrGacha)}</span>
                    <span>{t('Yakuniy qoldiq')}: <b style={qoldiqRang(j.yakuniy)}>{pul(j.yakuniy)}</b></span>
                    {j.korsatilmagan != null && j.korsatilmagan !== 0 && (
                      <span className="fz-chip fz-chip--warn">{t('Faylda harakatsiz (ko‘rsatilmagan) shartnomalar qoldig‘i')}: {pul(j.korsatilmagan)}</span>
                    )}
                  </div>
                ))}
                {reja.ogohMatnlar.map((m, i) => <div key={i} className="fz-note fz-note--warn"><AlertTriangle /><span>{m}</span></div>)}
              </div>

              <div className="fz-table-wrap">
                <table className="fz-table">
                  <thead><tr><th>{t('Fayldagi shartnoma')}</th><th>{t('Tizimdagi shartnoma')}</th><th style={raqamUstun}>{t('Sarlavhadagi summa')}</th></tr></thead>
                  <tbody>{reja.bloklar.map((b) => (
                    <tr key={b.kalit}>
                      <td title={b.sarlavha}>{b.raqam ? `№ ${b.raqam}` : b.sarlavha.slice(0, 60)}</td>
                      <td>
                        <select aria-label={t('Shartnoma')} className="input" style={{ height: 28, fontSize: 12 }} value={b.shartnomaId ?? ''}
                          onChange={(e) => setTanlov({ ...tanlov, [b.kalit]: e.target.value ? Number(e.target.value) : null })}>
                          <option value="">{t('— shartnoma topilmadi (o‘tkazib yuboriladi) —')}</option>
                          {shartnomalar.map((s) => <option key={s.id} value={s.id}>№ {s.raqam}</option>)}
                        </select>
                        {b.avto && <span className="fz-chip" style={{ marginLeft: 6 }}>{t('avtomatik')}</span>}
                      </td>
                      <td style={raqamUstun}>{pul(b.sarlavhaSumma)}</td>
                    </tr>))}
                  </tbody>
                </table>
              </div>

              {reja.ogohlantirishlar.map((o, i) => (
                <div key={i} className="fz-note fz-note--warn"><AlertTriangle /><span>{t('{sh}: to‘lovlar {tol} so‘m — shartnoma summasidan ({man}: {sum} so‘m) oshdi. DS kiritilmagan bo‘lishi mumkin; yozish bloklanmaydi.', {
                  sh: shNom(o.shartnomaId), tol: pul(o.tolangan), sum: pul(o.shartnoma), man: o.manba === 'sarlavha' ? t('fayl sarlavhasi') : t('tizim'),
                })}</span></div>
              ))}

              <div className="fz-panel">
                <div className="fz-panel__h"><span>{t('Saldo solishtiruvi (fayl ↔ tizim, yozilgandan keyin)')}</span></div>
                <div className="fz-table-wrap">
                  <table className="fz-table">
                    <thead><tr><th>{t('Fayl')}</th><th>{t('Shartnoma')}</th><th style={raqamUstun}>{t('Boshlang‘ich: fayl')}</th><th style={raqamUstun}>{t('Boshlang‘ich: tizim')}</th>
                      <th style={raqamUstun}>{t('Yakuniy: fayl')}</th><th style={raqamUstun}>{t('Yakuniy: tizim')}</th><th>{t('Holat')}</th></tr></thead>
                    <tbody>{reja.saldo.map((s) => (
                      <tr key={`${s.fayl}|${s.blokKalit}`}>
                        <td>{s.fayl}</td><td>{s.shartnomaId == null ? s.sarlavha.slice(0, 40) : shNom(s.shartnomaId)}</td>
                        <td style={{ ...raqamUstun, ...qoldiqRang(s.faylBoshlangich) }}>{pul(s.faylBoshlangich)}</td>
                        <td style={{ ...raqamUstun, ...qoldiqRang(s.tizimBoshlangich) }}>{pul(s.tizimBoshlangich)}</td>
                        <td style={{ ...raqamUstun, ...qoldiqRang(s.faylYakuniy) }}>{pul(s.faylYakuniy)}</td>
                        <td style={{ ...raqamUstun, ...qoldiqRang(s.tizimYakuniy) }}>{pul(s.tizimYakuniy)}</td>
                        <td>
                          {s.mos == null && <span className="fz-chip">{t('solishtirilmadi')}</span>}
                          {s.mos === true && <span className="fz-chip fz-chip--accent">{t('mos')}</span>}
                          {s.mos === false && <span className="fz-chip fz-chip--danger">{t('farq: {f}', { f: pul((s.tizimYakuniy ?? 0) - (s.faylYakuniy ?? 0)) })}</span>}
                          {s.faylIchkiMos === false && <span className="fz-chip fz-chip--danger">{t('fayl ichida tenglik yo‘q')}</span>}
                          {s.sanaKochganBolishiMumkin && <span className="fz-chip fz-chip--warn">{t('1C da sana oldingi davrga ko‘chgan')}</span>}
                        </td>
                      </tr>))}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-mute)', margin: 0 }}>{t('«+» — buyurtmachi qarzi, «−» — yopilmagan avans (bizning qarz). Jami netto shartnomalar kesimini yashirmaydi.')}</p>
              </div>

              {reja.yoqolgan.length > 0 && (
                <div className="fz-panel">
                  <div className="fz-panel__h"><AlertTriangle size={15} /><span>{t('Yo‘qolgan yoki o‘zgargan: tizimda bor, yangi faylda shu davrda yo‘q')}</span></div>
                  <p style={{ fontSize: 12, margin: 0 }}>{t('Avtomatik o‘chirilmaydi. Agar boshlang‘ich saldo shu summaga o‘zgargan bo‘lsa — 1C da sana oldingi davrga ko‘chirilgan: bekor qilmang, sanani to‘g‘rilang.')}</p>
                  <div className="fz-table-wrap">
                    <table className="fz-table">
                      <thead><tr><th>{t('Tur')}</th><th>{t('Shartnoma')}</th><th>{t('Sana')}</th><th>{t('Raqam')}</th><th style={raqamUstun}>{t('Summa')}</th><th>{t('Amal')}</th></tr></thead>
                      <tbody>{reja.yoqolgan.map((y) => {
                        const k = `${y.tur}${y.id}`;
                        return (
                          <tr key={k}>
                            <td>{t(TUR_NOM[y.tur === 'tolov' ? 'tolov' : 'sotuv'])}</td><td>{shNom(y.shartnomaId)}</td><td>{sanaKor(y.sana)}</td><td>{y.raqam ?? '—'}</td>
                            <td style={raqamUstun}>{pul(y.summa)}</td>
                            <td style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input type="date" aria-label={t('Yangi sana')} className="input" style={{ height: 28, fontSize: 12 }} value={sanaTahrir[k] ?? ''} onChange={(e) => setSanaTahrir({ ...sanaTahrir, [k]: e.target.value })} />
                              <button type="button" className="fz-btn fz-btn--sm" onClick={() => void yoqolganSana(y, sanaTahrir[k] ?? '')}><CalendarClock />{t('Sanani o‘zgartirish')}</button>
                              <button type="button" className="fz-btn fz-btn--sm fz-btn--danger" onClick={() => void yoqolganBekor(y)}><Trash2 />{t('Bekor qilish')}</button>
                            </td>
                          </tr>);
                      })}</tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="fz-panel">
                <div className="fz-panel__h" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <span>{t('Qatorlar')}</span>
                  {(['yangi', 'tizimda_bor', 'faylda_takror', 'shartnoma_yoq', 'tushunilmadi', 'hammasi'] as const).map((h) => (
                    <button key={h} type="button" className={`fz-btn fz-btn--sm${filtr === h ? ' fz-btn--primary' : ''}`} onClick={() => setFiltr(h)}>
                      {h === 'hammasi' ? t('Hammasi') : t(HOLAT_NOM[h])} ({h === 'hammasi' ? reja.yozuvlar.length : reja.yozuvlar.filter((y) => y.holat === h).length})
                    </button>
                  ))}
                </div>
                <div className="fz-table-wrap" style={{ maxHeight: 420 }}>
                  <table className="fz-table">
                    <thead><tr><th /><th>{t('Sana')}</th><th>{t('Hujjat')}</th><th>{t('Shartnoma')}</th><th style={raqamUstun}>{t('Summa (QQS bilan)')}</th><th>{t('Holat')}</th></tr></thead>
                    <tbody>{korinadigan.map((y) => (
                      <tr key={y.kalit + y.fayl + y.qator}>
                        <td>{y.holat === 'yangi' && (
                          <input type="checkbox" aria-label={t('Yozishga kiritish')} checked={!chiqarilgan.has(y.kalit)}
                            onChange={(e) => { const s = new Set(chiqarilgan); if (e.target.checked) s.delete(y.kalit); else s.add(y.kalit); setChiqarilgan(s); }} />)}</td>
                        <td>{sanaKor(y.sana)}</td>
                        <td title={`${y.fayl}, ${y.qator}`}>{y.hujjat}{y.hujjatSanaXato && <span className="fz-chip fz-chip--warn" style={{ marginLeft: 4 }}>{t('hujjat sanasi xato')}</span>}</td>
                        <td>{y.shartnomaId == null ? '—' : shNom(y.shartnomaId)}</td>
                        <td style={raqamUstun}>{y.tur === 'qaytarim' ? '−' : ''}{pul(y.summa)}</td>
                        <td>
                          <span className={`fz-chip${y.holat === 'yangi' ? ' fz-chip--accent' : y.holat === 'shartnoma_yoq' || y.holat === 'tushunilmadi' ? ' fz-chip--warn' : ''}`}>{t(HOLAT_NOM[y.holat])}</span>
                          {faylZiddiyat.has(y.kalit) && <span className="fz-chip fz-chip--warn" style={{ marginLeft: 4 }}>{t('«{f}» faylida bu davrda yo‘q', { f: faylZiddiyat.get(y.kalit)! })}</span>}
                        </td>
                      </tr>))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span>{t('Yoziladi: {t} ta to‘lov va {s} ta F3 sotuv', { t: String(yozilishi.filter((y) => y.tur !== 'sotuv').length), s: String(yozilishi.filter((y) => y.tur === 'sotuv').length) })}</span>
                <button type="button" className="fz-btn fz-btn--primary" disabled={band || !yozilishi.length} onClick={() => void yoz()}><Save />{t('Yozish')}</button>
                {jarayon && <span role="status">{jarayon}</span>}
              </div>
            </>
          )}

          {tab !== 'import' && tab !== 'reestr' && moslash && (
            <SverkaMoslashBolimi companyId={companyId} rejim={tab} shartnomalar={shartnomalar} moslash={moslash} yangila={yukla} />
          )}
          {tab === 'reestr' && moslash && <F2ReestrBolimi companyId={companyId} shartnomalar={shartnomalar} moslash={moslash} yangila={yukla} />}
        </div>
      )}
    </section>
  );
}
