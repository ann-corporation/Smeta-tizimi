/**
 * Bitim kartasi (o'ng tomondagi panel): mijoz (PII faqat server qaytarsa), birlik, narx (narxHisob), to'lov turi va shartnoma
 * maydonlari, bosqich amallari, grafik (generator bilan), to'lovlar, jami, ipoteka kalkulyatori, audit.
 * Yozuv — bitimSaqla(kutilgan_versiya) — server «VERSIYA» qaytarsa ma'lumot yangilanadi.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarRange, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { yangiOperationId } from '../../api/supabase';
import { bitimSaqla, type BitimKarta as BitimKartaT, type TolovTuri, type Valyuta } from '../../api/t2-sotuv';
import { narxHisob } from '../../lib/sotuv/hisob';
import { OCHIQ_BOSQICH, SOTILGAN_BOSQICH, bronQoldi, maydon, sonMaydon, telefonKorinish } from '../../lib/sotuv/bitim-korinish';
import { Maydon, Pul, Sana } from './umumiy';
import { BOSQICH_NOMI, TOLOV_TURI_NOMI, kirit, manbaNomi, sonOl, useSotuvYangila, xatoMatn, type SotuvRuxsat } from './sotuv-umumiy';
import { useBitim, useShaxmatka } from './sorovlar';
import { BosqichTanla, BronBekorTugma } from './BosqichAmal';
import { GrafikGenerator } from './GrafikGenerator';
import { IpotekaKalk, Tolovlar } from './Tolovlar';

type Bino = { id: number; nom: string };

export function BitimKarta({ kid, bitimId, ruxsat, binolar, yop }: { kid: number; bitimId: number; ruxsat: SotuvRuxsat; binolar: readonly Bino[]; yop: () => void }) {
  const q = useBitim(kid, bitimId);
  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: 'color-mix(in srgb, var(--bg) 55%, transparent)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) yop(); }}>
      <aside role="dialog" aria-modal="true" aria-label={t('Bitim kartasi')} className="flex h-full w-full max-w-[760px] flex-col overflow-y-auto border-l border-border bg-bg p-3 shadow-xl sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold">{t('Bitim №{id}', { id: bitimId })}</h3>
          <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" onClick={yop} aria-label={t('Yopish')}><X aria-hidden="true" /></button>
        </div>
        {q.isLoading && <p className="text-text-mute">{t('Yuklanmoqda…')}</p>}
        {q.error && <p className="fz-note fz-note--danger">{t((q.error as Error).message)}</p>}
        {q.data && <Ichki kid={kid} k={q.data} ruxsat={ruxsat} binolar={binolar} />}
      </aside>
    </div>
  );
}

const Blok = ({ nom, children }: { nom: string; children: ReactNode }) => (
  <section className="rounded-md border border-border bg-surface p-2.5">
    <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-text-mute">{nom}</h4>
    {children}
  </section>
);
const Qator = ({ nom, children }: { nom: string; children: ReactNode }) => (
  <div className="flex justify-between gap-3 py-0.5 text-[12.5px]"><span className="text-text-mute">{nom}</span><span className="text-right">{children}</span></div>
);

function Ichki({ kid, k, ruxsat, binolar }: { kid: number; k: BitimKartaT; ruxsat: SotuvRuxsat; binolar: readonly Bino[] }) {
  const [grafik, setGrafik] = useState(false);
  const b = k.bitim;
  const valyuta = (maydon<Valyuta>(b, 'valyuta') ?? 'UZS');
  const yopiq = b.bosqich === 'bekor' || b.bosqich === 'topshirildi';
  const sotilgan = (SOTILGAN_BOSQICH as readonly string[]).includes(b.bosqich);
  const tolovTuri = maydon<TolovTuri>(b, 'tolov_turi');
  const bron = k.bron && k.bron.holat === 'faol' ? k.bron : null;
  const qoldi = bron ? bronQoldi(bron.tugaydi) : null;
  const PII = ['pinfl', 'pasport', 'inn', 'manzil', 'email', 'telefon2'] as const;
  const piiNom: Record<typeof PII[number], () => string> = {
    pinfl: () => t('JSHSHIR'), pasport: () => t('Pasport'), inn: () => t('STIR'), manzil: () => t('Manzil'), email: () => t('E-pochta'), telefon2: () => t('Qo‘shimcha telefon'),
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="fz-chip fz-chip--accent">{BOSQICH_NOMI[b.bosqich]()}</span>
        {ruxsat.yozish && !yopiq && (
          <div className="w-44"><BosqichTanla kid={kid} binolar={binolar}
            bitim={{ id: b.id, versiya: b.versiya, bosqich: b.bosqich, birlik_id: b.birlik_id, summa: b.summa, mijoz: k.mijoz.fio }} /></div>
        )}
        {ruxsat.yozish && bron && <BronBekorTugma kid={kid} bronId={bron.id} />}
        {qoldi && <span className={qoldi.otdi ? 'text-danger' : 'text-warn'}>{qoldi.otdi ? t('Bron muddati tugadi') : t('Bron: {s} soat {d} daqiqa qoldi', { s: qoldi.soat, d: qoldi.daqiqa })}</span>}
      </div>
      {b.bosqich === 'bekor' && maydon(b, 'bekor_sabab') && <p className="fz-note fz-note--warn">{t('Bekor sababi')}: {maydon(b, 'bekor_sabab')}</p>}

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Blok nom={t('Mijoz')}>
          <Qator nom={t('F.I.O.')}><b>{k.mijoz.fio}</b></Qator>
          <Qator nom={t('Telefon')}><a className="text-accent tabular-nums" href={`tel:+${k.mijoz.telefon.replace(/\D/g, '')}`}>{telefonKorinish(k.mijoz.telefon)}</a></Qator>
          {PII.filter((p) => maydon(k.mijoz, p) != null).map((p) => <Qator key={p} nom={piiNom[p]()}>{String(maydon(k.mijoz, p))}</Qator>)}
          <Qator nom={t('Manba')}>{manbaNomi(maydon(b, 'manba'))}</Qator>
          {'rozilik_sana' in k.mijoz && <Qator nom={t('Rozilik')}>{maydon(k.mijoz, 'rozilik_sana') ? <Sana v={maydon(k.mijoz, 'rozilik_sana')} /> : t('Yo‘q')}</Qator>}
        </Blok>
        <Blok nom={t('Birlik')}>
          {k.birlik ? (
            <>
              <Qator nom={t('Raqam')}><b>{k.birlik.raqam}</b></Qator>
              <Qator nom={t('Podyezd / qavat')}>{`${maydon(k.birlik, 'podyezd') ?? '—'} / ${maydon(k.birlik, 'qavat') ?? '—'}`}</Qator>
              <Qator nom={t('Xonalar')}>{String(maydon(k.birlik, 'xona_soni') ?? '—')}</Qator>
              <Qator nom={t('Maydon, m²')}>{String(maydon(k.birlik, 'maydon') ?? '—')}</Qator>
              <Qator nom={t('Narx (jami)')}><Pul val={k.birlik.narx_jami} valyuta={maydon(k.birlik, 'valyuta') ?? valyuta} /></Qator>
            </>
          ) : <p className="text-[12px] text-text-mute">{t('Birlik tanlanmagan')}</p>}
        </Blok>
      </div>

      <Blok nom={t('Hisob')}>
        <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
          <Qator nom={t('Summa')}><b><Pul val={k.jami.summa} valyuta={valyuta} /></b></Qator>
          <Qator nom={t('To‘landi')}><Pul val={k.jami.tolandi} valyuta={valyuta} cl="text-ok" /></Qator>
          <Qator nom={t('Qoldiq')}><Pul val={k.jami.qoldiq} valyuta={valyuta} /></Qator>
          <Qator nom={t('Muddati o‘tgan')}><Pul val={k.jami.muddati_otgan} valyuta={valyuta} cl={k.jami.muddati_otgan > 0 ? 'text-danger' : ''} /></Qator>
        </div>
      </Blok>

      {ruxsat.yozish && !yopiq
        ? <BitimForma key={b.versiya} kid={kid} k={k} sotilgan={sotilgan} binolar={binolar} />
        : <BitimMalumot k={k} />}

      {tolovTuri === 'ipoteka' && (k.jami.summa ?? k.birlik?.narx_jami) != null && (
        <IpotekaKalk narx={(k.jami.summa ?? k.birlik?.narx_jami)!} valyuta={valyuta} subsidiya={sonMaydon(b, 'subsidiya_summa')} />
      )}

      <Blok nom={t('To‘lov grafigi')}>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[12px] text-text-mute">{k.grafik_versiya ? t('Versiya {v}', { v: k.grafik_versiya }) : t('Grafik tuzilmagan')}</span>
          {ruxsat.yozish && b.bosqich !== 'bekor' && b.summa != null && (
            <button type="button" className="fz-btn fz-btn--sm" onClick={() => setGrafik(true)}><CalendarRange size={14} aria-hidden="true" />{k.grafik.length ? t('Grafikni qayta tuzish') : t('Grafik tuzish')}</button>
          )}
        </div>
        {k.grafik.length > 0 && (
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-surface text-left text-text-mute">
                <tr><th className="px-1">{t('№')}</th><th className="px-1">{t('Sana')}</th><th className="px-1 text-right">{t('Summa')}</th><th className="px-1 text-right">{t('To‘langan')}</th><th className="px-1 text-right">{t('Qoldiq')}</th><th className="px-1 text-right">{t('Kechikish, kun')}</th></tr>
              </thead>
              <tbody>
                {k.grafik.map((g) => (
                  <tr key={g.id} className={`border-t border-border/50 ${g.kechikkan_kun ? 'text-danger' : g.qoldiq <= 0.005 ? 'text-text-mute' : ''}`}>
                    <td className="px-1 tabular-nums">{g.n}</td><td className="px-1"><Sana v={g.sana} /></td>
                    <td className="px-1 text-right"><Pul val={g.summa} valyuta={valyuta} /></td>
                    <td className="px-1 text-right"><Pul val={g.tolangan} valyuta={valyuta} /></td>
                    <td className="px-1 text-right"><Pul val={g.qoldiq} valyuta={valyuta} /></td>
                    <td className="px-1 text-right tabular-nums">{g.kechikkan_kun ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Blok>

      <Blok nom={t('To‘lovlar')}>
        <Tolovlar kid={kid} bitimId={b.id} tolovlar={k.tolovlar} valyuta={valyuta} tolovRuxsat={ruxsat.tolov && b.bosqich !== 'bekor'} shartnomadan={sotilgan} />
      </Blok>

      {k.audit.length > 0 && (
        <Blok nom={t('Tarix (audit)')}>
          <ul className="max-h-40 space-y-0.5 overflow-auto text-[11.5px] text-text-dim">
            {k.audit.map((a, i) => <li key={i} className="tabular-nums">{String(a.yaratildi).slice(0, 16).replace('T', ' ')} · {a.entity} · {a.amal}</li>)}
          </ul>
        </Blok>
      )}
      {grafik && b.summa != null && <GrafikGenerator kid={kid} bitimId={b.id} summa={b.summa} valyuta={valyuta} yop={() => setGrafik(false)} />}
    </div>
  );
}

function BitimMalumot({ k }: { k: BitimKartaT }) {
  const b = k.bitim;
  const tt = maydon<TolovTuri>(b, 'tolov_turi');
  return (
    <Blok nom={t('Shartnoma')}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Qator nom={t('To‘lov turi')}>{tt ? TOLOV_TURI_NOMI[tt]() : '—'}</Qator>
        <Qator nom={t('Shartnoma raqami')}>{maydon(b, 'shartnoma_raqam') ?? '—'}</Qator>
        <Qator nom={t('Shartnoma sanasi')}><Sana v={maydon(b, 'shartnoma_sana')} /></Qator>
        <Qator nom={t('Notarius sanasi')}><Sana v={maydon(b, 'notarius_sana')} /></Qator>
        <Qator nom={t('Kadastr sanasi')}><Sana v={maydon(b, 'kadastr_sana')} /></Qator>
        <Qator nom={t('Eskrou hisobi')}>{maydon(b, 'eskrou_hisob') ?? '—'}</Qator>
        <Qator nom={t('m² narxi')}><Pul val={sonMaydon(b, 'narx_m2')} valyuta={maydon(b, 'valyuta') ?? 'UZS'} /></Qator>
        <Qator nom={t('Chegirma, %')}>{sonMaydon(b, 'chegirma_foiz') ?? '—'}</Qator>
      </div>
    </Blok>
  );
}

const sStr = (o: Record<string, unknown>, k: string) => { const v = o[k]; return v == null ? '' : String(v).slice(0, k.endsWith('sana') ? 10 : undefined); };

/** Tahrirlanadigan shartnoma/narx maydonlari. Faqat o'zgargan maydonlar yuboriladi (server coalesce — bo'shatib bo'lmaydi). */
function BitimForma({ kid, k, sotilgan, binolar }: { kid: number; k: BitimKartaT; sotilgan: boolean; binolar: readonly Bino[] }) {
  const b = k.bitim;
  const boshlangich = useMemo(() => ({
    narx_m2: sStr(b, 'narx_m2') || (k.birlik ? sStr(k.birlik, 'narx_m2') : ''), chegirma_foiz: sStr(b, 'chegirma_foiz'), summa: sStr(b, 'summa'),
    valyuta: sStr(b, 'valyuta') || 'UZS', tolov_turi: sStr(b, 'tolov_turi'), bank: sStr(b, 'bank'), ipoteka_dastur: sStr(b, 'ipoteka_dastur'),
    subsidiya_summa: sStr(b, 'subsidiya_summa'), shartnoma_raqam: sStr(b, 'shartnoma_raqam'), shartnoma_sana: sStr(b, 'shartnoma_sana'),
    notarius_sana: sStr(b, 'notarius_sana'), kadastr_sana: sStr(b, 'kadastr_sana'), eskrou_hisob: sStr(b, 'eskrou_hisob'),
    keyingi_aloqa: sStr(b, 'keyingi_aloqa').slice(0, 16), izoh: sStr(b, 'izoh'),
  }), [b, k.birlik]);
  const [f, setF] = useState(boshlangich);
  const [birlikId, setBirlikId] = useState<number | null>(null);
  const [obyektId, setObyektId] = useState<number | null>(null);
  const [band, setBand] = useState(false);
  const op = useRef(yangiOperationId());
  const yangila = useSotuvYangila();
  const birlikOchiq = (OCHIQ_BOSQICH as readonly string[]).includes(b.bosqich);
  const sh = useShaxmatka(kid, birlikOchiq ? obyektId : null);
  const boshlar = (sh.data?.birliklar ?? []).filter((x) => x.holat === 'bosh');
  const tanBirlik = boshlar.find((x) => x.id === birlikId);
  const maydonM2 = tanBirlik?.maydon ?? sonMaydon(k.birlik, 'maydon');
  const narxM2 = sonOl(f.narx_m2) ?? tanBirlik?.narx_m2 ?? null;
  const hisob = maydonM2 != null && narxM2 != null ? narxHisob(maydonM2, narxM2, sonOl(f.chegirma_foiz) ?? 0) : null;
  const set = (key: keyof typeof f, v: string) => setF((x) => ({ ...x, [key]: v }));
  const ozgargan = (Object.keys(f) as Array<keyof typeof f>).filter((key) => f[key] !== boshlangich[key]);

  const saqla = async () => {
    const p: Record<string, unknown> = { id: b.id, kutilgan_versiya: b.versiya };
    for (const key of ozgargan) {
      const v = f[key].trim();
      if (!v) continue;
      if (['narx_m2', 'chegirma_foiz', 'summa', 'subsidiya_summa'].includes(key)) p[key] = sonOl(v);
      else if (key === 'keyingi_aloqa') p[key] = new Date(v).toISOString();
      else p[key] = v;
    }
    if (birlikId) p.birlik_id = birlikId;
    setBand(true);
    const r = await bitimSaqla(kid, p, op.current);
    setBand(false);
    op.current = yangiOperationId();
    if (!r.ok) { toast(xatoMatn(r), 'danger'); yangila(); return; }
    toast(t('Saqlandi')); yangila();
  };

  const txt = (key: keyof typeof f, nom: string, tur = 'text') => (
    <Maydon nom={nom}><input type={tur} className={kirit} value={f[key]} onChange={(e) => set(key, e.target.value)} aria-label={nom} /></Maydon>
  );
  const pul = (key: keyof typeof f, nom: string) => (
    <Maydon nom={nom}><MoneyInput className={kirit} value={f[key]} onValueChange={(v) => set(key, v)} aria-label={nom} /></Maydon>
  );

  return (
    <Blok nom={t('Shartnoma va narx')}>
      <div className="space-y-2.5">
        {birlikOchiq && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Maydon nom={t('Bino')}>
              <select className={kirit} value={obyektId ?? ''} onChange={(e) => { setObyektId(Number(e.target.value) || null); setBirlikId(null); }}>
                <option value="">{t('— tanlang —')}</option>
                {binolar.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
              </select>
            </Maydon>
            <Maydon nom={k.birlik ? t('Birlikni almashtirish') : t('Birlik')}>
              <select className={kirit} value={birlikId ?? ''} onChange={(e) => setBirlikId(Number(e.target.value) || null)} disabled={!obyektId}>
                <option value="">{t('— tanlang —')}</option>
                {boshlar.map((x) => <option key={x.id} value={x.id}>{`${x.raqam} · ${x.xona_soni ?? '—'}x · ${x.maydon ?? '—'} m²`}</option>)}
              </select>
            </Maydon>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {pul('narx_m2', t('m² narxi'))}
          {txt('chegirma_foiz', t('Chegirma, %'))}
          {pul('summa', t('Summa'))}
          <Maydon nom={t('Valyuta')}>
            <select className={kirit} value={f.valyuta} onChange={(e) => set('valyuta', e.target.value)} disabled={sotilgan}>
              <option value="UZS">{'UZS'}</option><option value="USD">{'USD'}</option>
            </select>
          </Maydon>
        </div>
        {hisob && (
          <p className="text-[12px] text-text-dim">
            {t('Hisob: {m} m² × m² narxi', { m: maydonM2 ?? 0 })} = <Pul val={hisob.asosiy} valyuta={f.valyuta} />
            {hisob.chegirma > 0 && <> − <Pul val={hisob.chegirma} valyuta={f.valyuta} /></>} = <b><Pul val={hisob.yakuniy} valyuta={f.valyuta} /></b>
            {' '}<button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => set('summa', String(hisob.yakuniy))}>{t('Summaga qo‘yish')}</button>
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Maydon nom={t('To‘lov turi')}>
            <select className={kirit} value={f.tolov_turi} onChange={(e) => set('tolov_turi', e.target.value)}>
              <option value="">{'—'}</option>
              {(Object.keys(TOLOV_TURI_NOMI) as TolovTuri[]).map((x) => <option key={x} value={x}>{TOLOV_TURI_NOMI[x]()}</option>)}
            </select>
          </Maydon>
          {(f.tolov_turi === 'ipoteka' || f.tolov_turi === 'eskrou') && txt('bank', t('Bank'))}
          {f.tolov_turi === 'ipoteka' && txt('ipoteka_dastur', t('Ipoteka dasturi'))}
          {f.tolov_turi === 'ipoteka' && pul('subsidiya_summa', t('Subsidiya'))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {txt('shartnoma_raqam', t('Shartnoma raqami'))}
          {txt('shartnoma_sana', t('Shartnoma sanasi'), 'date')}
          {txt('notarius_sana', t('Notarius sanasi'), 'date')}
          {txt('kadastr_sana', t('Kadastr sanasi'), 'date')}
          {txt('eskrou_hisob', t('Eskrou hisobi'))}
          {txt('keyingi_aloqa', t('Keyingi aloqa'), 'datetime-local')}
        </div>
        {txt('izoh', t('Izoh'))}
        <div className="flex justify-end">
          <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" disabled={band || (!ozgargan.length && !birlikId)} onClick={saqla}>{t('Saqlash')}</button>
        </div>
      </div>
    </Blok>
  );
}
