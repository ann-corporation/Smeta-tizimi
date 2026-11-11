-- Rollback: T2-MCP-GOOGLE-001. Faqat funksiyani olib tashlaydi; google_sub ustuni va allaqachon ulangan google_sub qiymatlariga tegmaydi
-- (ular t2_google_kirish_v1 / veb kirishiga tegishli). Funksiya yo'q bo'lsa Worker "Google bilan kirish" xato beradi (parol bilan kirish ishlaydi);
-- shuningdek Worker'da GOOGLE_CLIENT_ID/SECRET ni o'chirib tugmani yashirish mumkin.
begin;
drop function if exists public.t2_google_mcp_kirish_v1(text, text);
commit;
