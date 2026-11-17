import { useState } from 'react';
import { View } from 'react-native';
import { EventText } from './website-ui';

/** Prefer one readable line; longer names can use two without shortening the name. */
export function EventTitle({ title }: { title: string }) {
  const [singleLine, setSingleLine] = useState(false);
  return <View style={{ flex: 1, minWidth: 0 }}>
    <EventText accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      onTextLayout={({ nativeEvent }) => setSingleLine(nativeEvent.lines.length === 1)}
      style={{ position: 'absolute', left: 0, right: 0, opacity: 0, fontSize: 18, lineHeight: 22, fontWeight: '700' }}>
      {title}
    </EventText>
    <EventText accessibilityRole="header" numberOfLines={singleLine ? 1 : 2} adjustsFontSizeToFit
      minimumFontScale={(singleLine ? 18 : 16) / 26}
      style={{ fontSize: 26, lineHeight: 32, fontWeight: '700' }}>{title}</EventText>
  </View>;
}
