import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { SheetHeader } from '@/components/sheet-header';
import { LEGAL, parseLegalKind } from '@/lib/legal';
import { brand } from '@/theme/tokens';

export default function LegalSheet() {
  const params = useLocalSearchParams<{ kind?: string | string[] }>();
  const kind = parseLegalKind(params.kind);
  const copy = LEGAL[kind];

  return (
    <>
      <SheetHeader title={copy.title} />
      <ScrollView
        className="flex-1 bg-page px-5"
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled">
        <Text className="mb-4 text-[15px] leading-6 text-muted">{copy.intro}</Text>
        {copy.points.map((point) => (
          <View key={point} className="mb-3 flex-row">
            <Text className="mr-2 text-padel">•</Text>
            <Text className="flex-1 text-[15px] leading-6 text-muted">{point}</Text>
          </View>
        ))}
        {kind === 'privacy' ? (
          <Text className="mt-2 text-[13px] leading-5" style={{ color: brand.label }}>
            By creating an account, you consent to this processing of your personal
            information.
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}
