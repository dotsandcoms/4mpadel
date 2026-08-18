import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

/** Title row inside a native form sheet. Android has no stack header here. */
export function SheetHeader({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <View collapsable={false} className="bg-page">
      <View className="flex-row items-center px-5 pb-2 pt-3">
        <Text
          accessibilityRole="header"
          className="flex-1 pr-3 text-[20px] font-extrabold text-premium">
          {title}
        </Text>
        {trailing}
      </View>
      {children}
    </View>
  );
}
