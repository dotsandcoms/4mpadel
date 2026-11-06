import { Button, Host, HStack, Image, Spacer, Text } from '@expo/ui/swift-ui';
import { accessibilityHidden, accessibilityLabel, background, buttonStyle, contentShape, fixedSize, font, foregroundStyle, frame, layoutPriority, padding, shadow, shapes } from '@expo/ui/swift-ui/modifiers';
import type { ErrorPresentationProps } from './error-banner-presentation.types';
import { SwipeDismissibleBanner } from './swipe-dismissible-banner';

/** Nonblocking app banner built with native SwiftUI, not a system notification. */
export function ErrorPresentation({ message, onDismiss, top }: ErrorPresentationProps) {
  return <SwipeDismissibleBanner direction="up" top={top} onDismiss={onDismiss}><Host matchContents={{ vertical: true }} colorScheme="light" ignoreSafeArea="all" style={{ width: '100%' }}>
    <HStack spacing={10} alignment="center" modifiers={[
      padding({ leading: 16, trailing: 4, vertical: 8 }),
      background({ type: 'material', material: 'regular' }, shapes.roundedRectangle({ cornerRadius: 20, roundedCornerStyle: 'continuous' })),
      shadow({ color: '#0000001A', radius: 10, y: 4 }),
    ]}>
      <Image systemName="exclamationmark.circle.fill" color="red" modifiers={[font({ textStyle: 'title3' }), accessibilityHidden()]} />
      <Text modifiers={[font({ textStyle: 'callout', weight: 'medium' }), foregroundStyle({ type: 'hierarchical', style: 'primary' }), fixedSize({ horizontal: false, vertical: true }), layoutPriority(1)]}>{message}</Text>
      <Spacer minLength={0} />
      <Button onPress={onDismiss} modifiers={[buttonStyle('plain'), accessibilityLabel('Dismiss error')]}>
        <Image systemName="xmark" modifiers={[font({ textStyle: 'footnote', weight: 'semibold' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' }), frame({ width: 44, height: 44 }), contentShape(shapes.rectangle())]} />
      </Button>
    </HStack>
  </Host></SwipeDismissibleBanner>;
}
