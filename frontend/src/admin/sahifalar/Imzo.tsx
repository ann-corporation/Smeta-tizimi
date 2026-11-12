/**
 * Imzo - /admin/imzo: shaxsiy elektron imzo markazi. Bo'limlar (`?bolim=`): imzolash | mening | qurilmalar | tekshirish.
 * «Imzolash» - hujjat markazi (t2_document_registry) hujjatlari: tomon tanlanadi, hujjat yuklanib mazmun xeshi qurilmada tekshiriladi,
 * token yechiladi, qurilma kaliti bilan imzolanadi; hujjat yonida imzolar ro'yxati va «Imzolangan nusxa» (xlsx oxirida IMZO varag'i + QR).
 */
import { useState, type ReactNode } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, PenLine, Search } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { t } from '../../i18n/til';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { toast } from '../../umumiy/ui/Toast';
import { hujjatRoyxatOl, hujjatYuklabOlishUrl, hujjatOl } from '../../api/t2-hujjat-canonical';
import { hujjatImzolariOl, hujjatniImzola, meningImzolarimOl, xatoMatni, type ImzoKorinish } from '../../api/t2-imzo';
import { Karta,  Nota, INPUT_SINF, INPUT_STIL, Skelet } from '../../components/akkaunt/AkkauntUi';
import { ImzoQatorlari, Lbl, faylSaqla } from '../../components/imzo/ImzoUi';
import { ImzoBolimi } from '../../components/imzo/KalitlarKarta';
import { IMZO_TOMONLAR, tokenMi, type ImzoTomon } from '../../lib/imzo/yadro';
import { TOMON_NOMI, imzoVaraqQosh, nomidanTomonTaxmin, type ImzoBlokQator } from '../../lib/imzo/qr-varaq';
import { hujjatMazmunXeshi } from '../../lib/imzo/mazmun';
import { HUJJAT_TURLARI } from '../../lib/hujjat-dvigatel';

const TEKSHIRUV_NAMUNA = 'https://…/t/…';
const BOLIMLAR = [['imzolash', 'Imzolash'], ['mening', 'Mening imzolarim'], ['qurilmalar', 'Qurilmalarim'], ['tekshirish', 'Tekshirish']] as const;

/** Hujjat turiga mos kutilayotgan tomonlar (hujjat dvigateli reestridagi «imzo tomonlari»); tur noma'lum bo'lsa - bo'sh. */
function kutilganTomonlar(hujjatTuri: string): ImzoTomon[] {
  const tur = (HUJJAT_TURLARI as Record<string, { imzo: { tayyorlaydi: string; tasdiqlaydi: readonly string[] } }>)[hujjatTuri];
  if (!tur) return [];
  const m = new Set<ImzoTomon>();
  for (const r of [tur.imzo.tayyorlaydi, ...tur.imzo.tasdiqlaydi]) if ((IMZO_TOMONLAR as readonly string[]).includes(r)) m.add(r as ImzoTomon);
  return [...m];
}

