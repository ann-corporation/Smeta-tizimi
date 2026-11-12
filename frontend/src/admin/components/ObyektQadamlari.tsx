import { useInRouterContext, Link } from 'react-router-dom';
import { ArrowRight, FileCheck2, FilePlus2, FileText, HardHat } from 'lucide-react';
import type { ComponentType } from 'react';
import { t } from '../../i18n/til';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { markazHolati, qadamHolatlari, type QadamHolati, type QadamTon } from '../../lib/pto-markazi/markaz';
import { keyingiQadam, QADAM_YOL } from '../../lib/pto-markazi/keyingiQadam';
import { useForma3Holat, useIshOyi } from '../../lib/pto-markazi/useQadamMalumot';

/**
 * Oylik oqim qadam chizig'i — YAGONA kirish nuqtasi (egasi: yangi menyu emas — obyekt ekranlarining tepasida):
 * ① Fakt → ② F2 → ③ Forma 3 → ④ Hujjatlar (АОСР). Bir qator; rang faqat holat uchun; joriy qadam belgilanadi;
 * BITTA «Keyingi qadam» tugmasi. Oy — oxirgi fakt/F2 faollik oyi (yoki foydalanuvchi tanlagani), noyabr deb taxmin qilinmaydi.
 * Hisob — lib/pto-markazi (sof); bu yerda faqat chizish. Ma'lumot yuklanmasa chiplar ko'rinmaydi.
 * `f2-yasash` / `f2-import` — eski nomlar, ikkalasi ham ② F2 ga olib keladi (import F2 sahifasidagi ikkinchi bo'lim).
 */
export type QadamBelgi = 'fakt' | 'f2' | 'f2-yasash' | 'f2-import' | 'forma3' | 'hujjatlar';

type QadamKalit = 'fakt' | 'f2' | 'forma3' | 'hujjatlar';
type Qadam = { id: QadamKalit; nom: string; yol: string; Ikonka: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> };

/** Forma 3: standart — shartnoma rejimi (bitta F3, shartnomaning barcha obyektlari); obyekt shartnomaga bog'lanmagan bo'lsa sahifa o'zi obyekt rejimida qoladi. */
const F3_QIDIRUV = { f3: 'shartnoma' } as const;

const QADAMLAR: readonly Qadam[] = [
  { id: 'fakt', nom: 'Fakt', yol: QADAM_YOL.fakt, Ikonka: HardHat },
  { id: 'f2', nom: 'F2', yol: QADAM_YOL['f2-yasash'], Ikonka: FilePlus2 },
  { id: 'forma3', nom: 'Forma 3', yol: QADAM_YOL.nakopitelniy, Ikonka: FileText },
  { id: 'hujjatlar', nom: 'Hujjatlar', yol: QADAM_YOL.aosr, Ikonka: FileCheck2 },
];

const kalitga = (j: QadamBelgi | null | undefined): QadamKalit | null => (j === 'f2-yasash' || j === 'f2-import' ? 'f2' : j ?? null);

const TON_SINF: Record<QadamTon, string> = {
  ok: 'bg-ok/10 text-ok border-ok/30',
  warn: 'bg-warn/10 text-warn border-warn/35',
  info: 'bg-accent/10 text-accent border-accent/30',
  neytral: 'bg-surface-2/70 text-text-dim border-border',
};
const TON_NUQTA: Record<QadamTon, string> = { ok: 'bg-ok', warn: 'bg-warn', info: 'bg-accent', neytral: 'bg-text-mute' };

