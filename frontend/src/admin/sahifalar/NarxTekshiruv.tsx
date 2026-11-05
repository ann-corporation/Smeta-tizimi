/**
 * «Narx tekshiruvi» (egasi 2026-11-05): usta «rigel — N so'm/m» desa, tizim darhol «smetamiz shu ish uchun 1 birlikka
 * nima beradi» ni ko'rsatadi. Ish kartasi = amaliy ish birligi (kompaniyada bir marta) + bog'langan smeta qatorlari
 * (asosiy norma, armatura, ISHORALI istisno, zakladnoy) koeffitsient bilan. Hisob — `lib/ish-kartasi` + `lib/hisob-yadro`.
 * Yangi sahifa: mavjud narx sahifalari (Narxlar nazorati, Narx dalili) smeta qatori narxini boshqaradi; amaliy birlik va usta
 * narxi u yerda yo'q — shu sababli Narxlash bandiga alohida tab sifatida qo'shildi.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Plus, Save, Search, Wand2, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { FmtN } from '../../lib/format';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { yangiOperationId } from '../../api/supabase';
import { t2ObyektNakrutka } from '../../api/t2-nakrutka';
import { podvalTanla, sbPodvallarOl } from '../../api/t2-nakrutka-podval';
import {
  kartaArxiv, kartaSaqla, kartalarOl, qatorlarOl, smetadanQidir, ulushSaqla,
  type IshKarta, type KartaBogYozuv, type KompaniyaUlush,
} from '../../api/t2-ish-kartasi';
import {
  AMALIY_BIRLIKLAR, BOSQICHLAR, KARTA_TURLARI, SUKUT_ULUSH, avtoYigish, farq, hukm, kartaNatija, koefParametrdan, qamrovToldir,
  qatorHissalari, taqsimot, ulushTanla, ulushYaroqli,
  type AmaliyBirlik, type AvtoTaklif, type BogRol, type Bosqich, type BosqichUlush, type KartaNatija, type KartaParametr, type KartaTur,
  type MatGuruh, type Oraliq, type Qamrov, type SmetaQator, type UstamaKirish,
} from '../../lib/ish-kartasi';

const kirit = 'w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] text-text outline-none focus:border-accent';
const yorliq = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-mute';
const tugma = 'inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] hover:border-accent disabled:opacity-50';

const turNomi = (x: KartaTur) => ({
  rigel: t('Rigel'), balka: t('Balka'), kolonna: t('Kolonna'), plita: t('Plita (yopma)'), devor: t('Devor'), armatura: t('Armatura'), boshqa: t('Boshqa'),
}[x]);
const bosqichNomi = (b: Bosqich) => ({ opalubka: t('Opalubka'), armatura: t('Armatura to‘qish'), beton: t('Beton quyish') }[b]);
const guruhNomi = (g: MatGuruh) => ({ opalubka: t('Opalubka va boshqa materiallar'), armatura: t('Armatura'), beton: t('Beton') }[g]);
const rolNomi = (r: BogRol) => ({
  asosiy: t('Asosiy norma'), armatura_mat: t('Armatura materiali'), armatura_tayyorlash: t('Armatura tayyorlash'),
  istisno: t('Istisno (ishorali)'), zakladnoy: t('Zakladnoy'), boshqa: t('Boshqa'),
}[r]);

type Shakl = {
  id: number | null; versiya: number | null; nom: string; tur: KartaTur; birlik: AmaliyBirlik; parametrlar: KartaParametr;
  ulush: BosqichUlush | null; qamrov: Qamrov; naryad_narx: number | null; usta_nom: string; izoh: string; bog: KartaBogYozuv[];
};
const yangiShakl = (): Shakl => ({
  id: null, versiya: null, nom: '', tur: 'rigel', birlik: 'м', parametrlar: {}, ulush: null, qamrov: qamrovToldir(null), naryad_narx: null, usta_nom: '', izoh: '', bog: [],
});
const kartadanShakl = (k: IshKarta): Shakl => ({
  id: k.id, versiya: k.versiya, nom: k.nom, tur: k.tur, birlik: k.birlik, parametrlar: k.parametrlar ?? {}, ulush: k.bosqich_ulush,
  qamrov: qamrovToldir(k.qamrov), naryad_narx: k.naryad_narx, usta_nom: k.usta_nom ?? '', izoh: k.izoh ?? '', bog: k.bog,
});

const sonOl = (s: string): number | null => {
  const x = s.replace(/\s/g, '').replace(',', '.');
  if (x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

/** Smeta qatori: 1 smeta birligiga mehnat (ЧЕЛ) — qidiruv natijasida tez bog'lash uchun. */
function birlikkaMehnat(q: SmetaQator): number | null {
  const tq = qatorHissalari({ qator_id: q.id, obyekt_id: q.obyekt_id, rol: 'asosiy', koef: 1, bosqich: null, material_guruh: null }, q);
  if (tq.holat !== 'ok') return null;
  return taqsimot(tq.hissalar, SUKUT_ULUSH).mehnat.jami;
}

