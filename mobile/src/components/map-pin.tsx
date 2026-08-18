import { Feather } from '@expo/vector-icons';

/**
 * Lucide/Feather map-pin — same outline teardrop the website uses.
 * SF Symbols `mappin` is a different glyph.
 */
export function MapPin({
  size = 12,
  color,
}: {
  size?: number;
  color: string;
}) {
  return (
    <Feather
      name="map-pin"
      size={size}
      color={color}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
