export const supportsExpandableGlass = false;

export type GlassTabExpansionProps = {
  visible: boolean;
  restoring: boolean;
  activeTab?: string;
  badge?: string;
  onClose: () => void;
  onRestore: () => void;
  onCollapsed: () => void;
};

export function GlassTabExpansion(_props: GlassTabExpansionProps) {
  return null;
}
