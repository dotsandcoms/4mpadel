const timestamp = new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function communicationDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? timestamp.format(date) : '—';
}
