import type { EstimateDoc } from '../../lib/smeta-studio/model';
export type OpenCloudDraft = (doc: EstimateDoc, version: number) => Promise<void>;
