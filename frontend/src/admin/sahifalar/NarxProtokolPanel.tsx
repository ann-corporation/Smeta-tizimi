/**
 * NarxProtokolPanel.tsx — «Протокол согласования цен» (egasi 2026-10-03).
 * 1) Smeta narxidan qimmat manba narxlari (bog'langan dalil yoki tavsiya) → tanlanadi → protokol qoralamasi + Excel.
 * 2) Buyurtmachi imzolagan nusxa yuklanadi (R2, o'zgarmas) + kuchga kirish oyi → tasdiqlanadi.
 * 3) Shu oydan F2 tayyorlashda narx protokoldan olinadi (lib/f2-tayyor: protokol → oldingi F2 → smeta).
 */
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, FileUp, XCircle } from 'lucide-react';
import {
  amaldagiProtokolNarxlari, narxProtokolBekor, narxProtokolQatorlariOl, narxProtokolTasdiqla, narxProtokolYarat, narxProtokollarOl,
  type NarxProtokol,
} from '../../api/t2-narx-protokol';
import { hujjatYukla, hujjatYuklabOlishUrl } from '../../api/t2-hujjat-canonical';
import { NARX_MANBA_TUR_NOMI, type NarxDalilHolat } from '../../api/t2-narx-dalil';
import type { TaklifNatija } from '../../lib/narx-dalil/taklif';
import { manbaRekviziti } from '../../lib/narx-asoslash-export';
import { narxProtokolXlsx, protokolNomzodlari } from '../../lib/narx-protokol-hujjat';
import type { ImzoNomlar } from '../../lib/hujjat-yozuvchi';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';

