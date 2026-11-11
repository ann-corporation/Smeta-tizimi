import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { F2Oyna } from './F2Oyna';
import type { T2Qator } from '../../api/supabase';
import { yangiOperationId } from '../../api/supabase';
import { t } from '../../i18n/til';
import { sbT2ZamenaAlmashtirishBelgila, sbT2IshResurslarBilanYarat, sbT2QoshimchaIshYarat, sbT2ZamenaIshYarat, sbT2ResursBolaQosh } from '../../api/t2-additional-replacement';
import type { RejaliBuyruq } from '../../lib/f2-moslash-v3/rejali';
import { zamenaBirlikFarqli, zamenaRejaXatosi } from '../../lib/f2-moslash-v3/zamenaReja';

/** Modal REJALI rejimda serverga yozmaydi — buyruqni sahifaga beradi (oxirida «Saqlash» bilan bittada yoziladi). */
export type ModalRejali = Omit<RejaliBuyruq, 'tempId' | 'resursTempIds' | 'f2Uid' | 'f2ResursUidlar'>;

/**
 * T2-PTO-OWNER-CRITICAL-CLOSURE: the old system's F2-import gesture the
 * owner asked to restore -- drop an unmatched F2 source line onto the Smeta
 * tree to CREATE the missing canonical row and bind it in one motion,
 * instead of a disconnected form. This modal is the confirm/adjust step
 * ("bu qanaqa ish yoki material, qo'shimchami yoki zamenami" -- the system
 * would ask) between the drop gesture and the actual write.
 *
 * Reuses the exact same commands AdditionalReplacementNative.tsx already
 * calls (t2_qoshimcha_ish_yarat_v1 / t2_zamena_ish_yarat_v1 /
 * t2_resurs_bola_qosh_v1) -- OLD+NEW law unchanged: replacement NEVER
 * mutates the old row, it inserts a new one with replaces_line_id.
 */
/** `keyinId` — yangi qator shu qatordan (va uning resurslaridan) KEYIN joylashadi (egasi
 *  2026-09-29: "foydalanuvchi o'zi xohlagan qatorlar orasiga"); `parent` ning o'zi — birinchi
 *  o'rin. Zamena doim almashtirilgan qatordan keyin. */
export type DropAction =
  | { kind: 'replacement'; oldRow: T2Qator; parent: T2Qator }
  | { kind: 'additional'; parent: T2Qator; keyinId?: number }
  | { kind: 'resource'; parent: T2Qator; keyinId?: number };

export interface F2AddReplModalProps {
  action: DropAction;
  companyId: number;
  objectId: number;
  initialNom: string;
  initialKod?: string;
  initialBirlik?: string;
  initialHajm?: number;
  onClose: () => void;
  /** Ish yaratilganda F2 dagi resurslari — BIR so'rovda birga yaratiladi (egasi: zamena kuttirmasin). */
  resurslar?: Array<{ tur: 'rs' | 'mat' | 'ob'; nom: string; birlik: string; hajm?: number | null; kod?: string | null }>;
  onCreated: (qatorId: number, resursQatorIdlar?: number[]) => void;
  /** Qo'shimcha pozitsiya turi (egasi 2026-09-29, Karting АРМАТУРА): resurssiz «С» material ish
   *  (bl) emas — smetadagi kabi material (mat, kategoriya МАТ) bo'lib yaratiladi. */
  initialTur?: 'bl' | 'mat' | 'ob';
  /** Berilsa — serverga yozilmaydi, qoralamaga qo'shiladi (egasi 2026-10-20: har birida kutmaslik). */
  onRejali?: (b: ModalRejali) => void;
}

const turLabel = (): Record<string, string> => ({ rs: t('Resurs (RS)'), mat: t('Material (MAT)'), ob: t('Uskuna (OB)') });

