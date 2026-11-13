import { useCallback, useEffect, useMemo, useState } from 'react';
import { yangiOperationId } from '../../api/supabase';
import { aloqalarOl, type Aloqa } from '../../api/t2-tomon';
import { aosrlarniYubor, aosrQoralamalarYarat, slichitelniyAsosOl } from '../../api/t2-slichitelniy-asos';
import { AMAL_NOMI, amalBoyichaGuruh, tayyorlikFoiz, type AsosJavob } from '../../lib/slichitelniy-asos';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';

/**
 * «Slichitelniy tayyorligi» — obyekt bo'yicha: farqli qatorlar N, asosi bor M, texnadzor tasdiqlagan K, «nima yetishmaydi».
 * Yangi sahifa YO'Q (Holat sahifasi ichidagi bo'lim). Mantiq: lib/slichitelniy-asos.ts; manba: t2_aosr_slichitelniy_v1.
 * Bir bosishda: tanlangan qatorlar uchun АОСР qoralamalari (hajm = fakt hajmi taklifi) va texnadzorga yuborish (mavjud taqdim oqimi).
 */
export function SlichitelniyTayyorlik({ kompaniyaId, obyektId, onOzgardi }: { kompaniyaId: number; obyektId: number; onOzgardi?: () => void }) {
  const [javob, setJavob] = useState<AsosJavob | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [band, setBand] = useState(false);
  const [tanlangan, setTanlangan] = useState<Set<number>>(new Set());
  const [aloqalar, setAloqalar] = useState<Array<{ id: number; nom: string }>>([]);
  const [aloqaId, setAloqaId] = useState<number | null>(null);

  const yangila = useCallback(async () => {
    setYuklanmoqda(true);
    const j = await slichitelniyAsosOl(kompaniyaId, obyektId, 300);
    setJavob(j); setYuklanmoqda(false);
  }, [kompaniyaId, obyektId]);
  useEffect(() => { void yangila(); }, [yangila]);
  useEffect(() => {
    let tirik = true;
    void aloqalarOl(kompaniyaId).then((r) => {
      if (!tirik || !r.ok || !Array.isArray(r.natija)) return;
      const faol = (r.natija as Aloqa[]).filter((a) => a.holat === 'faol');
      setAloqalar(faol.map((a) => ({ id: a.id, nom: a.qarshi_nom || a.nom || `#${a.id}` })));
      setAloqaId((x) => x ?? faol[0]?.id ?? null);
    }).catch(() => undefined);
    return () => { tirik = false; };
  }, [kompaniyaId]);

  const guruh = useMemo(() => amalBoyichaGuruh(javob?.yetishmaydi ?? []), [javob]);
  const tay = javob?.tayyorlik;
  const foiz = tayyorlikFoiz(tay);
  const royxat = javob?.yetishmaydi ?? [];
  const jami = javob?.yetishmaydi_jami ?? 0;
  const qisqardi = jami > royxat.length;
  const qoralamaAosr = useCallback((qatorId: number): number[] => {
    const x = javob?.asoslar?.find((a) => a.qator_id === qatorId);
    const ids = new Set((javob?.aosrlar ?? []).filter((a) => a.asos_holat === 'qoralama').map((a) => a.id));
    return (x?.aosr ?? []).map((b) => b.id).filter((id) => ids.has(id));
  }, [javob]);

  const tanlaAmal = (amal: string) => setTanlangan(new Set(royxat.filter((r) => r.amal === amal).map((r) => r.qator_id)));
  const almashtir = (id: number) => setTanlangan((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const yarat = async () => {
    const idlar = royxat.filter((r) => tanlangan.has(r.qator_id) && r.amal === 'aosr_yarat').map((r) => r.qator_id);
    if (!idlar.length) { toast(t('Tanlanganlar orasida АОСР yaratiladigan qator yo‘q'), 'warn'); return; }
    setBand(true);
    try {
      const r = await aosrQoralamalarYarat(kompaniyaId, obyektId, idlar, yangiOperationId());
      if (!r.ok) { toast(r.error || t('АОСР qoralamalari yaratilmadi'), 'danger'); return; }
      toast(`${t('АОСР qoralamalari yaratildi')}: ${r.yaratildi?.length ?? 0}${r.otkazildi?.length ? ` · ${t('o‘tkazib yuborildi')}: ${r.otkazildi.length}` : ''}`, 'ok');
      setTanlangan(new Set()); await yangila(); onOzgardi?.();
    } finally { setBand(false); }
  };
  const yubor = async () => {
    if (aloqaId == null) { toast(t('Faol texnadzor/buyurtmachi aloqasi yo‘q'), 'warn'); return; }
    const aosrIdlar = [...new Set(royxat.filter((r) => tanlangan.has(r.qator_id) && r.amal === 'texnadzorga_yubor').flatMap((r) => qoralamaAosr(r.qator_id)))];
    if (!aosrIdlar.length) { toast(t('Tanlanganlar orasida yuboriladigan qoralama yo‘q'), 'warn'); return; }
    setBand(true);
    try {
      const r = await aosrlarniYubor(kompaniyaId, aloqaId, aosrIdlar);
      toast(`${t('Texnadzorga yuborildi')}: ${r.yuborildi.length}${r.rad.length ? ` · ${t('rad etildi')}: ${r.rad.length} (${r.rad[0].sabab})` : ''}`, r.rad.length ? 'warn' : 'ok');
      setTanlangan(new Set()); await yangila(); onOzgardi?.();
    } finally { setBand(false); }
  };

  if (javob && !javob.ok) return <p role="alert" className="text-danger">{javob.error || t('Tayyorlik o‘qilmadi')}</p>;
  return (
    <div className="flex flex-col gap-3 text-[12.5px]" data-testid="slichitelniy-tayyorlik">
      {yuklanmoqda && !javob && <p className="text-text-mute">{t('Yuklanmoqda…')}</p>}
      {tay && (
        <div className="flex flex-wrap gap-2" role="list">
          <span role="listitem" className="fz-chip">{t('Farqli qatorlar')}: {tay.farqli}</span>
          <span role="listitem" className="fz-chip">{t('Asosi bor')}: {tay.asosli}</span>
          <span role="listitem" className="fz-chip">{t('Texnadzor tasdiqlagan')}: {tay.tasdiqlagan}{foiz != null ? ` (${foiz} %)` : ''}</span>
          <span role="listitem" className="fz-chip">{t('Javob kutilmoqda')}: {tay.kutilmoqda}</span>
          <span role="listitem" className="fz-chip">{t('Tuzatishga qaytgan')}: {tay.tuzatish}</span>
          {!!tay.ichki_nazorat && <span role="listitem" className="fz-chip">{t('Ichki nazoratdan o‘tgan')}: {tay.ichki_nazorat}</span>}
          <span role="listitem" className={tay.asossiz ? 'fz-stamp fz-stamp--warn' : 'fz-chip'}>{t('Asosi yo‘q')}: {tay.asossiz}</span>
        </div>
      )}
      {javob?.ok && jami === 0 && <p className="text-text-mute">{t('Hamma farqli qator tasdiqlangan asos bilan ta’minlangan.')}</p>}
      {guruh.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-text-dim">{t('Nima yetishmaydi')}:</span>
          {guruh.map((g) => (
            <button key={g.amal} type="button" className="fz-chip" onClick={() => tanlaAmal(g.amal)} title={t('Shu amalga tegishli hamma qatorni tanlash')}>
              {t(AMAL_NOMI[g.amal])} · {g.soni}
            </button>
          ))}
          {qisqardi && <span className="text-text-mute">{t('Ro‘yxat qisqartirilgan')}: {royxat.length} / {jami}</span>}
        </div>
      )}
      {royxat.length > 0 && (
        <div className="max-h-[320px] overflow-auto border border-border">
          <table className="w-full text-[12px]">
            <thead><tr className="text-left text-text-mute"><th className="w-6" /><th>{t('Shifr')}</th><th>{t('Nomi')}</th><th>{t('Smeta')}</th><th>{t('Fakt')}</th><th>{t('Amal')}</th></tr></thead>
            <tbody>
              {royxat.map((r) => (
                <tr key={r.qator_id} className="border-t border-border">
                  <td><input type="checkbox" aria-label={t('Tanlash')} checked={tanlangan.has(r.qator_id)} onChange={() => almashtir(r.qator_id)} /></td>
                  <td className="whitespace-nowrap pr-2">{r.kod}</td>
                  <td className="max-w-[420px] truncate" title={r.nom ?? ''}>{r.nom}</td>
                  <td className="whitespace-nowrap pr-2 text-right">{r.smeta_hajm ?? '—'} {r.birlik}</td>
                  <td className="whitespace-nowrap pr-2 text-right">{r.fakt_hajm}</td>
                  <td>{t(AMAL_NOMI[r.amal])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fz-btn" disabled={band || !tanlangan.size} onClick={() => void yarat()}>{t('Tanlanganlar uchun АОСР qoralamalarini yaratish')}</button>
        <select className="fz-input" aria-label={t('Texnadzor / buyurtmachi aloqasi')} value={aloqaId ?? ''} onChange={(e) => setAloqaId(e.target.value ? Number(e.target.value) : null)}>
          {aloqalar.length === 0 && <option value="">{t('Faol aloqa yo‘q')}</option>}
          {aloqalar.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
        </select>
        <button type="button" className="fz-btn" disabled={band || !tanlangan.size || aloqaId == null} onClick={() => void yubor()}>{t('Tanlanganlarni texnadzorga yuborish')}</button>
        <button type="button" className="fz-btn" disabled={yuklanmoqda} onClick={() => void yangila()}>{t('Yangilash')}</button>
      </div>
    </div>
  );
}
