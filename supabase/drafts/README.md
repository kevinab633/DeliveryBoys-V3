# Unfinished SQL drafts

These files are **not deployable migrations**. They are kept outside
`supabase/migrations` so database tooling does not apply them automatically.
They depend on an incomplete app, identity and RLS migration. Do not apply
these files to the live project. Local tests exercise them with mock auth and
storage schemas; those tests are not a production Supabase integration test.
