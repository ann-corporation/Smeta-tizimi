import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Offline metadata indexing only. No database connection, env loading, DDL or business rows.
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'SCHEMA_METADATA_20261026.json'), 'utf8'));
const liveRefs = JSON.parse(fs.readFileSync(path.join(dir, 'ROUTINE_TABLE_REFERENCES_20261026.json'), 'utf8'));
const relationNames = new Set(metadata.tables.map(t => `${t.schema}.${t.name}`));
const pin = 'd7bf735359e8a54ef9e589c9a23cc28fc67876a9';
const overridesPath = path.join(dir, 'DATA_MODEL_CLASSIFICATION_OVERRIDES.json');
const overridesDoc = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
if (overridesDoc.source_pin !== pin || !Array.isArray(overridesDoc.overrides)) {
  throw new Error('Classification overrides must identify the pinned source and contain an overrides array');
}
const allowedClasses = new Set(['CANONICAL', 'COMPAT', 'DEPRECATED', 'BACKUP', 'TEMP', null]);
const overrides = new Map();
for (const entry of overridesDoc.overrides) {
  if (!entry.table || overrides.has(entry.table) || !allowedClasses.has(entry.classification)) {
    throw new Error(`Invalid or duplicate classification override: ${entry.table ?? '(missing table)'}`);
  }
  if (!entry.business_role || !entry.manual_review_basis || typeof entry.usage_verified !== 'boolean' || !Array.isArray(entry.classification_evidence) || !entry.classification_evidence.length) {
    throw new Error(`Override requires business_role, usage_verified, manual_review_basis and evidence: ${entry.table}`);
  }
  if (!/^[^.]+\.[^.]+$/.test(entry.table) || !relationNames.has(entry.table)) {
    throw new Error(`Override must match a fully qualified schema.table in metadata: ${entry.table}`);
  }
  for (const evidence of entry.classification_evidence) {
    if (!evidence.path || !Number.isInteger(evidence.line) || evidence.line < 1 || !evidence.revision || !evidence.supports) {
      throw new Error(`Invalid path:line evidence for ${entry.table}`);
    }
  }
  overrides.set(entry.table, entry);
}
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
const tracked = git('ls-tree', '-r', '--name-only', pin).split('\n');
const sourceFiles = tracked.filter(p => /^(frontend\/(src|functions)\/.*\.(ts|tsx)|mcp\/smeta-mcp\/src\/.*\.ts)$/.test(p) && !/\.(test|spec)\./.test(p));
const migrations = tracked.filter(p => /^supabase\/migrations\/.*\.sql$/.test(p) && !/\.(rollback|acceptance)\.sql$/.test(p));
// Sparse worktrees may omit MCP. Read an immutable Git export, not another agent's checkout.
const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smeta-architecture-source-'));
const archive = path.join(sourceRoot, 'source.tar');
git('archive', '--format=tar', '-o', archive, pin, 'frontend/src', 'frontend/functions', 'supabase/migrations', 'mcp/smeta-mcp/src');
execFileSync('tar', ['-xf', archive, '-C', sourceRoot]);
const sources = sourceFiles.map(file => ({ file, text: fs.readFileSync(path.join(sourceRoot, file), 'utf8') }));
const tableNames = new Set(metadata.tables.map(t => t.name));
const tableRefs = new Map([...tableNames].map(n => [n, []]));
for (const { file, text } of sources) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const token of new Set(lines[i].match(/\bt2_[a-zA-Z0-9_]+\b/g) ?? [])) {
      if (tableRefs.has(token)) tableRefs.get(token).push(`${file}:${i + 1}`);
    }
  }
}
const dml = new Map([...tableNames].map(n => [n, []]));
for (const file of migrations) {
  const text = fs.readFileSync(path.join(sourceRoot, file), 'utf8');
  const functions = [...text.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?\s*\(/gi)];
  for (let i = 0; i < functions.length; i++) {
    const f = functions[i];
    const span = text.slice(f.index, functions[i + 1]?.index ?? text.length);
    const quoted = /\bas\s+(\$[a-zA-Z0-9_]*\$)([\s\S]*?)\1/i.exec(span);
    if (!quoted) continue; // single-quoted bodies require separate review; do not index trailing migration DML
    const body = quoted[2];
    const bodyStart = f.index + quoted.index + quoted[0].indexOf(body);
    for (const m of body.matchAll(/\b(insert\s+into|update|delete\s+from)\s+(?:public\.)?"?(t2_[a-zA-Z0-9_]+)"?\b/gi)) {
      if (!dml.has(m[2])) continue;
      const line = text.slice(0, bodyStart + m.index).split('\n').length;
      dml.get(m[2]).push({ routine_candidate: f[1], operation: m[1].toUpperCase().replace(/\s+/g, ' '), evidence: `${file}:${line}` });
    }
  }
}
const domains = [
  ['agent', /^t2_agent_/, 'AI / Agent platform'],
  ['identity', /^t2_(foydalanuvchi|azolik|kompaniya|capability|onboarding|ozi_royxat|shaxs_yonalish|yonalish|mutaxassis|ish_joyi)/, 'Identity / Company'],
  ['catalog', /^t2_(catalog|work_|resource_|ish_turi|narx|price_|material_alias|resurs_kategoriya|manba|bosqich_katalog)/, 'Catalog / Pricing'],
  ['f2', /^t2_(akt|f2_|forma3|faktura|m29)/, 'PTO / F2 / Documents'],
  ['estimate', /^t2_(qator|smeta|shaxsiy_smeta|qoshimcha_ish|addrepl|nakrutka|xom|lrv_|viborka)/, 'PTO / Estimate / Fakt'],
  ['contracts', /^t2_(shartnoma|contract_|tolov|xarajat)/, 'Contracts / Finance'],
  ['storage', /^t2_(document_|hujjat_turi|fayl_|papka|.*storage_|r2_|replica_|obyekt_hujjat)/, 'Storage / Documents'],
  ['ecosystem', /^t2_(tomon_|topshiriq|xizmat_taklif|primitiv_|birja_|procurement|izoh|bildirishnoma|outbox)/, 'Ecosystem / Collaboration'],
  ['erp', /^t2_(erp_|sklad_|kadr_|texnika_|aosr|lab_|grafik_)/, 'ERP / Site control'],
  ['projects', /^t2_(loyiha|obyekt|kontragent|tuzilma)/, 'Projects / Objects'],
  ['billing', /^t2_(token_|tarif|obuna|baho|tolov_sorov)/, 'Billing'],
  ['operations', /^t2_(audit_|control_|deploy_|integration_|job|kozgu|mindmap_|ozgarish|signal|sozlama|sheets_|royxat_|yakunlash|demo_)/, 'Operations / Audit'],
];
const manifest = metadata.tables.map(t => {
  const refs = tableRefs.get(t.name);
  const writes = [...new Map(dml.get(t.name).map(x => [`${x.routine_candidate}:${x.operation}`, x])).values()];
  const backup = /_bak(?:_|$)|_zaxira(?:_|$)|_ierarxiya_zaxira$/.test(t.name);
  const temporary = /_tmp_/.test(t.name);
  const compat = t.name === 't2_company_storage_legacy_allowlist' || t.name === 't2_sheets_writeback_log';
  const routines = liveRefs.find(r => r.schema === t.schema && r.table === t.name)?.routine_references ?? [];
  const inferredStatus = backup ? 'BACKUP' : temporary ? 'TEMP' : compat ? 'COMPAT' : refs.length || writes.length || t.triggers.length || routines.length ? 'CANONICAL' : null;
  const domain = domains.find(([, re]) => re.test(t.name));
  const table = `${t.schema}.${t.name}`;
  const override = overrides.get(table);
  if (override?.candidate_class && !allowedClasses.has(override.candidate_class)) throw new Error(`Invalid candidate_class for ${table}`);
  const classification = override ? override.classification : t.schema === 'snapshot' ? 'BACKUP' : inferredStatus;
  const generatedBasis = t.schema === 'snapshot' ? 'Рабочее хранилище восстановления: BACKUP означает назначение, не кандидат удаления' : backup || temporary ? 'Имя резервного/временного отношения; назначение и срок хранения требуют review' : compat ? 'Мост/совместимость, не альтернативная бизнес-истина' : inferredStatus ? 'Текущее хранилище модуля: runtime reference / source SQL / trigger; не доказательство полноты команды' : 'Недостаточно доказательств для lifecycle-класса; классификация оставлена NULL';
  const generatedOwner = t.schema === 'snapshot' ? 'Snapshot / Recovery' : domain?.[2] ?? null;
  const record = {
    table, classification,
    classification_basis: override?.classification_basis ?? generatedBasis,
    owner_module: Object.hasOwn(override ?? {}, 'owner_module') ? override.owner_module : generatedOwner,
    owner_basis: override?.owner_basis ?? (t.schema === 'snapshot' ? 'Выделенная snapshot schema' : domain ? `Правило доменного префикса ${domain[0]}; review L0` : 'Назначить L0'),
    replacement: null, delete_authorized: false,
    rls: t.rls, force_rls: t.force_rls,
    write_path: { database_triggers: t.triggers, live_routine_text_references: routines, migration_dml_candidates: writes, completeness: 'CANDIDATES_ONLY: live body token references may read only or occur in comments; source SQL may be superseded; dynamic SQL may not be detected' },
    runtime_references: refs,
    foreign_keys: t.foreign_keys,
  };
  if (override) Object.assign(record, {
    business_role: override.business_role,
    usage_verified: override.usage_verified,
    classification_evidence: override.classification_evidence,
    manual_review_basis: override.manual_review_basis,
  });
  if (override?.candidate_class) record.candidate_class = override.candidate_class;
  return record;
});
const unknownOverrides = [...overrides.keys()].filter(name => !relationNames.has(name));
if (unknownOverrides.length) throw new Error(`Overrides reference relations absent from metadata: ${unknownOverrides.join(', ')}`);
const counts = Object.fromEntries(['CANONICAL', 'COMPAT', 'DEPRECATED', 'BACKUP', 'TEMP', 'UNCLASSIFIED'].map(k => [k, manifest.filter(t => (t.classification ?? 'UNCLASSIFIED') === k).length]));
const header = { generated_at: metadata.observed_at, git_commit: pin, db_migration_head: metadata.migration_head.version, db_migration_head_name: metadata.migration_head.name, migration_head_semantics: 'lexicographic max(version), not latest DDL/apply time', schemas: ['public', 'snapshot'], excluded_schemas: ['auth', 'storage', 'realtime', 'cron', 'vault', 'supabase_migrations', 'pg_catalog', 'information_schema'], relation_kinds: ['ordinary_table', 'partitioned_table'], table_count: manifest.length, counts, source_of_truth: 'Live catalog SELECT metadata; no business rows; static source references pinned to git_commit', classification_policy: 'CANONICAL означает каноническое хранение данных по указанной бизнес-роли, включая факты происхождения; это не доказывает использование при выполнении или в боевой среде и не означает финансовое право. NULL означает, что жизненный цикл не установлен. Одно имя таблицы не разрешает её удаление.', tables: manifest };
// JSON is a YAML 1.2 subset. Keep parsing dependency-free and NULL explicit.
fs.writeFileSync(path.join(dir, 'DATA_MODEL_REGISTRY.yaml'), JSON.stringify(header, null, 2) + '\n');
const raw = fs.readFileSync(path.join(sourceRoot, 'frontend/src/lib/sayt-xaritasi/generated.ts'), 'utf8');
const site = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
const liveNames = new Set(metadata.routines.map(r => r.name));
const catalog = fs.readFileSync(path.join(sourceRoot, 'frontend/src/lib/sayt-xaritasi/pageCatalog.ts'), 'utf8');
const pageLines = catalog.split(/\r?\n/).filter(s => /^\s*\{\s*kalit:/.test(s));
const field = (s, key) => s.match(new RegExp(`\\b${key}:\\s*'([^']*)'`))?.[1] ?? null;
const array = (s, key) => [...(s.match(new RegExp(`\\b${key}:\\s*\\[([^\\]]*)\\]`))?.[1] ?? '').matchAll(/'([^']*)'/g)].map(m => m[1]);
const pages = pageLines.map(line => ({ key: field(line, 'kalit'), route: field(line, 'yol'), scope: field(line, 'scope'), reads: array(line, 'oqiydi'), actions: array(line, 'yozadi') }));
if (!pages.length || pages.some(p => !p.key || !p.route || !p.scope)) throw new Error('pageCatalog source shape changed: review parser');
const body = [
  '# Маршруты → модели чтения → именованные команды',
  `generated_at: ${header.generated_at}\n\ngit_commit: ${pin}\n\ndb_migration_head: ${header.db_migration_head} (${header.db_migration_head_name})`,
  'Источник: существующий pageCatalog.ts (семантика экранов) + generated.ts (статическая карта). Не создавать параллельный реестр runtime. Ни совпадение имени, ни наличие routine не доказывают правильные grants/actor/tenant. Полный callgraph React→API автоматически не установлен; ниже точная allowlist, а не выдуманные связи.',
  `Инвентарь: меню ${site.menuRoutes.length}; сегментов App ${site.appRouteSegments.length}; allowlist read relations ${site.readTables.length}; именованных write actions ${site.writeActions.length}.`,
  '## Семантические связи экранов (существующий pageCatalog)',
  ...pages.map(p => `- \`${p.route}\` (${p.scope}, ${p.key}): читает ${p.reads.map(x => `\`${x}\``).join(', ') || '—'}; команды ${p.actions.map(x => { const rpc = site.writeActions.find(a => a.amal === x)?.rpc; return `\`${x}\`${rpc ? ` → \`${rpc}\`` : ' (не найдено в статической write allowlist; проверить отдельный API)'}`; }).join('; ') || '—'}.`),
  '## Полная write allowlist sb-yoz.ts',
  ...site.writeActions.map(a => `- \`${a.amal}\` → \`${a.rpc}\`; live routine: ${liveNames.has(a.rpc) ? 'PRESENT' : 'NOT_OBSERVED'}`),
  '## Маршруты меню', ...site.menuRoutes.map(r => `- \`${r}\``),
  '## Сегменты App.tsx (включая aliases/redirects)', ...site.appRouteSegments.map(r => `- \`${r}\``),
  '## Read allowlist sb.ts (таблицы и views)', ...site.readTables.map(r => `- \`${r}\``),
  '## Граница автоматизации',
  'Связи конкретного экрана перечислены в существующем frontend/src/lib/sayt-xaritasi/pageCatalog.ts. Allowlist не является сквозным разрешением: gateway и RPC проверяют компанию/акт/actor. MCP — отдельный локальный privileged путь, его sql_yozish не проходит web allowlist. Не добавлять новый маршрут/таблицу без проверки эквивалента в CODEMAP.',
];
fs.writeFileSync(path.join(dir, 'ROUTE_RPC_MAP.md'), body.join('\n\n') + '\n');
const summary = { ...counts, rls_enabled: metadata.tables.filter(t => t.rls).length, routines: metadata.routines.length, write_actions: site.writeActions.length, missing_live_write_routines: site.writeActions.filter(a => !liveNames.has(a.rpc)).map(a => a.rpc), unresolved_owners: manifest.filter(t => !t.owner_module).map(t => t.table), unclassified: manifest.filter(t => t.classification == null).map(t => t.table), cleanup_candidates: manifest.filter(t => t.table.startsWith('public.') && ['BACKUP', 'TEMP'].includes(t.classification)).map(t => t.table) };
console.log(JSON.stringify(summary, null, 2));
