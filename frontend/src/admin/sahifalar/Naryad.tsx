/**
 * «Naryad» — brigada/usta ish topshirig'i (egasi: «naryad va smeta lug'ati ochiq qolmasin»).
 * Smeta ishlaridan naryad: hajm, normativ чел-ч, kelishilgan usta narxi, to'lanadigan summa. Holat: berildi → bajarildi (usta) →
 * qabul (prorab; fakt farqi taklif) → hisoblandi (xarajat ЧЕЛ). Direktorga: usta narxi ↔ smeta mehnati (foyda/zarar).
 * Qidiruv va qisqa nomlar — yagona qurilish lug'ati (`lib/qurilish-lugat`): «g'isht», «pol quyish», «кирпич» smeta so'zlariga o'giriladi.
 * Pul: usta narxi QQS siz; smeta mehnati ustamali/QQS bilan — yagona hisob-yadro. Noma'lum — «—» (0 emas).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, RefreshCw, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { yangiOperationId } from '../../api/supabase';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { t2ObyektNakrutka } from '../../api/t2-nakrutka';
import { podvalTanla, sbPodvallarOl } from '../../api/t2-nakrutka-podval';
import { kartalarOl, qatorlarOl, smetadanQidir, type IshKarta } from '../../api/t2-ish-kartasi';
import {
  faktHozirOl, lugatKompaniyaOl, naryadBajarildi, naryadBekor, naryadFaktYoz, naryadHisobla, naryadNarx, naryadOl, naryadQabul, naryadYarat, naryadlarOl,
  type NaryadYaratQator,
} from '../../api/t2-naryad';
import type { SmetaQator, UstamaKirish } from '../../lib/ish-kartasi';
import { HOLAT_NOMI, NARYAD_HOLATLAR, faktTaklif, mehnatUchlik, naryadJami, qatorSurati, satrTahlil, ustaNarxTaklif, type Harakat, type Naryad, type NaryadHolat, type NaryadQisqa } from '../../lib/naryad';
import { naryadHujjat } from '../../lib/naryad/hujjat';
import { birlikOdam, lugatKengaytir, lugatOrnat, odamNomi } from '../../lib/qurilish-lugat';

const kirit = 'w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] text-text outline-none focus:border-accent';
const tugma = 'inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[13px] hover:border-accent disabled:opacity-50';
const asosiyTugma = 'inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50';
const yorliq = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-mute';

const sonOl = (s: string): number | null => {
  const x = s.replace(/\s/g, '').replace(',', '.');
  if (x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const pul = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('ru-RU', { maximumFractionDigits: 2 }));
const hajmFmt = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('ru-RU', { maximumFractionDigits: 4 }));
const holatNomi = (h: NaryadHolat) => t(HOLAT_NOMI[h]);
const bugun = () => new Date().toISOString().slice(0, 10);

/** Lug'at bilan qidiruv: so'z(lar) ruscha smeta o'zaklariga ham o'giriladi, natijalar birlashtiriladi. */
async function lugatBilanQidir(kid: number, q: string, obyektId: number): Promise<SmetaQator[]> {
  const soz = q.trim().split(/\s+/).filter(Boolean);
  const variantlar = new Set<string>([q.trim()]);
  const almashgan = soz.map((w) => lugatKengaytir(w)[0]?.toLowerCase() ?? w);
  if (almashgan.some((w, i) => w !== soz[i])) variantlar.add(almashgan.join(' '));
  if (soz.length === 1) for (const r of lugatKengaytir(soz[0]).slice(0, 2)) variantlar.add(r.toLowerCase());
  const natijalar = await Promise.all([...variantlar].slice(0, 3).map((v) => smetadanQidir(kid, v)));
  const xarita = new Map<number, SmetaQator>();
  for (const r of natijalar) for (const x of r ?? []) if (x.obyekt_id === obyektId) xarita.set(x.id, x);
  return [...xarita.values()];
}

type Tanlangan = { q: SmetaQator; hajm: string; narx: string };

