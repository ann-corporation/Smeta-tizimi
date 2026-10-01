-- T2-XAVFSIZLIK-POYDEVOR-001 — yengil xavfsizlik poydevori (egasi Q7, 2026-10-01:
-- "poydevor quriladi, lekin yengil — foydalanuvchiga og'irlik keltirmasin").
--
-- Holat: `public` sxemadagi deyarli barcha jadval/view/sequence va funksiyalarda `anon` va
-- `authenticated` rollariga TO'LIQ huquq bor edi (Supabase sukuti). View'lar RLS ni chetlab
-- o'tadi, security definer funksiyalar esa ichki tekshiruvsiz — anon kalitni bilgan har kim
-- PostgREST/GraphQL orqali ma'lumotni o'qishi, o'zgartirishi va RPC chaqirishi mumkin edi.
--
-- Dalil (hech kim sinmaydi): barcha iste'molchilar service_role bilan ishlaydi —
--   - Cloudflare `/api/*` — `/api/soglik`: supabase_key_role = service_role (2026-10-01 tekshirildi);
--   - T1 GAS (`Smeta tizimi/70_Supabase.js`) va `Akt generator/Supabase.js` — service_role kaliti;
--   - frontend Supabase'ga to'g'ridan-to'g'ri ulanmaydi (createClient yo'q).
-- service_role huquqlariga TEGILMAYDI. Keyin yaratiladigan obyektlar uchun ham sukut o'zgaradi.

begin;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

-- Sukut: yangi obyektlar anon/authenticated ga ochilmasin (migratsiya egasi — postgres).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, public;

-- service_role kafolati (o'zgarmaydi, lekin aniq yozilsin).
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

commit;
