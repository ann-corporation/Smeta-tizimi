/**
 * TestSaqlash.tsx — TIZIM_02: KO'P-KOMPANIYALI FAYL SAQLASH (STOR-001)
 * ═══════════════════════════════════════════════════════════════════════
 * EGALIK: Claude (arxitektura / STOR-001B integratsiya + yakuniy yig'ish).
 *
 * Bitta ekranda butun zanjir:
 *   KOMPANIYA STORAGE → LOYIHA STORAGE → OBYEKT STORAGE → HUJJAT/F2 YUKLASH
 *
 * UI — Codex'ning qayta ishlatiladigan komponentlari (components/storage):
 *   StorageHealthCard · StorageWorkspaceForm · StorageStatusBadge ·
 *   StorageErrorPanel · DocumentStorageStatus.
 * Ma'lumot — kanonik STOR-001 kontrakti (api/t2-storage.ts). Global
 * ROOT_FOLDER_ID fallback YO'Q: hamma narsa company→loyiha→obyekt ID zanjiri
 * va saqlangan folder ID orqali. Xato bo'lsa eski umumiy papkaga tushmaydi.
 */
import { useEffect, useState } from 'react';
import { FolderTree, Boxes, FileUp, RefreshCw, Archive, Loader2, ChevronRight } from 'lucide-react';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { t } from '../i18n/til';
import { useKompaniya } from './KompaniyaTanlov';
import { Badge } from '../umumiy/ui/Badge';
import {
  StorageHealthCard, StorageWorkspaceForm, StorageStatusBadge, StorageErrorPanel,
  DocumentStorageStatus, type StorageFormValue, type DocumentUploadStatus,
} from '../components/storage';
import {
  companyStorageOl, companyStorageBind, projectStorageRoyxat, projectStorageProvision,
  objectStorageRoyxat, objectStorageRetry, documentUpload, storageXatoMatn, demoRejimmi,
  toUiStatus,
  type CompanyStorage, type ProjectStorage, type ObjectStorage,
} from '../api/t2-storage';

const DEMO_SENARIY: { id: number; nom: string }[] = [
  { id: 4, nom: 'READY' },
  { id: 1, nom: 'PENDING' },
  { id: 2, nom: 'FAILED' },
  { id: 3, nom: 'LEGACY' },
  { id: 5, nom: 'NOT CONFIGURED' }, // 5 % 5 === 0
];

