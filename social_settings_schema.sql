-- Create settings table for global site configuration
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Seed initial social links (based on current hardcoded values)
INSERT INTO settings (key, value) VALUES 
('instagram', 'https://instagram.com/4mpadel'),
('youtube', 'https://youtube.com/channel/UC12345678'),
('facebook', 'https://facebook.com/4mpadel'),
('website', 'https://4mpadel.co.za')
ON CONFLICT (key) DO NOTHING;

-- Allow public read access (necessary for footer/contact pages)
CREATE POLICY "Allow public read access for settings"
ON settings FOR SELECT TO public USING (true);

-- Allow authenticated (admin) write access
CREATE POLICY "Allow admin write access for settings"
ON settings FOR ALL TO authenticated USING (true);
