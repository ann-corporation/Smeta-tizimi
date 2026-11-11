/**
 * Kundalik ish jurnali (P1) — obyekt ish joyidagi tab (`/admin/ish-jurnal`, «Fakt» bandi ostida).
 * Bir kun = bitta yozuv: bajarilgan ishlar (fakt), sklad kirimi, АОСР, murojaat/predpisaniya, ob-havo AVTOMATIK hosil bo'ladi;
 * prorab faqat qisqa izohni (va odamlar/brigadalar qatorini) tasdiqlaydi yoki tahrirlaydi. Chop etish — rasmiy shakl
 * (hujjat yozuvchisi, token yo'li). Shakl sozlanadigan: me'yoriy tafsilotlar tasdiqlanmagan («T»).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileSpreadsheet, Save, CheckCircle2 } from 'lucide-react';
import { t } from '../../i18n/til';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { toast } from '../../umumiy/ui/Toast';
import { bugunSana } from '../../lib/hujjat-yozuvchi';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { kunOl, izohSaqla, SANA_RE } from '../../lib/ish-jurnal/oqish';
import { kunBosh, obHavoMatni, type KunJurnali } from '../../lib/ish-jurnal/model';
import { ishJurnaliXlsx, jurnalSablonOl } from '../../lib/ish-jurnal/eksport';

const sanaSur = (iso: string, kun: number): string => {
  const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + kun);
  return bugunSana(d);
};
const raqam = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const HOLAT_UZ: Record<string, string> = { ochiq: 'ochiq', bajarildi: 'bajarildi', yopildi: 'yopildi' };

function Blok({ nom, soni, children }: { nom: string; soni: number; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-3">
      <h3 className="mb-1.5 text-[13px] font-semibold">{t(nom)} <span className="font-normal text-text-dim">· {soni}</span></h3>
      {soni ? children : <p className="text-[12.5px] text-text-dim">{t('Bu kunda yozuv yo‘q')}</p>}
    </section>);
}

export default function IshJurnali() {
  const ws = usePTOWorkspace();
  const [sp, setSp] = useSearchParams();
  const kompaniyaId = ws.companyId; const obyektId = ws.scope.objectId;
  const obyektNomi = ws.objects.find((o) => o.id === obyektId)?.nom ?? '';
  const bugun = bugunSana();
  const sanaQ = sp.get('sana') ?? '';
  const sana = SANA_RE.test(sanaQ) && sanaQ <= bugun ? sanaQ : bugun;
  const setSana = (s: string) => { const q = new URLSearchParams(sp); q.set('sana', s); setSp(q, { replace: true }); };

  const [kun, setKun] = useState<KunJurnali | null>(null);
  const [yuk, setYuk] = useState(false);
  const [xato, setXato] = useState('');
  const [izoh, setIzoh] = useState(''); const [odamlar, setOdamlar] = useState('');
  const [band, setBand] = useState(false);
  const [versiya, setVersiya] = useState(0);

  useEffect(() => {
    if (kompaniyaId == null || obyektId == null) { setKun(null); return undefined; }
    let tirik = true;
    setYuk(true); setXato('');
    kunOl({ kompaniyaId, obyektId, obyektNomi, sana }).then((k) => {
      if (!tirik) return;
      setKun(k); setIzoh(k.izoh?.izoh ?? ''); setOdamlar(k.izoh?.odamlar ?? '');
    }).catch(() => { if (tirik) setXato(t('Jurnalni o‘qib bo‘lmadi. Tarmoq yoki ruxsatni tekshiring.')); })
      .finally(() => { if (tirik) setYuk(false); });
    return () => { tirik = false; };
  }, [kompaniyaId, obyektId, obyektNomi, sana, versiya]);

  const saqla = useCallback(async (tasdiqlash: boolean) => {
    if (kompaniyaId == null || obyektId == null || !kun) return;
    setBand(true);
    try {
      const r = await izohSaqla({ kompaniyaId, obyektId, sana, izoh, odamlar, obHavo: kun.obHavo, tasdiqlash, kutilganVersiya: kun.izoh?.versiya ?? null });
      if (r.ok) { toast(tasdiqlash ? t('Jurnal tasdiqlandi') : t('Izoh saqlandi'), 'ok'); setVersiya((v) => v + 1); }
      else if (r.code === 'STALE_VERSION') { toast(t('Yozuv boshqa joyda yangilangan — qayta yuklandi, izohni tekshirib qayta saqlang'), 'warn'); setVersiya((v) => v + 1); }
      else toast(r.error ?? t('Saqlab bo‘lmadi'), 'danger');
    } finally { setBand(false); }
  }, [kompaniyaId, obyektId, sana, izoh, odamlar, kun]);

  const hujjat = useCallback(async () => {
    if (kompaniyaId == null || obyektId == null || !kun) return;
    setBand(true);
    try {
      // Hujjatga ekrandagi (saqlanmagan bo'lsa ham) izoh kiradi — lekin «tasdiqlanmagan» belgisi saqlanmaguncha qoladi.
      const joriy: KunJurnali = { ...kun, izoh: { izoh, odamlar, tasdiqlandi: kun.izoh?.tasdiqlandi ?? false, versiya: kun.izoh?.versiya ?? 0, obHavo: kun.izoh?.obHavo ?? null } };
      const { bytes, faylNomi } = ishJurnaliXlsx([joriy], { obyektNomi, sablon: jurnalSablonOl(kompaniyaId) });
      const r = await hujjatTokenBilan({ kompaniyaId, bytes, hujjat: 'ISH_JURNAL', sabab: `Общий журнал работ · ${obyektNomi} · ${sana}`, obyekt: obyektId }, () => downloadBlob(bytes, faylNomi));
      if (!r.ok) toast(r.xabar, 'danger'); else if (r.xabar) toast(r.xabar, 'ok');
    } catch { toast(t('Hujjat tuzilmadi. Qayta urinib ko‘ring.'), 'danger'); } finally { setBand(false); }
  }, [kompaniyaId, obyektId, kun, izoh, odamlar, obyektNomi, sana]);

  const ozgargan = useMemo(() => !!kun && (izoh !== (kun.izoh?.izoh ?? '') || odamlar !== (kun.izoh?.odamlar ?? '')), [kun, izoh, odamlar]);

  if (kompaniyaId == null || obyektId == null) {
    return <div className="p-4 text-sm text-text-dim" data-testid="ish-jurnal-obyekt-yoq">{t('Kundalik jurnal obyekt bo‘yicha ishlaydi — yuqoridan obyektni tanlang.')}</div>;
  }
  const hOb = obHavoMatni(kun?.obHavo);
  return (
    <div className="mx-auto w-full max-w-4xl space-y-3 p-3 sm:p-4" data-testid="ish-jurnal">
      <header className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label={t('Oldingi kun')} onClick={() => setSana(sanaSur(sana, -1))} className="fz-btn fz-btn--sm"><ChevronLeft aria-hidden="true" /></button>
        <input aria-label={t('Sana')} type="date" max={bugun} value={sana} onChange={(e) => SANA_RE.test(e.target.value) && setSana(e.target.value)} className="rounded-md border border-[var(--border-strong)] bg-bg px-2 py-1.5 text-[13px]" />
        <button type="button" aria-label={t('Keyingi kun')} disabled={sana >= bugun} onClick={() => setSana(sanaSur(sana, 1))} className="fz-btn fz-btn--sm"><ChevronRight aria-hidden="true" /></button>
        <button type="button" onClick={() => setSana(bugun)} disabled={sana === bugun} className="fz-btn fz-btn--sm">{t('Bugun')}</button>
        <span className="ml-auto text-[12.5px] text-text-dim">{obyektNomi}</span>
      </header>

      {yuk && <p className="text-[12.5px] text-text-dim" role="status">{t('Kun jurnali tayyorlanmoqda…')}</p>}
      {xato && <p role="alert" className="text-sm text-danger">{xato}</p>}
      {kun && !yuk && <>
        {kun.olinmagan.length > 0 && <p role="alert" className="rounded-md border border-warn/40 bg-warn/10 p-2 text-[12.5px]">{t('Ba’zi manbalar o‘qilmadi — jurnal to‘liq emas:')} {kun.olinmagan.join(', ')}</p>}
        {kunBosh(kun) && <p className="rounded-md border border-border p-2 text-[12.5px] text-text-dim">{t('Bu kunda fakt, kirim, АОСР yoki murojaat topilmadi. Ish bo‘lmagan bo‘lsa — izohga sababini yozing.')}</p>}
        <div className="text-[12.5px]"><b>{t('Ob-havo')}:</b> {hOb ?? t('ma’lumot yo‘q (ixtiyoriy)')}{kun.izoh?.obHavo ? ` · ${t('tasdiq paytidagi')}` : ''}</div>

        <Blok nom="Bajarilgan ishlar (fakt)" soni={kun.ishlar.length}>
          <ul className="space-y-0.5 text-[12.5px]">{kun.ishlar.map((i) => <li key={i.qatorId}>{i.kod ? <span className="text-text-dim">{i.kod} </span> : null}{i.nom} — <b>{raqam(i.hajm)}</b> {i.birlik}</li>)}</ul>
        </Blok>
        <Blok nom="Sklad kirimi" soni={kun.kirimlar.length}>
          <ul className="space-y-0.5 text-[12.5px]">{kun.kirimlar.map((i) => <li key={i.id}>{i.nomi} — <b>{raqam(i.hajm)}</b> {i.birligi}{i.postavshik ? <span className="text-text-dim"> · {i.postavshik}</span> : null}</li>)}</ul>
        </Blok>
        <Blok nom="АОСР (shu kuni)" soni={kun.aosr.length}>
          <ul className="space-y-0.5 text-[12.5px]">{kun.aosr.map((i) => <li key={i.id}>№ {i.raqam ?? '—'} {i.ishNomi} <span className="text-text-dim">· {i.holat === 'tasdiqlangan' ? t('imzolangan') : t('qog‘ozda')}</span></li>)}</ul>
        </Blok>
        <Blok nom="Predpisaniya va murojaatlar (shu kuni)" soni={kun.murojaatlar.length}>
          <ul className="space-y-0.5 text-[12.5px]">{kun.murojaatlar.map((i) => <li key={i.id}>[{i.turi}] {i.sarlavha} <span className="text-text-dim">· {t(HOLAT_UZ[i.holat] ?? i.holat)}{i.muddat ? ` · ${t('muddat')} ${i.muddat.split('-').reverse().join('.')}` : ''}</span></li>)}</ul>
        </Blok>

        <section className="space-y-2 rounded-lg border border-border p-3">
          <h3 className="text-[13px] font-semibold">{t('Prorab yozuvi')} {kun.izoh?.tasdiqlandi ? <span className="ml-1 inline-flex items-center gap-1 text-[12px] font-normal text-success"><CheckCircle2 size={13} aria-hidden="true" />{t('tasdiqlangan')}</span> : <span className="ml-1 text-[12px] font-normal text-text-dim">{t('tasdiqlanmagan')}</span>}</h3>
          <label className="block text-[12.5px]">{t('Odamlar / brigadalar (qisqa)')}
            <input aria-label={t('Odamlar / brigadalar')} maxLength={300} value={odamlar} onChange={(e) => setOdamlar(e.target.value)} className="mt-1 block w-full rounded-md border border-[var(--border-strong)] bg-bg px-2 py-1.5 text-[13px]" placeholder={t('masalan: 2 brigada, 14 kishi')} /></label>
          <label className="block text-[12.5px]">{t('Qisqa izoh')}
            <textarea aria-label={t('Qisqa izoh')} maxLength={2000} rows={3} value={izoh} onChange={(e) => setIzoh(e.target.value)} className="mt-1 block w-full rounded-md border border-[var(--border-strong)] bg-bg px-2 py-1.5 text-[13px]" placeholder={t('Kun haqida qisqa: nima to‘sqinlik qildi, nima o‘zgardi')} /></label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={band || !ozgargan} onClick={() => void saqla(false)} className="fz-btn fz-btn--sm"><Save aria-hidden="true" /> {t('Saqlash')}</button>
            <button type="button" disabled={band} onClick={() => void saqla(true)} className="fz-btn fz-btn--sm fz-btn--primary"><CheckCircle2 aria-hidden="true" /> {t('Tasdiqlash')}</button>
            <button type="button" disabled={band} onClick={() => void hujjat()} className="fz-btn fz-btn--sm ml-auto"><FileSpreadsheet aria-hidden="true" /> {t('Rasmiy jurnal (Excel)')}</button>
          </div>
          <p className="text-[11.5px] text-text-dim">{t('Rasmiy jurnal shakli sozlanadigan; me’yoriy tafsilotlar tasdiqlangach shablon yangilanadi. Hujjat chiqarish token yechadi.')}</p>
        </section>
      </>}
    </div>
  );
}
