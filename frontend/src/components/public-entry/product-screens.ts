import workspace from './assets/document-workspace.jpg';
import works from './assets/catalog-works.jpg';
import resources from './assets/work-resources.jpg';
import type { EntryCopy } from './product-scope';

// 2026-10-09: real production UI captures, not mockups. Crops exclude tenant context,
// financial data and the user's retained draft. See assets/README.md for provenance.
export const productScreens: readonly { src: string; title: EntryCopy; caption: EntryCopy }[] = [
  { src: workspace, title: ['Hujjatlar va ish oqimlari', 'Документы и рабочие процессы', 'Documents and workflows'], caption: ['LRV, F2, yig‘ma vedomost va ijro hujjatlari uchun bo‘limlar — saytning haqiqiy navigatsiya ekranidan lavha.', 'Разделы ЛРВ, Ф2, накопительной ведомости и исполнительной документации — фрагмент реального экрана навигации.', 'LRV, F2, cumulative statements and execution documents — a capture of the actual navigation screen.'] },
  { src: works, title: ['Ish turini katalogdan topish', 'Поиск работы в каталоге', 'Find work in the catalog'], caption: ['Sbornik → bo‘lim → ish turi. Beton va temirbeton ishlari katalogining haqiqiy ko‘rinishi.', 'Сборник → раздел → работа. Реальный экран каталога бетонных и железобетонных работ.', 'Collection → section → work item. The actual concrete and reinforced-concrete catalog.'] },
  { src: resources, title: ['Ishning resurs tarkibi', 'Ресурсный состав работы', 'Resources behind a work item'], caption: ['Tanlangan ishning o‘lchov birligi, mehnat, texnika va material sarf normalari bir joyda ko‘rinadi.', 'Единица измерения выбранной работы и нормы затрат труда, машин и материалов на одном экране.', 'The selected work’s unit and labor, machinery and material consumption norms in one view.'] },
];