function HujjatQatori({ d, kompaniyaId, userId, tomon, imzoKomp, nomidan }: { d: { id: string; filename: string; type: string; createdAt: string; mime: string }; kompaniyaId: number; userId: number; tomon: ImzoTomon; imzoKomp: number | null; nomidan: number | null }) {
  const qc = useQueryClient();
  const [ochiq, setOchiq] = useState(false);
  const [band, setBand] = useState(false);
  const id = Number(d.id);
  const imzolar = useQuery({ queryKey: ['imzo-hujjat', id], enabled: ochiq, queryFn: async () => { const r = await hujjatImzolariOl(id); if (!r.ok) throw new Error(r.code); return r.imzolar; } });

  const imzola = async () => {
    setBand(true);
    const r = await hujjatniImzola({ userId, kompaniyaId, hujjatId: id, tomon, imzoKompaniyaId: imzoKomp, nomidanKompaniyaId: nomidan });
    setBand(false);
    if (!r.ok) { toast(r.xabar || xatoMatni(r.code), 'danger'); return; }
    toast(r.xabar ? `${t('Imzolandi')} · ${r.xabar}` : t('Imzolandi'), 'ok');
    setOchiq(true); void qc.invalidateQueries({ queryKey: ['imzo-hujjat', id] }); void qc.invalidateQueries({ queryKey: ['imzo-mening'] });
  };

  /** Imzolangan nusxa: asl xlsx + oxirida «IMZO» varag'i (har imzolovchi qatori, QR, kutilayotgan tomonlar). Qayta yuklab olish bepul. */
  const nusxa = async () => {
    const r = await hujjatImzolariOl(id);
    const b = await hujjatOl(id);
    if (!r.ok || !(b instanceof Blob)) { toast(t('Nusxani tayyorlab bo‘lmadi'), 'danger'); return; }
    const bytes = new Uint8Array(await b.arrayBuffer());
    const qatorlar: ImzoBlokQator[] = r.imzolar.filter((q) => q.token).map((q: ImzoKorinish) => ({
      tomon: q.tomon, nomidan_tomon: q.nomidan_kompaniya ? nomidanTomonTaxmin(q.tomon) : null, kompaniya: q.imzolovchi_kompaniya, fio: q.imzolovchi, rol: q.rol, usul: q.usul, vaqt: q.vaqt, kod: q.kod, token: q.token as string,
    }));
    const imzolagan = new Set(r.imzolar.map((q) => q.tomon));
    const kutilmoqda = kutilganTomonlar(d.type).filter((x) => !imzolagan.has(x));
    const xlsx = imzoVaraqQosh(bytes, { imzolar: qatorlar, kutilmoqda, origin: window.location.origin, mazmunXesh: await hujjatMazmunXeshi(bytes) });
    if (!xlsx) { toast(t('Imzo varag‘ini faqat Excel (xlsx) hujjatga qo‘shish mumkin'), 'warn'); return; }
    faylSaqla(xlsx, d.filename.replace(/(\.[A-Za-z0-9]+)?$/, '') + ' (imzolangan).xlsx');
  };

  let imzolarKorinishi: ReactNode = <ImzoQatorlari imzolar={imzolar.data ?? []} />;
  if (imzolar.isLoading) imzolarKorinishi = <Skelet qatorlar={2} />;
  else if (imzolar.isError) imzolarKorinishi = <Nota tur="danger">{xatoMatni((imzolar.error as Error).message)}</Nota>;

  return (
    <li className="rounded-md border border-[var(--border)] p-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0"><b className="text-[13px] break-words">{d.filename}</b><div className="text-[12px] text-text-dim">{d.type} · {new Date(d.createdAt).toLocaleDateString('ru-RU')}</div></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="fz-btn fz-btn--primary" disabled={band} onClick={() => void imzola()}><PenLine size={14} aria-hidden="true" /> {band ? t('Imzolanmoqda…') : t('Imzolash')}</button>
          <button type="button" className="fz-btn" onClick={() => setOchiq((x) => !x)}>{ochiq ? t('Imzolarni yopish') : t('Imzolar')}</button>
          <a className="fz-btn" href={hujjatYuklabOlishUrl(id)}><Download size={14} aria-hidden="true" /> {t('Asl fayl')}</a>
          {/\.xlsx?$/i.test(d.filename) && <button type="button" className="fz-btn" onClick={() => void nusxa()}>{t('Imzolangan nusxa (Excel)')}</button>}
        </div>
      </div>
      {ochiq && imzolarKorinishi}
    </li>
  );
}

