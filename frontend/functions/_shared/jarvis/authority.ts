import type { RpcNatija } from '../agent-rpc';
import { ruxsatBormi } from '../role-authority';

/** Read a company capability from the server's actor context. Missing or conflicting context denies access. */
export function jarvisHasPermission(men: RpcNatija | null, company: number, permission: string): boolean {
  const companies = men?.data.context_kompaniyalar;
  if (!men?.ok || !Array.isArray(companies)) return false;
  const matches = companies.filter(row => row?.kompaniya_id === company);
  if (matches.length !== 1) return false;
  const context = matches[0];
  return Array.isArray(context.permissions) && ruxsatBormi(context.permissions, permission) &&
    !(Array.isArray(context.explicit_denials) && context.explicit_denials.includes(permission));
}