export function F2AddReplModal(p: F2AddReplModalProps) {
  const { action } = p;
  const [nom, setNom] = useState(p.initialNom);
  const [kod, setKod] = useState(p.initialKod || '');
  const [birlik, setBirlik] = useState(p.initialBirlik || '');
  const [hajm, setHajm] = useState(p.initialHajm != null ? String(+p.initialHajm.toPrecision(12)) : '');
  const [resTur, setResTur] = useState<'rs' | 'mat' | 'ob'>('rs');
  /** Qo'shimcha: ish (bl) yoki razdel ostidagi material/uskuna pozitsiyasi. */
  const [qTur, setQTur] = useState<'bl' | 'mat' | 'ob'>(p.initialTur ?? 'bl');
  const [sabab, setSabab] = useState(
    action.kind === 'replacement' ? 'F2 importda topilgan zamena' : 'F2 importda topilgan qo‘shimcha ish',
  );
  const [busy, setBusy] = useState(false);
  /** Birlik farqli zamena: aslning qancha hajmini almashtiradi (aslning birligida; ixtiyoriy -- bo'sh = asl to'liq almashtirilgan). */
  const [almHajm, setAlmHajm] = useState('');
  const aslBirlik = action.kind === 'replacement' ? (action.oldRow.birlik ?? '') : '';
  // P6 (F2 import auditi 2026-11-09): birlik farqli zamenada almashtiriladigan hajm (aslning birligida) MAJBURIY —
  // bitta F2 hajmi boshqa birlikda reja bo'lib qolsa, asl qatorning qoldig'i minusga tushadi.
  const birlikFarqli = action.kind === 'replacement' && zamenaBirlikFarqli(aslBirlik, birlik);
  /* Qayta urinishda AYNI operatsiya — tarmoq uzilsa ham dublikat yaratilmaydi. */
  const opRef = useRef(yangiOperationId());
  const resurslar = action.kind !== 'resource' ? (p.resurslar ?? []) : [];
  const [error, setError] = useState('');

  const sarlavha =
    action.kind === 'replacement' ? t('Zamena — "{nom}" o‘rniga', { nom: action.oldRow.nom ?? '—' })
      : action.kind === 'additional' ? t('Qo‘shimcha ish — "{nom}" ostiga', { nom: action.parent.nom ?? '—' })
        : t('Resurs qo‘shish — "{nom}" ostiga', { nom: action.parent.nom ?? '—' });
  const joyMatni = action.kind === 'replacement' ? t('Joyi: «{nom}» dan keyin', { nom: action.oldRow.nom ?? '—' })
    : action.keyinId == null ? t('Joyi: ota qator oxirida')
      : action.keyinId === action.parent.id ? t('Joyi: birinchi o‘rinda') : t('Joyi: tanlangan qatordan keyin');
  const turNomi = action.kind === 'replacement' ? t('Zamena') : action.kind === 'additional' ? t('Qo‘shimcha ish') : t('Qo‘shimcha resurs');
  const turStamp = action.kind === 'replacement' ? 'fz-stamp--warn' : 'fz-stamp--info';

  async function submit() {
    if (!nom.trim() || !birlik.trim() || !sabab.trim()) { setError(t('Nom, birlik va sabab majburiy.')); return; }
    const hajmSoni = hajm.trim() === '' ? undefined : Number(hajm.replace(',', '.'));
    // Minus hajm ruxsat (egasi 2026-10-24): norma tuzatuvchi ishlar — «на каждый мм изменения толщины …» K=7 —
    // loyiha/norma farqini AYIRADI (masalan 10 mm normada, loyihada 7 mm → minus). Faqat 0 va bo'sh — yo'q.
    if (action.kind !== 'resource' && (hajmSoni === undefined || !Number.isFinite(hajmSoni) || hajmSoni === 0)) {
      setError(t('Hajm 0 dan farqli son bo‘lishi shart (minus ham mumkin — norma tuzatuvchi ish).')); return;
    }
    const almSoni = birlikFarqli && almHajm.trim() !== '' ? Number(almHajm.replace(',', '.')) : null;
    if (almSoni != null && (!Number.isFinite(almSoni) || almSoni < 0)) { setError(t('Almashtiriladigan hajm manfiy bo‘lmagan son bo‘lishi shart.')); return; }
    if (action.kind === 'replacement' && zamenaRejaXatosi({ aslBirlik, aslHajm: action.oldRow.hajm, birlik, almashtirishHajm: almSoni })) {
      setError(almSoni == null
        ? t('Birlik farqli zamena: asl qatorning qancha hajmini ({birlik}) almashtirishini kiriting — aks holda qoldiq minusga tushadi.', { birlik: aslBirlik })
        : t('Almashtiriladigan hajm asl qator hajmidan katta.'));
      return;
    }
    if (p.onRejali) {
      p.onRejali({
        kind: action.kind, tur: action.kind === 'resource' ? resTur : (resurslar.length ? 'bl' : qTur),
        otaQatorId: action.parent.id, almashtirilayotganQatorId: action.kind === 'replacement' ? action.oldRow.id : undefined,
        keyinQatorId: action.kind === 'replacement' ? action.oldRow.id : action.keyinId,
        nom: nom.trim(), birlik: birlik.trim(), hajm: hajmSoni, kod: kod.trim() || undefined, sabab: sabab.trim(),
        resurslar, operationId: opRef.current, almashtirishHajm: almSoni,
      });
      return;
    }
    setBusy(true); setError('');
    const asos = {
      kompaniyaId: p.companyId, obyektId: p.objectId, otaQatorId: action.parent.id,
      nom: nom.trim(), birlik: birlik.trim(), hajm: hajmSoni as number,
      kod: kod.trim() || undefined, sabab: sabab.trim(),
      operationId: opRef.current, expectedVersion: action.parent.versiya,
      keyinQatorId: action.kind === 'replacement' ? action.oldRow.id : action.keyinId,
    };
    try {
      if (resurslar.length && action.kind !== 'resource') {
        const rr = await sbT2IshResurslarBilanYarat({
          ...asos, command: action.kind === 'replacement' ? 'replacement' : 'additional',
          almashtirilayotganQatorId: action.kind === 'replacement' ? action.oldRow.id : undefined,
          resurslar,
        });
        if (!rr.ok || rr.qator_id == null) { setError(rr.xabar || rr.error || t('Saqlanmadi.')); return; }
        if (almSoni != null) {
          const m = await sbT2ZamenaAlmashtirishBelgila({ kompaniyaId: p.companyId, qatorId: rr.qator_id, hajm: almSoni });
          if (!m.ok) { setError(m.xabar || m.error || t('Almashtirish hajmi saqlanmadi.')); return; }
        }
        p.onCreated(rr.qator_id, rr.resurs_qator_idlar ?? []);
        return;
      }
      const r = action.kind === 'replacement'
        ? await sbT2ZamenaIshYarat({ ...asos, almashtirilayotganQatorId: action.oldRow.id })
        : action.kind === 'additional'
          ? (qTur === 'bl' ? await sbT2QoshimchaIshYarat(asos) : await sbT2ResursBolaQosh({ ...asos, tur: qTur, hajm: hajmSoni }))
          : await sbT2ResursBolaQosh({ ...asos, tur: resTur, hajm: hajmSoni });
      if (!r.ok || r.qator_id == null) { setError(r.xabar || r.error || t('Saqlanmadi.')); return; }
      if (action.kind === 'replacement' && almSoni != null) {
        const m = await sbT2ZamenaAlmashtirishBelgila({ kompaniyaId: p.companyId, qatorId: r.qator_id, hajm: almSoni });
        if (!m.ok) { setError(m.xabar || m.error || t('Almashtirish hajmi saqlanmadi.')); return; }
      }
      p.onCreated(r.qator_id);
    } catch { setError(t('Tarmoq xatosi — qayta urinib ko‘ring.')); }
    finally { setBusy(false); }
  }

  return (
    <F2Oyna label={sarlavha} kenglik={480} onYop={busy ? undefined : p.onClose}>
      <div className="fz-card__head" style={{ alignItems: 'flex-start' }}>
        <div className="min-w-0">
          <span className={`fz-stamp ${turStamp}`}>{turNomi}</span>
          <h3 className="fz-card__title" style={{ marginTop: 6 }}>{sarlavha}</h3>
          {action.kind === 'replacement' && <p className="fz-card__sub">{t('Almashtirilayotgan')}: {[action.oldRow.kod, action.oldRow.nom].filter(Boolean).join(' ')} · {action.oldRow.hajm ?? '—'} {action.oldRow.birlik ?? ''}</p>}
        </div>
        <button type="button" onClick={p.onClose} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={t('Yopish')} disabled={busy}><X size={16} /></button>
      </div>
      <div className="fz-card__body">
        {action.kind === 'additional' && !resurslar.length && (
          <label className="mb-3 block text-[13px]">
            <span className="text-[12px] text-text-dim">{t('Pozitsiya turi')}</span>
            <select value={qTur} onChange={e => setQTur(e.target.value as 'bl' | 'mat' | 'ob')} className="mt-1 block h-9 w-full px-2.5 text-[13px]">
              <option value="bl">{t('Ish (resurssiz)')}</option>
              <option value="mat">{t('Material («С», kategoriya birlikdan)')}</option>
              <option value="ob">{t('Uskuna / oborudovaniye')}</option>
            </select>
          </label>
        )}
        {action.kind === 'resource' && (
          <label className="mb-3 block text-[13px]">
            <span className="text-[12px] text-text-dim">{t('Turi')}</span>
            <select value={resTur} onChange={e => setResTur(e.target.value as 'rs' | 'mat' | 'ob')} className="mt-1 block h-9 w-full px-2.5 text-[13px]">
              {Object.entries(turLabel()).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}
        <label className="mb-3 block text-[13px]">
          <span className="text-[12px] text-text-dim">{t('Kod (ixtiyoriy)')}</span>
          <input value={kod} onChange={e => setKod(e.target.value)} className="mt-1 block h-9 w-full px-2.5 text-[13px]" />
        </label>
        <label className="mb-3 block text-[13px]">
          <span className="text-[12px] text-text-dim">{t('Nomi')}</span>
          <input value={nom} onChange={e => setNom(e.target.value)} autoFocus data-boshlang-fokus className="mt-1 block h-9 w-full px-2.5 text-[13px]" />
        </label>
        <div className="mb-3 flex gap-3">
          <label className="block flex-1 text-[13px]">
            <span className="text-[12px] text-text-dim">{t('Birlik')}</span>
            <input value={birlik} onChange={e => setBirlik(e.target.value)} className="mt-1 block h-9 w-full px-2.5 text-[13px]" />
          </label>
          <label className="block flex-1 text-[13px]">
            <span className="text-[12px] text-text-dim">{action.kind === 'resource' ? t('Hajm (ixtiyoriy)') : t('Hajm')}</span>
            <input type="number" value={hajm} onChange={e => setHajm(e.target.value)} className="mt-1 block h-9 w-full px-2.5 text-[13px]" />
          </label>
        </div>
        {birlikFarqli && (
          <label className="mb-3 block text-[13px]">
            <span className="text-[12px] text-text-dim">{t('Asl qatorning qancha hajmini almashtiradi ({birlik}, majburiy — birlik farqli)', { birlik: aslBirlik })}</span>
            <input type="number" min="0" value={almHajm} onChange={e => setAlmHajm(e.target.value)} required
              placeholder={t('Asl qator hajmi: {h}', { h: action.kind === 'replacement' ? String(action.oldRow.hajm ?? '—') : '—' })} className="mt-1 block h-9 w-full px-2.5 text-[13px]" />
            <span className="mt-1 block text-[11px] text-warn">{t('Zamena birligi asl qatorniki bilan bir xil emas: reja bitta F2 hajmidan emas, asl qatorning almashtiriladigan hajmidan hisoblanadi.')}</span>
          </label>
        )}
        <label className="mb-3 block text-[13px]">
          <span className="text-[12px] text-text-dim">{t('Sabab')}</span>
          <input value={sabab} onChange={e => setSabab(e.target.value)} className="mt-1 block h-9 w-full px-2.5 text-[13px]" />
        </label>
        <p className="fz-note fz-note--info" style={{ marginBottom: 8 }}>{joyMatni}</p>
        {resurslar.length > 0 && <p className="mb-3 text-[12px] text-text-dim">{t('F2 dagi {n} ta resurs ham shu ish ostida birga yaratiladi va bog‘lanadi (bitta amal).', { n: resurslar.length })}</p>}
        {error && <p role="alert" className="mb-3 text-[12px] text-danger">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">
        <button type="button" onClick={p.onClose} className="fz-btn" disabled={busy}>{t('Bekor qilish')}</button>
        <button type="button" onClick={() => void submit()} disabled={busy} className="fz-btn fz-btn--primary">
          {busy ? t('Yaratilmoqda…') : t('Yaratish va bog‘lash')}
        </button>
      </div>
    </F2Oyna>
  );
}
