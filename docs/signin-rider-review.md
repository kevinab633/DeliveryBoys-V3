# Sign-in and rider review: owner handoff

## Deployment gate

**No live database, authentication, storage, or policy change was made.** The
SQL files in `supabase/drafts/` are review drafts, not migrations. Do not
apply them without the owner's explicit `apply live` instruction and a
separate rollout review.

The client now calls `register_direct_customer` or `register_direct_rider`
instead of writing a browser-chosen role. Until those server operations exist,
**both customer and rider signup fail closed** with an unavailable message;
no fake/local account is created. Coordinate the application release and the
server rollout so signup is not unintentionally interrupted. Existing-account
sign-in does not depend on these new signup functions.

The draft signup functions preserve the legacy contact-only interface and
therefore **do not verify ownership of an email or phone**. They are not safe
to deploy as an authentication solution: verified identity, abuse/rate-limit
controls, and the complete policy and client migration need separate review.
Likewise, current contact-only sign-in, public data policies, local state, and
broadcasts do not constitute authorization. A person who knows a contact can
still impersonate an existing account, including a manager or approved rider.
This PR does not fix that pre-existing vulnerability. The Google OAuth provider
may create a Supabase Auth identity before the app performs its existing-row
lookup; this PR prevents creation of an **app profile** on sign-in, but cannot
prevent that provider-side identity creation without a separately reviewed Auth
configuration/flow change. No Auth settings were changed.

`20261206_rider_access_server_guard.sql` is a proposed enforcement layer: it
blocks direct role/status changes, requires a linked verified rider for
availability/assignments, checks approval at the database, and requires a
verified manager session for review decisions. **It is not a standalone
migration**: current direct manager review and order/availability clients,
service-role operations, verification/resubmission, identity linking, and RLS
must be migrated and tested together. The draft can block the current app and
maintenance jobs if applied as-is. Reconcile its triggers with the existing
identity, order-acceptance, and commission drafts, and review historical riders
that are pending but marked online, without deleting or silently changing rows.

The client checks fresh approval before online/accept actions, filters pending
riders from dispatch, and shows a review state, but a modified browser can
bypass these checks until server authorization is deployed. A failed approval
refresh fails closed for those actions. A saved app session is rechecked against
its database row before the role-specific UI is displayed; it is signed out
locally if the row is missing, changed role, or cannot be checked.

## Duplicate accounts

Contact lookup is scoped to the requested role. For an exact email (ignoring
case) or exact phone match, the earliest `created_at` wins, nulls last, with
`id` as a deterministic tie-breaker. The browser logs a warning containing the
role, contact method, total count and up to two row IDs (not the contact). No
row is removed or modified to resolve duplicates. The following optional,
read-only queries can help the owner review all duplicate IDs; they have **not**
been run against the live project:

```sql
select role, lower(email) as email, count(*) as row_count,
       array_agg(id order by created_at asc nulls last, id asc) as ids
from public.users where email is not null
group by role, lower(email) having count(*) > 1;

select role, phone, count(*) as row_count,
       array_agg(id order by created_at asc nulls last, id asc) as ids
from public.users where phone is not null
group by role, phone having count(*) > 1;
```

The support address is not promoted to customer or manager on sign-in. A
customer lookup succeeds only when a customer row exists; new direct signup
with that address is rejected by the draft server functions. Existing rows of
other roles remain untouched.

## Validation scope

Automated tests use mocked clients and an in-process PostgreSQL-compatible
PGlite database; they do not contact the production database. Preview testing is
intentionally skipped. Production testing is reserved for after merge and the
owner's separately approved rollout.
