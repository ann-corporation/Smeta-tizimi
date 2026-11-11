/**
 * «VERSIYALAR VA FARQ» (PTO-CORE-001, 1-bosqich; egasi 2026-10-26): obyektga tashqi smeta versiyasini (ekspertizagacha /
 * ekspertizaga topshirilgan / korrektirovka … LRV .xls) yuklash → joriy smeta bilan pozitsiya bo'yicha moslash → bo'lim
 * bo'yicha farq (ustamasiz + ustamali) → noaniq mosliklarni inson tasdig'i → egasi qarori (qurilgan / yo'q / qisman) →
 * «Da'vo ro'yxati» Excel. Smeta tushunish faqat `smeta-anatomiya` orqali; asl smeta (t2_qator) O'ZGARMAYDI.
 * Egasi qarorlari: ekspertiza kesgan, lekin qurilgan hajm — fakt, himoya qilinadi (avtomatik minus yo'q).
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AlertTriangle, Download, RefreshCw, Save, Upload } from 'lucide-react';
import { yangiOperationId, type T2Qator } from '../../api/supabase';
import {
  eskiF2Ol, eskiQatorlarOl, faollashtirishPozitsiyalariOl,
  moslikYoz, mosliklarOl, pozitsiyaYoz, pozitsiyalarOl, qarorYoz, versiyaBekor, versiyaXatoMatni, versiyalarOl, versiyaYarat,
  type MoslikYuk, type QarorYuk, type VersiyaNatija,
} from '../../api/t2-smeta-versiya';
import { faollashtirishFarqi, type F2Qator, type FPozitsiya, type VQator } from '../../lib/smeta-versiya/faollashtirish-farq';
import { readXlsxFonda } from '../../lib/f2-import-parse/xlsxFonda';
import { kitobAnatomiyasi } from '../../lib/smeta-anatomiya';
import { anatomiyadanPozitsiyalar, qatorlardanPozitsiyalar, type JQator } from '../../lib/smeta-versiya/pozitsiya';
import { versiyaMoslash } from '../../lib/smeta-versiya/moslash';
import { bolimgaQosh, bosBolim, katalogQur, kesimQosh, pozitsiyaPul, qarorKerak, qatorPul, type BolimJami, type QatorPul } from '../../lib/smeta-versiya/hisob';
import { versiyaNomi } from './smeta-yuklash/xulosa';
import { davaXlsx, type DavaEksportQator } from '../../lib/smeta-versiya/dava-export';
import { son, type JPozitsiya, type MoslikHolat, type MoslikQator, type PozitsiyaQator, type Qaror, type SmetaVersiya, type Tasdiq, type VersiyaTur } from '../../lib/smeta-versiya/turlar';
import { bosKatKesim, type KatKesim } from '../../lib/ustamali-summa';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { NDS_SUKUT_FOIZ } from '../../lib/nakopitelniy-vedomost-export';
import type { ImzoNomlar } from '../../lib/hujjat-yozuvchi';
import { FmtN } from '../../lib/format';
import { qidiruvdaBor } from '../../i18n/lotin-kirill';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { useUstamaliSumma } from '../../umumiy/ui/useUstamaliSumma';

const SAHIFA = 100;
const POZ_BOLAK = 400;
const MOSLIK_BOLAK = 1000;

const TUR_NOMI: Record<VersiyaTur, string> = {
  dastlabki: 'Dastlabki smeta', ekspertizaga_topshirilgan: 'Ekspertizaga topshirilgan (ekspertizagacha)', ekspertiza: 'Ekspertiza xulosasi bo‘yicha',
  korrektirovka: 'Korrektirovka', boshqa: 'Boshqa versiya',
};
const holatNomi = (h: MoslikHolat) => ({
  ozgarmagan: t('O‘zgarmagan'), kamaygan: t('Kamaygan'), oshgan: t('Oshgan'), almashtirilgan: t('Almashtirilgan (zamena)'),
  ochirilgan: t('O‘chirilgan'), yangi: t('Yangi'), noaniq: t('Noaniq moslik'),
})[h];
const HOLAT_RANG: Record<MoslikHolat, string> = {
  ozgarmagan: 'text-text-mute', kamaygan: 'text-danger', oshgan: 'text-success', almashtirilgan: 'text-warn', ochirilgan: 'text-danger', yangi: 'text-accent', noaniq: 'text-warn',
};
const qarorNomi = (q: Qaror) => ({ kutilmoqda: t('Qaror yo‘q'), qurilgan: t('Qurilgan'), qurilmagan: t('Qurilmagan'), qisman: t('Qisman') })[q];

type Ozgarish = { qaror?: Qaror; qurilgan_hajm?: number | null; tasdiq?: 'tasdiqlandi' | 'rad'; izoh?: string };
type Qator = {
  m: MoslikQator; e: PozitsiyaQator | null; j: JPozitsiya | null;
  qaror: Qaror; tasdiq: Tasdiq; qurilganHajm: number | null; eskiHajm: number | null; joriyHajm: number | null;
  kerak: boolean; pul: QatorPul; bolim: string; matn: string;
};

const bolimKalit = (kod: string | null | undefined, nom: string | null | undefined) => [kod, nom].filter(Boolean).join(' ') || '—';

export function SmetaVersiyaFarq({ kompaniyaId, obyektId, obyektNom, joriyQatorlar, tomonlar, boshlangichFayl = null }: {
  kompaniyaId: number; obyektId: number; obyektNom: string; joriyQatorlar: readonly T2Qator[]; tomonlar: ImzoNomlar;
  /** Yuklash ustasidan kelgan fayl: forma oldindan to'ldiriladi (foydalanuvchi qayta tanlamaydi). */
  boshlangichFayl?: File | null;
}) {
  const [versiyalar, setVersiyalar] = useState<SmetaVersiya[] | null>(null);
  const [tanlangan, setTanlangan] = useState<number | null>(null);
  const [poz, setPoz] = useState<PozitsiyaQator[] | null>(null);
  const [mos, setMos] = useState<MoslikQator[] | null>(null);
  const [band, setBand] = useState('');
  const [xato, setXato] = useState('');
  // Yuklash shakli
  const [fayllar, setFayllar] = useState<File[]>([]);
  const [nom, setNom] = useState('');
  const [tur, setTur] = useState<VersiyaTur>('ekspertizaga_topshirilgan');
  const [manbaSana, setManbaSana] = useState('');
  const yuklashIdlar = useRef<string[]>([]);
  // Filtr / ko'rinish
  const [holatF, setHolatF] = useState<'kerak' | 'hammasi' | MoslikHolat>('kerak');
  const [bolimF, setBolimF] = useState('');
  const [qidiruv, setQidiruv] = useState('');
  const [tartib, setTartib] = useState<'kesilgan' | 'dava' | 'tartib'>('kesilgan');
  const [sahifa, setSahifa] = useState(0);
  const [fokus, setFokus] = useState(0);
  const [ozgarish, setOzgarish] = useState<Map<number, Ozgarish>>(new Map());
  const saqlashId = useRef(yangiOperationId());
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [nds, setNds] = useState(String(NDS_SUKUT_FOIZ));
  const jadval = useRef<HTMLTableSectionElement>(null);
  const ustama = useUstamaliSumma(obyektId, { kompaniyaId });

  const royxatYukla = useCallback(async () => {
    const r = await versiyalarOl(obyektId);
    if (!r.ok) { setXato(t('Versiyalar ro‘yxati o‘qilmadi.')); return; }
    const v = r.qatorlar ?? [];
    setVersiyalar(v);
    setTanlangan((x) => (x != null && v.some((y) => y.id === x) ? x : v.find((y) => y.holat === 'tayyor')?.id ?? null));
  }, [obyektId]);
  useEffect(() => { void royxatYukla(); }, [royxatYukla]);

  const versiya = versiyalar?.find((v) => v.id === tanlangan) ?? null;

  const tafsilotYukla = useCallback(async (id: number) => {
    setBand(t('Versiya pozitsiyalari o‘qilmoqda…')); setXato('');
    try {
      const [p, m] = await Promise.all([pozitsiyalarOl(id), mosliklarOl(id)]);
      if (!p.ok || p.toliq === false || !m.ok || m.toliq === false) { setXato(t('Versiya ma’lumoti to‘liq o‘qilmadi — chala ma’lumot ustida hisoblanmaydi.')); setPoz(null); setMos(null); return; }
      setPoz(p.qatorlar ?? []); setMos(m.qatorlar ?? []); setOzgarish(new Map()); setSahifa(0); setFokus(0);
    } finally { setBand(''); }
  }, []);
  useEffect(() => { if (versiya?.holat === 'tayyor') void tafsilotYukla(versiya.id); else { setPoz(null); setMos(null); } }, [versiya?.id, versiya?.holat, tafsilotYukla]);

  /* ── Joriy smeta: pozitsiyalar va narx katalogi (HolatNative allaqachon o'qigan daraxt) ── */
  const joriyRows = joriyQatorlar as unknown as JQator[];
  const joriy = useMemo(() => qatorlardanPozitsiyalar(joriyRows), [joriyRows]);
  const katalog = useMemo(() => katalogQur(joriyRows), [joriyRows]);
  const joriyById = useMemo(() => new Map(joriy.pozitsiyalar.map((p) => [p.qatorId, p])), [joriy]);

  /* ── Yuklash: fayl(lar) → anatomiya → pozitsiyalar → moslash → bazaga (bo'laklab, idempotent) ── */
  useEffect(() => { if (boshlangichFayl) setFayllar([boshlangichFayl]); }, [boshlangichFayl]);
  /** Nom: foydalanuvchi yozgan yorliq yoki sana — fayl nomi bilan aralashtirilmaydi. */
  const versiyaNomiHozir = versiyaNomi(nom);
  const yukla = async () => {
    if (!fayllar.length || band) return;
    setXato(''); setBand(t('Fayllar o‘qilmoqda…'));
    try {
      const kitoblar = [];
      for (const f of fayllar) {
        const wb = await readXlsxFonda(await f.arrayBuffer());
        kitoblar.push(kitobAnatomiyasi({ fayl: f.name, varaqlar: wb.sheets.map((s) => ({ nom: s.name, rows: s.rows as never, merges: s.merges })) }));
      }
      const { pozitsiyalar, ogohlar } = anatomiyadanPozitsiyalar(kitoblar);
      if (!pozitsiyalar.length) { setXato(t('Faylda smeta pozitsiyalari topilmadi.')); return; }
      setBand(t('Joriy smeta bilan moslanmoqda…'));
      const takliflar = versiyaMoslash(pozitsiyalar, joriy.pozitsiyalar);
      const posBolak = Math.ceil(pozitsiyalar.length / POZ_BOLAK);
      const mosBolak = Math.ceil(takliflar.length / MOSLIK_BOLAK);
      const kerak = 1 + posBolak + mosBolak + 1;
      if (yuklashIdlar.current.length !== kerak) yuklashIdlar.current = Array.from({ length: kerak }, () => yangiOperationId());
      const ids = yuklashIdlar.current;
      const tekshir = (r: VersiyaNatija) => { if (!r.ok) throw new Error(versiyaXatoMatni(r)); return r; };
      setBand(t('Versiya yaratilmoqda…'));
      const y = tekshir(await versiyaYarat({ kompaniyaId, obyektId, nom: versiyaNomiHozir, tur, manbaSana: manbaSana || null,
        fayllar: fayllar.map((f) => ({ nom: f.name, hajm: f.size })), izoh: ogohlar.slice(0, 20).join('\n') || undefined, operationId: ids[0] }));
      const vid = Number(y.versiya_id);
      for (let i = 0; i < posBolak; i++) {
        setBand(t('Pozitsiyalar yozilmoqda: {i} / {n}', { i: String(i + 1), n: String(posBolak) }));
        tekshir(await pozitsiyaYoz({ kompaniyaId, versiyaId: vid, pozitsiyalar: pozitsiyalar.slice(i * POZ_BOLAK, (i + 1) * POZ_BOLAK), operationId: ids[1 + i] }));
      }
      const yuk: MoslikYuk[] = takliflar.map((m) => {
        const e = m.eski != null ? pozitsiyalar[m.eski] : null; const j = m.joriy != null ? joriy.pozitsiyalar[m.joriy] : null;
        return { tartib: e?.tartib ?? null, qator_id: j?.qatorId ?? null, holat: m.holat, ishonch: m.ishonch, usul: m.usul, birlik_farq: m.birlikFarq,
          eski_hajm: e?.hajm ?? null, joriy_hajm: j?.hajm ?? null, joriy_kod: j?.kod ?? null, joriy_nom: j?.nom ?? null, joriy_birlik: j?.birlik ?? null };
      });
      for (let i = 0; i < mosBolak; i++) {
        setBand(t('Moslik yozilmoqda: {i} / {n}', { i: String(i + 1), n: String(mosBolak) }));
        tekshir(await moslikYoz({ kompaniyaId, versiyaId: vid, mosliklar: yuk.slice(i * MOSLIK_BOLAK, (i + 1) * MOSLIK_BOLAK), yakunla: false, operationId: ids[1 + posBolak + i] }));
      }
      tekshir(await moslikYoz({ kompaniyaId, versiyaId: vid, mosliklar: [], yakunla: true, operationId: ids[kerak - 1] }));
      yuklashIdlar.current = [];
      toast(t('Versiya yuklandi: {n} pozitsiya. Noaniq mosliklarni tasdiqlang va kesilgan pozitsiyalar bo‘yicha qaror qo‘ying.', { n: String(pozitsiyalar.length) }), 'ok', undefined, 10000);
      setFayllar([]); setNom('');
      setTanlangan(vid);
      await royxatYukla();
    } catch (e) {
      setXato(`${e instanceof Error ? e.message : String(e)} ${t('— «Yuklash» ni qayta bosing: allaqachon yozilgan bo‘laklar takrorlanmaydi.')}`);
    } finally { setBand(''); }
  };

  /* ── Qatorlar (moslik + pozitsiya + joriy + pul) ── */
  const pozMap = useMemo(() => new Map((poz ?? []).map((p) => [p.id, p])), [poz]);
  const eskiPul = useMemo(() => new Map((poz ?? []).map((p) => [p.id, pozitsiyaPul({ kod: p.kod, nom: p.nom, birlik: p.birlik, hajm: son(p.hajm), resurslar: p.resurslar ?? [] }, katalog)])), [poz, katalog]);
  const joriyPul = useMemo(() => new Map(joriy.pozitsiyalar.map((p) => [p.qatorId, pozitsiyaPul(p, katalog)])), [joriy, katalog]);

  const qatorlar: Qator[] = useMemo(() => (mos ?? []).map((m) => {
    const oz = ozgarish.get(m.id);
    const e = m.pozitsiya_id != null ? pozMap.get(m.pozitsiya_id) ?? null : null;
    const j = m.qator_id != null ? joriyById.get(m.qator_id) ?? null : null;
    const qaror = oz?.qaror ?? m.qaror;
    const qurilganHajm = oz && 'qurilgan_hajm' in oz ? oz.qurilgan_hajm ?? null : son(m.qurilgan_hajm);
    const eskiHajm = son(m.eski_hajm); const joriyHajm = son(m.joriy_hajm);
    const x = { holat: m.holat, qaror, eskiHajm, qurilganHajm, joriyHajm, birlikFarq: m.birlik_farq };
    const pul = qatorPul(x, e ? eskiPul.get(e.id) ?? null : null, m.qator_id != null ? joriyPul.get(m.qator_id) ?? null : null);
    const kerak = qarorKerak(x) || m.tasdiq === 'kutilmoqda';
    const bolim = e ? bolimKalit(e.ls_kod, e.ls_nom) : bolimKalit(j?.lsKod, j?.lsNom);
    const matn = [e?.kod, e?.nom, m.joriy_kod, m.joriy_nom, e?.blok, e?.razdel].filter(Boolean).join(' ');
    return { m, e, j, qaror, tasdiq: oz?.tasdiq ?? m.tasdiq, qurilganHajm, eskiHajm, joriyHajm, kerak, pul, bolim, matn };
  }), [mos, ozgarish, pozMap, joriyById, eskiPul, joriyPul]);

  const bolimlar = useMemo(() => {
    const map = new Map<string, BolimJami>();
    const jami = bosBolim('jami', null, t('Jami'));
    for (const q of qatorlar) {
      const b = map.get(q.bolim) ?? bosBolim(q.bolim, q.e?.ls_kod ?? q.j?.lsKod ?? null, q.e?.ls_nom ?? q.j?.lsNom ?? null);
      const x = { holat: q.m.holat, qaror: q.qaror, qarorKerak: q.kerak };
      bolimgaQosh(b, q.pul, x); bolimgaQosh(jami, q.pul, x);
      map.set(q.bolim, b);
    }
    return { royxat: [...map.values()].sort((a, b) => b.kesilgan - a.kesilgan), jami };
  }, [qatorlar]);

  const korinadigan = useMemo(() => {
    const r = qatorlar.filter((q) => (holatF === 'hammasi' ? true : holatF === 'kerak' ? q.kerak : q.m.holat === holatF)
      && (!bolimF || q.bolim === bolimF) && (!qidiruv.trim() || qidiruvdaBor(q.matn, qidiruv)));
    if (tartib === 'kesilgan') r.sort((a, b) => (a.pul.farq ?? 0) - (b.pul.farq ?? 0));
    else if (tartib === 'dava') r.sort((a, b) => (b.pul.dava ?? -1) - (a.pul.dava ?? -1));
    else r.sort((a, b) => (a.e?.tartib ?? 1e9) - (b.e?.tartib ?? 1e9) || a.m.id - b.m.id);
    return r;
  }, [qatorlar, holatF, bolimF, qidiruv, tartib]);
  const sahifaSoni = Math.max(1, Math.ceil(korinadigan.length / SAHIFA));
  const sahifaQatorlari = korinadigan.slice(sahifa * SAHIFA, (sahifa + 1) * SAHIFA);

  /* ── Qaror / tasdiq (mahalliy, keyin «Saqlash») ── */
  const ozgartir = (id: number, o: Ozgarish) => setOzgarish((prev) => { const n = new Map(prev); n.set(id, { ...n.get(id), ...o }); return n; });
  const qarorQoy = (q: Qator, qaror: Qaror) => {
    if (!q.e) return;
    if (qaror === 'qisman') ozgartir(q.m.id, { qaror, qurilgan_hajm: q.qurilganHajm ?? q.eskiHajm ?? null });
    else ozgartir(q.m.id, { qaror, qurilgan_hajm: null });
  };
  const fokusla = (i: number) => {
    const n = Math.max(0, Math.min(sahifaQatorlari.length - 1, i));
    setFokus(n);
    (jadval.current?.querySelectorAll('tr[data-qator]')[n] as HTMLTableRowElement | undefined)?.focus();
  };
  const klaviatura = (ev: KeyboardEvent<HTMLTableSectionElement>) => {
    if ((ev.target as HTMLElement).tagName === 'INPUT' && ev.key !== 'Escape') return;
    const q = sahifaQatorlari[fokus];
    const k = ev.key.toLowerCase();
    if (ev.key === 'ArrowDown') { ev.preventDefault(); fokusla(fokus + 1); return; }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); fokusla(fokus - 1); return; }
    if (!q) return;
    if (k === 'h') { qarorQoy(q, 'qurilgan'); fokusla(fokus + 1); }
    else if (k === 'y') { qarorQoy(q, 'qurilmagan'); fokusla(fokus + 1); }
    else if (k === 'q') { ev.preventDefault(); qarorQoy(q, 'qisman'); setTimeout(() => (jadval.current?.querySelector(`input[data-hajm="${q.m.id}"]`) as HTMLInputElement | null)?.select(), 0); }
    else if (k === '0') qarorQoy(q, 'kutilmoqda');
    else if (k === 't' && q.e && q.j) { ozgartir(q.m.id, { tasdiq: 'tasdiqlandi' }); fokusla(fokus + 1); }
    else if (k === 'r' && q.e && q.m.qator_id != null) { ozgartir(q.m.id, { tasdiq: 'rad' }); fokusla(fokus + 1); }
  };

  const saqla = async () => {
    if (!versiya || !ozgarish.size || saqlanmoqda) return;
    const byId = new Map((mos ?? []).map((m) => [m.id, m]));
    const yuk: QarorYuk[] = [];
    for (const [id, o] of ozgarish) {
      const m = byId.get(id); if (!m) continue;
      const x: QarorYuk = { moslik_id: id, kutilgan_versiya: m.versiya };
      if (o.tasdiq) x.tasdiq = o.tasdiq;
      if (o.qaror) {
        x.qaror = o.qaror;
        if (o.qaror === 'qisman') { if (o.qurilgan_hajm == null || !(o.qurilgan_hajm >= 0)) { toast(t('«Qisman» qarorida qurilgan hajmni kiriting.'), 'warn'); return; } x.qurilgan_hajm = o.qurilgan_hajm; }
      }
      if (o.izoh != null) x.izoh = o.izoh;
      yuk.push(x);
    }
    setSaqlanmoqda(true);
    try {
      const r = await qarorYoz({ kompaniyaId, versiyaId: versiya.id, qarorlar: yuk.slice(0, 2000), operationId: saqlashId.current });
      if (!r.ok) {
        toast(versiyaXatoMatni(r), 'danger');
        if (r.code === 'VERSIYA_ZIDDIYAT') { saqlashId.current = yangiOperationId(); await tafsilotYukla(versiya.id); }
        return;
      }
      saqlashId.current = yangiOperationId();
      toast(t('{n} ta qator saqlandi.', { n: String(yuk.length) }), 'ok');
      await tafsilotYukla(versiya.id);
    } finally { setSaqlanmoqda(false); }
  };

  const bekorQil = async () => {
    if (!versiya || !window.confirm(t('«{nom}» versiyasi bekor qilinadi (o‘chirilmaydi, ro‘yxatdan yashiriladi). Davom etasizmi?', { nom: versiya.nom }))) return;
    const r = await versiyaBekor({ kompaniyaId, versiyaId: versiya.id, operationId: yangiOperationId() });
    if (!r.ok) { toast(versiyaXatoMatni(r), 'danger'); return; }
    setTanlangan(null); await royxatYukla();
  };

  /* ── Da'vo ro'yxati (Excel, token bilan) ── */
  const ndsFoiz = (() => { const x = Number(nds.replace(',', '.')); return nds.trim() !== '' && Number.isFinite(x) && x >= 0 ? x : null; })();
  const ustamali = (k: KatKesim) => { const u = ustama.hisobla(k); return u?.ustamali == null ? null : u.ustamali + u.nomalum.summa; };
  const davaQatorlari = qatorlar.filter((q) => q.qaror === 'qurilgan' || q.qaror === 'qisman');
  const excel = async () => {
    if (!versiya || !davaQatorlari.length) { toast(t('Talablar ro‘yxati bo‘sh — avval qatorlarga «qurilgan» yoki «qisman» deb belgi qo‘ying.'), 'warn'); return; }
    if (ozgarish.size) { toast(t('Avval o‘zgarishlarni saqlang.'), 'warn'); return; }
    const rows: DavaEksportQator[] = davaQatorlari.map((q) => ({
      lsKod: q.e?.ls_kod ?? null, lsNom: q.e?.ls_nom ?? null, kod: q.e?.kod ?? null, nom: q.e?.nom ?? '', birlik: q.e?.birlik ?? null,
      eskiHajm: q.eskiHajm, joriyHajm: q.m.holat === 'ochirilgan' ? null : q.joriyHajm, qurilganHajm: q.qaror === 'qurilgan' ? q.eskiHajm : q.qurilganHajm,
      davaHajm: q.pul.davaHajm, dava: q.pul.dava, holat: q.m.holat, izoh: q.m.qaror_izoh,
    }));
    const kesim = davaQatorlari.reduce((k, q) => (q.pul.davaKesim ? kesimQosh(k, q.pul.davaKesim) : k), bosKatKesim());
    try {
      const h = davaXlsx(rows, { obyektNomi: obyektNom, versiyaNomi: versiya.nom, versiyaSanasi: versiya.manba_sana, imzo: tomonlar, ndsFoiz, ustamali: ustamali(kesim) });
      const r = await hujjatTokenBilan({ kompaniyaId, bytes: h.bytes, hujjat: 'SMETA_DAVA', sabab: `Претензия по экспертизе · ${obyektNom}`, obyekt: obyektId },
        () => downloadBlob(h.bytes, h.faylNomi));
      if (!r.ok) toast(r.xabar, 'danger'); else if (r.xabar) toast(r.xabar, 'ok');
    } catch { toast(t('Excel fayli tuzilmadi.'), 'danger'); }
  };

  const kutilayotgan = qatorlar.filter((q) => q.kerak && q.qaror === 'kutilmoqda').length;
  const tasdiqKutilmoqda = qatorlar.filter((q) => q.tasdiq === 'kutilmoqda').length;
  const yangilarSoni = qatorlar.filter((q) => q.m.holat === 'yangi').length;

  return (
    <div className="space-y-3 text-[13px]" data-testid="smeta-versiya-farq">
      <p className="text-[12px] text-text-dim">{t('Boshqa smeta versiyasini (masalan, ekspertizagacha bo‘lgan smeta) yuklang — tizim uni joriy smeta bilan pozitsiya bo‘yicha solishtiradi. Joriy smeta o‘zgarmaydi; ekspertiza qisqartirgan, lekin qurilgan hajm «talab» sifatida alohida hisoblanadi.')}</p>
      <p className="text-[12px] text-text-dim" data-testid="versiya-izoh">{t('«Eski versiya» — siz yuklagan fayl. «Yangi versiya» — tizimdagi joriy smeta. Farq: eskisidan yangisiga nima o‘zgardi.')}</p>

      <section className="karta p-3 space-y-2" aria-label={t('Versiya yuklash')}>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[12px]">{t('Smeta fayl(lar)i')}
            <input aria-label={t('Versiya fayllari')} type="file" multiple accept=".xls,.xlsx,.xlsm" className="ml-2" disabled={!!band}
              onChange={(e) => { setFayllar(Array.from(e.target.files ?? [])); }} />
            {fayllar.length > 0 && <span className="ml-2 text-text-mute">{fayllar.map((f) => f.name).join(', ')}</span>}
          </label>
          <label className="text-[12px]">{t('Versiya yorlig‘i (ixtiyoriy)')}<input className="ml-1 w-56 border rounded px-2 py-1" value={nom} placeholder={versiyaNomi('')} onChange={(e) => setNom(e.target.value)} /></label>
          <label className="text-[12px]">{t('Turi')}
            <select className="ml-1 border rounded px-2 py-1" value={tur} onChange={(e) => setTur(e.target.value as VersiyaTur)}>
              {(Object.keys(TUR_NOMI) as VersiyaTur[]).map((k) => <option key={k} value={k}>{t(TUR_NOMI[k])}</option>)}
            </select></label>
          <label className="text-[12px]">{t('Manba sanasi')}<input type="date" className="ml-1 border rounded px-2 py-1" value={manbaSana} onChange={(e) => setManbaSana(e.target.value)} /></label>
          <button type="button" className="tugma tugma-asosiy inline-flex items-center gap-1.5" disabled={!fayllar.length || !!band} onClick={() => void yukla()}>
            <Upload size={14} /> {t('Yuklash va solishtirish')}
          </button>
        </div>
        {joriy.eskiChiqarildi > 0 && <p className="text-[11px] text-warn">{t('Joriy smetadagi «(ekspertizagacha)» bo‘limlaridagi {n} ta qator solishtirishga kirmaydi (eski smeta shu daraxtga qo‘shilgan).', { n: String(joriy.eskiChiqarildi) })}</p>}
      </section>

      {band && <p role="status" className="text-[12px]">{band}</p>}
      {xato && <p role="alert" className="flex items-center gap-1.5 text-danger text-[12px]"><AlertTriangle size={14} /> {xato}</p>}

      {versiyalar && versiyalar.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[12px]">{t('Eski versiya')}
            <select className="ml-2 border rounded px-2 py-1 max-w-[420px]" value={tanlangan ?? ''} onChange={(e) => setTanlangan(e.target.value ? Number(e.target.value) : null)}>
              {versiyalar.map((v) => <option key={v.id} value={v.id}>{v.nom} · {t(TUR_NOMI[v.tur])}{v.manba_sana ? ` · ${v.manba_sana}` : ''}{v.holat !== 'tayyor' ? ` · ${t('chala yuklangan')}` : ''}</option>)}
            </select></label>
          {versiya && <button type="button" className="tugma inline-flex items-center gap-1" onClick={() => void tafsilotYukla(versiya.id)}><RefreshCw size={13} /> {t('Yangilash')}</button>}
          {versiya && <button type="button" className="tugma" onClick={() => void bekorQil()}>{t('Versiyani bekor qilish')}</button>}
          {versiya?.holat === 'yuklanmoqda' && <span className="text-warn text-[12px]">{t('Bu versiya oxirigacha yuklanmagan — fayllarni qayta yuklang yoki bekor qiling.')}</span>}
        </div>
      )}
      {versiyalar && !versiyalar.length && <p className="text-text-mute">{t('Bu obyektda hali boshqa smeta versiyasi yuklanmagan. Yuqoridagi maydondan ikkinchi (masalan, ekspertizagacha bo‘lgan) smeta faylini yuklang — tizim farqini ko‘rsatadi.')}</p>}

      {versiya?.tur === 'dastlabki' && versiya.holat === 'tayyor' && mos && (
        <FaollashtirishFarqiPanel kompaniyaId={kompaniyaId} obyektId={obyektId} versiya={versiya} mosliklar={mos} joriyQatorlar={joriyQatorlar} />
      )}

      {versiya?.holat === 'tayyor' && poz && mos && (
        <>
          <section className="karta overflow-auto" aria-label={t('Bo‘limlar bo‘yicha farq')}>
            <table className="w-full text-[12px]">
              <thead className="bg-surface-2 text-text-mute"><tr>
                <th className="px-2 py-1 text-left">{t('Bo‘lim (lokal smeta)')}</th>
                <th className="px-2 text-right">{t('Eski versiya')}</th><th className="px-2 text-right">{t('Yangi versiya (joriy smeta)')}</th>
                <th className="px-2 text-right">{t('Kesilgan')}</th><th className="px-2 text-right">{t('Oshgan')}</th>
                <th className="px-2 text-right">{t('Talab (qurilgan)')}</th><th className="px-2 text-right">{t('Qaror kutilmoqda')}</th>
              </tr></thead>
              <tbody>
                {[...bolimlar.royxat.filter((b) => b.kesilgan > 0 || b.oshgan > 0 || b.dava > 0).slice(0, 80), bolimlar.jami].map((b) => (
                  <tr key={b.kalit} className={`border-t border-border/50 ${b.kalit === 'jami' ? 'font-semibold' : 'cursor-pointer hover:bg-surface-2/40'}`}
                    onClick={() => { if (b.kalit !== 'jami') { setBolimF(b.kalit === bolimF ? '' : b.kalit); setSahifa(0); } }}>
                    <td className="px-2 py-1">{b.kalit === 'jami' ? t('Jami') : b.kalit}{bolimF === b.kalit ? ' ✓' : ''}</td>
                    <td className="px-2 text-right tabular-nums"><FmtN val={b.eski} /></td>
                    <td className="px-2 text-right tabular-nums"><FmtN val={b.joriy} /></td>
                    <td className="px-2 text-right text-danger"><SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={b.kesilgan} katKesim={b.kesilganKesim} kichik /></td>
                    <td className="px-2 text-right tabular-nums text-success"><FmtN val={b.oshgan} /></td>
                    <td className="px-2 text-right"><SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={b.dava} katKesim={b.davaKesim} kichik /></td>
                    <td className="px-2 text-right tabular-nums">{b.qarorKutilmoqda || '—'}{b.noaniq ? <span className="ml-1 text-warn">({t('noaniq')}: {b.noaniq})</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-2 py-1 text-[11px] text-text-mute">{t('Summalar QQS siz; eski va joriy pozitsiya bir xil narx katalogi (joriy smeta) bilan narxlangan — farq hajm va tarkibdan. Narxi topilmagan resurslar summaga 0 bo‘lib kirmaydi.')}
              {bolimlar.jami.narxsiz > 0 && ` ${t('Narxi to‘liq bo‘lmagan pozitsiyalar: {n}.', { n: String(bolimlar.jami.narxsiz) })}`}
              {yangilarSoni > 0 && ` ${t('Joriy smetada yangi pozitsiyalar: {n}.', { n: String(yangilarSoni) })}`}</p>
          </section>

          <div className="flex flex-wrap items-end gap-2 text-[12px]">
            <label>{t('Holat')}
              <select className="ml-1 border rounded px-2 py-1" value={holatF} onChange={(e) => { setHolatF(e.target.value as typeof holatF); setSahifa(0); setFokus(0); }}>
                <option value="kerak">{t('Qaror / tasdiq kerak')}</option><option value="hammasi">{t('Hammasi')}</option>
                {(['kamaygan', 'ochirilgan', 'almashtirilgan', 'noaniq', 'oshgan', 'yangi', 'ozgarmagan'] as MoslikHolat[]).map((h) => <option key={h} value={h}>{holatNomi(h)}</option>)}
              </select></label>
            <label>{t('Bo‘lim')}
              <select className="ml-1 border rounded px-2 py-1 max-w-[320px]" value={bolimF} onChange={(e) => { setBolimF(e.target.value); setSahifa(0); }}>
                <option value="">{t('Hammasi')}</option>
                {bolimlar.royxat.map((b) => <option key={b.kalit} value={b.kalit}>{b.kalit}</option>)}
              </select></label>
            <label>{t('Tartib')}
              <select className="ml-1 border rounded px-2 py-1" value={tartib} onChange={(e) => setTartib(e.target.value as typeof tartib)}>
                <option value="kesilgan">{t('Eng ko‘p kesilgan')}</option><option value="dava">{t('Eng katta talab')}</option><option value="tartib">{t('Fayldagi tartib')}</option>
              </select></label>
            <input className="border rounded px-2 py-1 w-56" placeholder={t('Shifr yoki nom bo‘yicha qidirish')} value={qidiruv} onChange={(e) => { setQidiruv(e.target.value); setSahifa(0); }} />
            <span className="text-text-mute">{t('Qaror kutilmoqda: {n} · tasdiq kutilmoqda: {m}', { n: String(kutilayotgan), m: String(tasdiqKutilmoqda) })}</span>
            <button type="button" className="tugma tugma-asosiy inline-flex items-center gap-1 ml-auto" disabled={!ozgarish.size || saqlanmoqda} onClick={() => void saqla()}>
              <Save size={13} /> {t('Saqlash')} ({ozgarish.size})</button>
            <label>{t('QQS, %')}<input className="ml-1 w-14 border rounded px-2 py-1" value={nds} onChange={(e) => setNds(e.target.value)} /></label>
            <button type="button" className="tugma inline-flex items-center gap-1" onClick={() => void excel()}><Download size={13} /> {t('Talablar ro‘yxati (Excel)')}</button>
          </div>
          <p className="text-[11px] text-text-mute">{t('Klaviatura: ↑/↓ — qator; H — qurilgan; Y — qurilmagan; Q — qisman (hajm kiriting); 0 — qarorni olib tashlash; T — moslikni tasdiqlash; R — moslik noto‘g‘ri (ajratish); Ctrl+S — saqlash.')}</p>

          <div className="karta overflow-auto max-h-[62vh]">
            <table className="w-full border-collapse text-[11.5px]" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void saqla(); } }}>
              <thead className="sticky top-0 z-[1] bg-surface-2 text-text-mute"><tr>
                <th className="px-2 py-1 text-left">{t('Holat')}</th><th className="px-2 text-left">{t('Pozitsiya (eski → joriy)')}</th><th className="px-2">{t('Birlik')}</th>
                <th className="px-2 text-right">{t('Eski versiya hajmi')}</th><th className="px-2 text-right">{t('Yangi (joriy) versiya hajmi')}</th><th className="px-2 text-right">{t('Farq (ustamasiz)')}</th>
                <th className="px-2 text-left">{t('Qaror')}</th><th className="px-2 text-right">{t('Qurilgan hajm')}</th><th className="px-2 text-right">{t('Talab (ustamasiz)')}</th>
              </tr></thead>
              <tbody ref={jadval} onKeyDown={klaviatura}>
                {sahifaQatorlari.map((q, i) => (
                  <Fragment key={q.m.id}>
                    <tr data-qator tabIndex={0} onFocus={() => setFokus(i)}
                      className={`border-t border-border/50 outline-none focus:bg-accent/10 ${ozgarish.has(q.m.id) ? 'bg-warn/5' : ''}`}>
                      <td className={`px-2 py-1 ${HOLAT_RANG[q.m.holat]}`}>{holatNomi(q.m.holat)}{q.m.ishonch != null && q.m.ishonch < 100 ? ` · ${t('moslik ishonchi')} ${q.m.ishonch}%` : ''}
                        {q.tasdiq === 'kutilmoqda' && <div className="text-warn">{t('tasdiq kutilmoqda')}</div>}
                        {q.tasdiq === 'tasdiqlandi' && <div className="text-success">{t('tasdiqlangan')}</div>}
                        {q.tasdiq === 'rad' && <div className="text-danger">{t('rad etilgan')}</div>}</td>
                      <td className="px-2">
                        {q.e ? <div>{q.e.kod ? <b>{q.e.kod} </b> : null}{q.e.nom}</div> : null}
                        {q.m.qator_id != null && (!q.e || q.m.joriy_kod !== q.e.kod || q.m.joriy_nom !== q.e.nom) && <div className="text-text-dim">→ {q.m.joriy_kod ? <b>{q.m.joriy_kod} </b> : null}{q.m.joriy_nom}</div>}
                        <div className="text-[10px] text-text-mute">{[q.bolim, q.e?.razdel, q.e?.blok].filter(Boolean).join(' › ')}{q.m.usul ? ` · ${q.m.usul}` : ''}</div>
                      </td>
                      <td className="px-2 text-center">{q.e?.birlik ?? q.m.joriy_birlik ?? '—'}{q.m.birlik_farq && <div className="text-warn">→ {q.m.joriy_birlik}</div>}</td>
                      <td className="px-2 text-right tabular-nums"><FmtN val={q.eskiHajm} kasr={3} /></td>
                      <td className="px-2 text-right tabular-nums"><FmtN val={q.m.holat === 'ochirilgan' ? null : q.joriyHajm} kasr={3} /></td>
                      <td className={`px-2 text-right tabular-nums ${(q.pul.farq ?? 0) < 0 ? 'text-danger' : (q.pul.farq ?? 0) > 0 ? 'text-success' : ''}`}><FmtN val={q.pul.farq} />
                        {((q.pul.eski?.narxsiz ?? 0) + (q.pul.joriy?.narxsiz ?? 0)) > 0 && <div className="text-[10px] text-warn">{t('narx to‘liq emas')}</div>}</td>
                      <td className="px-2">
                        {q.e ? (
                          <span className="inline-flex gap-1" role="group" aria-label={t('Qaror')}>
                            {(['qurilgan', 'qurilmagan', 'qisman'] as Qaror[]).map((k) => (
                              <button type="button" key={k} tabIndex={-1} aria-pressed={q.qaror === k} onClick={() => qarorQoy(q, q.qaror === k ? 'kutilmoqda' : k)}
                                className={`rounded border px-1.5 py-0.5 ${q.qaror === k ? 'border-accent bg-accent text-white' : 'border-border'}`}>{qarorNomi(k)}</button>
                            ))}
                            {q.e && q.m.qator_id != null && q.tasdiq === 'kutilmoqda' && <>
                              <button type="button" tabIndex={-1} className="rounded border border-border px-1.5 py-0.5" onClick={() => ozgartir(q.m.id, { tasdiq: 'tasdiqlandi' })}>{t('Mos')}</button>
                              <button type="button" tabIndex={-1} className="rounded border border-border px-1.5 py-0.5" onClick={() => ozgartir(q.m.id, { tasdiq: 'rad' })}>{t('Mos emas')}</button>
                            </>}
                          </span>
                        ) : <span className="text-text-mute">{t('yangi pozitsiya')}</span>}
                      </td>
                      <td className="px-2 text-right">
                        {q.qaror === 'qisman'
                          ? <input data-hajm={q.m.id} aria-label={t('Qurilgan hajm')} className="w-24 border rounded px-1 py-0.5 text-right" inputMode="decimal"
                            value={q.qurilganHajm ?? ''} onChange={(e) => { const x = e.target.value.replace(',', '.').trim(); ozgartir(q.m.id, { qurilgan_hajm: x === '' ? null : Number(x) }); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); fokusla(i + 1); } }} />
                          : q.qaror === 'qurilgan' ? <FmtN val={q.eskiHajm} kasr={3} /> : '—'}
                      </td>
                      <td className="px-2 text-right tabular-nums font-semibold">{q.pul.davaHajm == null ? (q.qaror === 'qurilgan' || q.qaror === 'qisman' ? <span className="text-warn" title={t('Birlik farq qiladi yoki joriy hajm noma’lum — talab hajmi aniqlanmadi')}>?</span> : '—') : <FmtN val={q.pul.dava} />}</td>
                    </tr>
                  </Fragment>
                ))}
                {!sahifaQatorlari.length && <tr><td colSpan={9} className="px-2 py-3 text-text-mute">{t('Filtrga mos qator yo‘q.')}</td></tr>}
              </tbody>
            </table>
          </div>
          {sahifaSoni > 1 && (
            <div className="flex items-center gap-2 text-[12px]">
              <button type="button" disabled={sahifa === 0} onClick={() => { setSahifa((p) => p - 1); setFokus(0); }} className="tugma">{t('Oldingi')}</button>
              <span>{sahifa + 1} / {sahifaSoni} · {korinadigan.length}</span>
              <button type="button" disabled={sahifa + 1 >= sahifaSoni} onClick={() => { setSahifa((p) => p + 1); setFokus(0); }} className="tugma">{t('Keyingi')}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * FAOLLASHTIRILGAN VERSIYA (egasi 2026-10-29): `t2_smeta_versiya_faollashtir_v1` eski smetani 'dastlabki' versiya qilib saqlaydi,
 * eski qatorlarni 'almashtirilgan' deb belgilaydi (o'chirmaydi — F2 tarixi ularda). Bu panel: eski → joriy (faol) zanjiri,
 * jamilar (QQS bilan → ustamali QQS siz → прямые), pozitsiya bo'yicha farq va eski qatordagi F2 dan pereraschet ishorasi.
 */
const FARQ_HOLATLAR: MoslikHolat[] = ['kamaygan', 'oshgan', 'yangi', 'ochirilgan', 'ozgarmagan', 'noaniq'];

function FaollashtirishFarqiPanel({ kompaniyaId, obyektId, versiya, mosliklar, joriyQatorlar }: {
  kompaniyaId: number; obyektId: number; versiya: SmetaVersiya; mosliklar: readonly MoslikQator[]; joriyQatorlar: readonly T2Qator[];
}) {
  const [data, setData] = useState<{ poz: FPozitsiya[]; eski: VQator[]; f2: F2Qator[] } | null>(null);
  const [xato, setXato] = useState('');
  const [holatF, setHolatF] = useState<'hammasi' | MoslikHolat>('hammasi');
  const [sahifa, setSahifa] = useState(0);
  useEffect(() => {
    let tirik = true;
    setData(null); setXato('');
    void Promise.all([faollashtirishPozitsiyalariOl(versiya.id), eskiQatorlarOl(obyektId, versiya.id), eskiF2Ol(obyektId)]).then(([p, e, f]) => {
      if (!tirik) return;
      if (!p.ok || p.toliq === false || !e.ok || e.toliq === false || !f.ok || f.toliq === false) {
        setXato(t('Faollashtirish farqi to‘liq o‘qilmadi — chala ma’lumot ustida hisoblanmaydi.')); return;
      }
      setData({ poz: p.qatorlar ?? [], eski: e.qatorlar ?? [], f2: f.qatorlar ?? [] });
    }).catch(() => { if (tirik) setXato(t('Faollashtirish farqi to‘liq o‘qilmadi — chala ma’lumot ustida hisoblanmaydi.')); });
    return () => { tirik = false; };
  }, [obyektId, versiya.id]);

  const natija = useMemo(() => (data ? faollashtirishFarqi({
    pozitsiyalar: data.poz, mosliklar, eskiQatorlar: data.eski, f2: data.f2,
    yangiQatorlar: joriyQatorlar as unknown as VQator[],
  }) : null), [data, mosliklar, joriyQatorlar]);
  const korinadigan = useMemo(() => (natija?.qatorlar ?? [])
    .filter((q) => holatF === 'hammasi' || q.holat === holatF)
    .sort((a, b) => Math.abs(b.farq ?? 0) - Math.abs(a.farq ?? 0)), [natija, holatF]);
  const sahifaSoni = Math.max(1, Math.ceil(korinadigan.length / SAHIFA));
  const sahifaQatorlari = korinadigan.slice(sahifa * SAHIFA, (sahifa + 1) * SAHIFA);

  if (xato) return <p role="alert" className="flex items-center gap-1.5 text-danger text-[12px]"><AlertTriangle size={14} /> {xato}</p>;
  if (!natija) return <p role="status" className="text-[12px]">{t('Faollashtirish farqi o‘qilmoqda…')}</p>;
  const j = natija.jami;
  const uchlik = (ustamasiz: number, kesim: KatKesim) => <SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={ustamasiz} katKesim={kesim} kichik />;
  return (
    <section className="karta p-3 space-y-2" aria-label={t('Faollashtirilgan versiya: eski → joriy (faol)')} data-testid="faollashtirish-farqi">
      <h4 className="text-[13px] font-semibold">{t('Faollashtirilgan versiya: eski → joriy (faol)')}</h4>
      <p className="text-[12px]"><span className="text-text-mute">{versiya.nom} · {versiya.yaratildi?.slice(0, 10)}</span> → <b>{t('Joriy smeta (faol)')}</b></p>
      <p className="text-[11px] text-text-mute">{t('Eski qatorlar o‘chirilmaydi: ulardagi tasdiqlangan F2 tarixda qoladi va bir marta sanaladi. Smeta jamilari, ustama, AI va hisobotlar faqat joriy (faol) versiyadan.')}</p>
      <div className="overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-surface-2 text-text-mute"><tr>
            <th className="px-2 py-1 text-left">{t('Eski smeta (almashtirilgan)')}</th>
            <th className="px-2 text-left">{t('Joriy smeta (faol)')}</th>
            <th className="px-2 text-left">{t('Farq (joriy − eski)')}</th>
            <th className="px-2 text-left">{t('Eski versiyada tasdiqlangan F2')}</th>
            <th className="px-2 text-left">{t('Pereraschet: eski F2 minus / joriy narx plus')}</th>
          </tr></thead>
          <tbody><tr className="align-top">
            <td className="px-2 py-1">{uchlik(j.eski, j.eskiKesim)}</td>
            <td className="px-2 py-1">{uchlik(j.yangi, j.yangiKesim)}</td>
            <td className="px-2 py-1">{uchlik(j.farq, j.farqKesim)}</td>
            <td className="px-2 py-1 tabular-nums"><FmtN val={j.f2Summa} /> <span className="text-[10.5px] text-text-mute">{t('ustamasiz')}</span></td>
            <td className="px-2 py-1 tabular-nums"><span className="text-danger">−<FmtN val={j.minus} /></span> / <span className="text-success">+<FmtN val={j.plus} /></span>
              {j.plusNomalum > 0 && <div className="text-[10px] text-warn">{t('yangi narx noma’lum')}: {j.plusNomalum}</div>}</td>
          </tr></tbody>
        </table>
      </div>
      <p className="text-[11px] text-text-mute">{t('Summalar: QQS bilan → ustamali (QQS siz) → прямые (ustamasiz); narxlar QQS siz.')}
        {(j.eskiNarxsiz > 0 || j.yangiNarxsiz > 0) && ` ${t('narxsiz qatorlar: eski {e} · joriy {j}', { e: String(j.eskiNarxsiz), j: String(j.yangiNarxsiz) })}`}</p>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <label>{t('Holat')}
          <select className="ml-1 border rounded px-2 py-1" value={holatF} onChange={(e) => { setHolatF(e.target.value as typeof holatF); setSahifa(0); }}>
            <option value="hammasi">{t('Hamma holatlar')} ({natija.qatorlar.length})</option>
            {FARQ_HOLATLAR.map((h) => <option key={h} value={h}>{holatNomi(h)} ({j.holatlar[h] ?? 0})</option>)}
          </select></label>
      </div>
      <div className="overflow-auto max-h-[56vh]">
        <table className="w-full border-collapse text-[11.5px]">
          <thead className="sticky top-0 z-[1] bg-surface-2 text-text-mute"><tr>
            <th className="px-2 py-1 text-left">{t('Holat')}</th><th className="px-2 text-left">{t('Pozitsiya')}</th><th className="px-2">{t('Birlik')}</th>
            <th className="px-2 text-right">{t('Eski: hajm / narx / summa')}</th><th className="px-2 text-right">{t('Joriy: hajm / narx / summa')}</th>
            <th className="px-2 text-right">{t('Farq (ustamasiz)')}</th><th className="px-2 text-right">{t('F2 (eski qatorda)')}</th><th className="px-2 text-right">{t('Pereraschet ishorasi')}</th>
          </tr></thead>
          <tbody>
            {sahifaQatorlari.map((q) => (
              <tr key={q.mosId} className="border-t border-border/50 align-top" data-testid="faollashtirish-qator">
                <td className={`px-2 py-1 ${HOLAT_RANG[q.holat]}`}>{holatNomi(q.holat)}</td>
                <td className="px-2">{q.kod ? <b>{q.kod} </b> : null}{q.nom}{q.bolim && <div className="text-[10px] text-text-mute">{q.bolim}</div>}</td>
                <td className="px-2 text-center">{q.birlik ?? '—'}</td>
                <td className="px-2 text-right tabular-nums">{q.eski ? <><FmtN val={q.eski.hajm} kasr={3} /> / <FmtN val={q.eski.narx} /> / <b><FmtN val={q.eski.summa} /></b></> : '—'}</td>
                <td className="px-2 text-right tabular-nums">{q.yangi ? <><FmtN val={q.yangi.hajm} kasr={3} /> / <FmtN val={q.yangi.narx} /> / <b><FmtN val={q.yangi.summa} /></b></> : '—'}</td>
                <td className={`px-2 text-right tabular-nums ${(q.farq ?? 0) < 0 ? 'text-danger' : (q.farq ?? 0) > 0 ? 'text-success' : ''}`}><FmtN val={q.farq} /></td>
                <td className="px-2 text-right tabular-nums">{q.f2 ? <><FmtN val={q.f2.hajm} kasr={3} /> / <FmtN val={q.f2.summa} /></> : '—'}</td>
                <td className="px-2 text-right tabular-nums">{q.pereraschet ? <>
                  <span className="text-danger">−<FmtN val={q.pereraschet.minus} /></span> / {q.pereraschet.plus == null ? <span className="text-warn">{t('yangi narx noma’lum')}</span> : <span className="text-success">+<FmtN val={q.pereraschet.plus} /></span>}
                  {q.pereraschet.ortiqchaHajm > 0 && <div className="text-[10px] text-warn">{t('Ortiqcha hajm: {h}', { h: String(q.pereraschet.ortiqchaHajm) })}</div>}
                </> : '—'}</td>
              </tr>
            ))}
            {!sahifaQatorlari.length && <tr><td colSpan={8} className="px-2 py-3 text-text-mute">{t('Filtrga mos qator yo‘q.')}</td></tr>}
          </tbody>
        </table>
      </div>
      {sahifaSoni > 1 && (
        <div className="flex items-center gap-2 text-[12px]">
          <button type="button" disabled={sahifa === 0} onClick={() => setSahifa((p) => p - 1)} className="tugma">{t('Oldingi')}</button>
          <span>{sahifa + 1} / {sahifaSoni} · {korinadigan.length}</span>
          <button type="button" disabled={sahifa + 1 >= sahifaSoni} onClick={() => setSahifa((p) => p + 1)} className="tugma">{t('Keyingi')}</button>
        </div>
      )}
    </section>
  );
}

/** Obyekt sahifasidagi havola: smeta yangi versiyaga almashtirilgan bo'lsa — «Versiyalar va farq» ga o'tish tugmasi. */
export function VersiyaAlmashtirilganBelgi({ obyektId, onOch }: { obyektId: number; onOch: () => void }) {
  const [bor, setBor] = useState(false);
  useEffect(() => {
    let tirik = true;
    setBor(false);
    void versiyalarOl(obyektId).then((r) => { if (tirik && r.ok) setBor((r.qatorlar ?? []).some((v) => v.tur === 'dastlabki' && v.holat === 'tayyor')); }).catch(() => {});
    return () => { tirik = false; };
  }, [obyektId]);
  if (!bor) return null;
  return (
    <button type="button" className="fz-btn fz-btn--sm" data-testid="versiya-almashtirilgan-belgi" onClick={onOch}>
      {t('Smeta yangi versiyaga almashtirilgan — eski va yangi farqi')}
    </button>
  );
}

export default SmetaVersiyaFarq;