const pul = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 2 }));
const keyingiOy = () => { const d = new Date(); d.setMonth(d.getMonth() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const HOLAT_NOMI: Record<NarxProtokol['holat'], string> = { qoralama: 'qoralama — imzo kutilmoqda', tasdiqlangan: 'tasdiqlangan', bekor: 'bekor qilingan' };

function yuklabBer(bytes: Uint8Array, faylNomi: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a'); a.href = url; a.download = faylNomi; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function NarxProtokolPanel(p: { kompaniyaId: number; obyektId: number; obyektNomi: string; takliflar: readonly TaklifNatija[]; dalillar: readonly NarxDalilHolat[]; imzo?: ImzoNomlar }) {
  const [protokollar, setProtokollar] = useState<NarxProtokol[]>([]);
  const [band, setBand] = useState<Set<number>>(new Set());
  const [tanlov, setTanlov] = useState<Set<number>>(new Set());
  const [band2, setBand2] = useState(false);
  const [imzoForma, setImzoForma] = useState<{ id: number; fayl: File | null; oy: string } | null>(null);

  const yukla = async () => {
    const [r, q] = await Promise.all([narxProtokollarOl(p.obyektId), narxProtokolQatorlariOl(p.obyektId)]);
    setProtokollar(r.ok ? r.qatorlar ?? [] : []);
    // Qoralama yoki shu oyda amalda bo'lgan protokoldagi qatorlar qayta taklif qilinmaydi.
    const qatorlar = q.ok ? q.qatorlar ?? [] : [];
    const amalda = amaldagiProtokolNarxlari(qatorlar, '9999-12');
    setBand(new Set([...qatorlar.filter((x) => x.holat === 'qoralama').map((x) => x.qator_id), ...amalda.keys()]));
    setTanlov(new Set());
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [p.obyektId]);

  const nomzodlar = useMemo(() => protokolNomzodlari(
    p.dalillar.map((d) => ({ qator_id: d.qator_id, kat: d.kat, kod: d.kod, nom: d.nom, birlik: d.birlik, smeta_narx: d.hozirgi_narx ?? d.smeta_narx, manba_narx: d.manba_narx, izoh: `${NARX_MANBA_TUR_NOMI[d.manba_tur]}: ${manbaRekviziti(d)}` })),
    p.takliflar.map((n) => { const x = n.tavsiya; return { qator_id: n.qator_id, kat: n.kat, kod: x.kod, nom: x.nom, birlik: x.birlik, smeta_narx: n.smeta_narx, manba_narx: x.manba_narx, manba_qator_id: x.manba_qator_id,
      izoh: `${NARX_MANBA_TUR_NOMI[x.manba_tur]}: ${manbaRekviziti({ manba_nom: x.manba_nom, manba_raqam: x.manba_raqam, manba_sana: x.manba_sana, yetkazuvchi: x.yetkazuvchi, yetkazuvchi_inn: null, yil: x.yil, kvartal: x.kvartal, region: x.region, nds_holati: x.nds_holati, ishlab_chiqaruvchi: x.ishlab_chiqaruvchi, nds_izoh: x.nds_izoh })}` }; }),
    band,
  ), [p.dalillar, p.takliflar, band]);

  const hujjat = async (pr: Pick<NarxProtokol, 'id' | 'raqam' | 'sana'>) => {
    const q = await narxProtokolQatorlariOl(p.obyektId, pr.id);
    if (!q.ok) { toast(t('Protokol qatorlari o‘qilmadi'), 'danger'); return; }
    const r = narxProtokolXlsx((q.qatorlar ?? []).map((x) => ({ kat: x.kat, kod: x.kod, nom: x.nom, birlik: x.birlik, eski_narx: x.eski_narx, yangi_narx: x.yangi_narx, izoh: x.izoh })),
      { obyektNomi: p.obyektNomi, raqam: pr.raqam, sana: pr.sana, imzo: p.imzo });
    yuklabBer(r.bytes, r.faylNomi);
  };

  const yarat = async () => {
    const tanlangan = nomzodlar.filter((n) => tanlov.has(n.qator_id));
    if (!tanlangan.length) return;
    setBand2(true);
    const r = await narxProtokolYarat(p.obyektId, tanlangan.map((n) => ({ qator_id: n.qator_id, yangi_narx: n.yangi_narx, manba_qator_id: n.manba_qator_id, izoh: n.izoh })));
    setBand2(false);
    if (!r.ok || !r.id) { toast(r.error || t('Protokol yaratilmadi'), 'danger'); return; }
    toast(t('Protokol {raqam} yaratildi — imzolash uchun Excel yuklab olindi', { raqam: r.raqam ?? '' }), 'ok');
    await hujjat({ id: r.id, raqam: r.raqam ?? '', sana: new Date().toISOString().slice(0, 10) });
    await yukla();
  };

  const tasdiqla = async () => {
    if (!imzoForma?.fayl || !/^\d{4}-\d{2}$/.test(imzoForma.oy)) return;
    setBand2(true);
    const u = await hujjatYukla({ file: imzoForma.fayl, kompaniyaId: p.kompaniyaId, obyektId: p.obyektId, documentType: 'narx_protokol' });
    if (!u.ok) { setBand2(false); toast(u.xato || t('Fayl yuklanmadi'), 'danger'); return; }
    const r = await narxProtokolTasdiqla(imzoForma.id, u.data.document_id, `${imzoForma.oy}-01`);
    setBand2(false);
    if (!r.ok) { toast(r.error || t('Protokol tasdiqlanmadi'), 'danger'); return; }
    toast(t('Protokol tasdiqlandi — {oy} oyidan F2 narxi protokoldan olinadi', { oy: imzoForma.oy }), 'ok');
    setImzoForma(null);
    await yukla();
  };

  const bekor = async (pr: NarxProtokol) => {
    const sabab = window.prompt(t('Bekor qilish sababi'));
    if (!sabab?.trim()) return;
    const r = await narxProtokolBekor(pr.id, sabab.trim());
    if (!r.ok) { toast(r.error || t('Bekor qilinmadi'), 'danger'); return; }
    toast(t('Protokol bekor qilindi'), 'ok');
    await yukla();
  };

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-text-dim">{t('Smeta narxidan qimmat manba narxlari: {n} ta. Tanlang — protokol qoralamasi va imzolash uchun Excel tayyorlanadi.', { n: nomzodlar.length })}</span>
          <button type="button" className="rounded border px-3 py-1" onClick={() => setTanlov(new Set(nomzodlar.map((n) => n.qator_id)))}>{t('Hammasini belgilash')}</button>
          <button type="button" className="rounded border px-3 py-1" onClick={() => setTanlov(new Set())}>{t('Tozalash')}</button>
          <button type="button" disabled={!tanlov.size || band2} onClick={() => void yarat()} className="inline-flex items-center gap-1 rounded bg-accent px-3 py-1 text-white disabled:opacity-40">
            <FileSpreadsheet size={13} /> {t('Protokol tuzish ({n})', { n: tanlov.size })}
          </button>
        </div>
        <div className="max-h-[420px] overflow-auto rounded-lg border">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="sticky top-0 bg-surface text-text-dim"><tr className="text-left">
              <th className="px-2 py-1.5" /><th className="px-2 py-1.5">{t('Resurs')}</th><th className="px-2 py-1.5 text-right">{t('Smeta narxi')}</th>
              <th className="px-2 py-1.5 text-right">{t('Taklif narxi')}</th><th className="px-2 py-1.5 text-right">{t('Og‘ish')}</th><th className="px-2 py-1.5">{t('Asos')}</th>
            </tr></thead>
            <tbody>
              {nomzodlar.length === 0 && <tr><td colSpan={6} className="px-2 py-4 text-center text-text-dim">{t('Smeta narxidan qimmat manba narxi topilmadi')}</td></tr>}
              {nomzodlar.slice(0, 1000).map((n) => {
                const ogish = n.smeta_narx ? Math.round(((n.yangi_narx - n.smeta_narx) / n.smeta_narx) * 10000) / 100 : null;
                return (
                  <tr key={n.qator_id} className="border-t align-top">
                    <td className="px-2 py-1.5"><input type="checkbox" aria-label={t('Tanlash')} checked={tanlov.has(n.qator_id)} onChange={(e) => setTanlov((s) => { const x = new Set(s); if (e.target.checked) x.add(n.qator_id); else x.delete(n.qator_id); return x; })} /></td>
                    <td className="px-2 py-1.5"><div>{n.nom}</div><div className="text-text-dim">{n.kat} · {n.birlik}{n.dalil ? ` · ${t('bog‘langan dalil')}` : ` · ${t('tavsiya')}`}</div></td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{pul(n.smeta_narx)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{pul(n.yangi_narx)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{ogish == null ? '—' : `+${ogish}%`}</td>
                    <td className="px-2 py-1.5 text-text-dim">{n.izoh}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t('Protokollar')}</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="text-text-dim"><tr className="text-left">
              <th className="px-2 py-1.5">{t('Raqam / sana')}</th><th className="px-2 py-1.5">{t('Holat')}</th><th className="px-2 py-1.5 text-right">{t('Qatorlar')}</th>
              <th className="px-2 py-1.5">{t('Kuchga kirish')}</th><th className="px-2 py-1.5">{t('Imzolangan nusxa')}</th><th className="px-2 py-1.5" />
            </tr></thead>
            <tbody>
              {protokollar.length === 0 && <tr><td colSpan={6} className="px-2 py-4 text-center text-text-dim">{t('Hali protokol yo‘q')}</td></tr>}
              {protokollar.map((pr) => (
                <tr key={pr.id} className="border-t align-top">
                  <td className="px-2 py-1.5">№ {pr.raqam}<div className="text-text-dim">{pr.sana?.slice(0, 10)}</div></td>
                  <td className={'px-2 py-1.5 ' + (pr.holat === 'tasdiqlangan' ? 'text-ok' : pr.holat === 'bekor' ? 'text-text-dim line-through' : 'text-warning')}>{t(HOLAT_NOMI[pr.holat])}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{pr.qator_soni}</td>
                  <td className="px-2 py-1.5">{pr.kuchga_kirish?.slice(0, 7) ?? '—'}</td>
                  <td className="px-2 py-1.5">{pr.document_id ? <a className="text-accent underline" href={hujjatYuklabOlishUrl(pr.document_id)}>{pr.hujjat_nom ?? t('fayl')}</a> : '—'}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap justify-end gap-1">
                      <button type="button" onClick={() => void hujjat(pr)} className="inline-flex items-center gap-1 rounded border px-2 py-0.5"><FileSpreadsheet size={12} /> {t('Excel')}</button>
                      {pr.holat === 'qoralama' && <button type="button" onClick={() => setImzoForma({ id: pr.id, fayl: null, oy: keyingiOy() })} className="inline-flex items-center gap-1 rounded border border-accent/50 px-2 py-0.5 text-accent"><FileUp size={12} /> {t('Imzolanganini yuklash')}</button>}
                      {pr.holat !== 'bekor' && <button type="button" onClick={() => void bekor(pr)} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-text-dim hover:text-danger"><XCircle size={12} /> {t('Bekor')}</button>}
                    </div>
                    {imzoForma?.id === pr.id && (
                      <div className="mt-2 flex flex-wrap items-end justify-end gap-2 rounded border border-accent/30 p-2">
                        <label className="text-text-dim">{t('Imzolangan nusxa (PDF/skan)')}
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx" className="mt-1 block" onChange={(e) => setImzoForma((f) => f && { ...f, fayl: e.target.files?.[0] ?? null })} /></label>
                        <label className="text-text-dim">{t('Kuchga kirish oyi')}
                          <input type="month" value={imzoForma.oy} onChange={(e) => setImzoForma((f) => f && { ...f, oy: e.target.value })} className="mt-1 block rounded border px-2 py-1" /></label>
                        <button type="button" disabled={!imzoForma.fayl || band2} onClick={() => void tasdiqla()} className="inline-flex items-center gap-1 rounded bg-accent px-3 py-1 text-white disabled:opacity-40"><CheckCircle2 size={13} /> {t('Tasdiqlash')}</button>
                        <button type="button" onClick={() => setImzoForma(null)} className="rounded border px-3 py-1">{t('Yopish')}</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-text-dim">{t('Protokol faqat imzolangan nusxa yuklangach kuchga kiradi. Kuchga kirish oyidan boshlab F2 tayyorlashda narx protokoldan olinadi (protokol → oldingi F2 → smeta).')}</p>
      </section>
    </div>
  );
}