export default function Naryad() {
  const { joriyId: kid } = useKompaniya();
  const ws = usePTOWorkspace();
  const obyektId = ws.scope.objectId;
  const obyektNom = ws.objects.find((o) => o.id === obyektId)?.nom ?? '';
  const [royxat, setRoyxat] = useState<NaryadQisqa[]>([]);
  const [holatFiltr, setHolatFiltr] = useState<NaryadHolat | ''>('');
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [ochiq, setOchiq] = useState<Naryad | null>(null);
  const [yangi, setYangi] = useState(false);
  const [band, setBand] = useState(false);
  const [kartalar, setKartalar] = useState<IshKarta[]>([]);
  const [ustama, setUstama] = useState<UstamaKirish>(null);

  const yukla = useCallback(async () => {
    if (!kid) return;
    setYuklanmoqda(true); setXato(null);
    const [r, lg] = await Promise.all([naryadlarOl(kid, { obyektId: obyektId ?? undefined, holat: holatFiltr || undefined, limit: 100 }), lugatKompaniyaOl(kid)]);
    setYuklanmoqda(false);
    if (lg) lugatOrnat(lg.qiymat);
    if (!r) { setXato(t('Naryadlar o‘qilmadi. Ruxsat (smeta.read) va migratsiyani tekshiring.')); return; }
    setRoyxat(r);
  }, [kid, obyektId, holatFiltr]);
  useEffect(() => { void yukla(); }, [yukla]);
  useEffect(() => { if (kid) void kartalarOl(kid).then((r) => { if (r) setKartalar(r.kartalar); }); }, [kid]);

  // Obyekt ustamasi (smeta mehnatining ustamali/QQS ko'rinishi uchun) — NarxTekshiruv bilan bir xil manba.
  useEffect(() => {
    if (!kid || !obyektId) { setUstama(null); return; }
    let faol = true;
    void (async () => {
      const [pod, nk] = await Promise.all([sbPodvallarOl(kid).catch(() => null), t2ObyektNakrutka(obyektId).catch(() => null)]);
      if (!faol) return;
      const royxatP = pod && pod.ok && Array.isArray(pod.qatorlar) ? pod.qatorlar : null;
      const p = royxatP ? podvalTanla(royxatP, { obyektId, shartnomaId: null }) : null;
      setUstama(nk && nk.ok && nk.koeffitsientlar ? { koef: nk.koeffitsientlar, podval: p ? { versiya: 1, nom: p.nom, qatorlar: p.qatorlar } : null } : null);
    })();
    return () => { faol = false; };
  }, [kid, obyektId]);

  const och = async (id: number) => { if (!kid) return; const n = await naryadOl(kid, id); if (n) setOchiq(n); else toast(t('Naryad o‘qilmadi'), 'danger'); };
  const yangilash = async (id: number) => { await yukla(); await och(id); };

  const harakat = async (f: Harakat, id: number, ok: string) => {
    setBand(true);
    try {
      const r = await f();
      if (!r.ok) { toast(`${t('Bajarilmadi')}: ${r.error ?? r.code ?? ''}`, 'danger'); return; }
      toast(ok, 'ok');
      await yangilash(id);
    } finally { setBand(false); }
  };

  return (
    <Sahifa sarlavha={t('Naryad')} tavsif={t('Brigada (usta) topshirig‘i: smeta ishlari, kelishilgan narx, qabul, fakt va xarajat')}
      amallar={<div className="flex gap-2">
        <button type="button" className={tugma} onClick={() => void yukla()} disabled={yuklanmoqda}><RefreshCw size={14} />{t('Yangilash')}</button>
        <button type="button" className={asosiyTugma} onClick={() => setYangi(true)} disabled={!obyektId}><Plus size={14} />{t('Yangi naryad')}</button>
      </div>}>
      {!obyektId && <div className="mb-3 rounded-md border border-border p-3 text-[13px]">{t('Avval yuqoridan obyektni tanlang.')}</div>}
      {xato && <div className="mb-3 rounded-md border border-danger p-3 text-[13px] text-danger">{xato}</div>}

      <div className="mb-3 flex flex-wrap gap-2" data-testid="naryad-filtr">
        <button type="button" className={tugma} aria-pressed={holatFiltr === ''} onClick={() => setHolatFiltr('')}>{t('Hammasi')}</button>
        {NARYAD_HOLATLAR.map((h) => <button key={h} type="button" className={tugma} aria-pressed={holatFiltr === h} onClick={() => setHolatFiltr(h)}>{holatNomi(h)}</button>)}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-2" data-testid="naryad-royxat">
          {!royxat.length && !yuklanmoqda && <div className="rounded-md border border-border p-3 text-[13px] text-text-dim">{t('Naryad yo‘q.')}</div>}
          {royxat.map((n) => (
            <button key={n.id} type="button" onClick={() => void och(n.id)} className={`block w-full rounded-md border p-3 text-left text-[13px] hover:border-accent ${ochiq?.id === n.id ? 'border-accent' : 'border-border'}`}>
              <div className="flex justify-between gap-2"><b>{n.raqam}</b><span>{holatNomi(n.holat)}</span></div>
              <div className="text-text-dim">{n.usta_nom}{n.brigada ? ` · ${n.brigada}` : ''} · {n.qator_soni} {t('ish')}</div>
              <div className="num">{pul(n.xarajat_summa ?? n.reja_summa)} {t('so‘m')} {n.narxsiz_soni ? <span className="text-warning">· {t('narxsiz')}: {n.narxsiz_soni}</span> : null}</div>
            </button>
          ))}
        </div>
        <div>
          {ochiq && kid && <NaryadTafsilot n={ochiq} band={band} ustama={ustama} obyektNom={obyektNom}
            onQabul={(qatorlar) => harakat(async () => {
              const h = await faktHozirOl(ochiq.qatorlar.map((q) => q.qator_id ?? 0));
              if (!h) toast(t('Hozirgi fakt o‘qilmadi — farq naryad boshidagi faktdan hisoblanadi'), 'danger');
              return naryadQabul({ kompaniyaId: kid, naryadId: ochiq.id, versiya: ochiq.versiya, operationId: yangiOperationId(),
                qatorlar: qatorlar.map((x) => ({ ...x, fakt_hozir: ochiq.qatorlar.find((q) => q.id === x.id)?.qator_id != null ? (h?.get(ochiq.qatorlar.find((q) => q.id === x.id)!.qator_id as number)?.fakt_hajm ?? null) : null })) });
            }, ochiq.id, t('Naryad qabul qilindi'))}
            onNarx={(qatorlar) => harakat(() => naryadNarx({ kompaniyaId: kid, naryadId: ochiq.id, versiya: ochiq.versiya, operationId: yangiOperationId(), qatorlar }), ochiq.id, t('Usta narxi saqlandi'))}
            onBajarildi={(qatorlar) => harakat(() => naryadBajarildi({ kompaniyaId: kid, naryadId: ochiq.id, versiya: ochiq.versiya, operationId: yangiOperationId(), qatorlar }), ochiq.id, t('Bajarildi deb belgilandi'))}
            onFakt={() => harakat(async () => { const r = await naryadFaktYoz({ kompaniyaId: kid, naryad: ochiq, sana: bugun(), operationId: yangiOperationId() }); return { ok: r.ok, error: r.xabar }; }, ochiq.id, t('Fakt farqi yozildi'))}
            onHisobla={() => harakat(() => naryadHisobla({ kompaniyaId: kid, naryadId: ochiq.id, versiya: ochiq.versiya, operationId: yangiOperationId() }), ochiq.id, t('Xarajatga (ЧЕЛ) yozildi'))}
            onBekor={() => harakat(() => naryadBekor({ kompaniyaId: kid, naryadId: ochiq.id, versiya: ochiq.versiya, operationId: yangiOperationId() }), ochiq.id, t('Naryad bekor qilindi'))}
            onHujjat={async () => {
              const { bytes, faylNomi } = naryadHujjat(ochiq, { obyektNom });
              const r = await hujjatTokenBilan({ kompaniyaId: kid, bytes, hujjat: 'NARYAD', sabab: `Наряд ${ochiq.raqam}`, obyekt: ochiq.obyekt_id }, () => {
                const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
                const a = document.createElement('a'); a.href = url; a.download = faylNomi; document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
              });
              toast(r.xabar, r.ok ? 'ok' : 'danger');
            }} />}
          {!ochiq && <div className="rounded-md border border-border p-3 text-[13px] text-text-dim">{t('Naryadni tanlang.')}</div>}
        </div>
      </div>

      {yangi && kid && obyektId && <YangiNaryad kid={kid} obyektId={obyektId} kartalar={kartalar} onYop={() => setYangi(false)} onYaratildi={async (id) => { setYangi(false); await yukla(); await och(id); }} />}
    </Sahifa>
  );
}

