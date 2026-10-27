-- Creates the database roles and grants of ADR 0012 and checks the result.
-- It is the only place that creates roles or grants on the app schemas.
--
-- Run it with psql, connected to the app database, before the first rollout
-- and again after the first rollout has migrated (the meta tables then exist).
-- Running it again is always safe.
--
-- hosting=self_managed: run as the Postgres superuser.
--   psql "<superuser url>" -v ON_ERROR_STOP=1 -v hosting=self_managed \
--     -v migrator_role=<role> -v api_role=<role> -v backup_role=<role> \
--     -f scripts/db/database-roles.sql
-- hosting=supabase: run as the migrator itself (migrator_role=postgres),
-- through the session pooler on 5432, with the Data API roles added:
--     ... -v hosting=supabase -v migrator_role=postgres \
--     -v data_api_roles=anon,authenticated,service_role ...
--
-- No password is set here; set one with \password <role> at a psql prompt.

\if :{?hosting}
\else
  \set hosting ''
\endif
\if :{?migrator_role}
\else
  \set migrator_role ''
\endif
\if :{?api_role}
\else
  \set api_role ''
\endif
\if :{?backup_role}
\else
  \set backup_role ''
\endif
\if :{?data_api_roles}
\else
  \set data_api_roles ''
\endif

-- psql does not expand variables inside the DO bodies below, so they travel
-- as session settings.
SELECT count(set_config(setting.name, setting.value, false)) AS variables_read
FROM (VALUES
  ('abyss.hosting', :'hosting'),
  ('abyss.migrator_role', :'migrator_role'),
  ('abyss.api_role', :'api_role'),
  ('abyss.backup_role', :'backup_role'),
  ('abyss.data_api_roles', :'data_api_roles')
) AS setting(name, value);

-- 1. Validate the variables and create the roles (no password).
DO $create_roles$
DECLARE
  is_supabase boolean := current_setting('abyss.hosting') = 'supabase';
  migrator text := current_setting('abyss.migrator_role');
  api text := current_setting('abyss.api_role');
  backup text := current_setting('abyss.backup_role');
  role_name text;
  attribute_changes text;
BEGIN
  IF current_setting('abyss.hosting') NOT IN ('self_managed', 'supabase') THEN
    RAISE EXCEPTION 'psql variable hosting must be self_managed or supabase';
  END IF;
  IF migrator = '' THEN
    RAISE EXCEPTION 'psql variable migrator_role is required';
  END IF;
  IF api = '' THEN
    RAISE EXCEPTION 'psql variable api_role is required';
  END IF;
  IF backup = '' THEN
    RAISE EXCEPTION 'psql variable backup_role is required';
  END IF;
  IF migrator IN (api, backup) OR api = backup THEN
    RAISE EXCEPTION 'migrator_role, api_role and backup_role must be three different roles';
  END IF;
  IF is_supabase AND trim(current_setting('abyss.data_api_roles')) = '' THEN
    RAISE EXCEPTION 'psql variable data_api_roles is required when hosting is supabase';
  END IF;
  IF is_supabase AND (
    SELECT bool_or(trim(listed) = migrator) FROM unnest(string_to_array(current_setting('abyss.data_api_roles'), ',')) AS listed
  ) THEN
    RAISE EXCEPTION 'psql variable data_api_roles must not contain the value of migrator_role';
  END IF;
  IF is_supabase AND (
    SELECT bool_or(trim(listed) = api) FROM unnest(string_to_array(current_setting('abyss.data_api_roles'), ',')) AS listed
  ) THEN
    RAISE EXCEPTION 'psql variable data_api_roles must not contain the value of api_role';
  END IF;
  IF is_supabase AND (
    SELECT bool_or(trim(listed) = backup) FROM unnest(string_to_array(current_setting('abyss.data_api_roles'), ',')) AS listed
  ) THEN
    RAISE EXCEPTION 'psql variable data_api_roles must not contain the value of backup_role';
  END IF;
  IF is_supabase AND current_user <> migrator THEN
    RAISE EXCEPTION 'with hosting=supabase the script must run as the migrator role';
  END IF;

  FOREACH role_name IN ARRAY CASE WHEN is_supabase
    THEN ARRAY[api, backup] ELSE ARRAY[migrator, api, backup] END
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('CREATE ROLE %I LOGIN', role_name);
    END IF;
    -- Only attributes that differ are named: a role manager that is not a
    -- superuser may not even restate REPLICATION or BYPASSRLS.
    SELECT concat_ws(' ',
      CASE WHEN NOT rolcanlogin THEN 'LOGIN' END,
      CASE WHEN rolsuper THEN 'NOSUPERUSER' END,
      CASE WHEN rolcreatedb THEN 'NOCREATEDB' END,
      CASE WHEN rolcreaterole THEN 'NOCREATEROLE' END,
      CASE WHEN rolbypassrls THEN 'NOBYPASSRLS' END,
      CASE WHEN rolreplication THEN 'NOREPLICATION' END)
    INTO attribute_changes
    FROM pg_roles WHERE rolname = role_name;
    IF attribute_changes <> '' THEN
      EXECUTE format('ALTER ROLE %I %s', role_name, attribute_changes);
    END IF;
  END LOOP;
