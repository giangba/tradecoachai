-- CÀI MỚI: chạy toàn bộ trong Supabase > SQL Editor. (Nếu đã cài và đã chạy các file migration trước đó: KHÔNG cần chạy lại.)
create table if not exists setups(id bigint generated always as identity primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null, body text default '', created_at timestamptz default now());
create table if not exists trades(id bigint generated always as identity primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade,
 pair text, side text, entry numeric, sl numeric, tp numeric, note text, result text default 'open', ai jsonb, setup_id bigint, setup_ids bigint[] default '{}', h4_path text, m15_path text, created_at timestamptz default now());
alter table setups enable row level security; alter table trades enable row level security;
drop policy if exists "own setups" on setups; create policy "own setups" on setups for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "own trades" on trades; create policy "own trades" on trades for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
insert into storage.buckets(id,name,public) values('charts','charts',false) on conflict do nothing;
drop policy if exists "own charts rw" on storage.objects;
create policy "own charts rw" on storage.objects for all using(bucket_id='charts' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='charts' and (storage.foldername(name))[1]=auth.uid()::text);
