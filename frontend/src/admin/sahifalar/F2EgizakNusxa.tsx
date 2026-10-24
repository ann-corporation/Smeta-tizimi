import { useEffect, useState } from 'react';
import { sbOqi, type T2Obyekt } from '../../api/supabase';
import { f2DavomRoyxatOl, type T2F2DavomQator } from '../../api/t2-f2-davom';
import { f2ServerOl } from '../../lib/f2-ishchi-qoralama';
import {
  EGIZAK_USTUNLAR, aslXarita, boglanishKochir, egizakHolat, egizakOpId, egizakQoshimchaYoz, f2Mosligi, idXarita, qoshimchaReja,
  type EgizakQator, type KochmaganSabab, type QoshimchaReja,
} from '../../lib/f2-moslash-v3/egizak';
import type { F2Indeks, IshJoyi } from '../../lib/f2-moslash-v3/ishJoyi';
import type { RejaliYaratish, YozilganQator } from '../../lib/f2-moslash-v3/rejali';
import { t } from '../../i18n/til';

/**
 * «⧉ Egizak obyekt qoralamasidan nusxa» (egasi 2026-10-24, Fast Food 2-etaj №1→№2/№3): shu loyihadagi boshqa obyektning
 * shu F2 bo'yicha server qoralamasidagi ishini (qo'shimcha/zamena + bog'lanishlar) shu obyektga takrorlaydi.
 * 1-qadam (alohida tasdiq): qo'shimcha/zamenalar sahifaning AYNI `rejaliYarat` yo'li bilan smetaga yoziladi (idempotent).
 * 2-qadam: bog'lanishlar bitta «Orqaga» qadami bo'lib qo'yiladi va server qoralamasiga saqlanadi. F2 (akt) YOZILMAYDI.
 */
export interface F2EgizakNusxaProps {
  companyId: number;
  objectId: number;
  objects: readonly T2Obyekt[];
  ind: F2Indeks;
  /** Shu obyektning ochiq server qoralamasi (o'zi nomzod bo'lmaydi). */
  jobId: number | null;
  busy: boolean;
  yarat: RejaliYaratish;
  versiya(id: number): Promise<number>;
  smetaYangila(): Promise<unknown>;
  /** Bog'lanishlarni bitta tarix qadami bilan qo'yadi va server qoralamasini saqlaydi. */
  ijQoy: (ij: IshJoyi, izoh: string) => void;
}

type Tahlil = {
  job: T2F2DavomQator; aNom: string;
  aIj: IshJoyi; aslMap: Map<number, number>; imzo: string;
  reja: QoshimchaReja; bQosh: YozilganQator[]; qoshMap: Map<number, number>; qolganSoni: number;
  hozir: number; jami: number; bogKochmadi: number;
};

const SABAB: Record<KochmaganSabab, string> = {
  ota: 'ota qatori ko‘chmadi', almashtirilgan: 'almashtirilgan qator topilmadi', hajm: 'hajmi yo‘q', birlik: 'birligi yo‘q',
};

async function qatorlar(oid: number): Promise<EgizakQator[]> {
  const r = await sbOqi<EgizakQator>({ jadval: 't2_qator', filtr: `obyekt_id=eq.${oid}`, ustunlar: EGIZAK_USTUNLAR, tartib: 'id.asc', limit: 50000 });
  if (!r.ok) throw new Error(t('Egizak obyekt ma’lumotlari o‘qilmadi.'));
  return r.qatorlar ?? [];
}

