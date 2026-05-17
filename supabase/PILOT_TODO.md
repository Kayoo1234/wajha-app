# Wajha — Supabase pilot-phase TODO

This file tracks Supabase-level work that is deferred to the **pilot** phase
(when Wajha leaves demo mode and starts handling real Aura member traffic).
Demo mode rules — public-catalog data only, no auth, RLS off — are encoded in
the parent `CLAUDE.md` (hard rules #1, #6). Anything in this file is
**out of scope** for the Nida pitch demo.

---

## 1. Enable RLS on `shop` tables and add policies

**Status:** deferred (demo: RLS off)
**Trigger:** start of pilot, before any per-member data lands

Tables that currently have RLS off (public-catalog data — safe in demo):

- `shop.brand`
- `shop.product`
- `shop.product_embedding`

For pilot, RLS turns on and policies follow project hard rule #6:

```sql
alter table shop.brand            enable row level security;
alter table shop.product          enable row level security;
alter table shop.product_embedding enable row level security;

-- Catalog data is publicly readable (still no PII in these tables)
create policy "catalog readable by anon"
  on shop.brand for select to anon, authenticated using (true);
create policy "catalog readable by anon"
  on shop.product for select to anon, authenticated using (true);
create policy "catalog readable by anon"
  on shop.product_embedding for select to anon, authenticated using (true);

-- Only the service role (backend / ingestion) can write
-- (service_role bypasses RLS by default, so no explicit policy needed)
```

Any **per-member** table added at pilot (saved items, search history,
recommendation cache) must be RLS-gated on `auth.uid() = aura_member_id` from
the very first migration. Do not let per-member tables ship without RLS.

---

## 2. Restore or replace `public.rls_auto_enable()` / `ensure_rls` event trigger

**Status:** dropped 2026-05-16 (demo cleanup; flagged by `get_advisors`)
**Trigger:** pilot — decide whether to bring it back or replace it

### What it was

Supabase provisioned a `SECURITY DEFINER` helper function and an event trigger
that auto-enabled RLS on every newly-created `public`-schema table. Dropped
during demo schema deploy because:

1. `get_advisors` flagged it as "anon can call `/rest/v1/rpc/rls_auto_enable`"
   — technically true, though the function does nothing when called outside
   an event-trigger context.
2. Wajha tables live in `shop`, not `public`. The function explicitly only
   acts on `public` (`WHERE cmd.schema_name IN ('public')`), so it never
   protected our tables anyway.

### Decision needed at pilot

- **Option A — don't restore.** Replace with explicit RLS policies per table
  (see item 1 above). Cleaner; matches "policies are documented, not magic."
  Recommended.
- **Option B — restore and extend to cover `shop`.** Modify the schema-name
  filter to include `shop`. Keeps the auto-enable behavior so future tables
  can't ship without RLS. Useful insurance if multiple devs will be writing
  migrations later.

### Restoration recipe (verbatim from the dropped function)

```sql
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL
        AND cmd.schema_name IN ('public')  -- extend to ('public','shop') for Option B
        AND cmd.schema_name NOT IN ('pg_catalog','information_schema')
        AND cmd.schema_name NOT LIKE 'pg_toast%'
        AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  EXECUTE FUNCTION public.rls_auto_enable();

-- If keeping callable via REST is undesirable (it was the original advisor complaint):
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, public;
```

---

## 3. Move `pgvector` out of `public`

**Status:** deferred (demo: WARN-level advisory, functional)
**Trigger:** pilot hardening

`vector` extension is installed in `public` (Supabase / pgvector default).
Advisor recommends moving it to a dedicated `extensions` schema. Cosmetic for
demo; tighten at pilot.

```sql
create schema if not exists extensions;
alter extension vector set schema extensions;
-- then add `extensions` to search_path on roles that need it
```

---

## 4. Kuwait data residency review (Singapore region)

**Status:** documented in `../docs/PITCH_NOTES.md`
**Trigger:** if Alshaya raises data residency at pilot

Project lives in `ap-southeast-1` (Singapore) because Supabase did not have a
closer region at provision time. If Alshaya requires Kuwait or GCC residency,
plan a migration. Wajha's data is public catalog + opaque member IDs, so this
is a contractual concern more than a privacy one.
