export type HealthState = 'TAYYOR' | 'XATO' | 'SYNCED' | 'PENDING' | 'SYNCING' | 'FAILED' | 'CONFLICT' | 'NOT_CONFIGURED';
export type DocumentStatus = 'READY' | 'UPLOADING' | 'REGISTERING' | 'ERROR';
export type ReplicaStatus = HealthState | 'MISSING';
export interface DocumentReplica { provider: 'sheets'; status: ReplicaStatus; externalId?: string; lastSyncedAt?: string; error?: string; revision?: number; }
export interface CenterDocument { id: string; filename: string; type: string; revision: number; mime: string; size: number; sha256: string; canonicalStatus: DocumentStatus; metadataStatus?: 'READY' | 'ERROR' | 'PENDING'; updatedAt: string; createdAt: string; author: string; replicas: DocumentReplica[]; }
export interface DocumentHealth { provider: 'r2' | 'registry' | 'sheets'; status: HealthState; message?: string; lastCheck?: string; }
export interface DocumentCenterProps { projectName: string; documents: CenterDocument[]; health: DocumentHealth[]; loading?: boolean; error?: string; noPermission?: boolean; onOpen?: (id: string) => void; onDownload?: (id: string) => void; onUpload?: (id: string) => void; onDetails?: (id: string) => void; }