export default function TestSaqlash() {
  const { joriy } = useKompaniya();
  const demo = demoRejimmi();
  const [demoKompaniyaId, setDemoKompaniyaId] = useState(4);
  const kompaniyaId = demo ? demoKompaniyaId : (joriy?.id ?? 0);

  const [company, setCompany] = useState<CompanyStorage | null>(null);
  const [companyXato, setCompanyXato] = useState<{ code?: string; xabar?: string } | null>(null);
  const [projects, setProjects] = useState<ProjectStorage[]>([]);
  const [tanlanganLoyiha, setTanlanganLoyiha] = useState<number | null>(null);
  const [objects, setObjects] = useState<ObjectStorage[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [ish, setIsh] = useState<string | null>(null);
  const [form, setForm] = useState<StorageFormValue>({ folderInput: '', mode: 'shared_drive' });

  const yukla = async () => {
    if (!kompaniyaId) return;
    setYuklanmoqda(true);
    setCompanyXato(null);
    const c = await companyStorageOl(kompaniyaId);
    if (c.ok) setCompany(c.data);
    else { setCompany(null); setCompanyXato({ code: c.code, xabar: c.xabar }); }
    const p = await projectStorageRoyxat(kompaniyaId);
    setProjects(p.ok ? p.data : []);
    setYuklanmoqda(false);
  };

  useEffect(() => {
    setCompany(null); setProjects([]); setObjects([]); setTanlanganLoyiha(null);
    yukla(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [kompaniyaId]);

  useEffect(() => {
    if (tanlanganLoyiha == null || !kompaniyaId) { setObjects([]); return; }
    objectStorageRoyxat(kompaniyaId, tanlanganLoyiha).then((r) => setObjects(r.ok ? r.data : []));
  }, [tanlanganLoyiha, kompaniyaId, ish]);

  const bind = async (v: StorageFormValue) => {
    setIsh('bind');
    const r = await companyStorageBind({
      kompaniyaId, folderUrl: v.folderInput.trim(), mode: v.mode,
      expectedVersion: company?.versiya ?? 0,
    });
    setIsh(null);
    if (r.ok) { setCompany(r.data); setForm({ folderInput: '', mode: v.mode }); setCompanyXato(null); }
    else setCompanyXato({ code: r.code, xabar: r.xabar });
  };

  const provision = async (loyihaId: number, versiya: number) => {
    setIsh('provision:' + loyihaId);
    const r = await projectStorageProvision({ kompaniyaId, loyihaId, expectedVersion: versiya });
    if (r.ok) {
      const fresh = await projectStorageRoyxat(kompaniyaId);
      if (fresh.ok) setProjects(fresh.data);
    } else {
      setProjects((prev) => prev.map((p) => p.loyiha_id === loyihaId
        ? { ...p, provisioning_status: 'failed', storage_error: storageXatoMatn(r.code, r.xabar) } : p));
    }
    setIsh(null);
  };

  const retryObject = async (o: ObjectStorage) => {
    if (tanlanganLoyiha == null) return;
    setIsh('object:' + o.obyekt_id);
    const r = await objectStorageRetry({
      kompaniyaId, loyihaId: tanlanganLoyiha, obyektId: o.obyekt_id,
      obyektNom: o.obyekt_nom, expectedVersion: o.versiya,
    });
    if (r.ok) {
      const fresh = await objectStorageRoyxat(kompaniyaId, tanlanganLoyiha);
      if (fresh.ok) setObjects(fresh.data);
    } else {
      setObjects((prev) => prev.map((x) => x.obyekt_id === o.obyekt_id
        ? { ...x, storage_status: 'failed', storage_error: storageXatoMatn(r.code, r.xabar) } : x));
    }
    setIsh(null);
  };

  const companyTayyor = company?.status === 'verified' || company?.status === 'legacy';
  const companyUi = company ? toUiStatus(company.status)
    : (companyXato ? 'FAILED' : 'NOT_CONFIGURED') as ReturnType<typeof toUiStatus>;

  const loyihaTayyor = projects.filter((p) => p.provisioning_status === 'verified').length;
  const obyektTayyor = objects.filter((o) => o.storage_status === 'ready').length;
  const yuklashTayyor = objects.some((o) => o.storage_status === 'ready');
  /** Zanjir tayyorligi: kompaniya → loyiha → obyekt → yuklash; har bosqich so'z bilan va ulush bilan. */
  const bosqichlar: { nom: string; qiymat: string; ulush: number | null; ok: boolean; izoh: string }[] = [
    { nom: t('Kompaniya papkasi'), qiymat: companyTayyor ? t('tayyor') : t('tayyor emas'), ulush: companyTayyor ? 1 : 0, ok: companyTayyor, izoh: company?.root_folder_name ?? t('biriktirilmagan') },
    { nom: t('Loyiha papkalari'), qiymat: companyTayyor && projects.length ? `${loyihaTayyor}/${projects.length}` : '—', ulush: companyTayyor && projects.length ? loyihaTayyor / projects.length : null, ok: projects.length > 0 && loyihaTayyor === projects.length, izoh: t('tayyorlangan loyihalar') },
    { nom: t('Obyekt papkalari'), qiymat: tanlanganLoyiha != null && objects.length ? `${obyektTayyor}/${objects.length}` : '—', ulush: tanlanganLoyiha != null && objects.length ? obyektTayyor / objects.length : null, ok: objects.length > 0 && obyektTayyor === objects.length, izoh: tanlanganLoyiha == null ? t('loyiha tanlang') : t('tanlangan loyihada') },
    { nom: t('Hujjat yuklash'), qiymat: yuklashTayyor ? t('mumkin') : t('hali yo‘q'), ulush: yuklashTayyor ? 1 : 0, ok: yuklashTayyor, izoh: t('kamida bitta tayyor obyekt kerak') },
  ];

  return (
    <Sahifa sarlavha="Fayl saqlash (Storage)" tavsif="Kompaniya → Loyiha → Obyekt → Hujjat zanjiri. Har daraja o‘zining tekshirilgan Google Drive papkasiga ega; global umumiy papka yo‘q — hammasi kanonik ID orqali."
      amallar={<button type="button" onClick={() => void yukla()} className="fz-btn"><RefreshCw size={14} className={yuklanmoqda ? 'animate-spin text-accent' : ''} />{t('Yangilash')}</button>}>
      <div className="flex flex-col gap-4">
      {demo && (
        <div className="fz-note fz-note--warn flex-wrap" style={{ alignItems: 'center' }}>
          <Archive aria-hidden="true" />
          <span>{t('DEMO — backend hali productionga qo‘llanmagan. Ekran kanonik kontrakt shakli bilan ishlaydi; jonli ulanish uchun manzilga ?demo=0 qo‘shing.')}</span>
          <span className="ml-auto flex flex-wrap items-center gap-1">
            <span className="text-text-mute">{t('Holat')}:</span>
            {DEMO_SENARIY.map((x) => (
              <button key={x.id} type="button" onClick={() => setDemoKompaniyaId(x.id)} aria-pressed={demoKompaniyaId === x.id}
                className={`fz-btn fz-btn--sm ${demoKompaniyaId === x.id ? 'fz-btn--primary' : 'fz-btn--ghost'}`}>{x.nom}</button>
            ))}
          </span>
        </div>
      )}

      {!kompaniyaId && <div className="fz-card p-4 text-[13px] text-text-dim">{t('Avval yuqoridan kompaniya tanlang.')}</div>}

      {kompaniyaId > 0 && (
        <section className="fz-card p-4" aria-label={t('Zanjir tayyorligi')}>
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            {bosqichlar.map((x, i) => (
              <li key={x.nom} className="relative flex flex-col gap-1 rounded-md border border-border bg-surface-2 px-3 py-2.5" style={{ borderTop: `3px solid ${x.ok ? 'var(--ok)' : x.ulush ? 'var(--warn)' : 'var(--border-strong)'}` }}>
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-text-mute">{i + 1}. {x.nom}</span>
                <b className="text-[15px] tabular-nums text-text">{x.qiymat}</b>
                {x.ulush != null && <span className="fz-meter" style={{ minWidth: 0 }}><span className="fz-meter__t"><i style={{ width: `${x.ulush * 100}%`, background: x.ok ? 'var(--ok)' : 'var(--warn)' }} /></span></span>}
                <span className="truncate text-[11.5px] text-text-mute" title={x.izoh}>{x.izoh}</span>
                {i < bosqichlar.length - 1 && <ChevronRight aria-hidden="true" size={14} className="absolute -right-[11px] top-1/2 z-10 hidden -translate-y-1/2 text-text-mute sm:block" />}
              </li>
            ))}
          </ol>
        </section>
      )}

      {kompaniyaId > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {/* ── 1. KOMPANIYA STORAGE ── */}
          <div className="space-y-4">
            <StorageHealthCard
              className="w-full"
              provider={company?.provider === 'google_drive' ? 'Google Drive' : 'Google Drive'}
              mode={company?.mode ?? null}
              folderName={company?.root_folder_name ?? null}
              status={companyUi}
              lastVerifiedAt={company?.verified_at ?? null}
              errorCode={!companyTayyor ? companyXato?.code : null}
              error={!companyTayyor ? (companyXato?.xabar ? storageXatoMatn(companyXato.code, companyXato.xabar) : null) : null}
              loading={yuklanmoqda && !company}
              onRetry={company?.status === 'failed' ? () => bind(form) : undefined}
            />
            {company?.legacy && (
              <div className="fz-note fz-note--info" style={{ alignItems: 'center' }}>
                <Badge variant="bl" className="gap-1"><Archive size={12} /> {t('ESKI (LEGACY)')}</Badge>
                {t('Bu kompaniya legacy ruxsatnomasida — yangi T2 yozuv oqimi legacy workspace’ga yozmaydi.')}
              </div>
            )}
            {!companyTayyor && (
              <StorageWorkspaceForm
                value={form}
                onChange={setForm}
                onBind={bind}
                loading={ish === 'bind'}
                error={companyXato ? storageXatoMatn(companyXato.code, companyXato.xabar) : null}
              />
            )}
          </div>

          {/* ── 2. LOYIHA STORAGE ── */}
          <section className="fz-card p-4">
            <h2 className="fz-card__title mb-3 flex items-center gap-2"><FolderTree size={16} className="text-accent" /> {t('Loyiha storage')}</h2>
            {!companyTayyor && <div className="text-[12.5px] text-text-dim">{t('Avval kompaniya storage tayyor bo‘lishi kerak.')}</div>}
            {companyTayyor && projects.length === 0 && <div className="text-[12.5px] text-text-dim">{t('Loyiha topilmadi.')}</div>}
            <ul className="space-y-2">
              {companyTayyor && projects.map((p) => (
                <li key={p.loyiha_id}
                  className={'cursor-pointer rounded-lg border px-3 py-2 transition-colors ' +
                    (tanlanganLoyiha === p.loyiha_id ? 'border-accent/50 bg-accent/5' : 'border-border hover:bg-surface-2')}
                  onClick={() => setTanlanganLoyiha(p.loyiha_id)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">{p.loyiha_nom}</span>
                    <StorageStatusBadge status={toUiStatus(p.provisioning_status)} />
                  </div>
                  {p.storage_error && <StorageErrorPanel message={p.storage_error} className="mt-2" />}
                  {p.provisioning_status !== 'verified' && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); void provision(p.loyiha_id, p.versiya); }}
                      disabled={ish === 'provision:' + p.loyiha_id} className="fz-btn fz-btn--sm mt-2">
                      {ish === 'provision:' + p.loyiha_id ? <Loader2 size={12} className="animate-spin" /> : <FolderTree size={12} />}
                      {t('Papkani tayyorlash')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* ── 3. OBYEKT STORAGE ── */}
          <section className="fz-card p-4">
            <h2 className="fz-card__title mb-3 flex items-center gap-2"><Boxes size={16} className="text-accent" /> {t('Obyekt storage')}</h2>
            {tanlanganLoyiha == null && <div className="text-[12.5px] text-text-dim">{t('Chapdan loyiha tanlang.')}</div>}
            {tanlanganLoyiha != null && objects.length === 0 && <div className="text-[12.5px] text-text-dim">{t('Bu loyihada obyekt yo‘q.')}</div>}
            <ul className="space-y-2">
              {objects.map((o) => (
                <li key={o.obyekt_id} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">{o.obyekt_nom}</span>
                    <StorageStatusBadge status={toUiStatus(o.storage_status)} />
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-text-mute">{o.folder_id ? `folder: ${o.folder_id}` : t('papka biriktirilmagan')}</div>
                  {o.storage_error && <StorageErrorPanel message={o.storage_error} className="mt-2" />}
                  {o.storage_status !== 'ready' && (
                    <button type="button" onClick={() => void retryObject(o)} disabled={ish === 'object:' + o.obyekt_id} className="fz-btn fz-btn--sm mt-2">
                      {ish === 'object:' + o.obyekt_id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      {t('Papkani tayyorlash / qayta urinish')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* ── 4. HUJJAT / F2 YUKLASH ── */}
          <HujjatYuklash
            kompaniyaId={kompaniyaId}
            loyihaId={tanlanganLoyiha}
            obyekt={objects.find((o) => o.storage_status === 'ready') ?? null}
          />
        </div>
      )}
      </div>
    </Sahifa>
  );
}

/* ───────────────────────── HUJJAT YUKLASH ───────────────────────── */

function HujjatYuklash({ kompaniyaId, loyihaId, obyekt }: {
  kompaniyaId: number; loyihaId: number | null; obyekt: ObjectStorage | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [tur, setTur] = useState('hujjat');
  const [holat, setHolat] = useState<DocumentUploadStatus>('IDLE');
  const [natija, setNatija] = useState<string>('');

  const tayyor = kompaniyaId > 0 && loyihaId != null && obyekt != null;

  const yukla = async () => {
    if (!file || !tayyor || !obyekt || loyihaId == null) return;
    setHolat('UPLOADING'); setNatija('');
    const r = await documentUpload({
      kompaniyaId, loyihaId, obyektId: obyekt.obyekt_id, file, documentType: tur,
    });
    if (r.ok) { setHolat('SUCCESS'); setNatija(t('Hujjat #{id} — «{ob}» obyekt papkasiga yozildi va reyestrga qayd etildi.', { id: r.document_id, ob: obyekt.obyekt_nom })); }
    else { setHolat('FAILED'); setNatija(storageXatoMatn(r.code, r.xabar)); }
  };

  return (
    <section className="fz-card p-4">
      <h2 className="fz-card__title mb-3 flex items-center gap-2"><FileUp size={16} className="text-accent" /> {t('Hujjat / F2 yuklash')}</h2>
      {!tayyor && (
        <div className="text-[12.5px] text-text-dim">{t('Yuklash uchun kompaniya, loyiha va storage‑i')} <b className="text-text">{t('TAYYOR')}</b> {t('obyekt tanlang.')}</div>
      )}
      {tayyor && obyekt && (
        <>
          <div className="mb-2 text-[12.5px] text-text-dim">{t('Manzil')}: <span className="text-text">{obyekt.obyekt_nom}</span> → {t('kanonik obyekt papkasi')}</div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setHolat('IDLE'); }}
              className="text-[12px] file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-text" />
            <select value={tur} onChange={(e) => setTur(e.target.value)}
              className="input px-2 py-1.5 text-[12px]">
              <option value="hujjat">{t('Hujjat')}</option>
              <option value="f2">{t('F2 / Bajarilgan ish dalolatnomasi')}</option>
              <option value="loyiha">{t('Loyiha chizmasi')}</option>
              <option value="aosr">{t('AOSR / yashirin ishlar')}</option>
            </select>
            <button type="button" onClick={() => void yukla()} disabled={!file || holat === 'UPLOADING'} className="fz-btn fz-btn--primary fz-btn--sm">
              <FileUp size={13} />{t('Yuklash')}
            </button>
          </div>
          {holat !== 'IDLE' && (
            <DocumentStorageStatus
              className="mt-3"
              status={holat}
              progress={holat === 'UPLOADING' ? 60 : null}
              message={natija || undefined}
            />
          )}
          {holat === 'FAILED' && (
            <button type="button" onClick={() => void yukla()} className="fz-btn fz-btn--sm mt-2">
              <RefreshCw size={12} />{t('Qayta urinish')}
            </button>
          )}
          <p className="mt-3 text-[11.5px] text-text-mute">{t('Fayl faqat obyektning saqlangan papkasiga (folder_id) yoziladi va hujjatlar reyestriga qayd etiladi. Nom bo‘yicha Drive qidiruvi yo‘q; xato bo‘lsa eski umumiy papkaga tushmaydi.')}</p>
        </>
      )}
    </section>
  );
}
