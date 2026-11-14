import { relizJavob } from '../_shared/reliz-fayl';

export const onRequest: PagesFunction<{ R2_CANONICAL?: R2Bucket }> = ctx => relizJavob('macos', ctx.request, ctx.env);
