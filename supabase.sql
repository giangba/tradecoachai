-- Chạy toàn bộ file này trong Supabase > SQL Editor
create table if not exists rules(user_id uuid primary key references auth.users on delete cascade, body text default '', updated_at timestamptz default now());
create table if not exists trades(id bigint generated always as identity primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade,
 pair text, side text, entry numeric, sl numeric, tp numeric, note text, result text default 'open', ai jsonb, h4_path text, m15_path text, created_at timestamptz default now());
alter table rules enable row level security; alter table trades enable row level security;
create policy "own rules" on rules for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "own trades" on trades for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
insert into storage.buckets(id,name,public) values('charts','charts',false) on conflict do nothing;
create policy "own charts rw" on storage.objects for all using(bucket_id='charts' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='charts' and (storage.foldername(name))[1]=auth.uid()::text);
