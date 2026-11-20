import ExcelJS from 'exceljs';
import { participantLicence, participantName } from './eventParticipants.js';

const currencyFormat = '"R"#,##0.00';

export function buildImportedParticipantWorkbook(event, rows, amounts) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Event Finance', { views: [{ state: 'frozen', ySplit: 3 }] });
  sheet.addRow([`Event: ${event.event_name || event.title || event.id}`]).font = { bold: true, size: 14 };
  sheet.mergeCells('A1:K1');
  sheet.addRow(['Amounts include attributable live receipts for the filtered participants. A blank amount means no verified receipt was attributed.']);
  sheet.mergeCells('A2:K2');
  sheet.addRow(['Participant Name', 'Division', 'System Profile', 'Email', 'Contact Number', 'Licence Type', 'Recorded Payment Status',
    'Verified Payment Method', 'Verified Amount Paid', 'WhatsApp Added', 'Notes']).font = { bold: true };
  sheet.autoFilter = 'A3:K3';
  sheet.getColumn(9).numFmt = currencyFormat;
  [28, 24, 28, 32, 20, 24, 24, 25, 23, 18, 43].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  let total = 0;
  for (const row of rows) {
    const record = amounts.get(row.id);
    if (record) total += record.cents;
    sheet.addRow([
      participantName(row), row.class_name || 'Not recorded', row.players?.name || (row.profile_id ? 'Linked' : 'Unlinked'),
      row.email || row.players?.email || '', row.players?.contact_number || '', participantLicence(row, event.id),
      row.is_paid ? 'Paid' : 'Unpaid', record ? [...record.methods].join(', ') : '', record ? record.cents / 100 : null,
      row.whatsapp_added ? 'Yes' : 'No', record ? [...record.notes].join(' · ') : '',
    ]);
  }
  sheet.addRow([]);
  sheet.addRow(['', '', '', '', '', '', '', 'Verified total (filtered)', total / 100]).font = { bold: true };
  return workbook;
}

export async function downloadImportedParticipantWorkbook(event, report, isCurrent) {
  const buffer = await buildImportedParticipantWorkbook(event, report.rows, report.amounts).xlsx.writeBuffer();
  if (!isCurrent()) return;
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const filename = String(event.event_name || event.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  anchor.download = `${filename || `event-${event.id}`}-participants.xlsx`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
