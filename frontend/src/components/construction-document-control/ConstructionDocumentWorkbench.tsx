import {
  calculateProgressValuation,
  createExportPreview,
  exportExceptions,
  validateProjectCloseout,
  type ConstructionDocumentControlReadModel,
  type ProgressValuationPage,
} from '../../lib/construction-document-control';
import { ChangeControlWorkspace } from './ChangeControlWorkspace';
import { ExportPreview, ExportValidationSummary, ReconciliationErrors } from './ExportPreview';
import { NakopitelniyWorkspace } from './NakopitelniyWorkspace';
import {
  BlockingIssuesPanel,
  MissingDocumentsPanel,
  PeriodReconciliationPanel,
  ProjectCloseoutMatrix,
} from './ProjectCloseoutWorkspace';
import { ProgressValuationWorkspace } from './ProgressValuationWorkspace';
import { RevisionHistoryView } from './RevisionHistoryView';

/**
 * Composition-only workbench: data arrives through typed ports/read models.
 * This component owns presentation order only; it does not calculate or
 * persist business truth in the browser.
 */
export function ConstructionDocumentWorkbench({
  model,
  page,
}: {
  model: ConstructionDocumentControlReadModel;
  page: ProgressValuationPage;
}) {
  const contractLabel = model.contractId ? 'mavjud' : 'qayd etilmagan';
  const period = model.valuation.periods[model.valuation.throughPeriod];

  if (model.valuation.periods.length === 0) {
    return (
      <main className="os-workbench space-y-5" aria-label="PTO va F2 hujjat nazorati">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">PTO / F2 HUJJAT NAZORATI</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{model.projectName} · {model.objectName}</h1>
          <p className="mt-1 text-sm text-text-dim">Shartnoma: {contractLabel} · Smeta manbasi: mavjud</p>
        </header>
        <section className="karta p-5">
          <h2 className="font-medium">Tasdiqlangan F2 davri yo‘q</h2>
          <p className="mt-2 max-w-2xl text-sm text-text-dim">
            Bu obyekt uchun hali tasdiqlangan F2 davri mavjud emas. Nakopitelniy va davr eksporti tasdiqlangan F2 paydo bo‘lgach ochiladi.
          </p>
        </section>
      </main>
    );
  }

  const valuation = calculateProgressValuation(model.valuation);
  const closeout = validateProjectCloseout(model);
  const issues = exportExceptions(model);
  const preview = createExportPreview(model);

  return (
    <main className="os-workbench space-y-5" aria-label="PTO va F2 hujjat nazorati">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">PTO / F2 HUJJAT NAZORATI</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{model.projectName} · {model.objectName}</h1>
            <p className="mt-1 text-sm text-text-dim">Shartnoma: {contractLabel} · Joriy davr: {period?.label ?? 'tanlanmagan'}</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-ok/20 bg-ok/5 px-3 py-1.5 text-xs text-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Jonli ma’lumot
          </span>
        </div>
      </header>

      <BlockingIssuesPanel issues={issues} nomlar={Object.fromEntries(valuation.rows.map((r) => [String(r.lineId), r.description]))} />
      <ProgressValuationWorkspace page={page} />
      <NakopitelniyWorkspace result={valuation} />
      <ChangeControlWorkspace changes={model.valuation.changes} />
      <RevisionHistoryView events={model.revisions} />
      <ProjectCloseoutMatrix rows={closeout} />
      <MissingDocumentsPanel rows={closeout} />
      <PeriodReconciliationPanel rows={closeout} />
      <ExportPreview model={preview} />
      <ExportValidationSummary errors={preview.reconciliation} />
      <ReconciliationErrors errors={preview.reconciliation} />
      <section className="rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm text-text-dim">
        To‘lov va sertifikatsiya qoidalari: <b className="text-warn">qoida to‘plami talab qilinadi</b>. Huquqiy jami ataylab hisoblanmadi.
      </section>
    </main>
  );
}
