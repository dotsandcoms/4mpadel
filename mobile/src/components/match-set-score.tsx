import { Text, View } from 'react-native';

type ScoreValue = string | number | null | undefined;

export const setScoreColumnWidth = (set: readonly ScoreValue[]) =>
  set.some(value => /\(\d+\)$/.test(String(value))) ? 36 : 28;

/** Keep games and tiebreak points together, even in narrow three-set cards. */
export function MatchSetScore({ value, color, width = 28, fontSize = 19 }: {
  value: ScoreValue; color: string; width?: number; fontSize?: number;
}) {
  const text = String(value ?? '–');
  const parts = /^(\d+)\((\d+)\)$/.exec(text);
  return <View style={{ width, flexShrink: 0, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', minHeight: fontSize + 6 }}>
    <Text numberOfLines={1} style={{ color, fontSize, lineHeight: fontSize + 6, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{parts?.[1] ?? text}</Text>
    {parts && <Text numberOfLines={1} style={{ color, marginLeft: 1, marginTop: 1, fontSize: Math.round(fontSize * .55), lineHeight: Math.ceil(fontSize * .7), fontWeight: '500', fontVariant: ['tabular-nums'] }}>{parts[2]}</Text>}
  </View>;
}
