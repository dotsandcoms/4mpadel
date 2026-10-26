import { Pressable, Text, TextInput, View } from 'react-native';
import { useFieldColors } from '@/components/field-colors';
import { parseSponsors, serializeSponsors } from '@/lib/sponsors';

export function SponsorField({ value, input, onChange, onInputChange }: {
  value: string;
  input: string;
  onChange: (value: string) => void;
  onInputChange: (value: string) => void;
}) {
  const colors = useFieldColors();
  const names = parseSponsors(value);
  function add(text = input) {
    onChange(serializeSponsors([...names, ...parseSponsors(text)]));
    onInputChange('');
  }
  return (
    <View className="mb-3">
      <Text className="mb-1.5 text-[14px] font-semibold" style={{ color: colors.label }}>Sponsors (optional)</Text>
      <View className="rounded-[14px] p-3" style={{ backgroundColor: colors.elevated, borderColor: colors.accent, borderWidth: 2 }}>
        {names.length > 0 && <View className="mb-2 flex-row flex-wrap" style={{ gap: 8 }}>
          {names.map((name) => <Pressable key={name.toLowerCase()} accessibilityRole="button" accessibilityLabel={`Remove sponsor ${name}`}
            onPress={() => onChange(serializeSponsors(names.filter((item) => item !== name)))}
            className="min-h-11 flex-row items-center rounded-full px-3" style={{ backgroundColor: colors.soft, maxWidth: '100%', gap: 8 }}>
            <Text style={{ color: colors.accent, fontWeight: '600', flexShrink: 1 }}>{name}</Text>
            <Text style={{ color: colors.accent, fontSize: 20 }}>×</Text>
          </Pressable>)}
        </View>}
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <TextInput value={input} onChangeText={(text) => text.includes(',') ? add(text) : onInputChange(text)}
            onSubmitEditing={() => add()} returnKeyType="done" submitBehavior="submit"
            accessibilityLabel="Sponsor name" placeholder="Add a sponsor" placeholderTextColor={colors.placeholder}
            autoCapitalize="words" autoCorrect={false} selectionColor={colors.selection} cursorColor={colors.accent}
            style={{ flex: 1, minWidth: 0, minHeight: 44, fontSize: 16, color: colors.premium }} />
          <Pressable onPress={() => add()} disabled={!input.trim()} accessibilityRole="button" accessibilityLabel="Add sponsor"
            className="min-h-11 justify-center rounded-xl px-4" style={{ backgroundColor: colors.accent, opacity: input.trim() ? 1 : 0.4 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Add</Text>
          </Pressable>
        </View>
      </View>
      <Text className="mt-2 px-1 text-[13px] leading-5" style={{ color: colors.label }}>Add one sponsor at a time, or separate names with commas.</Text>
    </View>
  );
}
