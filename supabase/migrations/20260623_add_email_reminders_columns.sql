-- Add columns to event_registrations to track sent reminders
ALTER TABLE event_registrations 
ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS close_reminder_sent_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for performance on these columns
CREATE INDEX IF NOT EXISTS idx_event_registrations_reminder_sent ON event_registrations(reminder_sent_at);
CREATE INDEX IF NOT EXISTS idx_event_registrations_close_reminder_sent ON event_registrations(close_reminder_sent_at);
