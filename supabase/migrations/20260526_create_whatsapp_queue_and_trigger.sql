-- Migration: Create WhatsApp Queue Table and Partner Notification Trigger
-- Date: 2026-05-26

-- 1. Create WhatsApp Queue Table
CREATE TABLE IF NOT EXISTS whatsapp_queue (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    recipient_phone TEXT NOT NULL,
    template_name TEXT NOT NULL,
    variables JSONB DEFAULT '[]'::jsonb, -- e.g., ["John", "SAPA Gold", "Cat 1", "link"]
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE whatsapp_queue ENABLE ROW LEVEL SECURITY;

-- Select/Write Policies (Admins have full access, public read own is off for privacy)
CREATE POLICY "Admin full access to whatsapp_queue" ON whatsapp_queue FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Create Index for high performance processing
CREATE INDEX IF NOT EXISTS idx_whatsapp_status ON whatsapp_queue(status);

-- 2. Create PostgreSQL Trigger Function
CREATE OR REPLACE FUNCTION enqueue_partner_whatsapp_notification()
RETURNS TRIGGER AS $$
DECLARE
    partner_phone TEXT;
    partner_player_id BIGINT;
    event_title TEXT;
    reg_division TEXT;
BEGIN
    -- Only trigger if the registration is marked as paid and there is a partner name
    IF NEW.payment_status = 'paid' AND NEW.partner_name IS NOT NULL AND NEW.partner_name <> '' THEN
        
        -- A. Try to lookup the partner's profile to get their contact number
        SELECT id, contact_number INTO partner_player_id, partner_phone
        FROM players
        WHERE name ILIKE NEW.partner_name OR email ILIKE NEW.partner_name
        LIMIT 1;

        -- B. If a partner is found with a valid contact number, queue the notification
        IF partner_phone IS NOT NULL AND partner_phone <> '' THEN
            
            -- Get the event name
            SELECT event_name INTO event_title
            FROM calendar
            WHERE id = NEW.event_id;

            -- Safe division fallback
            reg_division := COALESCE(NEW.division, 'Open');

            -- Log/Enqueue the WhatsApp template message
            -- Variables: [Player 1 Name, Tournament Name, Division Category, Confirmation Link]
            INSERT INTO whatsapp_queue (recipient_phone, template_name, variables, status)
            VALUES (
                partner_phone,
                'partner_entry_invite',
                jsonb_build_array(
                    NEW.full_name,
                    event_title,
                    reg_division,
                    'https://4mpadel.co.za/calendar?register=true'
                ),
                'pending'
            );
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create Trigger on event_registrations
DROP TRIGGER IF EXISTS trigger_enqueue_partner ON event_registrations;
CREATE TRIGGER trigger_enqueue_partner
    AFTER INSERT OR UPDATE OF payment_status ON event_registrations
    FOR EACH ROW
    EXECUTE FUNCTION enqueue_partner_whatsapp_notification();
