import { SelectField } from '@/components/select-field';

const options = [
  { value: 'all', label: 'All chats' },
  { value: 'event_discussion', label: 'Discussions' },
  { value: 'event_announcements', label: 'Announcements' },
] as const;

export type EventChatType = typeof options[number]['value'];
const selectOptions = [...options];

export function EventChatFilter({ value, onChange }: { value: EventChatType; onChange: (value: EventChatType) => void }) {
  return <SelectField compact label="Filter event chats" value={value} options={selectOptions} onChange={next => {
    const option = options.find(option => option.value === next);
    if (option) onChange(option.value);
  }} />;
}
