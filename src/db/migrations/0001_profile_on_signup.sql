-- Create an empty profile row whenever someone signs up through Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
--> statement-breakpoint
drop trigger if exists on_auth_user_created on auth.users;
--> statement-breakpoint
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
--> statement-breakpoint
revoke execute on function public.handle_new_user() from public, anon, authenticated;
