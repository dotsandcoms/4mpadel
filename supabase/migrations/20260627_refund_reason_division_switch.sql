-- Allow 'division_switch' as a payment_refunds.reason — used when a player
-- switches to a cheaper division and the fee difference is refunded.
ALTER TABLE payment_refunds DROP CONSTRAINT IF EXISTS payment_refunds_reason_check;
ALTER TABLE payment_refunds ADD CONSTRAINT payment_refunds_reason_check
    CHECK (reason IN (
        'owner_withdraw',
        'partner_withdraw',
        'owner_removed_partner',
        'admin_removal',
        'admin_cash_refund',
        'division_switch'
    ));
