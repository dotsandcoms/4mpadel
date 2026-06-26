# Event Registration Refunds — Implementation Plan (Corrected)

Implement Paystack-backed partial refunds for manual event registrations with a booking-ownership model (owner vs partner), automatic refunds until registration closes, and admin-only removal/refunds after close.

**Scope:** Manual events (`calendar.is_manual = true`) only — Rankedin-synced events keep existing flows.

> **Revision note:** This version folds in fixes from a codebase review. Changes vs. the original draft are flagged inline as **[CORRECTION]**. The substantive design is unchanged; the corrections address unit handling, idempotency across the two payment-finalize paths, the booking-owner check, the admin authorization source, and line references.

---

## Codebase facts this plan relies on (verified)

- **`payments` is one row per checkout.** `metadata.covers` is an array of `{ type: 'entry' | 'license', email, division?, license? }` describing every line item the transaction paid for. This is the join key for resolving refundable items and already exists. `metadata` also carries `line_items`, `division_entry_fees`, `registrant_email`, `registration_rows`, and `solo_link_updates`.
- **Amounts are stored in Rands.** `payments.amount` is `NUMERIC(10,2)` in ZAR. The client converts to Paystack subunits (cents) only at the API boundary via `toPaystackAmount()` (`src/constants/fees.js`, `×100`). All DB-side money is Rands.
- **Payment lifecycle:** `processing → success`, or `abandoned` (after a timeout sweep). There is no `refunded` / `partially_refunded` state today.
- **Finalization is duplicated across two functions** that contain near-identical `finalizeManualEventPayment` logic:
  - `supabase/functions/confirm-manual-payment/index.ts` (client-polled after checkout)
  - `supabase/functions/paystack-webhook/index.ts` (server, currently early-returns on anything that isn't `charge.success`)
- **Shared code is physically copied** into each function directory (Supabase bundles each function in isolation). `_shared/` is the canonical source; `paystack.ts` and `manual-event-payment.ts` are copied into `confirm-manual-payment/`, `paystack-webhook/`, etc.
- **Booking ownership exists.** `event_registrations.registered_by` is populated on insert (`registered_by: existingSelfReg?.registered_by || userEmail`). The UI already derives `wasAddedByPartner = registeredBy && registeredBy !== selfEm`.
- **Licenses:** temp licenses live in a `temporary_licenses` table keyed by `(player_id, event_id)`; `players.license_type` is `'none' | 'temporary' | 'full'`. Full vs. temp is set during finalize.
- **Admin authorization** is backed by the `admin_permissions` table (migration `20260326_create_admin_permissions.sql`) — the canonical source for `isAdmin`.

---

## Confirmed Decisions

> [!NOTE]
> **Full entry fee refund:** Refund the **full entry fee amount** to the original payer. The organiser absorbs the Paystack processing fee loss (Paystack does not return their cut on refunds).

> [!NOTE]
> **Annual SAPA license:** Full annual licenses purchased in checkout are **not** refunded on event withdrawal. Only temporary event licenses are refunded and cancelled.

> [!NOTE]
> **Partial refund mechanics:** A single Paystack transaction can cover multiple divisions + licenses. Each withdrawal issues a separate partial refund call for the relevant line items. Guard: `sum(existing_refunds for payment) + new_refund <= payment.amount`, computed in **Rands**.

> [!NOTE]
> **Admin cash/manual refund:** Admin UI will show a **"Mark Refunded"** button for cash/manual-paid entries — local status update only, no Paystack call.

> [!NOTE]
> **Multi-division withdraw:** When a player has entries in multiple divisions, offer both per-division withdraw **and** a **"Withdraw from All"** option that processes refunds for every active division in one action.

> [!NOTE]
> **Refund recipient rule:** The refund **always goes to the original payer** (the person whose card was charged), regardless of who is withdrawing. If Player A paid for Player B's entry and Player B withdraws, the refund goes back to Player A's transaction.

---

## Corrections folded into this revision

> [!IMPORTANT]
> **[CORRECTION 1 — Money units.] Convert Rands → cents at the Paystack boundary only.**
> `payments.amount` and all line-item amounts are in Rands. Paystack's `POST /refund` expects the `amount` in subunits (cents). The refund engine must apply `Math.round(rands * 100)` when calling Paystack, and store `payment_refunds.amount` in **Rands** to stay consistent with `payments.amount`. The `sum + new <= original` guard is computed entirely in Rands.

> [!IMPORTANT]
> **[CORRECTION 2 — Booking-owner check.]** The booking owner is determined by comparing `registered_by` to the **caller's email**, not to the row's `email`:
> ```js
> isBookingOwner: normEmail(reg.registered_by) === normEmail(userEmail)
> ```
> This matches the existing `wasAddedByPartner` logic. (The original draft's `=== normEmail(reg.email)` was incorrect.)

> [!IMPORTANT]
> **[CORRECTION 3 — Idempotency across BOTH finalize paths.]** Because finalize logic runs in both `confirm-manual-payment` and `paystack-webhook`, every refund side-effect (especially flipping `event_registrations.payment_status = 'refunded'` and inserting `payment_refunds` rows) must be idempotent across both. Key on `paystack_refund_id` (unique) so a replayed webhook or a client poll cannot create a duplicate refund row or double-flip status.

> [!IMPORTANT]
> **[CORRECTION 4 — Admin authorization source.]** `checkRefundEligibility(..., isAdmin)` must derive `isAdmin` server-side from the `admin_permissions` table using the authenticated user — never trust a client-supplied flag.

> [!IMPORTANT]
> **[CORRECTION 5 — Line references.]** Verified anchors in `ManualEventRegistration.jsx`: `confirmWithdraw` is **L2178–2263**, partner-unlink block is **L2191–2207**, withdraw-modal refund copy is **L3828–3831**, `registrationEntries` memo is **L586–637**, `isClosed` helper is **L126–130**. `AuthModal.jsx` terms list is around **L1098**.

---

## Proposed Changes

### Phase 1 — Foundation (Database + Shared Logic)

---

#### [NEW] `supabase/migrations/20260626_payment_refunds.sql`

New migration creating:

**`payment_refunds` table:**
```sql
CREATE TABLE IF NOT EXISTS payment_refunds (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    event_registration_id UUID REFERENCES event_registrations(id) ON DELETE SET NULL,
    paystack_refund_id TEXT,            -- unique once known; idempotency key
    paystack_reference TEXT,            -- original transaction reference
    amount NUMERIC(10,2) NOT NULL,      -- RANDS, consistent with payments.amount
    currency TEXT DEFAULT 'ZAR',
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending','processing','processed','failed','needs_attention')),
    reason TEXT NOT NULL
        CHECK (reason IN ('owner_withdraw','partner_withdraw','owner_removed_partner','admin_removal','admin_cash_refund')),
    initiated_by TEXT NOT NULL,         -- email or admin user id
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ
);

-- Idempotency: prevent duplicate rows for the same Paystack refund
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_refunds_paystack_refund_id
    ON payment_refunds(paystack_refund_id) WHERE paystack_refund_id IS NOT NULL;
```

> **[CORRECTION 1]** `amount` is documented and used as **Rands**.
> **[CORRECTION 3]** The partial unique index on `paystack_refund_id` is the cross-path idempotency guard.

**Schema changes to existing tables (additive, `IF NOT EXISTS`, per existing migration style):**
- `event_registrations`: add `refunded_at TIMESTAMPTZ`, `refund_amount NUMERIC(10,2)`. `payment_status` already accepts free text (`'pending'|'paid'|...`) so `'refunded'` needs no constraint change — confirm there is no CHECK constraint to extend.
- `payments`: **no schema change.** `partially_refunded` / `refunded` are derived from `payment_refunds` rows (avoids migration risk on live data).

**Indexes:** `payment_refunds(payment_id)`, `payment_refunds(event_registration_id)`, plus the unique `paystack_refund_id` index above.

**RLS:** service-role only writes; admin read via authenticated + `admin_permissions` check; public blocked. (Match the existing additive RLS pattern: `DROP POLICY IF EXISTS` then `CREATE POLICY`.)

---

#### [NEW] `supabase/functions/_shared/refund-engine.ts`

Shared server-side module (canonical source, copied into edge-function dirs per existing pattern). Contains:

1. **`resolveRefundableItems(registration, payments[], existingRefunds[])`**
   - Matches `payments.metadata.covers` entries to the registration being withdrawn (by `email` + `division`, and `type === 'entry'`; plus `type === 'license'` where `license !== 'full'`).
   - Returns `{ payment_id, reference, refund_amount_rands, cover_type, already_refunded_rands, is_test }[]`.
   - Guard: `already_refunded_rands + refund_amount_rands <= payment.amount` (Rands). **[CORRECTION 1]**

2. **`toPaystackCents(rands)`** — small helper, `Math.round(rands * 100)`, used only when building the Paystack request body. **[CORRECTION 1]**

3. **`applyRegistrationWithdrawal(supabaseAdmin, reg, options)`**
   - Sets `status: 'withdrawn'`, `withdrawn_at`, optionally `payment_status: 'refunded'`, `refunded_at`, `refund_amount`.
   - Unlinks partner on remaining rows (logic currently in `ManualEventRegistration.jsx` L2191–2207, moved server-side). **[CORRECTION 5]**
   - Must be safe to call twice (no-op if already `withdrawn`/`refunded`). **[CORRECTION 3]**

4. **`transferBookingOwnership(supabaseAdmin, ownerReg, partnerReg)`**
   - Sets `partnerReg.registered_by = partnerReg.email` (partner becomes owner).
   - Clears partner linkage on the partner's row.

5. **`cancelEventTempLicense(supabaseAdmin, playerEmail, eventId)`**
   - Deletes the `temporary_licenses` row for `(player_id, event_id)`.
   - Reverts `players.license_type` to `'none'` only if no other active temp/full license remains.

6. **`checkRefundEligibility(reg, divisions, event, callerEmail, isAdmin)`**
   - Returns `{ eligible, reason, closedForSelfService }`.
   - Enforces the close-date gate (`isClosed`, mirrors L126–130) for non-admin callers. **[CORRECTION 5]**
   - `isAdmin` is resolved by the caller from `admin_permissions`, never from the request body. **[CORRECTION 4]**

7. **`resolveIsAdmin(supabaseAdmin, userId | email)`** — looks up `admin_permissions`; single source of truth for admin paths. **[CORRECTION 4]**

---

### Phase 2 — Edge Functions

---

#### [NEW] `supabase/functions/paystack-refund/index.ts`

New edge function. Entry point for all refund operations.

**Request body:**
```typescript
{
  registration_id: string,
  action: 'withdraw' | 'withdraw_all' | 'remove_partner' | 'admin_remove',
  event_id?: string,        // required for withdraw_all
  skip_paystack?: boolean   // admin-only; cash/manual-paid entries. Ignored unless caller is admin. [CORRECTION 4]
}
```

**Auth flow:**
1. Extract user from `Authorization` header (existing pattern from `confirm-manual-payment/index.ts` — create an anon client with the header, call `auth.getUser()`).
2. Resolve `isAdmin` from `admin_permissions` (`resolveIsAdmin`). **[CORRECTION 4]**
3. Load registration; verify caller is owner / partner / admin. Owner check uses `normEmail(reg.registered_by) === normEmail(user.email)`. **[CORRECTION 2]**
4. Check eligibility via `checkRefundEligibility` (close-date gate for non-admins).
5. Resolve refundable items via `resolveRefundableItems`.
6. For each refundable item: insert a `payment_refunds` row with status `'pending'` **first** (so a crash mid-call is auditable), then call `POST https://api.paystack.co/refund` with `{ transaction: reference, amount: toPaystackCents(item.refund_amount_rands) }`, using the Paystack secret resolved per-payment via the existing `getPaystackSecretForPayment` (test vs. live by `is_test`). **[CORRECTION 1]**
7. On Paystack response, update the row with `paystack_refund_id` and bump status to `'processing'` (final state arrives via webhook).
8. Apply side-effects: `applyRegistrationWithdrawal`, `transferBookingOwnership` (owner withdraws but partner stays), `cancelEventTempLicense`.
9. Send withdrawal / refund emails.
10. Return a refund summary to the client.

> **[CORRECTION 3]** All inserts key on the unique `paystack_refund_id` once known; re-running the action for an already-withdrawn/refunded registration is a no-op.

**Copied shared files** (per isolation constraint):
- `paystack-refund/paystack.ts` ← copy of `_shared/paystack.ts`
- `paystack-refund/refund-engine.ts` ← copy of `_shared/refund-engine.ts`

---

#### [MODIFY] `supabase/functions/paystack-webhook/index.ts`

Extend to handle refund webhook events from Paystack:
- Currently the handler early-returns unless `payload.event === 'charge.success'`. Add a branch for `refund.pending`, `refund.processing`, `refund.processed`, `refund.failed`.
- Refund payloads differ from charge payloads: the transaction reference is at `data.transaction.reference` (or `data.transaction`), and the refund id at `data.id` — parse defensively.
- On each event: look up `payment_refunds` by `paystack_refund_id` (preferred) or by `paystack_reference` + pending state, update `status` + `processed_at`.
- On `refund.processed`: finalize `event_registrations.payment_status = 'refunded'` if not already done — **idempotent**, since `confirm-manual-payment` may also touch the row. **[CORRECTION 3]**

**Copied shared file:**
- `paystack-webhook/refund-engine.ts` ← copy for import resolution

> Note: the same idempotency requirement applies if any refund-finalize logic is mirrored into `confirm-manual-payment` (it polls). Keep the webhook as the authoritative finalizer; the client path should only ever read/confirm, never double-write refund state.

---

### Phase 3 — Player UI Flows

---

#### [MODIFY] `src/components/ManualRegistrationEntryCard.jsx`

Add **Remove Partner** button (owner-only, before close):
- New prop: `onRemovePartner` callback.
- Show "Remove Partner" when: `entry.hasPartner === true` **and** `entry.isBookingOwner === true` **and** `entry.canWithdraw === true` (not closed).
- Button style: destructive outline (mirror the existing Withdraw button at L82–95).

---

#### [MODIFY] `src/components/ManualEventRegistration.jsx`

**1. Add `removePartner(reg)` handler (~30 lines)**
- Confirmation modal: "Remove [partner name]? If they paid, they'll be refunded automatically."
- Calls `paystack-refund` with `action: 'remove_partner'`.
- Reloads registrations on success (`loadMyRegs` + `loadDivisionRegs` + `onParticipantsChange`).

**2. Refactor `confirmWithdraw` (L2178–2263 rewrite)** **[CORRECTION 5]**
- **Before close:** invoke `paystack-refund` (`action: 'withdraw'`) instead of the current direct Supabase writes. The edge function handles withdrawal, ownership transfer, partner unlinking, and refund initiation.
- **After close:** disable the withdraw button entirely; show "Registration closed — contact admin."
- **Owner + partner remaining:** edge function transfers ownership; UI shows success mentioning the partner now owns the booking.
- Remove the direct Supabase withdrawal/unlink calls (L2185–2207) from the frontend.

**3. Add "Withdraw from All Divisions" flow**
- When the player has entries in 2+ divisions, the withdraw modal shows a "Withdraw from all divisions" toggle.
- Calls `paystack-refund` with `action: 'withdraw_all'` + `event_id`; the edge function iterates the caller's active registrations and returns a combined summary.
- Refund always routes to the original payer's transaction per division (may span multiple Paystack transactions).

**4. Add `isBookingOwner` + `canWithdraw` to the `registrationEntries` memo (L586–637)** **[CORRECTION 2, 5]**
```js
const selfEm = normEmail(userEmail);
// ...
isBookingOwner: normEmail(reg.registered_by) === selfEm,   // CORRECTION 2
canWithdraw: !!div && !isClosed(div, event),
```
Pass both through to `ManualRegistrationEntryCard`.

**5. Update withdraw modal copy (L3828–3831)** **[CORRECTION 5]**
Replace "Withdrawing will not automatically issue a refund" with dynamic text:
- Eligible for refund: "Your entry fee of R X will be refunded to your original payment method (3–10 business days)."
- Temp license included: "Your temporary SAPA license of R 120 will also be refunded."
- Not paid: "No refund applicable — entry was not paid."
- Closed: don't show the modal — show a disabled state with tooltip.

**6. Close-date gate on Withdraw/Remove buttons**
- Driven by the `canWithdraw` field above; hide/disable in `ManualRegistrationEntryCard` when `canWithdraw === false`.

**7. Add remove-partner confirmation modal (~50 lines)**
- Mirror the existing withdraw modal; show partner name and refund estimate if applicable.

---

### Phase 4 — Admin UI + Email + Legal

---

#### [MODIFY] `src/components/admin/ManualEventRegistrations.jsx`

Add post-close admin removal capabilities (today the row only has "Mark Paid", `markPaid` at L129):
- **"Remove"** button per registration row, with a dialog offering:
  - "Remove & Refund" (Paystack-paid) → `paystack-refund` with `action: 'admin_remove'`.
  - **"Mark Refunded"** (cash/manual-paid) → local-only: set `payment_status: 'refunded'` and insert a `payment_refunds` row with `reason: 'admin_cash_refund'`, `status: 'processed'` (no Paystack call). **[CORRECTION 1]** amount in Rands.
  - "Remove (No Refund)" → withdraw without refund.
- **"Remove Pair"** for paired entries (both players).
- Show a `refund_status` badge on rows that have `payment_refunds` records.

---

#### [MODIFY] `src/components/admin/EventFinance.jsx`

- Add a **Refund Status** column in the participant table for manual events.
- Badge: "Refunded R X" / "Refund Pending" / "Refund Failed".
- Add a **"Refund"** action on paid Paystack rows (invokes `paystack-refund`).
- Dashboard stats: add a "Total Refunded" card alongside Revenue/Outstanding; compute **net revenue = paid − refunded** in Rands. **[CORRECTION 1]**
- Query `payment_refunds` alongside `payments` on event load (the component already reads `payments` + `covers` at L34).

---

#### [MODIFY] `supabase/functions/send-email/index.ts`

Add a new `entry_refunded` template case in the switch block (templates currently run through `case 'entry_withdrawn'` at L571 and neighbours):
```
Subject: "Refund Initiated: {eventName} ✅"
Body:
  - "Your entry fee of {amount} for {division} has been refunded."
  - "Refunds typically take 3–10 business days to appear on your statement."
  - Event card with refund details
  - Reference number
```
Update the existing `entry_withdrawn` template: when a refund was initiated, add "A refund of {amount} has been initiated and will appear on your statement within 3–10 business days." (amounts formatted with the existing `fmtR` helper).

---

#### [MODIFY] `src/utils/emails.js`

Add the subject mapping for `entry_refunded` in `getSubjectForTemplate`.

---

#### [MODIFY] `src/components/AuthModal.jsx` (≈ L1098)

Replace the terms line "Registration fees are non-refundable unless otherwise stated." with:
> "Entry fees are automatically refunded if you withdraw before registration closes. After registration closes, refunds are at the organiser's discretion. Paystack processing fees are non-refundable. Annual SAPA licenses are non-refundable."

---

## File Summary

| Phase | Action | File | Description |
|-------|--------|------|-------------|
| 1 | NEW | `supabase/migrations/20260626_payment_refunds.sql` | `payment_refunds` table (+ unique `paystack_refund_id` index) + `event_registrations` columns |
| 1 | NEW | `supabase/functions/_shared/refund-engine.ts` | Refund resolution (Rands), withdrawal, ownership transfer, admin resolution |
| 2 | NEW | `supabase/functions/paystack-refund/index.ts` | Refund edge function: auth, admin check, eligibility, Paystack calls (cents at boundary) |
| 2 | NEW | `supabase/functions/paystack-refund/paystack.ts` | Copy of shared Paystack helpers |
| 2 | NEW | `supabase/functions/paystack-refund/refund-engine.ts` | Copy of shared refund engine |
| 2 | MODIFY | `supabase/functions/paystack-webhook/index.ts` | Handle `refund.*` events; idempotent finalize |
| 2 | NEW | `supabase/functions/paystack-webhook/refund-engine.ts` | Copy for webhook import |
| 3 | MODIFY | `src/components/ManualRegistrationEntryCard.jsx` | Remove Partner button, close-date visibility |
| 3 | MODIFY | `src/components/ManualEventRegistration.jsx` | Refund-aware withdraw, remove partner, ownership transfer, `isBookingOwner`/`canWithdraw`, close gate |
| 4 | MODIFY | `src/components/admin/ManualEventRegistrations.jsx` | Admin remove/refund controls |
| 4 | MODIFY | `src/components/admin/EventFinance.jsx` | Refund status column, refund button, net revenue |
| 4 | MODIFY | `supabase/functions/send-email/index.ts` | `entry_refunded` template + updated `entry_withdrawn` |
| 4 | MODIFY | `src/utils/emails.js` | Subject line for `entry_refunded` |
| 4 | MODIFY | `src/components/AuthModal.jsx` | Updated refund policy copy |

---

## Verification Plan

### Automated Tests
- No existing test framework — verification is manual integration testing.

### Manual Verification

**Phase 1:**
- Apply migration; confirm `payment_refunds` exists with the CHECK constraints and the unique `paystack_refund_id` index.
- Confirm `event_registrations` gained `refunded_at` and `refund_amount`.

**Phase 2:**
- Deploy `paystack-refund`. In Paystack **test mode**, initiate a refund for a test transaction; confirm a `payment_refunds` row is created with `amount` in **Rands** and the Paystack request carried `amount` in **cents**. **[CORRECTION 1]**
- Fire a mock `refund.processed` webhook; verify status + `processed_at` update.
- **Idempotency:** send the same `refund.processed` event twice → no duplicate row, no double status flip. Run the client `confirm-manual-payment` poll against an already-refunded reg → no double-write. **[CORRECTION 3]**

**Phase 3 (testing matrix):**
- [ ] Owner solo withdraw (paid) → full entry refund
- [ ] Owner paid for partner, owner removes partner → refund to owner's transaction
- [ ] Partner paid self, owner removes partner → refund to partner's transaction
- [ ] Partner unpaid, owner removes partner → no refund, partner row withdrawn
- [ ] Owner withdraws, partner stays → ownership transfer + owner-only refund
- [ ] Partner decline when added by owner (paid/unpaid)
- [ ] Temp license in same checkout → license row deleted + partial refund
- [ ] After close → self-service blocked; admin path works
- [ ] Multi-item checkout → partial refund never exceeds `payment.amount` (Rands guard)
- [ ] `isBookingOwner` true only for the caller who created the booking; partner sees no Remove-Partner button **[CORRECTION 2]**

**Phase 4:**
- Admin removes paid player → refund initiated in EventFinance; net revenue reflects it.
- Admin removes cash-paid player → "Mark Refunded" local-only, `reason: 'admin_cash_refund'`.
- `skip_paystack` ignored for non-admin callers. **[CORRECTION 4]**
- Refund email received with correct amount + reference.
- AuthModal shows updated terms.
