/**
 * AosrZanjir — ZANJIRLI АОСР QORALAMA: tanlangan smeta ishi(lari) uchun yashiriladigan bosqichlar
 * (zamin → podgotovka → armatura → opalubka → beton → gidroizolyatsiya → qoplama asosi) bo'yicha alohida qoralamalar.
 * Bosqich/material aniqlash — lib/aosr-zanjir (shifr prefiksi + nom); hamma qoralama holati «Qoralama».
 * Yozish mavjud yo'llar bilan: `sbAosrYozV2` + `sbAosrBogSaqla`. Raqam obyekt bo'yicha davomli (tahrirlanadi).
 * Sanalar sukut bo'yicha BO'SH (egasi o'zi qo'yadi); xohlansa fakt sanalaridan to'ldiriladi.
 */
import { useMemo, useState } from 'react';
import { Layers, X, FilePlus2 } from 'lucide-react';
import { sbAosrBogSaqla, sbFaktSanalarOl, type AosrCoverage, type QatorMetaYozuv } from '../api/t2-aosr';
import { sbAosrYozV2, type AosrMalumot, type AosrV2 } from '../api/t2-ijro';
import { obyektImzochilarOl } from '../api/obyekt-imzochi';
import { yangiOperationId } from '../api/supabase';
import { aosrKomissiyaTartibi } from '../lib/aosr-export';
import { komissiyaImzochilardan, sanaOraligi } from '../lib/ijro-tayyorla';
import { BOSQICH_UZ, guruhResurslari, keyingiAosrRaqam, namunaAkt, zanjirQur, type Bosqich } from '../lib/aosr-zanjir';
import { resursKatmi } from '../lib/aosr-resurs';
import { toast } from '../umumiy/ui/Toast';
import { t } from '../i18n/til';

type Props = {
  kompaniyaId: number; obyektId: number;
  coverage: readonly AosrCoverage[]; qatorMeta: readonly QatorMetaYozuv[];
  /** Belgilangan qator id lar (chap ro'yxatdan). */
  tanlangan: ReadonlySet<number>; aktlar: readonly AosrV2[];
  onYopish: () => void; onTayyor: () => void;
};

const resursmi = (c: Pick<AosrCoverage, 'kat'>) => resursKatmi(c.kat);

