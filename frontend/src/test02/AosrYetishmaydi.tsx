/**
 * AosrYetishmaydi — «Nima yetishmayapti»: АОСР siz yashirin ishlar smeta razdeli bo'yicha.
 * Bitta tugma = bitta razdel uchun АОСР QORALAMASI (holat doim «Qoralama»; tasdiqlamaydi).
 * Mavjud yo'llar: coverage (o'qish), `qoralamaGuruhdan` (sof mantiq), `sbAosrYozV2` + `sbAosrBogSaqla` (yozish, M:N).
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, FilePlus2 } from 'lucide-react';
import { sbAosrBogSaqla, sbFaktSanalarOl, type AosrCoverage } from '../api/t2-aosr';
import { sbAosrYozV2, type AosrV2 } from '../api/t2-ijro';
import { obyektImzochilarOl } from '../api/obyekt-imzochi';
import { yangiOperationId } from '../api/supabase';
import { qoralamaGuruhdan, sanaOraligi, type YetishmaydiGuruh } from '../lib/ijro-tayyorla';
import { toast } from '../umumiy/ui/Toast';
import { t } from '../i18n/til';

type Props = {
  kompaniyaId: number; obyektId: number;
  guruhlar: YetishmaydiGuruh[]; aktlar: AosrV2[];
  onTayyor: () => void;
};

const raqamlari = (aktlar: readonly AosrV2[]) => aktlar.map((a) => Number(String(a.raqam ?? '').replace(/\D+/g, ''))).filter((n) => Number.isFinite(n) && n > 0);

export function AosrYetishmaydi({ kompaniyaId, obyektId, guruhlar, aktlar, onTayyor }: Props) {
  const [chiqarilgan, setChiqarilgan] = useState<Set<number>>(new Set());
  const [band, setBand] = useState(false);
  const jami = useMemo(() => guruhlar.reduce((s, g) => s + g.ishlar.length, 0), [guruhlar]);

  const tanlangan = (g: YetishmaydiGuruh) => g.ishlar.filter((c) => !chiqarilgan.has(c.qator_id));
  const almashtir = (id: number) => setChiqarilgan((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  /** Berilgan razdellar uchun qoralamalar: har razdel — bitta АОСР, bir nechta ishga M:N bog'lanadi. */
  const tayyorla = async (royxat: readonly YetishmaydiGuruh[]) => {
    const ishli = royxat.map((g) => ({ g, ishlar: tanlangan(g) })).filter((x) => x.ishlar.length > 0);
    if (!ishli.length || band) return;
    setBand(true);
    try {
      const barchaIds = ishli.flatMap((x) => [...x.ishlar.map((c) => c.qator_id), ...x.g.resurslar.filter((r) => x.ishlar.some((c) => c.qator_id === r.ishId)).map((r) => r.c.qator_id)]);
      const fakt = await sbFaktSanalarOl(obyektId, barchaIds);
      const oxirgi = aktlar.find((a) => a.holat !== 'bekor');
      const sukut = oxirgi ? { komissiya: Array.isArray(oxirgi.komissiya) ? oxirgi.komissiya.map((k) => ({ ...k })) : undefined, blank: oxirgi.blank_varianti, loyihaTashkiloti: oxirgi.loyiha_tashkiloti } : undefined;
      let raqam = Math.max(0, ...raqamlari(aktlar));
      let tayyor = 0; let xato = '';
      for (const { g, ishlar } of ishli) {
        const resurslar = g.resurslar.filter((r) => ishlar.some((c) => c.qator_id === r.ishId));
        const imzo = await obyektImzochilarOl(kompaniyaId, obyektId, g.razdelId).catch(() => null);
        const sanalar = sanaOraligi([...ishlar, ...resurslar.map((r) => r.c)].map((c) => c.qator_id), fakt.links, fakt.aktlar);
        const malumot = qoralamaGuruhdan(g, ishlar, { raqam: String(raqam + 1), sanalar, imzochilar: imzo && imzo.ok ? imzo.natija.imzochilar : null, sukut });
        const r = await sbAosrYozV2({ kompaniyaId, obyektId, malumot, operationId: yangiOperationId() });
        if (!r.ok || !r.id) { xato = r.error || t('Xato'); break; }
        raqam++;
        const bog = await sbAosrBogSaqla([r.id], [...ishlar.map((c) => c.qator_id), ...resurslar.map((x) => x.c.qator_id)]);
        if (!bog.ok) { xato = bog.error || t('Xato'); break; }
        tayyor++;
      }
      if (tayyor) toast(t('✓ {n} ta АОСР qoralamasi tayyor — tekshirib, o‘zingiz tasdiqlang', { n: tayyor }), 'ok');
      if (xato) toast(t('Qoralama tayyorlanmadi: {x}', { x: xato }), 'danger');
      onTayyor();
    } finally { setBand(false); }
  };

  if (jami === 0) {
    return (
      <section className="fz-note" data-testid="aosr-yetishmaydi"><CheckCircle2 /><span>{t('Nima yetishmayapti: hech narsa — yashirin ishlarning hammasiga АОСР bor.')}</span></section>
    );
  }
  return (
    <section className="fz-card" aria-label={t('Nima yetishmayapti')} data-testid="aosr-yetishmaydi">
      <div className="fz-card__head">
        <div>
          <h2 className="fz-card__title flex items-center gap-1.5"><AlertTriangle size={16} className="text-warn" />{t('Nima yetishmayapti: {n} ta yashirin ishga АОСР yo‘q', { n: jami })}</h2>
          <p className="fz-card__sub">{t('Razdelni tanlang → qoralama tayyor bo‘ladi. Tasdiqlashni o‘zingiz qilasiz.')}</p>
        </div>
        {guruhlar.length > 1 && (
          <button type="button" disabled={band} onClick={() => void tayyorla(guruhlar)} className="fz-btn fz-btn--sm fz-btn--primary"><FilePlus2 /> {t('Hammasi uchun qoralama ({n})', { n: guruhlar.length })}</button>
        )}
      </div>
      <div className="divide-y divide-border">
        {guruhlar.map((g) => {
          const n = tanlangan(g).length;
          return (
            <details key={g.razdelId ?? 'razdelsiz'} className="group px-4 py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-3">
                <ChevronDown size={14} className="text-text-mute transition-transform group-open:rotate-180" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">{g.nom || t('Razdelsiz ishlar')}</span>
                <span className="fz-chip fz-chip--warn">{t('{n} ish', { n: g.ishlar.length })}</span>
                <button type="button" disabled={band || n === 0} className="fz-btn fz-btn--sm fz-btn--primary"
                  onClick={(e) => { e.preventDefault(); void tayyorla([g]); }}><FilePlus2 /> {t('АОСР qoralamasini tayyorla ({n})', { n })}</button>
              </summary>
              <div className="mt-2 space-y-1 pl-7">
                {g.ishlar.map((c: AosrCoverage) => (
                  <label key={c.qator_id} className="flex cursor-pointer items-center gap-2 text-[12.5px] text-text">
                    <input type="checkbox" className="h-4 w-4" checked={!chiqarilgan.has(c.qator_id)} onChange={() => almashtir(c.qator_id)} />
                    <span className="min-w-0 flex-1 truncate" title={c.nom ?? ''}>{c.nom}</span>
                    <span className="text-[11.5px] text-text-mute">{c.fakt_hajm} {c.birlik}</span>
                  </label>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
