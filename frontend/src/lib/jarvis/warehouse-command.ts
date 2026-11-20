import { qidiruvKaliti } from '../../i18n/lotin-kirill';

export type WarehouseOption = { id: number; kompaniya_id: number; nomi: string; yozish: boolean };
export type WarehouseSnapshot = { company: number; question: string; warehouses: WarehouseOption[];
  warehouseId: number | null; result: ({ ok: boolean; code?: string; [key: string]: unknown }) | null };
export type WarehouseTransport = (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
export const warehouseTool = { name: 'warehouse_command', mode: 'preview', permissions: ['warehouse.write'],
  description: 'Prepare warehouse receipt or issue from the actual user question. Server asks for missing data. Never saves. Optional warehouse_id must refer to an explicitly selected warehouse.' } as const;
export const warehouseToolSchema = { type: 'object', additionalProperties: false, required: ['name', 'arguments'], properties: {
  name: { const: warehouseTool.name }, arguments: { type: 'object', additionalProperties: false,
    properties: { warehouse_id: { type: 'integer', minimum: 1 } } },
} };
export function warehouseCall(value: unknown): { warehouseId?: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2) return null;
  const call = value as { name?: unknown; arguments?: unknown };
  if (call.name !== warehouseTool.name || !call.arguments || typeof call.arguments !== 'object' || Array.isArray(call.arguments)) return null;
  const args = call.arguments as { warehouse_id?: unknown };
  if (Object.keys(args).some(key => key !== 'warehouse_id')) return null;
  if (args.warehouse_id === undefined) return {};
  return Number.isSafeInteger(args.warehouse_id) && Number(args.warehouse_id) > 0 ? { warehouseId: Number(args.warehouse_id) } : null;
}
export function warehouseWriteIntent(question: string): boolean {
  const text = question.toLowerCase() + ' ' + qidiruvKaliti(question);
  return /kirim|chiqim|prixod|rasxod|keldi|berdim|berildi|olib kel|приход|расход|оприход|выдай|спиши/.test(text);
}
