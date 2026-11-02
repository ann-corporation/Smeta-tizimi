/**
 * 1C sverka importi — natija bo'limlari: Продажа ↔ F2 moslash, obyektlar kesimi (F3 / to'langan / qarz yoki avans), to'lov taqsimoti (FIFO taklif).
 * Hisob — lib/sverka-1c/f2-moslash, lib/sverka-1c/taqsimot, lib/nakopitelniy-svod (obyektKesimi). Yozish — api/t2-sverka-import.
 */
import { Fragment, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Save, X, Plus } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { yangiOperationId } from '../../api/supabase';
import { forma3F2Bog, sverkaImportXato, tolovTaqsimotSaqla } from '../../api/t2-sverka-import';
import { tiyin } from '../../lib/nakopitelniy-svod';
import { f2Birliklar, kalitlardanIdlar, shartnomaMoslash, shartnomaObyektKesimi, type F2Birlik } from '../../lib/sverka-1c/f2-moslash';
import { fifoTaklif, taqsimotTekshir, type TaqsimotTaklif } from '../../lib/sverka-1c/taqsimot';
import type { MoslashShartnoma, TizimShartnoma } from '../../lib/sverka-1c/turlar';
import { pul, qoldiqRang, raqamUstun, sanaKor } from './yordamchi';

type Props = {
  companyId: number; rejim: 'moslash' | 'obyekt' | 'taqsimot';
  shartnomalar: TizimShartnoma[]; moslash: MoslashShartnoma[]; yangila: () => unknown;
};

const OGOH_NOM: Record<string, string> = {
  TIZIMDA_YOQ: 'reestrda bor, tizimda F2 yo‘q', REESTR_YOQ: 'reestr jami yo‘q — qatorlardan (taxminiy)',
  QATORLAR_FARQ: 'qatorlar bilan bog‘langan qismi hujjat jamidan farq qiladi', SUMMA_NOMALUM: 'summa noma’lum',
};

function birlikNom(b: F2Birlik, obyektNom: (id: number | null) => string): string {
  return `F2 № ${b.raqam ?? '—'} · ${b.oy ?? '—'} · ${b.obyektId != null ? obyektNom(b.obyektId) : (b.izoh ?? '—')}`;
}