type Solishtirish = { narx: string; miqdor: string; qamrov: Qamrov };

export default function NarxTekshiruv() {
  const { joriyId: kid } = useKompaniya();
  const [kartalar, setKartalar] = useState<IshKarta[]>([]);
  const [ulushlar, setUlushlar] = useState<KompaniyaUlush[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [shakl, setShakl] = useState<Shakl | null>(null);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [tanlov, setTanlov] = useState<number[]>([]);
  const [qatorlar, setQatorlar] = useState<ReadonlyMap<number, SmetaQator>>(new Map());
  const [ustamalar, setUstamalar] = useState<ReadonlyMap<number, UstamaKirish>>(new Map());
  const [qoshimchaBilan, setQoshimchaBilan] = useState(false);
  const [sol, setSol] = useState<Record<string, Solishtirish>>({});
  const [qidiruv, setQidiruv] = useState('');
  const [topilgan, setTopilgan] = useState<SmetaQator[] | null>(null);
  const [qidirilmoqda, setQidirilmoqda] = useState(false);
  const [takliflar, setTakliflar] = useState<AvtoTaklif[]>([]);

  const yukla = useCallback(async () => {
    if (!kid) return;
    setYuklanmoqda(true); setXato(null);
    const r = await kartalarOl(kid);
    setYuklanmoqda(false);
    if (!r) { setXato(t('Ish kartalari o‘qilmadi. Ruxsat (smeta.read) va migratsiyani tekshiring.')); return; }
    setKartalar(r.kartalar); setUlushlar(r.ulushlar);
  }, [kid]);
  useEffect(() => { void yukla(); }, [yukla]);

  /** Solishtiriladigan kartalar: belgilanganlar + ochiq shakl (bog'i bo'lsa). */
  const solKartalar = useMemo(() => {
    const out: Array<{ kalit: string; nom: string; tur: KartaTur; birlik: AmaliyBirlik; bog: KartaBogYozuv[]; ulush: BosqichUlush | null; qamrov: Qamrov; naryad: number | null }> = [];
    if (shakl && shakl.bog.length) out.push({ kalit: shakl.id ? `k${shakl.id}` : 'yangi', nom: shakl.nom || t('Yangi karta'), tur: shakl.tur, birlik: shakl.birlik, bog: shakl.bog, ulush: shakl.ulush, qamrov: shakl.qamrov, naryad: shakl.naryad_narx });
    for (const id of tanlov) {
      if (shakl?.id === id) continue;
      const k = kartalar.find((x) => x.id === id);
      if (k) out.push({ kalit: `k${k.id}`, nom: k.nom, tur: k.tur, birlik: k.birlik, bog: k.bog, ulush: k.bosqich_ulush, qamrov: qamrovToldir(k.qamrov), naryad: k.naryad_narx });
    }
    return out;
  }, [shakl, tanlov, kartalar]);

  // Kerakli smeta qatorlari va obyekt ustamalari (bir marta o'qiladi).
  useEffect(() => {
    if (!kid) return;
    const ids = [...new Set(solKartalar.flatMap((k) => k.bog.map((b) => b.qator_id)).filter((x): x is number => x != null && !qatorlar.has(x)))];
    const oids = [...new Set(solKartalar.flatMap((k) => k.bog.map((b) => b.obyekt_id)).filter((x) => !ustamalar.has(x)))];
    if (!ids.length && !oids.length) return;
    let faol = true;
    void (async () => {
      if (ids.length) {
        const r = await qatorlarOl(kid, ids);
        if (faol && r) setQatorlar((m) => { const n = new Map(m); for (const q of r.qatorlar) n.set(q.id, q); return n; });
      }
      if (oids.length) {
        const pod = await sbPodvallarOl(kid).catch(() => null);
        const royxat = pod && pod.ok && Array.isArray(pod.qatorlar) ? pod.qatorlar : null;
        const yangi = new Map<number, UstamaKirish>();
        for (const oid of oids) {
          const nk = await t2ObyektNakrutka(oid).catch(() => null);
          const p = royxat ? podvalTanla(royxat, { obyektId: oid, shartnomaId: null }) : null;
          yangi.set(oid, nk && nk.ok && nk.koeffitsientlar ? { koef: nk.koeffitsientlar, podval: p ? { versiya: 1, nom: p.nom, qatorlar: p.qatorlar } : null } : null);
        }
        if (faol) setUstamalar((m) => new Map([...m, ...yangi]));
      }
    })();
    return () => { faol = false; };
  }, [kid, solKartalar, qatorlar, ustamalar]);

  const natijalar = useMemo(() => solKartalar.map((k) => {
    const kompUlush = ulushlar.find((u) => u.tur === k.tur)?.ulush ?? null;
    const { ulush, manba } = ulushTanla(k.ulush, kompUlush);
    const s = sol[k.kalit] ?? { narx: k.naryad != null ? String(k.naryad) : '', miqdor: '', qamrov: k.qamrov };
    const n = kartaNatija({
      bog: k.bog.map((b) => ({ qator_id: b.qator_id, obyekt_id: b.obyekt_id, rol: b.rol, koef: b.koef, bosqich: b.bosqich, material_guruh: b.material_guruh })),
      qatorlar, ulush, qamrov: s.qamrov, ustama: (oid) => ustamalar.get(oid) ?? null, qoshimchaBilan,
    });
    return { k, ulush, ulushManba: manba, s, n };
  }), [solKartalar, ulushlar, sol, qatorlar, ustamalar, qoshimchaBilan]);

  const solYangila = (kalit: string, asl: Solishtirish, o: Partial<Solishtirish>) => setSol((x) => ({ ...x, [kalit]: { ...asl, ...(x[kalit] ?? {}), ...o } }));

  const qidir = async () => {
    if (!kid || !qidiruv.trim()) return;
    setQidirilmoqda(true);
    const r = await smetadanQidir(kid, qidiruv.trim());
    setQidirilmoqda(false);
    if (!r) { toast(t('Qidiruv bajarilmadi'), 'danger'); return; }
    setTopilgan(r);
    setQatorlar((m) => { const n = new Map(m); for (const q of r) n.set(q.id, q); return n; });
  };

  const bogla = async (q: SmetaQator, rol: BogRol) => {
    if (!shakl || !kid) return;
    if (shakl.bog.some((b) => b.qator_id === q.id)) { toast(t('Bu qator allaqachon bog‘langan'), 'danger'); return; }
    const koef = rol === 'asosiy' ? koefParametrdan(shakl.tur, shakl.birlik, shakl.parametrlar, q.birlik) : null;
    const yangi: KartaBogYozuv = { qator_id: q.id, obyekt_id: q.obyekt_id, rol, koef, koef_usul: koef != null ? 'parametr' : 'qolda', bosqich: null, material_guruh: null, kod: q.kod, nom: q.nom, birlik: q.birlik, manba: 'qolda' };
    setShakl({ ...shakl, bog: [...shakl.bog, yangi] });
    if (rol === 'asosiy') {
      const r = await qatorlarOl(kid, [q.id], true);
      if (r) {
        setQatorlar((m) => { const n = new Map(m); for (const x of [...r.qatorlar, ...r.qoshnilar]) n.set(x.id, x); return n; });
        setTakliflar(avtoYigish(q, r.qoshnilar, koef));
      }
    }
  };

  const takliflarniQosh = () => {
    if (!shakl) return;
    const bor = new Set(shakl.bog.map((b) => b.qator_id));
    const qosh = takliflar.filter((x) => x.tanlangan && !bor.has(x.qator.id)).map((x): KartaBogYozuv => ({
      qator_id: x.qator.id, obyekt_id: x.qator.obyekt_id, rol: x.rol, koef: x.koef, koef_usul: 'nisbat', bosqich: x.bosqich, material_guruh: x.material_guruh,
      kod: x.qator.kod, nom: x.qator.nom, birlik: x.qator.birlik, manba: 'avto',
    }));
    setShakl({ ...shakl, bog: [...shakl.bog, ...qosh] });
    setTakliflar([]);
  };

  const bogOzgar = (i: number, o: Partial<KartaBogYozuv>) => shakl && setShakl({ ...shakl, bog: shakl.bog.map((b, j) => (j === i ? { ...b, ...o } : b)) });

  const saqla = async () => {
    if (!shakl || !kid) return;
    if (!shakl.nom.trim()) { toast(t('Karta nomini kiriting'), 'danger'); return; }
    if (shakl.ulush && !ulushYaroqli(shakl.ulush)) { toast(t('Bosqich ulushlari yig‘indisi 100 bo‘lishi kerak'), 'danger'); return; }
    setSaqlanmoqda(true);
    const r = await kartaSaqla({
      kompaniyaId: kid, id: shakl.id, kutilganVersiya: shakl.versiya, operationId: yangiOperationId(),
      karta: {
        nom: shakl.nom.trim(), tur: shakl.tur, birlik: shakl.birlik, parametrlar: shakl.parametrlar, bosqich_ulush: shakl.ulush, qamrov: shakl.qamrov,
        naryad_narx: shakl.naryad_narx, naryad_sana: null, usta_nom: shakl.usta_nom.trim() || null, usta_kontragent_id: null, manba: 'qolda', ishonch: null,
        manba_hujjat_id: null, manba_sahifa: null, izoh: shakl.izoh.trim() || null,
      },
      bog: shakl.bog,
    });
    setSaqlanmoqda(false);
    if (!r.ok) {
      const kod = `${r.code ?? ''} ${r.error ?? ''}`;
      toast(/NOM_BAND/.test(kod) ? t('Bu nomli karta allaqachon bor') : /STALE_VERSION/.test(kod) ? t('Karta shu orada o‘zgargan — yangilab qayta urinib ko‘ring') : (r.error || t('Saqlab bo‘lmadi')), 'danger');
      return;
    }
    toast(t('Karta saqlandi'));
    setShakl({ ...shakl, id: r.id ?? shakl.id, versiya: r.versiya ?? shakl.versiya });
    void yukla();
  };

  const arxivla = async () => {
    if (!shakl?.id || shakl.versiya == null || !kid) return;
    const r = await kartaArxiv({ kompaniyaId: kid, id: shakl.id, kutilganVersiya: shakl.versiya, operationId: yangiOperationId() });
    if (!r.ok) { toast(r.error || t('Arxivlab bo‘lmadi'), 'danger'); return; }
    setShakl(null); void yukla();
  };

  const kompUlushSaqla = async (tur: KartaTur, ulush: BosqichUlush) => {
    if (!kid) return;
    if (!ulushYaroqli(ulush)) { toast(t('Bosqich ulushlari yig‘indisi 100 bo‘lishi kerak'), 'danger'); return; }
    const mavjud = ulushlar.find((u) => u.tur === tur);
    const r = await ulushSaqla({ kompaniyaId: kid, tur, ulush, kutilganVersiya: mavjud?.versiya ?? null, operationId: yangiOperationId() });
    if (!r.ok) { toast(r.error || t('Saqlab bo‘lmadi'), 'danger'); return; }
    toast(t('Kompaniya ulushi saqlandi')); void yukla();
  };

  return (
    <Sahifa sarlavha={t('Narx tekshiruvi')} tavsif={t('Usta aytgan narxni smetamiz 1 amaliy birlikka beradigan narx bilan solishtiring')}
      onYangila={() => void yukla()} yangilanmoqda={yuklanmoqda}
      amallar={<button type="button" className={tugma} onClick={() => { setShakl(yangiShakl()); setTakliflar([]); }}><Plus size={14} />{t('Yangi karta')}</button>}>
      {xato && <div role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/5 p-2 text-[13px] text-danger">{xato}</div>}
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-2">
          <div className={yorliq}>{t('Ish kartalari')}</div>
          {!kartalar.length && !yuklanmoqda && <p className="text-[12px] text-text-mute">{t('Hali karta yo‘q. «Yangi karta» bilan boshlang.')}</p>}
          {kartalar.map((k) => (
            <div key={k.id} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-[13px] ${shakl?.id === k.id ? 'border-accent' : 'border-border'}`}>
              <input type="checkbox" aria-label={t('Solishtirishga qo‘shish')} checked={tanlov.includes(k.id)}
                onChange={(e) => setTanlov((x) => (e.target.checked ? [...x, k.id] : x.filter((y) => y !== k.id)))} />
              <button type="button" className="flex-1 text-left" onClick={() => { setShakl(kartadanShakl(k)); setTakliflar([]); }}>
                <span className="font-medium">{k.nom}</span> <span className="text-text-mute">· {turNomi(k.tur)} · {k.birlik}</span>
              </button>
            </div>
          ))}
          <label className="mt-3 flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={qoshimchaBilan} onChange={(e) => setQoshimchaBilan(e.target.checked)} />{t('Qo‘shimcha ishlar bilan')}
          </label>
        </aside>

        <main className="space-y-4">
          {shakl && (
            <section className="rounded-lg border border-border p-3" aria-label={t('Ish kartasi')}>
              <div className="grid gap-2 md:grid-cols-4">
                <label className="md:col-span-2"><span className={yorliq}>{t('Nomi')}</span>
                  <input className={kirit} value={shakl.nom} onChange={(e) => setShakl({ ...shakl, nom: e.target.value })} placeholder={t('Masalan: Rigel 300×500')} /></label>
                <label><span className={yorliq}>{t('Turi')}</span>
                  <select className={kirit} value={shakl.tur} onChange={(e) => setShakl({ ...shakl, tur: e.target.value as KartaTur })}>
                    {KARTA_TURLARI.map((x) => <option key={x} value={x}>{turNomi(x)}</option>)}
                  </select></label>
                <label><span className={yorliq}>{t('Amaliy birlik')}</span>
                  <select className={kirit} value={shakl.birlik} onChange={(e) => setShakl({ ...shakl, birlik: e.target.value as AmaliyBirlik })}>
                    {AMALIY_BIRLIKLAR.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select></label>
                {(['b_mm', 'h_mm', 'qalinlik_mm', 'uzunlik_m'] as const).map((p) => (
                  <label key={p}><span className={yorliq}>{{ b_mm: t('Kenglik b, mm'), h_mm: t('Balandlik h, mm'), qalinlik_mm: t('Qalinlik, mm'), uzunlik_m: t('Uzunlik, m') }[p]}</span>
                    <input className={kirit} inputMode="decimal" value={shakl.parametrlar[p] ?? ''}
                      onChange={(e) => setShakl({ ...shakl, parametrlar: { ...shakl.parametrlar, [p]: sonOl(e.target.value) } })} /></label>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <span className={yorliq}>{t('Bosqich ulushlari (karta), %')}</span>
                {BOSQICHLAR.map((b) => (
                  <label key={b} className="w-28"><span className="text-[11px] text-text-mute">{bosqichNomi(b)}</span>
                    <input className={kirit} inputMode="decimal" value={shakl.ulush?.[b] ?? ''} placeholder={String(ulushTanla(null, ulushlar.find((u) => u.tur === shakl.tur)?.ulush).ulush[b])}
                      onChange={(e) => { const v = sonOl(e.target.value); const u = { ...(shakl.ulush ?? ulushTanla(null, ulushlar.find((x) => x.tur === shakl.tur)?.ulush).ulush), [b]: v ?? 0 }; setShakl({ ...shakl, ulush: u }); }} /></label>
                ))}
                <button type="button" className={tugma} onClick={() => setShakl({ ...shakl, ulush: null })}>{t('Kompaniya ulushini olish')}</button>
                <button type="button" className={tugma} disabled={!shakl.ulush} onClick={() => shakl.ulush && void kompUlushSaqla(shakl.tur, shakl.ulush)}>{t('Shu turga kompaniya ulushi qilish')}</button>
              </div>

              <div className="mt-3">
                <div className={yorliq}>{t('Bog‘langan smeta qatorlari')}</div>
                {!shakl.bog.length && <p className="text-[12px] text-text-mute">{t('Pastdagi «Smetadan ish topish» bilan asosiy normani bog‘lang.')}</p>}
                {!!shakl.bog.length && (
                  <table className="w-full text-[12px]">
                    <thead><tr className="text-left text-text-mute">
                      <th>{t('Shifr')}</th><th>{t('Nomi')}</th><th>{t('Obyekt')}</th><th>{t('Birlik')}</th><th>{t('Hajm')}</th><th>{t('Rol')}</th><th>{t('Bosqich')}</th><th>{t('1 birlikka koef')}</th><th />
                    </tr></thead>
                    <tbody>
                      {shakl.bog.map((b, i) => {
                        const q = b.qator_id != null ? qatorlar.get(b.qator_id) : undefined;
                        return (
                          <tr key={`${b.qator_id}-${i}`} className="border-t border-border">
                            <td>{b.kod ?? q?.kod}</td><td className="max-w-[260px] truncate" title={b.nom ?? q?.nom ?? ''}>{b.nom ?? q?.nom}</td>
                            <td>{q?.obyekt_nom ?? b.obyekt_id}</td><td>{b.birlik ?? q?.birlik}</td><td className="num"><FmtN val={q?.hajm ?? null} kasr={4} /></td>
                            <td><select className={kirit} value={b.rol} onChange={(e) => bogOzgar(i, { rol: e.target.value as BogRol })}>
                              {(['asosiy', 'armatura_mat', 'armatura_tayyorlash', 'istisno', 'zakladnoy', 'boshqa'] as const).map((r) => <option key={r} value={r}>{rolNomi(r)}</option>)}
                            </select></td>
                            <td><select className={kirit} value={b.bosqich ?? ''} onChange={(e) => bogOzgar(i, { bosqich: (e.target.value || null) as Bosqich | null })}>
                              <option value="">{t('Ulush bo‘yicha')}</option>
                              {BOSQICHLAR.map((x) => <option key={x} value={x}>{bosqichNomi(x)}</option>)}
                            </select></td>
                            <td><input className={kirit} inputMode="decimal" value={b.koef ?? ''} aria-label={t('1 birlikka koef')}
                              onChange={(e) => bogOzgar(i, { koef: sonOl(e.target.value), koef_usul: 'qolda' })} /></td>
                            <td><button type="button" aria-label={t('Olib tashlash')} onClick={() => setShakl({ ...shakl, bog: shakl.bog.filter((_, j) => j !== i) })}><X size={14} /></button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {!!takliflar.length && (
                <div className="mt-3 rounded-md border border-accent/40 bg-accent/5 p-2 text-[12px]">
                  <div className="mb-1 font-medium">{t('Avto-yig‘ish: shu bo‘limdagi element qatorlari (tasdiqlang)')}</div>
                  {takliflar.map((x, i) => (
                    <label key={x.qator.id} className="flex items-center gap-2">
                      <input type="checkbox" checked={x.tanlangan} onChange={(e) => setTakliflar((a) => a.map((y, j) => (j === i ? { ...y, tanlangan: e.target.checked } : y)))} />
                      <span>{rolNomi(x.rol)}: {x.qator.kod} {x.qator.nom} · {x.qator.birlik} {x.qator.hajm}</span>
                      <span className="text-text-mute">{t('koef')} {x.koef == null ? '—' : x.koef.toPrecision(4)}</span>
                    </label>
                  ))}
                  <button type="button" className={`${tugma} mt-1`} onClick={takliflarniQosh}><Wand2 size={14} />{t('Tanlanganlarni qo‘shish')}</button>
                </div>
              )}

              <div className="mt-3 rounded-md border border-border p-2">
                <div className={yorliq}>{t('Smetadan ish topish')}</div>
                <div className="flex gap-2">
                  <input className={kirit} value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} placeholder={t('Masalan: ригел')}
                    onKeyDown={(e) => { if (e.key === 'Enter') void qidir(); }} />
                  <button type="button" className={tugma} disabled={qidirilmoqda} onClick={() => void qidir()}><Search size={14} />{t('Qidirish')}</button>
                </div>
                {topilgan && !topilgan.length && <p className="mt-1 text-[12px] text-text-mute">{t('Hech narsa topilmadi')}</p>}
                {!!topilgan?.length && (
                  <table className="mt-2 w-full text-[12px]">
                    <thead><tr className="text-left text-text-mute"><th>{t('Shifr')}</th><th>{t('Nomi')}</th><th>{t('Obyekt')}</th><th>{t('Birlik')}</th><th>{t('Hajm')}</th><th>{t('Mehnat 1 smeta birligiga')}</th><th /></tr></thead>
                    <tbody>
                      {topilgan.map((q) => (
                        <tr key={q.id} className="border-t border-border">
                          <td>{q.kod}</td><td className="max-w-[280px] truncate" title={q.nom ?? ''}>{q.nom}</td><td>{q.obyekt_nom}</td><td>{q.birlik}</td>
                          <td className="num"><FmtN val={q.hajm} kasr={4} /></td><td className="num"><FmtN val={birlikkaMehnat(q)} kasr={0} /></td>
                          <td className="whitespace-nowrap">
                            <button type="button" className={tugma} onClick={() => void bogla(q, 'asosiy')}>{t('Asosiy')}</button>{' '}
                            <button type="button" className={tugma} onClick={() => void bogla(q, 'boshqa')}>{t('Qo‘shish')}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={tugma} disabled={saqlanmoqda} onClick={() => void saqla()}><Save size={14} />{t('Saqlash')}</button>
                {shakl.id && <button type="button" className={tugma} onClick={() => void arxivla()}><Archive size={14} />{t('Arxivga')}</button>}
              </div>
            </section>
          )}

          {!natijalar.length && <p className="text-[13px] text-text-mute">{t('Kartani oching yoki chapdan bir nechtasini belgilang — solishtirish shu yerda chiqadi.')}</p>}
          {natijalar.map(({ k, ulush, ulushManba, s, n }) => (
            <KartaSolishtirish key={k.kalit} nom={k.nom} birlik={k.birlik} n={n} ulush={ulush} ulushManba={ulushManba} s={s}
              onSol={(o) => solYangila(k.kalit, s, o)} />
          ))}
        </main>
      </div>
    </Sahifa>
  );
}

const ort = (o: Oraliq) => o.ortacha;

function Oralik({ o, kasr = 0 }: { o: Oraliq; kasr?: number }) {
  return (
    <span>
      <FmtN val={o.ortacha} kasr={kasr} />
      {o.min != null && o.max != null && Math.abs(o.max - o.min) > 0.5 && (
        <span className="ml-1 text-[11px] text-text-mute">(<FmtN val={o.min} kasr={kasr} /> – <FmtN val={o.max} kasr={kasr} />)</span>
      )}
    </span>
  );
}

export function hukmMatni(ustaNarx: number | null, n: KartaNatija): string {
  if (ustaNarx == null) return t('Usta narxini kiriting');
  const h = hukm(ustaNarx, ort(n.mehnat.ustamali), ort(n.qamrov.ustamali));
  if (h.mehnat.baravar == null || h.qamrov.foiz == null) return t('Solishtirish uchun ustama ma’lumoti yetarli emas');
  const fx = (x: number, k = 1) => x.toLocaleString('ru-RU', { maximumFractionDigits: k, minimumFractionDigits: 0 });
  const m = h.mehnat.baravar >= 1
    ? t('smeta mehnatidan (ustama bilan) {n} baravar ko‘p', { n: fx(h.mehnat.baravar) })
    : t('smeta mehnatidan (ustama bilan) {p}% kam', { p: fx(Math.abs(h.mehnat.foiz ?? 0), 0) });
  const q = h.qamrov.foiz >= 0
    ? t('tanlangan qamrov narxidan {p}% ortiq', { p: fx(h.qamrov.foiz, 0) })
    : t('tanlangan qamrov narxidan {p}% kam', { p: fx(Math.abs(h.qamrov.foiz), 0) });
  return `${t('Usta narxi')} ${m}; ${q}.`;
}

function KartaSolishtirish({ nom, birlik, n, ulush, ulushManba, s, onSol }: {
  nom: string; birlik: string; n: KartaNatija; ulush: BosqichUlush; ulushManba: string; s: Solishtirish; onSol: (o: Partial<Solishtirish>) => void;
}) {
  const ustaNarx = sonOl(s.narx);
  const miqdor = sonOl(s.miqdor);
  const qatorlar: Array<{ nom: string; u: KartaNatija['mehnat'] }> = [
    { nom: t('Smeta mehnati (ShNQ)'), u: n.mehnat },
    { nom: t('Tanlangan qamrov'), u: n.qamrov },
    { nom: t('To‘liq ish'), u: n.toliq },
  ];
  const ogoh = n.obyektlar.flatMap((o) => o.ogohlantirish);
  const narxsiz = n.obyektlar.reduce((x, o) => x + o.narxsizSoni, 0);
  return (
    <section className="rounded-lg border border-border p-3" aria-label={nom}>
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <h3 className="text-[15px] font-semibold">{nom} <span className="text-text-mute">/ {birlik}</span></h3>
        <label className="w-40"><span className={yorliq}>{t('Usta narxi, 1 birlikka')}</span>
          <input className={kirit} inputMode="decimal" value={s.narx} onChange={(e) => onSol({ narx: e.target.value })} aria-label={t('Usta narxi, 1 birlikka')} /></label>
        <label className="w-32"><span className={yorliq}>{t('Rejadagi miqdor')}</span>
          <input className={kirit} inputMode="decimal" value={s.miqdor} onChange={(e) => onSol({ miqdor: e.target.value })} aria-label={t('Rejadagi miqdor')} /></label>
      </div>

      <div className="mb-2 flex flex-wrap gap-3 text-[12px]">
        <span className="text-text-mute">{t('Usta bajaradi:')}</span>
        {BOSQICHLAR.map((b) => (
          <label key={b} className="flex items-center gap-1">
            <input type="checkbox" checked={s.qamrov.bosqichlar[b]} onChange={(e) => onSol({ qamrov: { ...s.qamrov, bosqichlar: { ...s.qamrov.bosqichlar, [b]: e.target.checked } } })} />
            {bosqichNomi(b)} <span className="text-text-mute">({ulush[b]}%)</span>
          </label>
        ))}
        <span className="text-text-mute">· {ulushManba === 'karta' ? t('ulush: karta') : ulushManba === 'kompaniya' ? t('ulush: kompaniya') : t('ulush: tizim sukuti')}</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-[12px]">
        <span className="text-text-mute">{t('Material kimdan:')}</span>
        {BOSQICHLAR.map((g) => (
          <label key={g} className="flex items-center gap-1">{guruhNomi(g)}
            <select className="rounded border border-border bg-surface px-1" value={s.qamrov.material[g]} onChange={(e) => onSol({ qamrov: { ...s.qamrov, material: { ...s.qamrov.material, [g]: e.target.value as 'biz' | 'usta' } } })}>
              <option value="biz">{t('biz')}</option><option value="usta">{t('usta')}</option>
            </select>
          </label>
        ))}
        <label className="flex items-center gap-1">{t('Mexanizm')}
          <select className="rounded border border-border bg-surface px-1" value={s.qamrov.mexanizm} onChange={(e) => onSol({ qamrov: { ...s.qamrov, mexanizm: e.target.value as 'biz' | 'usta' } })}>
            <option value="biz">{t('biz')}</option><option value="usta">{t('usta')}</option>
          </select>
        </label>
      </div>

      <table className="w-full text-[13px]">
        <thead><tr className="text-left text-[11px] uppercase text-text-mute">
          <th>{t('1 birlikka')}</th><th className="text-right">{t('Ustamasiz')}</th><th className="text-right">{t('Ustamali (QQS siz)')}</th>
          <th className="text-right">{t('QQS bilan')}</th><th className="text-right">{t('Usta farqi, %')}</th><th className="text-right">{t('Farq × miqdor')}</th>
        </tr></thead>
        <tbody>
          {qatorlar.map((r) => {
            const f = farq(ustaNarx, ort(r.u.ustamali), miqdor);
            return (
              <tr key={r.nom} className="border-t border-border">
                <td>{r.nom}</td>
                <td className="num text-right text-text-mute"><Oralik o={r.u.ustamasiz} /></td>
                <td className="num text-right font-semibold"><Oralik o={r.u.ustamali} /></td>
                <td className="num text-right"><Oralik o={r.u.qqsBilan} /></td>
                <td className="num text-right">{f.foiz == null ? '—' : `${f.foiz >= 0 ? '+' : ''}${f.foiz.toFixed(0)}%`}</td>
                <td className="num text-right"><FmtN val={f.jamiFarq} kasr={0} /></td>
              </tr>
            );
          })}
          <tr className="border-t border-border font-medium"><td>{t('Usta narxi')}</td><td /><td className="num text-right"><FmtN val={ustaNarx} kasr={0} /></td><td /><td /><td className="num text-right"><FmtN val={ustaNarx != null && miqdor != null ? ustaNarx * miqdor : null} kasr={0} /></td></tr>
        </tbody>
      </table>
      <p className="mt-2 rounded-md bg-accent/5 p-2 text-[13px] font-medium" data-testid="hukm">{hukmMatni(ustaNarx, n)}</p>

      <details className="mt-2 text-[12px]" open>
        <summary className="cursor-pointer text-text-mute">{t('1 birlikka ShNQ tarkibi (ustamasiz)')}</summary>
        <table className="mt-1 w-full">
          <tbody>
            <tr><td>{t('Mehnat')}</td><td className="num text-right"><Oralik o={n.taqsimot.mehnat} /></td><td className="pl-3 text-text-mute">{t('чел-ч')}: <FmtN val={ort(n.taqsimot.chelSoat)} kasr={2} /></td></tr>
            {n.obyektlar.length === 1 && BOSQICHLAR.map((b) => (
              <tr key={b}><td className="pl-4 text-text-mute">{bosqichNomi(b)}</td><td className="num text-right text-text-mute"><FmtN val={n.obyektlar[0].taqsimot.mehnat[b]} kasr={0} /></td><td /></tr>
            ))}
            <tr><td>{t('Mashina va mexanizmlar')}</td><td className="num text-right"><Oralik o={n.taqsimot.mashina} /></td><td /></tr>
            <tr><td>{t('Beton va opalubka materiallari')}</td><td className="num text-right"><Oralik o={n.taqsimot.beton_opalubka} /></td><td /></tr>
            <tr><td>{t('Armatura')}</td><td className="num text-right"><Oralik o={n.taqsimot.armatura} /></td><td /></tr>
            <tr className="border-t border-border font-semibold"><td>{t('Jami to‘g‘ri xarajat')}</td><td className="num text-right"><Oralik o={n.taqsimot.jami} /></td><td /></tr>
          </tbody>
        </table>
        {n.obyektlar.length > 1 && <p className="mt-1 text-text-mute">{t('{n} ta obyekt bo‘yicha hajmga tortilgan o‘rtacha; qavs ichida eng kam – eng ko‘p.', { n: n.obyektlar.length })}</p>}
        {n.hajmNomalum && <p className="mt-1 text-warning">{t('Ayrim obyektda asosiy qator hajmi yoki koeffitsienti yo‘q — o‘rtachaga og‘irliksiz qo‘shildi.')}</p>}
        {narxsiz > 0 && <p className="mt-1 text-warning">{t('Narxsiz resurslar: {n} ta (0 deb olinmadi, hisobga kirmadi).', { n: narxsiz })}</p>}
        {ogoh.length > 0 && <p className="mt-1 text-warning">{t('Hisobga kirmagan qatorlar: {n} ta (koeffitsient yo‘q, qator topilmadi yoki qo‘shimcha ish).', { n: ogoh.length })}</p>}
      </details>
    </section>
  );
}
