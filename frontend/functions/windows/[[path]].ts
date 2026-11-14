import { relizJavob } from '../_shared/reliz-fayl';

export const onRequest: PagesFunction<{ R2_CANONICAL?: R2Bucket }> = ctx => relizJavob('windows', ctx.request, ctx.env);
