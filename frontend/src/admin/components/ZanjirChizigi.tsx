import { useInRouterContext, Link } from 'react-router-dom';
import { ArrowRight, Check, CircleDashed, Lock, HelpCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { t } from '../../i18n/til';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { useForma3Holat, useIshOyi } from '../../lib/pto-markazi/useQadamMalumot';
import { ZANJIR_YOL, zanjirHisobla, zanjirKirishYasa, type QadamHolat, type ZanjirKirish, type ZanjirQadamId } from '../../lib/zanjir/qadamlar';

/**
 * Pudratchi ish zanjiri chizig'i — YAGONA «keyingi qadam» vidjeti (obyekt sahifasi va zanjirning hamma qadam sahifalari).
 * Smeta → Fakt → АОСР → F2 → Forma 3 → To'lov. Hisob — lib/zanjir/qadamlar (sof); bu yerda faqat chizish.
 * Ma'lumot: mavjud keshlangan hook (akt reestri; obyekt sahifasi bilan bir so'rov), obyekt jami — workspace ro'yxatidan.
 * Yangi so'rov YO'Q. Sahifada bor bo'lgan qo'shimcha ma'lumot (masalan АОСР qamrovi) `aosr` orqali beriladi; yo'q bo'lsa — noma'lum.
 * Har qadam — o'sha ish bajariladigan sahifaga havola (obyekt va tanlangan davr qidiruv qatorida ketadi).
 */
export type ZanjirBelgi = ZanjirQadamId;

const IKONKA: Record<QadamHolat, ReactNode> = {
  done: <Check aria-hidden className="h-3.5 w-3.5" />,
  current: <ArrowRight aria-hidden className="h-3.5 w-3.5" />,
  blocked: <Lock aria-hidden className="h-3.5 w-3.5" />,
  not_started: <CircleDashed aria-hidden className="h-3.5 w-3.5" />,
  unknown: <HelpCircle aria-hidden className="h-3.5 w-3.5" />,
};
const HOLAT_NOMI: Record<QadamHolat, () => string> = {
  done: () => t('Bajarilgan'), current: () => t('Hozir'), blocked: () => t('Bloklangan'), not_started: () => t('Navbatda'), unknown: () => t('Noma‘lum'),
};
const HOLAT_SINF: Record<QadamHolat, string> = {
  done: 'border-ok/30 bg-ok/10 text-ok',
  current: 'border-accent bg-accent/10 text-text',
  blocked: 'border-border bg-surface-2/60 text-text-mute',
  not_started: 'border-border bg-surface text-text-dim',
  unknown: 'border-dashed border-border bg-surface text-text-mute',
};

export function ZanjirChizigi({ joriy, obyektId, aosr }: { joriy?: ZanjirBelgi | null; obyektId?: number | null; aosr?: ZanjirKirish['aosr'] }) {
  const ws = usePTOWorkspace();
  const routerda = useInRouterContext();
  const id = obyektId ?? ws.scope?.objectId ?? null;
  if (!routerda || id == null) return null;
  return <Chizig obyektId={id} joriy={joriy ?? null} aosr={aosr ?? null} />;
}

function Chizig({ obyektId: id, joriy, aosr }: { obyektId: number; joriy: ZanjirBelgi | null; aosr: ZanjirKirish['aosr'] }) {
  const ws = usePTOWorkspace();
  const io = useIshOyi(id);
  const aktlar = io.malumot.aktlar;
  const obyekt = (ws.objects ?? []).find((o) => o.id === id) ?? null;
  const asos = { obyekt, aktlar, oy: io.oy, aosr };
  /* Forma 3 soni faqat shu oyda tasdiqlangan F2 bor bo'lsagina o'qiladi (mavjud kelishuv) — boshqa holatda null (noma'lum). */
  const f3Kerak = (zanjirKirishYasa(asos).f2TasdiqBuOyda ?? 0) > 0;
  const forma3 = useForma3Holat(id, io.oy, f3Kerak);
  const natija = zanjirHisobla(zanjirKirishYasa({ ...asos, forma3 }));
  const search = ws.scopeSearch?.(id) ?? '';
  const havola = (q: ZanjirQadamId) => {
    const p = new URLSearchParams(search);
    if (q === 'f3') p.set('f3', 'shartnoma');
    if (q === 'tolov') p.set('tab', 'tolov');
    const s = p.toString();
    return { pathname: q === 'smeta' ? `${ZANJIR_YOL.smeta}/${id}` : ZANJIR_YOL[q], search: s ? `?${s}` : '' };
  };
  const keyingi = natija.keyingi;

  return (
    <nav aria-label={t('Ish zanjiri')} data-testid="zanjir-chizigi" className="flex min-w-0 flex-col gap-2">
      <ol className="m-0 flex min-w-0 list-none flex-wrap gap-1.5 p-0">
        {natija.qadamlar.map((q, i) => {
          const faol = joriy === q.id;
          const tavsiya = keyingi?.id === q.id;
          return (
            <li key={q.id} className="min-w-0 flex-1 basis-[7.5rem]" data-holat={q.holat}>
              <Link
                to={havola(q.id)}
                aria-current={faol ? 'step' : undefined}
                title={`${q.nom} — ${q.izoh}`}
                data-testid={`zanjir-qadam-${q.id}`}
                className={`flex h-full min-h-[44px] min-w-0 flex-col justify-center gap-0.5 rounded-lg border px-2 py-1.5 text-sm no-underline transition-colors hover:border-accent/60 ${HOLAT_SINF[q.holat]} ${faol ? 'ring-2 ring-accent/60' : ''} ${tavsiya ? 'font-semibold' : ''}`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 tabular-nums">{i + 1}</span>
                  <span className="min-w-0 truncate font-semibold">{q.nom}</span>
                  <span className="ml-auto shrink-0" role="img" aria-label={HOLAT_NOMI[q.holat]()}>{IKONKA[q.holat]}</span>
                </span>
                <span className="min-w-0 truncate text-xs leading-tight opacity-80" data-testid={`zanjir-izoh-${q.id}`}>{q.izoh}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {io.aniq ? (
          <span className="text-sm text-text-mute" data-testid="ish-oyi" title={io.manba === 'faollik' ? t('Oxirgi fakt yoki F2 bor oy') : undefined}>{t('Ish oyi')}: <b className="ml-1 text-text">{io.oy}</b></span>
        ) : null}
        {keyingi ? (
          <>
            <Link
              to={havola(keyingi.id)}
              data-testid="keyingi-qadam"
              className="fz-btn fz-btn--primary inline-flex min-h-[44px] max-w-full items-center justify-center gap-2 text-sm font-semibold no-underline"
            >
              <span className="truncate">{keyingi.amal}</span>
              <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />
            </Link>
            <span className="min-w-0 flex-1 basis-48 text-sm text-text-dim" data-testid="keyingi-sabab">
              {keyingi.sabab}{keyingi.eslatma ? ` · ${keyingi.eslatma}` : ''}
            </span>
          </>
        ) : natija.tugallandi ? (
          <span className="text-sm text-ok" data-testid="zanjir-tugadi">{t('Zanjir shu oy uchun yopilgan')}</span>
        ) : null}
      </div>
    </nav>
  );
}