export function SverkaMoslashBolimi({ companyId, rejim, shartnomalar, moslash, yangila }: Props) {
  const birinchi = moslash.find((m) => m.f3.length || m.tolovlar.length)?.id ?? moslash[0]?.id ?? null;
  const [shId, setShId] = useState<number | null>(birinchi);
  const [tanlov, setTanlov] = useState<Map<number, string[]>>(new Map());
  const [ochiq, setOchiq] = useState<Set<number>>(new Set());
  const [band, setBand] = useState(false);
  const [tahrir, setTahrir] = useState<Record<number, Record<string, string>>>({});

  const m = moslash.find((x) => x.id === shId) ?? null;
  const sh = shartnomalar.find((x) => x.id === shId);
  const obyektNom = (id: number | null) => (id == null ? t('taqsimlanmagan') : sh?.obyektlar.find((o) => o.id === id)?.nom ?? `#${id}`);
  const natija = useMemo(() => (m ? shartnomaMoslash(m, tanlov) : null), [m, tanlov]);
  const birliklar = useMemo(() => (m ? f2Birliklar(m) : []), [m]);

  const tanlovOl = (f3Id: number) => tanlov.get(f3Id) ?? natija?.sotuvlar.find((s) => s.f3.id === f3Id)?.birliklar.map((b) => b.kalit) ?? [];
  const tanlovQoy = (f3Id: number, kalitlar: string[]) => { const n = new Map(tanlov); n.set(f3Id, kalitlar); setTanlov(n); };

  async function bogSaqla(f3Ids: number[]) {
    if (band || !natija) return;
    setBand(true);
    let ok = 0; const xatolar: string[] = [];
    for (const id of f3Ids) {
      const { aktIds, reestrIds } = kalitlardanIdlar(tanlovOl(id));
      const r = await forma3F2Bog({ kompaniyaId: companyId, forma3Id: id, aktIds, reestrIds, operationId: yangiOperationId() });
      if (r.ok) ok++; else xatolar.push(t(sverkaImportXato(r.code ?? r.error)));
    }
    setBand(false);
    if (xatolar.length) toast(xatolar.slice(0, 3).join('; '), 'danger');
    if (ok) { toast(t('Saqlandi: {n} ta Продажа', { n: String(ok) }), 'ok'); setTanlov(new Map()); await yangila(); }
  }

  const shTanlov = (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span>{t('Shartnoma')}</span>
      <select aria-label={t('Shartnoma')} className="input" style={{ height: 30 }} value={shId ?? ''} onChange={(e) => { setShId(e.target.value ? Number(e.target.value) : null); setTanlov(new Map()); setOchiq(new Set()); }}>
        {moslash.map((x) => <option key={x.id} value={x.id}>№ {x.raqam}</option>)}
      </select>
    </label>
  );

  /* ─────────── Obyektlar bo'yicha (hamma shartnoma) ─────────── */
  if (rejim === 'obyekt') {
    const qatorlar = moslash.map((x) => ({ m: x, k: shartnomaObyektKesimi(x, shartnomalar.find((s) => s.id === x.id)) })).filter((x) => x.k.some((q) => q.f3 || q.tolangan));
    const hammasi = qatorlar.flatMap((x) => x.k);
    const qarz = hammasi.filter((q) => q.qoldiq > 0).reduce((a, q) => a + q.qoldiq, 0);
    const avans = hammasi.filter((q) => 0 > q.qoldiq).reduce((a, q) => a + q.qoldiq, 0);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div className="fz-kpis">
          <div className="fz-kpi"><div className="fz-kpi__label">{t('Buyurtmachi qarzi (obyektlar bo‘yicha)')}</div><div className="fz-kpi__value" style={qoldiqRang(qarz)}>{pul(qarz)}</div></div>
          <div className="fz-kpi"><div className="fz-kpi__label">{t('Yopilmagan avans (obyektlar bo‘yicha)')}</div><div className="fz-kpi__value" style={qoldiqRang(avans)}>{pul(avans)}</div></div>
          <div className="fz-kpi"><div className="fz-kpi__label">{t('Netto')}</div><div className="fz-kpi__value" style={qoldiqRang(qarz + avans)}>{pul(qarz + avans)}</div>
            <div className="fz-kpi__sub">{t('Netto qarz va avansni bir-biriga yopadi — pastdagi kesimga qarang')}</div></div>
        </div>
        <div className="fz-table-wrap">
          <table className="fz-table">
            <thead><tr><th>{t('Shartnoma / obyekt')}</th><th style={raqamUstun}>{t('F3 (sotuv)')}</th><th style={raqamUstun}>{t('To‘langan')}</th><th style={raqamUstun}>{t('Qarz (+) / avans (−)')}</th></tr></thead>
            <tbody>{qatorlar.map(({ m: x, k }) => {
              const s = shartnomalar.find((y) => y.id === x.id);
              const j = k.reduce((a, q) => ({ f3: a.f3 + q.f3, tol: a.tol + q.tolangan }), { f3: 0, tol: 0 });
              return (
                <Fragment key={x.id}>
                  <tr className="fz-row-rz"><td><b>№ {x.raqam}</b></td><td style={raqamUstun}>{pul(j.f3)}</td><td style={raqamUstun}>{pul(j.tol)}</td><td style={{ ...raqamUstun, ...qoldiqRang(j.f3 - j.tol) }}><b>{pul(j.f3 - j.tol)}</b></td></tr>
                  {k.map((q) => (
                    <tr key={`${x.id}-${q.obyektId}`}>
                      <td style={{ paddingLeft: 24 }}>{q.obyektId == null ? <i>{t('taqsimlanmagan (obyektga bog‘lanmagan)')}</i> : (s?.obyektlar.find((o) => o.id === q.obyektId)?.nom ?? q.nom)}</td>
                      <td style={raqamUstun}>{pul(q.f3)}</td><td style={raqamUstun}>{pul(q.tolangan)}</td><td style={{ ...raqamUstun, ...qoldiqRang(q.qoldiq) }}>{pul(q.qoldiq)}</td>
                    </tr>))}
                </Fragment>);
            })}</tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-mute)', margin: 0 }}>{t('F3 obyektga Продажага bog‘langan F2 lar nisbatida bo‘linadi; F2 bog‘lanmagan Продажа ko‘p obyektli shartnomada «taqsimlanmagan» qatorda turadi. To‘lov — saqlangan taqsimot bo‘yicha.')}</p>
      </div>
    );
  }

  /* ─────────── To'lov taqsimoti (ko'p obyektli shartnoma) ─────────── */
  if (rejim === 'taqsimot') {
    const kop = sh && sh.obyektlar.length > 1;
    const navbat = birliklar.filter((b) => b.obyektId != null && b.asosiy != null && b.oy).map((b) => ({ obyektId: b.obyektId!, sana: `${b.oy}-01`, summa: b.asosiy! }));
    const tolovlar = (m?.tolovlar ?? []).filter((x) => x.tur !== 'qaytarim');
    const taklif = fifoTaklif(tolovlar.filter((x) => x.obyekt_id == null).map((x) => ({ id: x.id, sana: x.sana, summa: tiyin(x.summa), saqlangan: x.taqsimot.map((q) => ({ obyektId: q.obyekt_id, summa: tiyin(q.summa) })) })), navbat);
    const kalit = (o: number | null) => (o == null ? 'null' : String(o));
    const joriy = (tid: number): TaqsimotTaklif[] => {
      const e = tahrir[tid];
      if (e) return Object.entries(e).filter(([, v]) => v !== '' && Number(v) !== 0).map(([k, v]) => ({ obyektId: k === 'null' ? null : Number(k), summa: tiyin(Number(v)) }));
      const s = m?.tolovlar.find((x) => x.id === tid)?.taqsimot ?? [];
      return s.length ? s.map((q) => ({ obyektId: q.obyekt_id, summa: tiyin(q.summa) })) : taklif.get(tid) ?? [];
    };
    async function saqla(tid: number, summa: number) {
      const q = joriy(tid);
      const tk = taqsimotTekshir(summa, q);
      if (!tk.ok) { toast(tk.sabab === 'JAMI' ? t('Taqsimot jami to‘lovdan {f} so‘m farq qiladi', { f: pul(tk.farq ?? 0) }) : t('Taqsimot noto‘g‘ri'), 'danger'); return; }
      setBand(true);
      const r = await tolovTaqsimotSaqla({ kompaniyaId: companyId, tolovId: tid, operationId: yangiOperationId(),
        qatorlar: q.map((x) => ({ obyekt_id: x.obyektId, summa: x.summa / 100, manba: tahrir[tid] ? 'qolda' as const : 'fifo' as const })) });
      setBand(false);
      if (!r.ok) { toast(t(sverkaImportXato(r.code ?? r.error)), 'danger'); return; }
      const n = { ...tahrir }; delete n[tid]; setTahrir(n);
      toast(t('Taqsimot saqlandi'), 'ok'); await yangila();
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {shTanlov}
        {!kop && <div className="fz-note fz-note--info"><span>{t('Bu shartnoma bitta obyektga bog‘langan — to‘lov avtomatik o‘sha obyektga yoziladi, taqsimot kerak emas.')}</span></div>}
        {kop && (
          <>
            <p style={{ fontSize: 12, margin: 0 }}>{t('Taklif (FIFO): to‘lov obyektlarning eng eski to‘lanmagan F2 summalarini (QQS bilan, oy tartibida) yopadi; qolgani — taqsimlanmagan avans. Summalarni o‘zgartirib tasdiqlang.')}</p>
            <div className="fz-table-wrap">
              <table className="fz-table">
                <thead><tr><th>{t('Sana')}</th><th>{t('Hujjat №')}</th><th style={raqamUstun}>{t('To‘lov')}</th><th>{t('Taqsimot')}</th><th /></tr></thead>
                <tbody>{tolovlar.map((x) => {
                  const summa = tiyin(x.summa);
                  const q = joriy(x.id);
                  const saqlangan = x.taqsimot.length > 0 && !tahrir[x.id];
                  const variantlar: (number | null)[] = [...(sh?.obyektlar.map((o) => o.id) ?? []), null];
                  return (
                    <tr key={x.id}>
                      <td>{sanaKor(x.sana)}</td><td>{x.hujjat_raqam ?? '—'}</td><td style={raqamUstun}>{pul(summa)}</td>
                      <td>
                        {x.obyekt_id != null ? <span>{obyektNom(x.obyekt_id)}</span> : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) 150px', gap: 4, alignItems: 'center' }}>
                            {variantlar.map((o) => {
                              const bor = q.find((z) => z.obyektId === o)?.summa ?? 0;
                              return (
                                <Fragment key={kalit(o)}>
                                  <span style={{ fontSize: 12 }}>{obyektNom(o)}</span>
                                  <MoneyInput aria-label={obyektNom(o)} className="input h-7 px-2 text-[12px] tabular-nums" value={tahrir[x.id]?.[kalit(o)] ?? (bor ? String(bor / 100) : '')}
                                    onValueChange={(v) => {
                                      const baza = Object.fromEntries(variantlar.map((z) => [kalit(z), String((q.find((y) => y.obyektId === z)?.summa ?? 0) / 100)]));
                                      setTahrir({ ...tahrir, [x.id]: { ...baza, ...tahrir[x.id], [kalit(o)]: v } });
                                    }} />
                                </Fragment>);
                            })}
                          </div>)}
                      </td>
                      <td>
                        {x.obyekt_id == null && (
                          <>
                            <span className={`fz-chip${saqlangan ? ' fz-chip--accent' : ' fz-chip--warn'}`}>{saqlangan ? t('saqlangan') : tahrir[x.id] ? t('qo‘lda') : t('taklif')}</span>
                            <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={band} onClick={() => void saqla(x.id, summa)}><Save />{t('Tasdiqlash')}</button>
                          </>)}
                      </td>
                    </tr>);
                })}</tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  /* ─────────── Продажа ↔ F2 ─────────── */
  if (!m || !natija) return shTanlov;
  const saqlanmagan = natija.sotuvlar.filter((s) => !s.saqlangan && s.birliklar.length).map((s) => s.f3.id);
  const erkin = natija.sotuvsizF2;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)' }}>
        {shTanlov}
        <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" style={{ marginLeft: 'auto' }} disabled={band || !saqlanmagan.length} onClick={() => void bogSaqla(saqlanmagan)}>
          <Save />{t('Takliflarni saqlash ({n})', { n: String(saqlanmagan.length) })}</button>
      </div>
      <div className="fz-kpis">
        <div className="fz-kpi"><div className="fz-kpi__label">{t('1C Продажа (F3), QQS bilan')}</div><div className="fz-kpi__value">{pul(natija.jami.sotuv)}</div></div>
        <div className="fz-kpi"><div className="fz-kpi__label">{t('F2 jami, QQS bilan')}</div><div className="fz-kpi__value">{pul(natija.jami.f2QqsBilan)}</div>
          <div className="fz-kpi__sub">{t('Продажага bog‘langan: {b}', { b: pul(natija.jami.f2Boglangan) })}</div></div>
        <div className="fz-kpi"><div className="fz-kpi__label">{t('Farq (F3 − F2)')}</div><div className="fz-kpi__value" style={qoldiqRang(natija.jami.farq)}>{pul(natija.jami.farq)}</div>
          <div className="fz-kpi__sub">{t('Farq ichida F2 bo‘lmagan xat (lump-sum) qatorlari bo‘lishi mumkin')}</div></div>
      </div>
      {(natija.jami.tizimdaYoqF2 > 0 || natija.jami.reestrsizF2 > 0) && (
        <div className="fz-note fz-note--warn"><AlertTriangle /><span>{t('Reestrda bor, tizimda F2 yo‘q: {a} ta. Rasmiy reestr jami kiritilmagan F2: {b} ta (summa qatorlardan, taxminiy).', { a: String(natija.jami.tizimdaYoqF2), b: String(natija.jami.reestrsizF2) })}</span></div>
      )}
      <div className="fz-table-wrap">
        <table className="fz-table">
          <thead><tr>
            <th /><th>{t('Sana')}</th><th>{t('Продажа №')}</th><th style={raqamUstun}>{t('1C summa')}</th><th style={raqamUstun}>{t('F2 soni')}</th>
            <th style={raqamUstun}>{t('F2 qatorlar (ustamasiz)')}</th><th style={raqamUstun}>{t('F2 QQSsiz (hujjat)')}</th><th style={raqamUstun}>{t('F2 QQS bilan')}</th>
            <th style={raqamUstun}>{t('Farq')}</th><th>{t('Izoh')}</th>
          </tr></thead>
          <tbody>{natija.sotuvlar.map((s) => {
            const och = ochiq.has(s.f3.id);
            return (
              <Fragment key={s.f3.id}>
                <tr>
                  <td><button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={t('F2 to‘plami')} onClick={() => { const n = new Set(ochiq); if (och) n.delete(s.f3.id); else n.add(s.f3.id); setOchiq(n); }}>{och ? <ChevronDown /> : <ChevronRight />}</button></td>
                  <td>{sanaKor(s.f3.sotuv_sana)}</td><td>{s.f3.raqam ?? '—'}</td><td style={raqamUstun}>{pul(s.sotuv)}</td>
                  <td style={raqamUstun}>{s.birliklar.length}</td><td style={raqamUstun}>{pul(s.f2Pryamye)}</td><td style={raqamUstun}>{pul(s.f2Ustamali)}</td>
                  <td style={raqamUstun}>{pul(s.f2QqsBilan)}{s.nomalumSoni > 0 && <span className="fz-chip fz-chip--warn" style={{ marginLeft: 4 }}>{t('{n} ta noma’lum', { n: String(s.nomalumSoni) })}</span>}</td>
                  <td style={{ ...raqamUstun, ...qoldiqRang(s.farq) }}>{s.farq == null ? '—' : pul(s.farq)}</td>
                  <td>{!s.birliklar.length ? <span className="fz-chip fz-chip--danger">{t('F2 si yo‘q')}</span>
                    : <span className={`fz-chip${s.saqlangan ? ' fz-chip--accent' : ' fz-chip--warn'}`}>{s.saqlangan ? t('saqlangan') : t('taklif')}</span>}</td>
                </tr>
                {och && (
                  <tr><td /><td colSpan={9}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {s.birliklar.map((b) => (
                        <div key={b.kalit} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 12 }}>
                          <span>{birlikNom(b, obyektNom)}</span>
                          <span>{t('qatorlar')}: {pul(b.qatorPryamye)} / {t('ustamali+QQS')}: {pul(b.qatorQqsBilan)}</span>
                          <span>{t('hujjat')}: {pul(b.reestrQqssiz)} / {pul(b.reestrQqsBilan)}</span>
                          {b.ogoh.map((o) => <span key={o} className="fz-chip fz-chip--warn">{t(OGOH_NOM[o])}</span>)}
                          <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={t('Olib tashlash')} onClick={() => tanlovQoy(s.f3.id, tanlovOl(s.f3.id).filter((k) => k !== b.kalit))}><X /></button>
                        </div>))}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select aria-label={t('F2 qo‘shish')} className="input" style={{ height: 28, fontSize: 12 }} value="" onChange={(e) => { if (e.target.value) tanlovQoy(s.f3.id, [...tanlovOl(s.f3.id), e.target.value]); }}>
                          <option value="">{t('+ F2 qo‘shish (bog‘lanmaganlardan)')}</option>
                          {erkin.map((b) => <option key={b.kalit} value={b.kalit}>{birlikNom(b, obyektNom)} — {pul(b.asosiy)}</option>)}
                        </select>
                        <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={band} onClick={() => void bogSaqla([s.f3.id])}><Plus />{t('Saqlash')}</button>
                      </div>
                    </div>
                  </td></tr>
                )}
              </Fragment>);
          })}
            <tr className="fz-row-total"><td /><td colSpan={2}>{t('Jami')}</td><td style={raqamUstun}>{pul(natija.jami.sotuv)}</td><td /><td /><td />
              <td style={raqamUstun}>{pul(natija.jami.f2Boglangan)}</td><td style={{ ...raqamUstun, ...qoldiqRang(natija.jami.sotuv - natija.jami.f2Boglangan) }}>{pul(natija.jami.sotuv - natija.jami.f2Boglangan)}</td><td /></tr>
          </tbody>
        </table>
      </div>
      {erkin.length > 0 && (
        <div className="fz-panel">
          <div className="fz-panel__h"><AlertTriangle size={15} /><span>{t('Продажага kirmagan F2 ({n} ta, {s} so‘m)', { n: String(erkin.length), s: pul(erkin.reduce((a, b) => a + (b.asosiy ?? 0), 0)) })}</span></div>
          {erkin.map((b) => (
            <div key={b.kalit} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
              <span>{birlikNom(b, obyektNom)}</span><b>{pul(b.asosiy)}</b>
              {b.ogoh.map((o) => <span key={o} className="fz-chip fz-chip--warn">{t(OGOH_NOM[o])}</span>)}
            </div>))}
        </div>
      )}
    </div>
  );
}