function Imzolash() {
  const [qp] = useSearchParams();
  const tanlangan = qp.get('hujjat');
  const k = useKompaniya();
  const userId = k.foydalanuvchi?.id; const kompaniyaId = k.joriyId;
  const [tomon, setTomon] = useState<ImzoTomon>('pudratchi');
  const [imzoKomp, setImzoKomp] = useState<number | null>(null);
  const [nomidan, setNomidan] = useState('');
  const q = useQuery({ queryKey: ['imzo-hujjatlar', kompaniyaId], enabled: !!kompaniyaId, queryFn: () => hujjatRoyxatOl({ kompaniyaId: kompaniyaId as number, limit: 100 }) });
  if (!userId || !kompaniyaId) return <Nota tur="warn">{t('Avval kompaniyani tanlang.')}</Nota>;
  const nom = nomidan.trim() === '' ? null : Number(nomidan);
  return (
    <div className="flex flex-col gap-3">
      <Karta sarlavha="Kim sifatida imzolaysiz" tavsif="Tomon imzo blokida ko‘rinadi. Boshqa kompaniya nomidan (masalan, alohida texnadzor kompaniyasi - Buyurtmachi nomidan) imzolasangiz, faol aloqa tekshiriladi.">
        <div className="grid gap-2 sm:grid-cols-3">
          <Lbl yorliq="Tomon"><select className={INPUT_SINF} style={INPUT_STIL} value={tomon} onChange={(e) => setTomon(e.target.value as ImzoTomon)}>{IMZO_TOMONLAR.map((x) => <option key={x} value={x}>{TOMON_NOMI[x].uz}</option>)}</select></Lbl>
          <Lbl yorliq="Imzolovchi kompaniya"><select className={INPUT_SINF} style={INPUT_STIL} value={imzoKomp ?? ''} onChange={(e) => setImzoKomp(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('Hujjat egasi kompaniyasi')}</option>{k.kompaniyalar.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></Lbl>
          <Lbl yorliq="Nomidan (kompaniya raqami, ixtiyoriy)"><input className={INPUT_SINF} style={INPUT_STIL} inputMode="numeric" value={nomidan} onChange={(e) => setNomidan(e.target.value.replace(/\D/g, ''))} /></Lbl>
        </div>
      </Karta>
      {q.isLoading && <Skelet qatorlar={4} />}
      {q.isError && <Nota tur="danger">{t('Hujjatlar ro‘yxatini o‘qib bo‘lmadi.')}</Nota>}
      {q.data && !q.data.documents.length && <p className="text-[13px] text-text-dim m-0">{t('Hujjat markazida hujjat yo‘q.')}</p>}
      <ul className="m-0 p-0 list-none flex flex-col gap-2">
        {(q.data?.documents ?? []).filter((d) => !tanlangan || d.id === tanlangan).map((d) => (
          <HujjatQatori key={d.id} d={d} kompaniyaId={kompaniyaId} userId={userId} tomon={tomon} imzoKomp={imzoKomp} nomidan={nom !== null && Number.isFinite(nom) ? nom : null} />
        ))}
      </ul>
    </div>
  );
}

function Mening() {
  const q = useQuery({ queryKey: ['imzo-mening'], queryFn: async () => { const r = await meningImzolarimOl(); if (!r.ok) throw new Error(r.code); return r.imzolar; } });
  if (q.isLoading) return <Skelet qatorlar={3} />;
  if (q.isError) return <Nota tur="danger">{xatoMatni((q.error as Error).message)}</Nota>;
  return <Karta sarlavha="Mening imzolarim"><ImzoQatorlari imzolar={q.data ?? []} /></Karta>;
}

function Tekshirish() {
  const nav = useNavigate();
  const [v, setV] = useState('');
  const token = (v.match(/[A-Za-z0-9_-]{22}/g) ?? []).find(tokenMi);
  return (
    <Karta sarlavha="Imzoni yoki hujjatni tekshirish" tavsif="QR dagi havolani yoki 22 belgili kodni kiriting. Yuklangan faylni tekshirish - ochilgan sahifada.">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (token) nav('/t/' + token); }}>
        <input className={INPUT_SINF} style={INPUT_STIL} value={v} onChange={(e) => setV(e.target.value)} placeholder={TEKSHIRUV_NAMUNA} aria-label={t('Havola yoki kod')} />
        <button type="submit" className="fz-btn fz-btn--primary" disabled={!token}><Search size={14} aria-hidden="true" /> {t('Tekshirish')}</button>
      </form>
    </Karta>
  );
}

export default function Imzo() {
  const [qp, setQp] = useSearchParams();
  const faol = BOLIMLAR.find(([id]) => id === qp.get('bolim'))?.[0] ?? 'imzolash';
  return (
    <Sahifa sarlavha="Imzo" tavsif="Shaxsiy elektron imzo: hujjatga imzo qo‘yish, imzolaringiz, qurilma kalitlari va tekshirish. Bu tizim ichidagi imzo, ERI (E-IMZO) emas.">
      <div role="tablist" className="flex flex-wrap gap-1 mb-3">
        {BOLIMLAR.map(([id, nom]) => (
          <button key={id} type="button" role="tab" aria-selected={id === faol} className={id === faol ? 'fz-btn fz-btn--primary' : 'fz-btn'} onClick={() => setQp({ bolim: id }, { replace: true })}>{t(nom)}</button>
        ))}
      </div>
      {faol === 'imzolash' && <Imzolash />}
      {faol === 'mening' && <Mening />}
      {faol === 'qurilmalar' && <ImzoBolimi />}
      {faol === 'tekshirish' && <Tekshirish />}
    </Sahifa>
  );
}