END
$create_roles$;

-- 2. Self-managed server only: ownership and PUBLIC. A managed host owns the
-- database and shares it with its own services, so supabase mode leaves it.
DO $harden_database$
DECLARE
  database text := current_database();
  migrator text := current_setting('abyss.migrator_role');
  api text := current_setting('abyss.api_role');
  backup text := current_setting('abyss.backup_role');
BEGIN
  IF current_setting('abyss.hosting') <> 'self_managed' THEN
    RETURN;
  END IF;
  EXECUTE format('ALTER DATABASE %I OWNER TO %I', database, migrator);
  EXECUTE format('REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC', database);
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I, %I', database, api, backup);
  EXECUTE format('GRANT pg_read_all_data TO %I', backup);
END
$harden_database$;

-- 3. Grants: default privileges for what the migrator creates later, and the
-- same grants on what exists now.
DO $grant_app_privileges$
DECLARE
  is_supabase boolean := current_setting('abyss.hosting') = 'supabase';
  migrator text := current_setting('abyss.migrator_role');
  api text := current_setting('abyss.api_role');
  backup text := current_setting('abyss.backup_role');
  schema_name text;
  default_scope text;
BEGIN
  IF is_supabase THEN
    CREATE SCHEMA IF NOT EXISTS content;
  END IF;

  -- Self-managed: database-wide defaults. Supabase: only the app schemas,
  -- because postgres may create objects elsewhere from the dashboard.
  FOREACH default_scope IN ARRAY CASE WHEN is_supabase
    THEN ARRAY['IN SCHEMA public', 'IN SCHEMA content'] ELSE ARRAY[''] END
  LOOP
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I %s GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', migrator, default_scope, api);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I %s GRANT USAGE, SELECT ON SEQUENCES TO %I', migrator, default_scope, api);
    IF is_supabase THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I %s GRANT SELECT ON TABLES TO %I', migrator, default_scope, backup);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I %s GRANT SELECT ON SEQUENCES TO %I', migrator, default_scope, backup);
    ELSE
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I GRANT USAGE ON SCHEMAS TO %I', migrator, api);
    END IF;
  END LOOP;

  FOREACH schema_name IN ARRAY ARRAY['public', 'content'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = schema_name) THEN
      CONTINUE;
    END IF;
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', schema_name, api);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I', schema_name, api);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO %I', schema_name, api);
    IF is_supabase THEN
      EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', schema_name, backup);
      EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO %I', schema_name, backup);
      EXECUTE format('GRANT SELECT ON ALL SEQUENCES IN SCHEMA %I TO %I', schema_name, backup);
    END IF;
  END LOOP;
END
$grant_app_privileges$;

-- 4. The API role only reads the migration history and the content type
-- definitions (the runtime reads masking flags from them).
DO $restrict_meta_tables$
DECLARE
  api text := current_setting('abyss.api_role');
  meta_table text;
BEGIN
  FOREACH meta_table IN ARRAY ARRAY[
    'public._prisma_migrations', 'content._migrations', 'content._content_types']
  LOOP
    IF to_regclass(meta_table) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON %s FROM %I', meta_table, api);
      EXECUTE format('GRANT SELECT ON %s TO %I', meta_table, api);
    END IF;
  END LOOP;
END
$restrict_meta_tables$;

-- 5. Supabase only: the Data API roles (anon, authenticated, service_role)
-- must not reach the app tables, or the public key would bypass cms-api.
DO $revoke_data_api_roles$
DECLARE
  migrator text := current_setting('abyss.migrator_role');
  role_name text;
  schema_name text;
BEGIN
  IF current_setting('abyss.hosting') <> 'supabase' THEN
    RETURN;
  END IF;
  FOR role_name IN
    SELECT trim(listed) FROM unnest(string_to_array(current_setting('abyss.data_api_roles'), ',')) AS listed
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      RAISE EXCEPTION 'data_api_roles names a role that does not exist: %', role_name;
    END IF;
    FOREACH schema_name IN ARRAY ARRAY['public', 'content'] LOOP
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I', schema_name, role_name);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM %I', schema_name, role_name);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA %I FROM %I', schema_name, role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON TABLES FROM %I', migrator, schema_name, role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM %I', migrator, schema_name, role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON FUNCTIONS FROM %I', migrator, schema_name, role_name);
    END LOOP;
  END LOOP;
END
$revoke_data_api_roles$;

-- 6. Self-check. It only reads; it never revokes a right to make itself pass.
-- The message lists roles and tables, never values.
DO $check_privileges$
DECLARE
  is_supabase boolean := current_setting('abyss.hosting') = 'supabase';
  database text := current_database();
  migrator text := current_setting('abyss.migrator_role');
  api text := current_setting('abyss.api_role');
  backup text := current_setting('abyss.backup_role');
  violations text[] := ARRAY[]::text[];
  role_name text;
  schema_name text;
  object record;
  is_meta_table boolean;
  write_rights constant text := 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER';
  any_table_right constant text := 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER';