function NaryadTafsilot({ n, band, ustama, obyektNom: _obyektNom, onQabul, onNarx, onBajarildi, onFakt, onHisobla, onBekor, onHujjat }: {
  n: Naryad; band: boolean; ustama: UstamaKirish; obyektNom: string;
  onQabul: (q: Array<{ id: number; qabul_hajm: number }>) => void; onNarx: (q: Array<{ id: number; usta_narx: number }>) => void; onBajarildi: (q: Array<{ id: number; bajarilgan_hajm: number }>) => void;
  onFakt: () => void; onHisobla: () => void; onBekor: () => void; onHujjat: () => void;
}) {
  const [kirit1, setKirit1] = useState<Record<number, string>>({});
  const [narxKirit, setNarxKirit] = useState<Record<number, string>>({});
  useEffect(() => { setKirit1({}); setNarxKirit({}); }, [n.id, n.versiya]);
  const narxYozilgan = n.holat !== 'hisoblandi' && n.holat !== 'bekor';
  const yangiNarxlar = n.qatorlar.flatMap((q) => { const v = sonOl(narxKirit[q.id] ?? ''); return v != null && v >= 0 ? [{ id: q.id, usta_narx: v }] : []; });
  const rejim = n.holat === 'berildi' ? 'reja' : 'amalda';
  const j = useMemo(() => naryadJami(n.qatorlar, rejim), [n.qatorlar, rejim]);
  const uch = useMemo(() => mehnatUchlik(j.smetaMehnat, ustama), [j.smetaMehnat, ustama]);
  const tahrir = n.holat === 'berildi' || n.holat === 'bajarildi';
  const qiymat = (id: number, asl: number | null) => kirit1[id] ?? (asl == null ? '' : String(asl));
  const faktTakliflari = useMemo(() => n.qatorlar.filter((q) => (q.fakt_delta ?? 0) > 0), [n.qatorlar]);
  const takliflarOldindan = useMemo(() => (n.holat === 'qabul' ? [] : faktTaklif(n.qatorlar.map((q) => ({ ...q, qabul_hajm: sonOl(kirit1[q.id] ?? '') ?? q.bajarilgan_hajm ?? q.hajm })), new Map())), [n, kirit1]);

  return (
    <div className="rounded-md border border-border p-3 text-[13px]" data-testid="naryad-tafsilot">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div><b>{n.raqam}</b> · {holatNomi(n.holat)} · {n.usta_nom}{n.brigada ? ` · ${n.brigada}` : ''}</div>
        <button type="button" className={tugma} onClick={onHujjat}><Download size={14} />{t('Hujjat (Excel)')}</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12px]">
          <thead><tr className="text-left text-text-mute">
            <th className="p-1">{t('Ish')}</th><th className="p-1">{t('Birlik')}</th><th className="p-1 text-right">{t('Reja')}</th>
            <th className="p-1 text-right">{t('Bajarildi')}</th><th className="p-1 text-right">{t('Qabul')}</th><th className="p-1 text-right">{t('chel-soat')}</th>
            <th className="p-1 text-right">{t('Usta narxi')}</th><th className="p-1 text-right">{t('To‘lov')}</th><th className="p-1 text-right">{t('Smeta mehnati')}</th><th className="p-1 text-right">{t('Farq')}</th>
          </tr></thead>
          <tbody>
            {n.qatorlar.map((q) => {
              const s = satrTahlil({ ...q, bajarilgan_hajm: n.holat === 'bajarildi' || n.holat === 'berildi' ? sonOl(kirit1[q.id] ?? '') ?? q.bajarilgan_hajm : q.bajarilgan_hajm }, rejim);
              return (
                <tr key={q.id} className="border-t border-border align-top">
                  <td className="p-1"><div className="font-medium">{odamNomi(q, 'uz')}</div><div className="text-[11px] text-text-dim">{q.kod} {q.nom}</div></td>
                  <td className="p-1">{birlikOdam(q.birlik, 'uz')}</td>
                  <td className="p-1 text-right num">{hajmFmt(q.hajm)}</td>
                  <td className="p-1 text-right">{tahrir ? <input aria-label={t('Bajarilgan hajm')} className={`${kirit} w-24 text-right`} value={qiymat(q.id, q.bajarilgan_hajm)} onChange={(e) => setKirit1((x) => ({ ...x, [q.id]: e.target.value }))} /> : <span className="num">{hajmFmt(q.bajarilgan_hajm)}</span>}</td>
                  <td className="p-1 text-right num">{hajmFmt(q.qabul_hajm)}</td>
                  <td className="p-1 text-right num">{hajmFmt(s.chelSoat)}</td>
                  <td className="p-1 text-right num">{q.usta_narx == null && narxYozilgan ? <MoneyInput aria-label={t('Usta narxi')} className={`${kirit} w-24 text-right`} placeholder={t('kelishilmagan')} value={narxKirit[q.id] ?? ''} onValueChange={(v) => setNarxKirit((x) => ({ ...x, [q.id]: v }))} /> : pul(q.usta_narx)}</td>
                  <td className="p-1 text-right num">{pul(s.summa)}</td>
                  <td className="p-1 text-right num">{pul(s.smetaMehnat)}</td>
                  <td className={`p-1 text-right num ${s.foyda != null && s.foyda < 0 ? 'text-danger' : ''}`}>{pul(s.foyda)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid gap-1 rounded-md bg-surface-2 p-2" data-testid="naryad-jami">
        <div>{t('Jami to‘lov (QQS siz)')}: <b className="num">{pul(j.ustaSumma)}</b> · {t('chel-soat')}: <b className="num">{hajmFmt(j.chelSoat)}</b>{j.narxsizSoni ? <span className="text-warning"> · {t('narxsiz')}: {j.narxsizSoni}</span> : null}</div>
        <div>{t('Smeta mehnati (ustamasiz)')}: <b className="num">{pul(j.smetaMehnat)}</b>{uch ? <> · {t('ustamali')}: <b className="num">{pul(uch.ustamali)}</b> · {t('QQS bilan')}: <b className="num">{pul(uch.qqsBilan)}</b></> : null}</div>
        <div className={j.foyda != null && j.foyda < 0 ? 'text-danger' : ''}>{t('Smeta − usta (foyda +, zarar −)')}: <b className="num">{pul(j.foyda)}</b>{j.foiz != null ? ` (${j.foiz.toFixed(1)}%)` : ''}</div>
      </div>

      {takliflarOldindan.length !== 0 && tahrir ? <div className="mt-2 text-[12px] text-text-dim">{t('Qabulda faktga yoziladigan farq')}: {takliflarOldindan.length} {t('ish')}</div> : null}
      {n.holat === 'qabul' && n.fakt_holat !== 'yozildi' && faktTakliflari.length > 0 && (
        <div className="mt-2 rounded-md border border-border p-2" data-testid="naryad-fakt-taklif">
          <div className="mb-1 font-medium">{t('Faktga yoziladigan farq (faqat yetishmagan qism)')}</div>
          {faktTakliflari.map((q) => <div key={q.id} className="num">{odamNomi(q, 'uz')}: +{hajmFmt(q.fakt_delta)} {birlikOdam(q.birlik, 'uz')}</div>)}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {yangiNarxlar.length > 0 && <button type="button" className={tugma} disabled={band} onClick={() => onNarx(yangiNarxlar)}>{t('Usta narxini saqlash')}</button>}
        {n.holat === 'berildi' && <button type="button" className={tugma} disabled={band} onClick={() => {
          const q = n.qatorlar.map((x) => ({ id: x.id, bajarilgan_hajm: sonOl(kirit1[x.id] ?? '') ?? x.bajarilgan_hajm ?? x.hajm }));
          onBajarildi(q);
        }}>{t('Bajarildi (usta)')}</button>}
        {n.holat === 'bajarildi' && <button type="button" className={tugma} disabled={band} onClick={() => onBajarildi(n.qatorlar.map((x) => ({ id: x.id, bajarilgan_hajm: sonOl(kirit1[x.id] ?? '') ?? x.bajarilgan_hajm ?? x.hajm })))}>{t('Hajmni yangilash')}</button>}
        {tahrir && <button type="button" className={asosiyTugma} disabled={band} onClick={() => onQabul(n.qatorlar.map((x) => ({ id: x.id, qabul_hajm: sonOl(kirit1[x.id] ?? '') ?? x.bajarilgan_hajm ?? x.hajm })))}>{t('Qabul qilish (prorab)')}</button>}
        {n.holat === 'qabul' && n.fakt_holat !== 'yozildi' && <button type="button" className={asosiyTugma} disabled={band} onClick={onFakt}>{t('Faktga yozish')}</button>}
        {n.holat === 'qabul' && <button type="button" className={asosiyTugma} disabled={band || (n.fakt_holat !== 'yozildi' && faktTakliflari.length > 0)} onClick={onHisobla}>{t('Hisoblash (xarajatga)')}</button>}
        {(n.holat === 'berildi' || n.holat === 'bajarildi' || (n.holat === 'qabul' && n.fakt_holat !== 'yozildi')) && <button type="button" className={tugma} disabled={band} onClick={onBekor}><X size={14} />{t('Bekor qilish')}</button>}
      </div>
      <div className="mt-1 text-[11px] text-text-mute">{t('Hisoblash faqat moliya ruxsati (financial.write) bilan; to‘lov hajmi — qabul qilingan hajm.')}</div>
    </div>
  );
}

function YangiNaryad({ kid, obyektId, kartalar, onYop, onYaratildi }: { kid: number; obyektId: number; kartalar: IshKarta[]; onYop: () => void; onYaratildi: (id: number) => unknown }) {
  const [usta, setUsta] = useState(''); const [brigada, setBrigada] = useState(''); const [dan, setDan] = useState(''); const [gacha, setGacha] = useState('');
  const [qidiruv, setQidiruv] = useState(''); const [topilgan, setTopilgan] = useState<SmetaQator[] | null>(null);
  const [tanlangan, setTanlangan] = useState<Tanlangan[]>([]);
  const [band, setBand] = useState(false);

  const qidir = async () => {
    if (!qidiruv.trim()) return;
    setBand(true);
    setTopilgan(await lugatBilanQidir(kid, qidiruv, obyektId));
    setBand(false);
  };
  const qosh = async (q: SmetaQator) => {
    if (tanlangan.some((x) => x.q.id === q.id)) return;
    const toliq = (await qatorlarOl(kid, [q.id]))?.qatorlar[0] ?? q;
    const taklif = ustaNarxTaklif(q.id, kartalar);
    setTanlangan((l) => [...l, { q: toliq, hajm: toliq.hajm != null ? String(toliq.hajm) : '', narx: taklif != null ? String(taklif) : '' }]);
  };
  const saqla = async () => {
    const qatorlar: NaryadYaratQator[] = [];
    for (const x of tanlangan) {
      const h = sonOl(x.hajm);
      if (h == null || h <= 0) { toast(t('Har ish uchun hajm musbat son bo‘lsin'), 'danger'); return; }
      const nr = x.narx.trim() === '' ? null : sonOl(x.narx);
      if (x.narx.trim() !== '' && (nr == null || nr < 0)) { toast(t('Usta narxi son bo‘lsin (yoki bo‘sh — kelishilmagan)'), 'danger'); return; }
      qatorlar.push({ qator_id: x.q.id, hajm: h, usta_narx: nr, ...qatorSurati(x.q, h), fakt_boshida: null });
    }
    if (!usta.trim() || !qatorlar.length) { toast(t('Usta nomi va kamida bitta ish kerak'), 'danger'); return; }
    setBand(true);
    const fakt = await faktHozirOl(qatorlar.map((x) => x.qator_id));
    if (!fakt) toast(t('Hozirgi fakt o‘qilmadi — farq 0 dan hisoblanadi'), 'danger');
    for (const x of qatorlar) x.fakt_boshida = fakt?.get(x.qator_id)?.fakt_hajm ?? null;
    const r = await naryadYarat({ kompaniyaId: kid, operationId: yangiOperationId(), obyektId, ustaNom: usta.trim(), brigada: brigada.trim() || null, davrDan: dan || null, davrGacha: gacha || null, qatorlar });
    setBand(false);
    if (!r.ok || !r.id) { toast(`${t('Yaratilmadi')}: ${r.error ?? r.code ?? ''}`, 'danger'); return; }
    toast(`${t('Naryad yaratildi')}: ${r.raqam ?? ''}`, 'ok');
    await onYaratildi(r.id);
  };
  const tanJami = useMemo(() => tanlangan.map((x) => ({ x, h: sonOl(x.hajm), n: x.narx.trim() === '' ? null : sonOl(x.narx) })), [tanlangan]);

  return (
    <div role="dialog" aria-label={t('Yangi naryad')} className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4" data-testid="naryad-yangi">
      <div className="w-full max-w-3xl rounded-lg border border-border bg-surface p-4 text-[13px]">
        <div className="mb-3 flex items-center justify-between"><b>{t('Yangi naryad')}</b><button type="button" className={tugma} onClick={onYop}><X size={14} />{t('Yopish')}</button></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label><span className={yorliq}>{t('Usta / mas’ul')}</span><input className={kirit} value={usta} maxLength={200} onChange={(e) => setUsta(e.target.value)} /></label>
          <label><span className={yorliq}>{t('Brigada')}</span><input className={kirit} value={brigada} maxLength={200} onChange={(e) => setBrigada(e.target.value)} /></label>
          <label><span className={yorliq}>{t('Davr: dan')}</span><input type="date" className={kirit} value={dan} onChange={(e) => setDan(e.target.value)} /></label>
          <label><span className={yorliq}>{t('Davr: gacha')}</span><input type="date" className={kirit} value={gacha} onChange={(e) => setGacha(e.target.value)} /></label>
        </div>
        <div className="mt-3 flex gap-2">
          <input className={kirit} placeholder={t('Ish qidiring: g‘isht, pol quyish, beton, кирпич…')} value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void qidir(); }} />
          <button type="button" className={tugma} disabled={band} onClick={() => void qidir()}>{t('Qidirish')}</button>
        </div>
        {topilgan && <div className="mt-2 max-h-48 space-y-1 overflow-auto" data-testid="naryad-topilgan">
          {!topilgan.length && <div className="text-text-dim">{t('Topilmadi.')}</div>}
          {topilgan.map((q) => <button key={q.id} type="button" className="block w-full rounded border border-border px-2 py-1 text-left hover:border-accent" onClick={() => void qosh(q)}>
            <b>{odamNomi(q, 'uz')}</b> <span className="text-text-dim">{q.kod} {q.nom} · {hajmFmt(q.hajm)} {birlikOdam(q.birlik, 'uz')}</span></button>)}
        </div>}
        {tanlangan.length > 0 && <table className="mt-3 w-full text-[12px]"><thead><tr className="text-left text-text-mute"><th className="p-1">{t('Ish')}</th><th className="p-1">{t('Hajm')}</th><th className="p-1">{t('Usta narxi (1 birlikka, QQS siz)')}</th><th /></tr></thead>
          <tbody>{tanJami.map(({ x, h, n }) => (
            <tr key={x.q.id} className="border-t border-border"><td className="p-1">{odamNomi(x.q, 'uz')}<div className="text-[11px] text-text-dim">{x.q.nom}</div></td>
              <td className="p-1"><input aria-label={t('Hajm')} className={`${kirit} w-24`} value={x.hajm} onChange={(e) => setTanlangan((l) => l.map((y) => (y.q.id === x.q.id ? { ...y, hajm: e.target.value } : y)))} /> {birlikOdam(x.q.birlik, 'uz')}</td>
              <td className="p-1"><MoneyInput aria-label={t('Usta narxi')} className={`${kirit} w-28`} value={x.narx} onValueChange={(v) => setTanlangan((l) => l.map((y) => (y.q.id === x.q.id ? { ...y, narx: v } : y)))} />
                <span className="ml-2 num">{h != null && n != null ? pul(h * n) : '—'}</span></td>
              <td className="p-1"><button type="button" aria-label={t('Olib tashlash')} onClick={() => setTanlangan((l) => l.filter((y) => y.q.id !== x.q.id))}><X size={14} /></button></td></tr>))}</tbody></table>}
        <div className="mt-3 flex justify-end gap-2"><button type="button" className={tugma} onClick={onYop}>{t('Bekor')}</button><button type="button" className={asosiyTugma} disabled={band} onClick={() => void saqla()}>{t('Naryad berish')}</button></div>
        <div className="mt-1 text-[11px] text-text-mute">{t('Usta narxi bo‘sh bo‘lsa — kelishilmagan hisoblanadi (0 emas); to‘lovdan oldin kiritiladi.')}</div>
      </div>
    </div>
  );
}