function Chip({ h }: { h: QadamHolati }) {
  return (
    <>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full sm:hidden ${TON_NUQTA[h.ton]}`} role="img" aria-label={h.matn} />
      <span className={`hidden max-w-full truncate rounded-full border px-2 py-0.5 text-sm leading-tight sm:inline-block ${TON_SINF[h.ton]}`} data-testid="qadam-chip">{h.matn}</span>
    </>
  );
}

export function ObyektQadamlari({ joriy, obyektId }: { joriy?: QadamBelgi | null; obyektId?: number | null }) {
  const ws = usePTOWorkspace();
  const routerda = useInRouterContext();
  const id = obyektId ?? ws.scope?.objectId ?? null;
  const io = useIshOyi(routerda ? id : null);
  const m = io.malumot;
  if (!routerda || id == null) return null;
  return <QadamChizig obyektId={id} joriy={kalitga(joriy)} io={io} m={m} />;
}

function QadamChizig({ obyektId: id, joriy, io, m }: { obyektId: number; joriy: QadamKalit | null; io: ReturnType<typeof useIshOyi>; m: ReturnType<typeof useIshOyi>['malumot'] }) {
  const ws = usePTOWorkspace();
  const yuklandi = m.aktlar != null;
  const obyekt = (ws.objects ?? []).find((o) => o.id === id) ?? null;
  const oy = io.oy;
  const asos = { smetaJami: obyekt?.jami ?? null, narxsiz: obyekt?.narxsiz ?? null, aktlar: m.aktlar, importQoralama: m.importQoralama, oy };
  const f3Kerak = yuklandi && (markazHolati({ ...asos, forma3: null }).f2TasdiqBuOyda ?? 0) > 0;
  const forma3 = useForma3Holat(id, oy, f3Kerak);
  const holat = markazHolati({ ...asos, forma3 });
  const holatlar = yuklandi ? qadamHolatlari(holat) : null;
  /* «Keyingi qadam» faqat hamma kerakli ma'lumot bor bo'lganda (obyekt va akt reestri) — taxmin qilinmaydi. */
  const keyingi = yuklandi && obyekt ? keyingiQadam(holat) : null;
  const search = ws.scopeSearch?.(id) ?? '';
  const havola = (pathname: string, qoshimcha?: Record<string, string>) => {
    if (!qoshimcha) return { pathname, search };
    const p = new URLSearchParams(search);
    for (const [k, v] of Object.entries(qoshimcha)) p.set(k, v);
    const s = p.toString();
    return { pathname, search: s ? `?${s}` : '' };
  };
  const yoli = (pathname: string) => (pathname === QADAM_YOL.nakopitelniy ? havola(pathname, F3_QIDIRUV) : havola(pathname));
  const chipOl = (q: Qadam): QadamHolati | undefined => {
    if (!holatlar) return undefined;
    if (q.id === 'fakt') return holatlar.fakt;
    if (q.id === 'f2') return (m.importQoralama ?? 0) > 0 ? holatlar['f2-import'] : holatlar['f2-yasash'];
    if (q.id === 'forma3') return holatlar.nakopitelniy;
    return undefined;
  };

  return (
    <nav aria-label={t('Obyekt qadamlari')} data-testid="obyekt-qadamlari" className="flex flex-wrap items-stretch gap-2">
      <ol className="m-0 grid min-w-0 flex-1 list-none grid-cols-4 gap-1.5 p-0 sm:gap-2">
        {QADAMLAR.map((q, i) => {
          const faol = joriy === q.id;
          const h = chipOl(q);
          const korsat = !!h && h.matn !== '—';
          return (
            <li key={q.id} className="min-w-0">
              <Link
                to={yoli(q.yol)}
                aria-current={faol ? 'step' : undefined}
                title={t(q.nom)}
                className={`flex h-full min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 py-1.5 text-center text-sm font-semibold no-underline transition-colors sm:flex-row sm:gap-2 sm:px-3 ${faol ? 'border-accent bg-accent/10 text-text' : 'border-border bg-surface text-text-dim hover:border-accent/50 hover:text-text'}`}
              >
                <span className="flex items-center gap-1.5">
                  <q.Ikonka aria-hidden className="h-4 w-4 shrink-0" />
                  <span className="shrink-0">{i + 1}</span>
                  <span className="hidden min-w-0 truncate min-[420px]:inline">{t(q.nom)}</span>
                </span>
                {korsat ? <Chip h={h} /> : null}
              </Link>
            </li>
          );
        })}
      </ol>
      {io.aniq ? (
        <span className="inline-flex min-h-[48px] items-center text-sm text-text-mute" data-testid="ish-oyi" title={io.manba === 'faollik' ? t('Oxirgi fakt yoki F2 bor oy') : undefined}>{t('Ish oyi')}: <b className="ml-1 text-text">{oy}</b></span>
      ) : null}
      {keyingi ? (
        <Link
          to={yoli(QADAM_YOL[keyingi.qadam])}
          title={keyingi.izoh}
          data-testid="keyingi-qadam"
          className="fz-btn fz-btn--primary inline-flex min-h-[48px] w-full items-center justify-center gap-2 text-sm font-semibold no-underline sm:w-auto"
        >
          <span className="truncate">{keyingi.sarlavha}</span>
          <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />
        </Link>
      ) : null}
    </nav>
  );
}
