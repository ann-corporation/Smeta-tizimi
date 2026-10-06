-- Orqaga qaytarish: model registri. t2_agent_muhit_v1 ni 20261106260000 dagi (model kaliti yo'q) variantiga qaytarish uchun o'sha migratsiyadagi funksiyani qayta qo'llang.
drop function if exists public.t2_agent_model_tanla_v1(bigint, bigint, text, text);
drop function if exists public.t2_agent_modellar_v1(bigint, bigint);
drop function if exists public.t2_agent_model_katalog_yoz_v1(bigint, text, text, text, text, boolean, boolean);
drop table if exists public.t2_agent_model_tanlov;
drop table if exists public.t2_agent_model_katalog;
