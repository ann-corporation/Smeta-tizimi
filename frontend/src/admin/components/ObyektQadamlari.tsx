import { useInRouterContext, Link } from 'react-router-dom';
import { ArrowRight, FileCheck2, FileInput, FilePlus2, HardHat } from 'lucide-react';
import type { ComponentType } from 'react';
import { t } from '../../i18n/til';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { markazHolati, qadamHolatlari, type QadamHolati, type QadamId, type QadamTon } from '../../lib/pto-markazi/markaz';
import { keyingiQadam, QADAM_YOL } from '../../lib/pto-markazi/keyingiQadam';
import { useQadamMalumot } from '../../lib/pto-markazi/useQadamMalumot';

/**
 * B0 qadam chizig'i (egasi: yangi menyu emas — mavjud obyekt ekranlarining tepasida): ① Fakt → ② F2 yasash → ③ F2 import
 * → ④ Hujjatlar. Bir qator; rang faqat holat uchun; joriy qadam belgilanadi; BITTA «Keyingi qadam» tugmasi.
 * Hisob — lib/pto-markazi (sof); bu yerda faqat chizish. Ma'lumot yuklanmasa chiplar ko'rinmaydi.
 */
export type QadamBelgi = 'fakt' | 'f2-yasash' | 'f2-import' | 'hujjatlar';

type Qadam = { id: QadamBelgi; nom: string; yol: string; Ikonka: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>; holat: QadamId };

const QADAMLAR: readonly Qadam[] = [
  { id: 'fakt', nom: 'Fakt', yol: QADAM_YOL.fakt, Ikonka: HardHat, holat: 'fakt' },
  { id: 'f2-yasash', nom: 'F2 yasash', yol: QADAM_YOL['f2-yasash'], Ikonka: FilePlus2, holat: 'f2-yasash' },
  { id: 'f2-import', nom: 'F2 import', yol: QADAM_YOL['f2-import'], Ikonka: FileInput, holat: 'f2-import' },
  { id: 'hujjatlar', nom: 'Hujjatlar', yol: QADAM_YOL.nakopitelniy, Ikonka: FileCheck2, holat: 'f2-paket' },
];

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
  const m = useQadamMalumot(ws.companyId, routerda ? id : null);
  if (!routerda || id == null) return null;

  const obyekt = (ws.objects ?? []).find((o) => o.id === id) ?? null;
  const yuklandi = m.aktlar != null;
  const oy = ws.scope?.periodId ?? new Date().toISOString().slice(0, 7);
  const holat = markazHolati({ smetaJami: obyekt?.jami ?? null, narxsiz: obyekt?.narxsiz ?? null, aktlar: m.aktlar, importQoralama: m.importQoralama, forma3: null, oy });
  const holatlar = yuklandi ? qadamHolatlari(holat) : null;
  /* «Keyingi qadam» faqat hamma kerakli ma'lumot bor bo'lganda (obyekt va akt reestri) — taxmin qilinmaydi. */
  const keyingi = yuklandi && obyekt ? keyingiQadam(holat) : null;
  const search = ws.scopeSearch?.(id) ?? '';
  const havola = (pathname: string) => ({ pathname, search });

  return (
    <nav aria-label={t('Obyekt qadamlari')} data-testid="obyekt-qadamlari" className="flex flex-wrap items-stretch gap-2">
      <ol className="m-0 grid min-w-0 flex-1 list-none grid-cols-4 gap-1.5 p-0 sm:gap-2">
        {QADAMLAR.map((q, i) => {
          const faol = joriy === q.id;
          const h = holatlar?.[q.holat];
          const korsat = !!h && h.matn !== '—';
          return (
            <li key={q.id} className="min-w-0">
              <Link
                to={havola(q.yol)}
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
      {keyingi ? (
        <Link
          to={havola(QADAM_YOL[keyingi.qadam])}
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
