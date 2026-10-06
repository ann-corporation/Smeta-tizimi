-- Orqaga qaytarish: kompaniya AI sozlamalari. sarf_tekshir ni 20261106300000 dagi variantga qaytarish uchun o'sha migratsiyani qayta qo'llang.
drop function if exists public.t2_agent_kompaniya_sozlama_saqla_v1(bigint, bigint, boolean, numeric, boolean);
drop function if exists public.t2_agent_kompaniya_sozlama_v1(bigint, bigint);
drop table if exists public.t2_agent_kompaniya_sozlama;
