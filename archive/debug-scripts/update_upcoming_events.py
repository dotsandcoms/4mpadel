import re

file_path = "/Users/bradein/Sites/4m Padel/src/components/FeaturedSections.jsx"

with open(file_path, "r") as f:
    content = f.read()

# Replace featured-tournaments with upcoming-events where appropriate
content = content.replace("data.id === 'featured-tournaments'", "data.id === 'upcoming-events'")
content = content.replace("section.id === 'featured-tournaments'", "section.id === 'upcoming-events'")
content = content.replace("item.id === 'featured-tournaments'", "item.id === 'upcoming-events'")

# Fix the fetchFeaturedEvents query
old_query = """const { data, error } = await supabase
                    .from('calendar')
                    .select('*, registered_players, start_date, end_date')
                    .eq('featured_event', true)
                    .neq('is_visible', false)
                    .order('start_date', { ascending: true })
                    .limit(10);"""

new_query = """const today = new Date().toISOString().split('T')[0];
                const { data, error } = await supabase
                    .from('calendar')
                    .select('*, registered_players, start_date, end_date')
                    .gte('start_date', today)
                    .neq('is_visible', false)
                    .order('start_date', { ascending: true })
                    .limit(10);"""

content = content.replace(old_query, new_query)

with open(file_path, "w") as f:
    f.write(content)
