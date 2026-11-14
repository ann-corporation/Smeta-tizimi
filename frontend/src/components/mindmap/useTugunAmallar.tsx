/**
 * Tugun amallari — YAGONA manba: `MindmapXarita` (xarita/jadval) ham, karta kanvasi (`test02/KartaQatlam`) ham shu hookdan foydalanadi.
 * Amallar: `tugunAmallari` (sahifaga o‘tish, mas‘ul, topshiriq) + `pultAmallari` (yaratish/biriktirish/uzish/nomlash). Karta uchun
 * `maxsusOl` — tomon kabi graf daraxtida yo‘q tugunlarning o‘z amallari (`fn` yoki `yol` bilan).
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MindmapGraf } from '../../api/t2-mindmap';
import { tugunAmallari, type Amal, type AmalKorish, type AmalNishon } from '../../lib/mindmap-amallar';
import { pultAmallari, pultNishon } from '../../lib/mindmap-pult';
import type { XDaraxt } from '../../lib/mindmap-korinish';
import { t } from '../../i18n/til';
import { AmalMenyu, MasulQilishModal, VazifaModal, type MenyuHolati, type VazifaBoshqaruv } from './AmalMenyu';
import { PultAmalModal, type PultTugatdi } from './PultAmalModal';
import type { MasulBoshqaruv } from './XaritaJamoa';
import type { PultKontekst } from '../../lib/mindmap-pult';

export type PultBoshqaruvKichik = { kontekst: PultKontekst; onTugadi: (t: PultTugatdi) => void };
export type MaxsusAmal = Amal & { fn?: () => void };
export type ModalHolati = { tur: 'masul'; odamId: string } | { tur: 'vazifa'; odamId: string | null; obyektId: number | null } | { tur: 'pult'; nishonId: string; amal: string } | null;

const YOPIQ_KORISH: AmalKorish = { superadmin: false, rol: '', permissions: [], boshqaKompaniya: false };
export const yaratishAmalimi = (a: Amal) => a.ikon === 'yangi' || a.kalit === 'pult:shartnoma.obyekt-biriktir';
const nishonNomi = (n: AmalNishon) => (n.tur === 'kompaniya' ? n.nom || t('Kompaniya') : (n.tur as string) === 'jamoa' ? t('Jamoa') : n.nom);

export function useTugunAmallar(p: {
  graf: MindmapGraf; daraxt: XDaraxt; pult?: PultBoshqaruvKichik; amalKorish?: AmalKorish; masul?: MasulBoshqaruv; vazifa?: VazifaBoshqaruv;
  /** Tugun id → amal nishoni (chaqiruvchi o‘z daraxtiga ko‘ra). */
  nishonOl: (id: string) => AmalNishon | null;
  /** Daraxtda yo‘q tugunlarning (tomon…) o‘z amallari. */
  maxsusOl?: (id: string) => { nom: string; amallar: MaxsusAmal[] } | null;
  /** «Panelda ochish / mas‘ul biriktirish» amallari: chaqiruvchi paneli. */
  onPanel: (n: AmalNishon, a: Amal) => void;
}) {
  const { graf, daraxt, pult, amalKorish, masul, vazifa, nishonOl, maxsusOl, onPanel } = p;
  const navigate = useNavigate();
  const [menyu, setMenyu] = useState<(MenyuHolati & { nishon: AmalNishon }) | null>(null);
  const [modal, setModal] = useState<ModalHolati>(null);
  const kontekst = useMemo(() => ({ ...(amalKorish ?? YOPIQ_KORISH), pul: !daraxt.pulYoq, masul: !!masul?.mumkin }), [amalKorish, daraxt.pulYoq, masul?.mumkin]);

  const amallarOl = useCallback((n: AmalNishon): Amal[] => {
    const asos = tugunAmallari(n, kontekst).filter((a) => a.modal !== 'vazifa' || !!vazifa);
    if (!pult) return asos;
    return [...asos, ...pultAmallari(graf, pultNishon(graf, n.id), pult.kontekst.tahrir).map((a): Amal => ({
      kalit: 'pult:' + a.kalit, nom: a.nom, ikon: a.kalit.includes('yarat') ? 'yangi' : a.kalit.includes('nomla') ? 'nomlash' : a.kalit.endsWith('-uz') || a.kalit.endsWith('.uz') ? 'uzish' : 'ulash',
      bajar: 'pult', yol: null, modal: null, panel: null, mumkin: a.mumkin, sabab: a.sabab, pult: a.kalit,
    }))];
  }, [kontekst, vazifa, pult, graf]);

  /** Id bo‘yicha: avval maxsus (tomon…), keyin umumiy nishon. */
  const idAmallari = useCallback((id: string): { nishon: AmalNishon; nom: string; amallar: Amal[] } | null => {
    const m = maxsusOl?.(id);
    if (m) return { nishon: { tur: 'kontragent', id, entityId: null, nom: m.nom } as AmalNishon, nom: m.nom, amallar: m.amallar };
    const n = nishonOl(id);
    return n ? { nishon: n, nom: nishonNomi(n), amallar: amallarOl(n) } : null;
  }, [maxsusOl, nishonOl, amallarOl]);

  const menyuOchNishon = useCallback((n: AmalNishon, x: number, y: number, amallar?: Amal[]) => {
    setMenyu({ nishon: n, nishonNom: nishonNomi(n), amallar: amallar ?? amallarOl(n), x, y });
  }, [amallarOl]);
  const menyuOchId = useCallback((id: string, x: number, y: number, faqatYaratish = false) => {
    const r = idAmallari(id);
    if (r) setMenyu({ nishon: r.nishon, nishonNom: r.nom, amallar: faqatYaratish ? r.amallar.filter(yaratishAmalimi) : r.amallar, x, y });
  }, [idAmallari]);
  const amalSoni = useCallback((id: string) => idAmallari(id)?.amallar.length ?? 0, [idAmallari]);
  const yaratishBor = useCallback((id: string) => !!pult && (idAmallari(id)?.amallar.some(yaratishAmalimi) ?? false), [idAmallari, pult]);

  const bajar = (a: MaxsusAmal) => {
    const n = menyu?.nishon;
    setMenyu(null);
    if (!n || !a.mumkin) return;
    if (a.fn) { a.fn(); return; }
    if (a.bajar === 'pult' && a.pult) { setModal({ tur: 'pult', nishonId: n.id, amal: a.pult }); return; }
    if (a.bajar === 'yol' && a.yol) { navigate(a.yol); return; }
    if (a.modal === 'masul') { setModal({ tur: 'masul', odamId: n.id }); return; }
    if (a.modal === 'vazifa') { setModal({ tur: 'vazifa', odamId: n.tur === 'odam' ? n.id : null, obyektId: n.tur === 'obyekt' ? n.entityId : null }); return; }
    if (a.panel === 'tanla' || a.panel === 'masul') onPanel(n, a);
  };

  const qatlam: ReactNode = (
    <>
      {menyu && <AmalMenyu holat={menyu} onYop={() => setMenyu(null)} onBajar={bajar} />}
      {modal?.tur === 'pult' && pult && <PultAmalModal graf={graf} nishonId={modal.nishonId} amalKalit={modal.amal} kontekst={pult.kontekst} onYop={() => setModal(null)} onTugadi={pult.onTugadi} />}
      {modal?.tur === 'masul' && masul && <MasulQilishModal daraxt={daraxt} odamId={modal.odamId} masul={masul} onYop={() => setModal(null)} />}
      {modal?.tur === 'vazifa' && vazifa && <VazifaModal daraxt={daraxt} odamId={modal.odamId} obyektId={modal.obyektId} vazifa={vazifa} onYop={() => setModal(null)} />}
    </>
  );
  return { amallarOl, menyuOchNishon, menyuOchId, amalSoni, yaratishBor, modalOch: setModal, qatlam };
}
