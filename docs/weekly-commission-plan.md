# Weekly rider commission: implementation plan

Status: **not implemented**. The current commission card records a rider-reported amount and lets a manager confirm it; it does not provide weekly statements, deadlines, proof uploads, or a reliable overdue halt. Do not treat the existing flow as payment verification.

## Agreed requirements

- A commission week runs Monday through Sunday in Ghana time (UTC). Only completed deliveries count, using their recorded commission and delivery time.
- The manager can set the number of days allowed for payment. Initially this is one day: payment is due by 23:59 Monday, Ghana time. Each week's deadline must remain fixed after that statement is created, even if the setting later changes.
- Begin the new system at GHS 0; do not carry over test commission balances. Establish an explicit server-side cutover so earlier deliveries are not counted again.
- A rider sees the previous week's amount and deadline, pays the company manually, and submits a payment screenshot for manager review. The current week's commission accumulates separately.
- A manager reviews the screenshot, confirms receipt or rejects the submission. A confirmed statement is settled; subsequent weeks remain separate. Keep a payment/approval history after deleting the screenshot.
- After a deadline passes without confirmation, prevent the rider from accepting new deliveries. Allow sign-in, completion of an active delivery and submission of proof. A manager must confirm payment and approve the rider's return; any other overdue unpaid statements must also be resolved before access is restored.
- Delete payment proof after approval. If rejected, keep it until a replacement is successfully submitted, then delete the old image.
- Apply the same retention rule to rider verification images: delete them on approval; keep rejected images until a successful resubmission, then delete the old images. Do not delete profile pictures.

## Rollout prerequisites and decisions

- Create and verify a backup before any live migration. The Supabase test-branch request was denied because branching requires a Pro plan.
- Decide the exact cutover time for the GHS 0 reset and how to handle any existing manual payment requests.
- Confirm whether a report submitted before the deadline but not yet confirmed should still trigger the halt; the agreed rule above requires confirmation.
- Confirm the company's payment instructions and what transaction details the rider must supply alongside the screenshot.
- Decide retention and recovery policy for failed image deletions, backups, and disputed transactions, taking applicable legal obligations into account.

## Security and data prerequisites

The existing email/phone `loginDirect` in `src/stores/authStore.ts` looks up a contact and signs in without verifying control of it. The current client stores roles locally, `usersApi` writes directly to Supabase, and order acceptance is initiated optimistically from the client. A read-only review of the connected project found public all-access to `users`, public reads/inserts/updates to `orders`, and public writes to `app_settings`; restricting these safely requires updating the app's existing access paths at the same time. No storage bucket was listed in the project, while the verification UI expects `rider-verification`; the current upload flow therefore needs configuration as well as a privacy redesign. Email auth and Google are enabled, and email confirmation is required; the current confirmation template uses a link, so a code-based flow needs an appropriate template. The native build guide also notes that Supabase Auth migration and Row Level Security are needed. A client-only overdue check would not enforce a halt, and a screenshot or manager approval must not be exposed to arbitrary users.

Before enabling this feature:

1. Establish verified identity, link it reliably to the app user, and enforce manager/rider roles server-side. The owner chose Google-only sign-in for all accounts, with manager access limited to the owner-controlled support.deliveryboysgh@gmail.com Google identity. Customers request rider access; managers approve it. Roles must be assigned server-side, never supplied by the client. Plan migration of existing email and phone-only test accounts without deleting data. Review all existing Supabase policies and service-role API endpoints; don't trust client-supplied user IDs or roles.
2. Add durable, auditable weekly statements, immutable deadline snapshots, payment submissions and approval events. Calculate and settle them transactionally on the server from authoritative order data; account for existing debts, late corrections, concurrent submissions and retries.
3. Enforce the overdue/approval gate server-side at every order-assignment and acceptance path, while preserving access to active deliveries. A UI-only check is insufficient.
4. Store proof and verification images in private storage with narrowly scoped access. Delete the actual storage objects (not just their URLs), retry failed deletions, and retain only necessary audit metadata. On resubmission, save the replacement successfully before deleting the old object. Never delete the profile image.
5. Test boundary times in Ghana, zero-commission weeks, multiple overdue weeks, delayed review, rejections/resubmission, duplicate approvals, connectivity failures, cross-device updates, and unauthorized requests. Verify behavior against a staging database before production rollout.
