import { jsPDF } from 'jspdf';

/** Export the full division, independent of the table's search and pagination. */
export function buildDivisionListPdf({ event, division, entries, rows, review, seededCount, seeded = false, confirmedAt, dirty = false }) {
    const pdf = new jsPDF();
    let y;
    const header = () => {
        pdf.setFontSize(17);
        pdf.text(seeded ? 'Team seedings' : 'Player / team members list', 14, 20);
        pdf.setFontSize(10);
        const title = pdf.splitTextToSize(`${event.event_name || event.title || 'Tournament'} / ${division.name}`, 180);
        pdf.text(title, 14, 29);
        y = 34 + title.length * 5;
        pdf.text(dirty || !confirmedAt ? 'Working copy - not confirmed' : `Confirmed: ${new Date(confirmedAt).toLocaleString('en-ZA')}`, 14, y);
        y += 12;
    };
    header();
    const lines = seeded ? entries.map((e, i) => `${i + 1}. ${e.team_name} | ${i < seededCount ? `Seed ${i + 1}` : 'Unseeded'} | Ranking points: ${e.seeding_value || 0}`)
        : rows.map(r => `${review.excluded?.includes(r.id) ? 'Excluded' : 'Included'}: ${r.full_name}${r.partner_name ? ' / ' + r.partner_name : ''} | Payment: ${r.payment_status || 'Unknown'}`);
    if (!lines.length) lines.push('No entries in this division.');
    for (const line of lines) {
        for (const wrapped of pdf.splitTextToSize(line, 180)) {
            if (y > 275) { pdf.addPage(); header(); }
            pdf.text(wrapped, 14, y); y += 5;
        }
        y += 4;
    }
    return pdf;
}

export function downloadDivisionList(options) {
    buildDivisionListPdf(options).save(`${options.division.name.replace(/[^a-z0-9-]+/gi, '-')}-${options.seeded ? 'seedings' : 'team-members'}.pdf`);
}