export function AosrZanjir({ kompaniyaId, obyektId, coverage, qatorMeta, tanlangan, aktlar, onYopish, onTayyor }: Props) {
  const [boshRaqam, setBoshRaqam] = useState(() => String(keyingiAosrRaqam(aktlar)));
  const [faktSana, setFaktSana] = useState(false);
  const [chiqarilgan, setChiqarilgan] = useState<Set<Bosqich>>(new Set());
  const [band, setBand] = useState(false);

  const natija = useMemo(() => {
    const ota = new Map(qatorMeta.map((m) => [m.id, m.ota_id] as const));
    const ishlar = coverage.filter((c) => tanlangan.has(c.qator_id) && !resursmi(c));
    const ishIds = new Set(ishlar.map((c) => c.qator_id));
    const resurslar = new Map<number, AosrCoverage[]>();
    for (const c of coverage) {
      const o = ota.get(c.qator_id);
      if (resursmi(c) && o != null && ishIds.has(o) && Number(c.fakt_hajm) > 0) { const a = resurslar.get(o) ?? []; a.push(c); resurslar.set(o, a); }
    }
    // Hammasi bitta guruhda (bitta razdel/konstruksiya) bo'lsa — akt nomi shu guruh nomi bilan.
    const otalar = new Set(ishlar.map((c) => ota.get(c.qator_id)));
    const guruhId = otalar.size === 1 ? [...otalar][0] : null;
    const konstruksiya = guruhId != null ? qatorMeta.find((m) => m.id === guruhId)?.nom ?? null : null;
    return zanjirQur({ ishlar, resurslar, guruhResurslar: guruhResurslari(coverage, ota, ishIds), konstruksiya });
  }, [coverage, qatorMeta, tanlangan]);

  const tanlanganlar = natija.qoralamalar.filter((q) => !chiqarilgan.has(q.bosqich));
  const almashtir = (b: Bosqich) => setChiqarilgan((s) => { const n = new Set(s); if (n.has(b)) n.delete(b); else n.add(b); return n; });

  const yarat = async () => {
    const bosh = Number(boshRaqam);
    if (!tanlanganlar.length || band) return;
    if (!Number.isFinite(bosh) || bosh <= 0) { toast(t('Boshlang‘ich raqamni kiriting'), 'warn'); return; }
    setBand(true);
    try {
      const oxirgi = namunaAkt(aktlar);
      const sukutKomissiya = oxirgi && Array.isArray(oxirgi.komissiya) ? oxirgi.komissiya.map((k) => ({ ...k })) : aosrKomissiyaTartibi('subpudratchisiz', []).map((k) => ({ rol: String(k.rol) }));
      const imzo = await obyektImzochilarOl(kompaniyaId, obyektId, null).catch(() => null);
      const imzochilar = imzo && imzo.ok ? imzo.natija.imzochilar : null;
      const komissiya = imzochilar?.some((x) => x.effektiv) ? komissiyaImzochilardan(imzochilar) : null;
      const fakt = faktSana ? await sbFaktSanalarOl(obyektId, tanlanganlar.flatMap((q) => q.qatorIds)) : null;
      let tayyor = 0; let xato = '';
      for (const [i, q] of tanlanganlar.entries()) {
        const sanalar = fakt ? sanaOraligi(q.qatorIds, fakt.links, fakt.aktlar) : null;
        const malumot: AosrMalumot = {
          tur: 'aosr', holat: 'yangi', raqam: String(bosh + i), ...q.malumot,
          ...(sanalar ? { sana: sanalar.tugash ?? undefined, boshlanish_sana: sanalar.boshlanish ?? undefined, tugash_sana: sanalar.tugash ?? undefined } : {}),
          blank_varianti: komissiya?.blank ?? oxirgi?.blank_varianti ?? 'subpudratchisiz',
          loyiha_tashkiloti: oxirgi?.loyiha_tashkiloti ?? '', ...(oxirgi?.loyiha_hujjati ? { loyiha_hujjati: oxirgi.loyiha_hujjati } : {}), chetlanishlar: 'Нет',
          komissiya: komissiya?.komissiya ?? sukutKomissiya,
          izoh: `zanjir: ${q.bosqich}`,
        };
        const r = await sbAosrYozV2({ kompaniyaId, obyektId, malumot, operationId: yangiOperationId() });
        if (!r.ok || !r.id) { xato = r.error || t('Xato'); break; }
        const bog = await sbAosrBogSaqla([r.id], q.qatorIds);
        if (!bog.ok) { xato = bog.error || t('Xato'); break; }
        tayyor++;
      }
      if (tayyor) toast(t('✓ {n} ta АОСР qoralamasi tayyor — tekshirib, o‘zingiz tasdiqlang', { n: tayyor }), 'ok');
      if (xato) toast(t('Qoralama tayyorlanmadi: {x}', { x: xato }), 'danger');
      if (tayyor) onTayyor();
    } finally { setBand(false); }
  };

  return (
    <section className="fz-card" aria-label={t('Zanjirli qoralama')} data-testid="aosr-zanjir">
      <div className="fz-card__head">
        <div>
          <h2 className="fz-card__title flex items-center gap-1.5"><Layers size={16} />{t('Zanjirli qoralama: yashiriladigan bosqichlar')}</h2>
          <p className="fz-card__sub">{t('Smetadagi ish va resurslardan aniqlangan bosqichlar qurilish tartibida. Smetada yo‘q bosqich yaratilmaydi.')}</p>
        </div>
        <button type="button" onClick={onYopish} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={t('Yopish')}><X /></button>
      </div>
      <div className="space-y-2 p-4">
        {natija.qoralamalar.length === 0 && <p className="text-[13px] text-text-mute">{t('Tanlangan ishlardan bosqich aniqlanmadi — «Belgilanganlardan akt» orqali qo‘lda yarating.')}</p>}
        {natija.qoralamalar.map((q, i) => (
          <label key={q.bosqich} className="flex cursor-pointer items-start gap-3 rounded border border-border p-2.5" data-testid={`aosr-zanjir-${q.bosqich}`}>
            <input type="checkbox" className="mt-1 h-4 w-4" checked={!chiqarilgan.has(q.bosqich)} onChange={() => almashtir(q.bosqich)} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-text">
                <span className="fz-chip">{i + 1}. {t(BOSQICH_UZ[q.bosqich])}</span>
                <span className="truncate" title={q.malumot.ish_nomi ?? undefined}>{q.malumot.ish_nomi}</span>
                {q.belgilar.map((b) => <span key={b} className="fz-chip fz-chip--accent">{b}</span>)}
              </div>
              <div className="mt-0.5 text-[11.5px] text-text-mute">
                {t('{n} ish', { n: q.ishlar.length })}{q.resurslar.length ? ` · ${t('{n} material', { n: q.resurslar.length })}` : ''}
                {q.malumot.materiallar ? ` · ${q.malumot.materiallar}` : ''}
              </div>
            </div>
          </label>
        ))}
        {natija.yoq.length > 0 && <p className="text-[12px] text-text-mute">{t('Smetada dalili yo‘q bosqichlar: {x}', { x: natija.yoq.map((b) => t(BOSQICH_UZ[b])).join(', ') })}</p>}
        {natija.aniqlanmagan.length > 0 && <p className="text-[12px] text-warn">{t('Bosqichi aniqlanmagan ishlar: {x}', { x: natija.aniqlanmagan.map((c) => c.nom).join('; ') })}</p>}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <label className="inline-flex items-center gap-1.5 text-[12px] text-text-dim">{t('Boshlang‘ich raqam')}
            <input aria-label={t('Boshlang‘ich raqam')} className="h-8 w-20 px-2 text-[13px]" inputMode="numeric" value={boshRaqam} onChange={(e) => setBoshRaqam(e.target.value.replace(/\D+/g, ''))} /></label>
          <label className="inline-flex items-center gap-1.5 text-[12px] text-text-dim"><input type="checkbox" checked={faktSana} onChange={(e) => setFaktSana(e.target.checked)} /> {t('sanalarni fakt jurnalidan to‘ldirish (aks holda bo‘sh)')}</label>
          <button type="button" disabled={band || tanlanganlar.length === 0} onClick={() => void yarat()} className="fz-btn fz-btn--primary fz-btn--sm" data-testid="aosr-zanjir-yarat">
            <FilePlus2 /> {t('Qoralamalarni yaratish ({n})', { n: tanlanganlar.length })}</button>
        </div>
      </div>
    </section>
  );
}