BEGIN
  IF NOT is_supabase AND NOT EXISTS (
    SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba
    WHERE d.datname = database AND r.rolname = migrator
  ) THEN
    violations := violations || format('database is not owned by %s', migrator);
  END IF;

  FOREACH role_name IN ARRAY ARRAY[api, backup] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = role_name
        AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication)
    ) THEN
      violations := violations || format('%s has a privileged role attribute', role_name);
    END IF;
    -- Memberships carry rights that the has_*_privilege calls below may not
    -- see (SET ROLE into the migrator, pg_execute_server_program, ...). Only
    -- pg_read_all_data for the backup role on a self-managed server is meant.
    FOR object IN
      SELECT granted.rolname
      FROM pg_auth_members membership
      JOIN pg_roles member ON member.oid = membership.member
      JOIN pg_roles granted ON granted.oid = membership.roleid
      WHERE member.rolname = role_name
        AND NOT (NOT is_supabase AND role_name = backup AND granted.rolname = 'pg_read_all_data')
    LOOP
      violations := violations || format('%s is a member of role %s', role_name, object.rolname);
    END LOOP;
    IF has_database_privilege(role_name, database, 'CREATE') THEN
      violations := violations || format('%s can create schemas in the database', role_name);
    END IF;
    FOREACH schema_name IN ARRAY ARRAY['public', 'content'] LOOP
      IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = schema_name)
        AND has_schema_privilege(role_name, schema_name, 'CREATE') THEN
        violations := violations || format('%s can create objects in schema %s', role_name, schema_name);
      END IF;
    END LOOP;
  END LOOP;

  -- TEMPORARY stays with PUBLIC on a managed host (accepted, ADR 0012 9.7).
  IF NOT is_supabase AND has_database_privilege(api, database, 'TEMPORARY') THEN
    violations := violations || format('%s can create temporary tables', api);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_shdepend dependency
    JOIN pg_roles r ON r.oid = dependency.refobjid
    WHERE dependency.refclassid = 'pg_authid'::regclass
      AND dependency.deptype = 'o'
      AND r.rolname = api
      AND dependency.dbid IN (0, (SELECT oid FROM pg_database WHERE datname = database))
  ) THEN
    violations := violations || format('%s owns an object', api);
  END IF;

  FOR object IN
    SELECT c.oid, n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'content') AND c.relkind IN ('r', 'p')
  LOOP
    is_meta_table := (object.nspname, object.relname) IN (
      ('public', '_prisma_migrations'), ('content', '_migrations'), ('content', '_content_types'));
    IF has_table_privilege(api, object.oid, 'TRUNCATE, REFERENCES, TRIGGER') THEN
      violations := violations || format('%s has a DDL-like right on %s.%s', api, object.nspname, object.relname);
    ELSIF is_meta_table AND has_table_privilege(api, object.oid, 'INSERT, UPDATE, DELETE') THEN
      violations := violations || format('%s can write meta table %s.%s', api, object.nspname, object.relname);
    ELSIF is_meta_table AND NOT has_table_privilege(api, object.oid, 'SELECT') THEN
      violations := violations || format('%s cannot read meta table %s.%s', api, object.nspname, object.relname);
    ELSIF NOT is_meta_table AND NOT (
      has_table_privilege(api, object.oid, 'SELECT')
      AND has_table_privilege(api, object.oid, 'INSERT')
      AND has_table_privilege(api, object.oid, 'UPDATE')
      AND has_table_privilege(api, object.oid, 'DELETE')
    ) THEN
      violations := violations || format('%s lacks DML on %s.%s', api, object.nspname, object.relname);
    END IF;
    IF has_table_privilege(backup, object.oid, write_rights) THEN
      violations := violations || format('%s can write %s.%s', backup, object.nspname, object.relname);
    END IF;
    IF NOT has_table_privilege(backup, object.oid, 'SELECT') THEN
      violations := violations || format('%s cannot read %s.%s', backup, object.nspname, object.relname);
    END IF;
  END LOOP;

  IF is_supabase THEN
    FOR object IN
      SELECT r.rolname, n.nspname, c.relname
      FROM unnest(string_to_array(current_setting('abyss.data_api_roles'), ',')) AS listed
      JOIN pg_roles r ON r.rolname = trim(listed)
      CROSS JOIN pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'content')
        AND ((c.relkind IN ('r', 'p', 'v', 'm', 'f')
              AND has_table_privilege(r.oid, c.oid, any_table_right))
          OR (c.relkind = 'S'
              AND has_sequence_privilege(r.oid, c.oid, 'USAGE, SELECT, UPDATE')))
    LOOP
      violations := violations || format('Data API role %s holds a right on %s.%s', object.rolname, object.nspname, object.relname);
    END LOOP;
  END IF;

  IF cardinality(violations) > 0 THEN
    RAISE EXCEPTION 'database roles self-check failed: %', array_to_string(violations, '; ');
  END IF;
  RAISE NOTICE 'database roles self-check passed (hosting=%)', current_setting('abyss.hosting');
END
$check_privileges$;
