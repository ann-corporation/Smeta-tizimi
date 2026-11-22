/** Shared read-tool contract. The server binds the actor, company and handler. */
export const jarvisTools = {
  object_search: { mode: 'read', description: 'Find a company object by name. Query example: Obyektni top Sinov obyekt.', permissions: ['smeta.read'] },
  estimate_row: { mode: 'read', description: 'Find an exact estimate shifr. Query example: Smeta qatori E06-01-001-1.', permissions: ['smeta.read'] },
  estimate_price: { mode: 'read', description: 'Read resource prices in an object estimate. Query example: Smetada M200 beton narxi?', permissions: ['smeta.read'] },
  norm_reference: { mode: 'read', description: 'Read a normative reference by ShNQ code. Query example: ShNQ 4.02.06-04.', permissions: ['company.read'] },
  catalog_price: { mode: 'read', description: 'Read the price catalog by name, code or row number. Query example: Katalogda M200 beton narxi?', permissions: ['company.read'] },
  f2_register: { mode: 'read', description: 'Read the F2 register or act status. Query example: F2 № S-1 holati.', permissions: ['f2.read'] },
  cumulative: { mode: 'read', description: 'Read a cumulative statement. Query example: Nakopitelniy 2026-06.', permissions: ['f2.read'] },
  discrepancy: { mode: 'read', description: 'Read estimate and actual quantity discrepancies. Query example: Slichitelniy vedomost.', permissions: ['fakt.read', 'document.read'] },
  warehouse_balance: { mode: 'read', description: 'Read warehouse stock. Query example: Ombor #7 qoldig‘i: sement.', permissions: ['warehouse.read'] },
  transport_tekshir: { mode: 'read', description: 'Audit the transport kind (foiz / tkm / narx_ichida) of an object and its errors (double transport). Query example: Transport tekshir.', permissions: ['smeta.read'] },
  document_search: { mode: 'read', description: 'Find a document by ID or quoted filename. Query example: «Sinov.xlsx» ni top.', permissions: ['document.read'] },
} as const;

export type JarvisToolName = keyof typeof jarvisTools;
export const jarvisToolNames = Object.keys(jarvisTools) as JarvisToolName[];
export const jarvisToolParameters = {
  type: 'object', additionalProperties: false, required: ['query'],
  properties: { query: { type: 'string', minLength: 2, maxLength: 240 } },
} as const;
export const jarvisToolCallSchema = {
  type: 'object', additionalProperties: false, required: ['name', 'arguments'],
  properties: { name: { type: 'string', enum: jarvisToolNames }, arguments: jarvisToolParameters },
} as const;

export function parseJarvisToolCall(value: unknown): { name: JarvisToolName; query: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2) return null;
  const { name, arguments: args } = value as { name?: unknown; arguments?: unknown };
  if (typeof name !== 'string' || !Object.hasOwn(jarvisTools, name) || !args || typeof args !== 'object' ||
      Array.isArray(args) || Object.keys(args).length !== 1 || !Object.hasOwn(args, 'query')) return null;
  const query = (args as { query: unknown }).query;
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 240) return null;
  return { name: name as JarvisToolName, query: query.trim() };
}
