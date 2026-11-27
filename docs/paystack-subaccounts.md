# Organisation Paystack subaccounts

One Paystack code per organisation, with opt-in per tournament. App and website entrants use the same routing and keep their existing payment and refund screens.

## Finance setup

1. In the 4M Paystack Dashboard, verify the organisation's ZAR subaccount and set the main account share to 0%.
2. In **Finance & Revenue → Paystack Subaccounts**, select the organisation, paste the code, and choose **Verify code**. Check the holder and masked account before selecting **Save subaccount**.
3. Set the tournament's registration opening date in the future. For a new 4M online tournament with no Paystack checkouts, choose **Enable routing** beside the tournament.
4. To replace a subaccount, pause its upcoming and current routed tournaments first. Verify and save the new code, then resume the affected tournaments. Existing payment references, refunds and payout checks use their original Paystack subaccount.

## Release and pilot

- Apply the forward migration on the separately authorised target project. Then deploy `paystack-organisation-settlement`, `confirm-manual-payment`, `paystack-webhook`, `event-cash-receipts`, `event-finance-summary` and the root `paystack-refund`. Deploy `native-event-checkout` from the mobile Supabase project directory to the same hosted project and release the web client before enabling a tournament. Keep the mobile copy of the refund function in sync with the deployable root function.
- Use `PAYSTACK_ORGANISATION_SETTLEMENT_MODE=test` in an isolated environment with the test Paystack key and a test subaccount. Live mode is the default. In live mode leave `PAYSTACK_ORGANISATION_REFUND_FUNDING` unset until Paystack has confirmed the required behaviour. Only then set it to `confirmed`.
- Ask Paystack to confirm that entry refunds on a 0% primary-share ZAR split are debited from the organisation before and after settlement, including partial refunds, insufficient organisation funds and a combined licence or checkout fee. Out-of-band refunds made in Paystack also need to follow the confirmed funding model.
- After authorisation, first link SA Grand using the code supplied for the pilot. Test a small live website and installed app payment. Match the original charge references, split and fees to the Paystack payout and SA Grand's bank receipt. Test full and partial refunds before and after payout and verify 4M was never debited for the entry refund. Then open public registration. Pause the tournament in Finance if allocation or refund funding is incorrect.
- Finance labels the net amount after processing as the allocated payout. **Check Paystack payouts** looks for exact transaction matches in settlement batches. A receipt can have a verified allocation while its bank payout is still unconfirmed. Refunds are shown separately.

## Local verification

Run `npm run check:web`, `npm --prefix mobile run check`, `npm run test:data-api` and `npm run test:data-api:db`. Run `tests/paystackSubaccounts.sql` with `psql -X -v ON_ERROR_STOP=1` against the empty disposable `fourm_paystack_routing_test` database. The fixture stands in for existing Auth, banking and checkout-quote tables. It exercises the real migration's access checks, routing snapshot, refund claim and payout guard. Use Paystack test mode and controlled live checks to verify the provider behaviour.