export function F2EgizakNusxa(p: F2EgizakNusxaProps) {
  const [nomzodlar, setNomzodlar] = useState<T2F2DavomQator[]>([]);
  const [tahlil, setTahlil] = useState<Tahlil | null>(null);
  const [rad, setRad] = useState<string[]>([]);
  const [izoh, setIzoh] = useState('');
  const [ish, setIsh] = useState(false);
  const qatorSoni = p.ind.qatorlar.length;
  const loyiha = p.objects.find((o) => o.id === p.objectId)?.loyiha_id ?? null;

  useEffect(() => {
    let faol = true;
    setNomzodlar([]); setTahlil(null); setRad([]); setIzoh('');
    if (loyiha == null) return () => { faol = false; };
    const egizak = new Set(p.objects.filter((o) => o.loyiha_id === loyiha && o.id !== p.objectId).map((o) => o.id));
    if (!egizak.size) return () => { faol = false; };
    void f2DavomRoyxatOl(p.companyId).then((r) => {
      if (!faol || !r.ok) return;
      setNomzodlar(r.qatorlar
        .filter((q) => egizak.has(q.obyekt_id) && q.job_id !== p.jobId && !['cancelled', 'failed'].includes(q.status)
          && q.jami === qatorSoni && q.jami - q.topilmadi > 0)
        .sort((a, b) => (b.jami - b.topilmadi) - (a.jami - a.topilmadi) || String(b.yangilandi).localeCompare(String(a.yangilandi)))
        .slice(0, 3));
    }).catch(() => undefined);
    return () => { faol = false; };
  }, [p.companyId, p.objectId, p.jobId, loyiha, qatorSoni, p.objects]);

  async function tekshir(job: T2F2DavomQator): Promise<Tahlil | null> {
    setIsh(true); setRad([]); setIzoh(t('Egizak obyekt tekshirilmoqda…'));
    try {
      const [aRows, bRows, aD] = await Promise.all([qatorlar(job.obyekt_id), qatorlar(p.objectId), f2ServerOl(job.job_id)]);
      if (aD.objectId !== job.obyekt_id) throw new Error(t('Egizak obyekt ma’lumotlari o‘qilmadi.'));
      const aNom = p.objects.find((o) => o.id === job.obyekt_id)?.nom ?? job.obyekt_nom ?? `#${job.obyekt_id}`;
      const f2 = f2Mosligi(aD.sourceRows, p.ind);
      if (!f2.ok) { setRad([t('F2 fayli egizak qoralamaga mos emas ({n} qator farq qiladi) — nusxa olinmaydi.', { n: f2.farqlar.length })]); setTahlil(null); return null; }
      const x = aslXarita(aRows, bRows);
      if (!x.ok) {
        setRad([t('Asl smeta egizak obyektnikiga tuzilma bo‘yicha mos emas — nusxa olinmaydi.'),
          t('Qatorlar soni: {a} va {b}.', { a: x.aSoni, b: x.bSoni }), t('Imzo: {a} / {b}', { a: x.imzoA, b: x.imzoB }),
          ...x.farqlar.slice(0, 5).map((f) => t('Farq: {orin}-qator ({maydon}).', { orin: f.orin, maydon: f.maydon }))]);
        setTahlil(null); return null;
      }
      const ops = new Map(await Promise.all(aRows.filter((q) => q.qoshimcha).map(async (q) => [q.id, await egizakOpId(q.id, p.objectId)] as const)));
      const reja = qoshimchaReja(aRows, x.map, ops, `Egizak obyektdan nusxa: ${aNom} (#${job.obyekt_id})`);
      const bQosh = bRows.filter((q) => q.qoshimcha).map((q) => ({ id: q.id, ota_id: q.ota_id, operation_id: q.operation_id ?? null, tur: q.tur, nom: q.nom, tartib: q.tartib ?? null }));
      const h = egizakHolat(reja, bQosh);
      const hozir = boglanishKochir(aD.ij, p.ind, idXarita(x.map, h.map));
      const rejadagi = new Set(reja.buyruqlar.flatMap((b) => [b.tempId, ...b.resursTempIds]));
      const jami = boglanishKochir(aD.ij, p.ind, (id) => x.map.get(id) ?? (rejadagi.has(-id) ? id : undefined));
      const r: Tahlil = { job, aNom, aIj: aD.ij, aslMap: x.map, imzo: x.imzo, reja, bQosh, qoshMap: h.map, qolganSoni: h.qolgan.length,
        hozir: hozir.kochdi, jami: jami.kochdi, bogKochmadi: jami.kochmadi.length };
      setTahlil(r); setIzoh('');
      return r;
    } catch (e) { setRad([e instanceof Error ? e.message : t('Egizak obyekt ma’lumotlari o‘qilmadi.')]); setTahlil(null); return null; }
    finally { setIsh(false); }
  }

  async function qoshimchaYoz() {
    if (!tahlil || ish) return;
    const bNom = p.objects.find((o) => o.id === p.objectId)?.nom ?? '';
    if (!window.confirm(t('{nom} smetasiga {n} ta amal ({q} qator) qo‘shimcha/zamena sifatida yoziladi. Asl qatorlar o‘zgarmaydi. Davom etasizmi?',
      { nom: bNom, n: tahlil.qolganSoni, q: tahlil.reja.qatorSoni }))) return;
    setIsh(true);
    let natija = '';
    try {
      // Yozishdan oldin B smetasi qayta o'qiladi: boshqa oynada yozilganlari takrorlanmaydi.
      const bRows = await qatorlar(p.objectId);
      const bQosh = bRows.filter((q) => q.qoshimcha).map((q) => ({ id: q.id, ota_id: q.ota_id, operation_id: q.operation_id ?? null, tur: q.tur, nom: q.nom, tartib: q.tartib ?? null }));
      const r = await egizakQoshimchaYoz(tahlil.reja, bQosh, { yarat: p.yarat, versiya: p.versiya,
        progress: (i, n) => setIzoh(t('Qo‘shimcha/zamena yozilmoqda: {i}/{n}', { i, n })) });
      natija = r.xato ? t('Yozish to‘xtadi: {xato}. Qayta bosing — yozilganlari takrorlanmaydi.', { xato: r.xato })
        : t('{yozildi} ta amal yozildi, {oldin} tasi avval yozilgan edi.', { yozildi: r.yozildi, oldin: r.oldin });
      await p.smetaYangila().catch(() => undefined);
    } catch (e) { natija = e instanceof Error ? e.message : t('Egizak obyekt ma’lumotlari o‘qilmadi.'); }
    finally { setIsh(false); }
    await tekshir(tahlil.job);
    setIzoh(natija);
  }

  async function boglanishNusxa() {
    if (!tahlil || ish) return;
    const r0 = await tekshir(tahlil.job);
    if (!r0) return;
    const r = boglanishKochir(r0.aIj, p.ind, idXarita(r0.aslMap, r0.qoshMap));
    if (!window.confirm(t('Joriy bog‘lanishlar egizak obyektnikiga almashtiriladi ({n} ta). «Orqaga» bilan qaytarish mumkin. Davom etasizmi?', { n: r.kochdi }))) return;
    const matn = t('{n} ta bog‘lanish egizak obyektdan ko‘chirildi; {m} tasi ko‘chmadi. Server qoralamasi saqlanmoqda. «F2 ni yozish» ni o‘zingiz bosing.', { n: r.kochdi, m: r.kochmadi.length });
    p.ijQoy(r.ij, matn);
    setIzoh(matn);
  }

  if (!nomzodlar.length) return null;
  const band = ish || p.busy;
  return (
    <section className="karta space-y-2 border border-violet-500/40 bg-violet-500/5 p-2 text-[12px]" aria-label={t('Egizak obyektdan nusxa')}>
      <div className="flex flex-wrap items-center gap-2">
        {nomzodlar.map((n) => (
          <button key={n.job_id} type="button" className="tugma" disabled={band} onClick={() => void tekshir(n)}>
            {t('⧉ Egizak obyekt qoralamasidan nusxa ({nom})', { nom: p.objects.find((o) => o.id === n.obyekt_id)?.nom ?? n.obyekt_nom ?? `#${n.obyekt_id}` })}
          </button>
        ))}
        {izoh && <span role="status" className="text-text-dim">{izoh}</span>}
      </div>
      {rad.length > 0 && <div role="alert" className="text-danger">{rad.map((m) => <p key={m}>{m}</p>)}</div>}
      {tahlil && (
        <div className="space-y-1">
          <p className="font-semibold text-text">{t('Egizak obyektdan nusxa')}: {tahlil.aNom} → {p.objects.find((o) => o.id === p.objectId)?.nom}</p>
          <p className="text-text-dim">{t('Asl smeta mos: {n} qator (imzo {imzo}).', { n: tahlil.aslMap.size, imzo: tahlil.imzo })}</p>
          <p>{t('Qo‘shimcha/zamena: {buyruq} ta amal ({qator} qator: {qosh} qo‘shimcha, {zam} zamena, {bolim} bo‘lim); smetada allaqachon bor: {oldin}.', {
            buyruq: tahlil.reja.buyruqlar.length, qator: tahlil.reja.qatorSoni, qosh: tahlil.reja.qoshimchaSoni, zam: tahlil.reja.zamenaSoni,
            bolim: tahlil.reja.bolimSoni, oldin: tahlil.reja.buyruqlar.length - tahlil.qolganSoni })}</p>
          <p>{t('Bog‘lanishlar: {jami} ta ko‘chiriladi (hozir {hozir} ta tayyor; qolgani qo‘shimcha/zamenalar yozilgach).', { jami: tahlil.jami, hozir: tahlil.hozir })}
            {tahlil.bogKochmadi > 0 && <> {t('Bog‘lanmaydigan F2 qatorlari: {n}', { n: tahlil.bogKochmadi })}</>}</p>
          {tahlil.reja.kochmadi.length > 0 && (
            <details open className="text-warn">
              <summary>{t('Ko‘chirib bo‘lmaydigan qatorlar ({n}):', { n: tahlil.reja.kochmadi.length })}</summary>
              <ul className="ml-4 list-disc">{tahlil.reja.kochmadi.map((k) => <li key={k.id}>#{k.id} {k.nom} — {t(SABAB[k.sabab])}</li>)}</ul>
            </details>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="tugma" disabled={band || tahlil.qolganSoni === 0} onClick={() => void qoshimchaYoz()}>
              {t('1. Qo‘shimcha/zamenalarni smetaga yozish ({n})', { n: tahlil.qolganSoni })}
            </button>
            <button type="button" className="tugma tugma-asosiy" disabled={band || tahlil.hozir === 0} onClick={() => void boglanishNusxa()}>
              {t('2. Bog‘lanishlarni nusxalash ({n})', { n: tahlil.hozir })}
            </button>
            <button type="button" className="tugma" disabled={band} onClick={() => { setTahlil(null); setRad([]); setIzoh(''); }}>{t('Yopish')}</button>
          </div>
        </div>
      )}
    </section>
  );
}
