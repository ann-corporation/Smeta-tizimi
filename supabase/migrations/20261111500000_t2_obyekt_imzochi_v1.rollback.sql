-- Rollback: 20261111500000_t2_obyekt_imzochi_v1
-- Loyiha/obyekt/razdel imzochilari va eslab qolingan nomlar tarixi o'chadi; eski frontend kompaniya nusxasiga qaytadi.
begin;
drop function if exists public.t2_imzochi_tarix_v1(bigint, bigint);
drop function if exists public.t2_obyekt_imzochi_saqla_v1(bigint, bigint, bigint, text, text, bigint, text, text, text, uuid);
drop function if exists public.t2_obyekt_imzochilar_v1(bigint, bigint, bigint, bigint);
drop function if exists public._t2_imzochi_yozish_sabab(bigint, boolean, text, text, public.t2_obyekt_imzochi);
drop function if exists public._t2_imzochi_json(public.t2_obyekt_imzochi);
drop function if exists public._t2_imzochi_qator(text, bigint, bigint, bigint, text);
drop function if exists public._t2_imzochi_kontekst(bigint, bigint);
drop function if exists public._t2_imzochi_rol_norm(text);
drop table if exists public.t2_imzochi_tarix;
drop table if exists public.t2_obyekt_imzochi;
commit;
