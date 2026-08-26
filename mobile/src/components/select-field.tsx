import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { brand } from '@/theme/tokens';

type Option = { label: string; value: string; group?: string };

type Props = {
  label: string;
  value: string;
  options: Option[];
  placeholder?: string;
  error?: string;
  searchable?: boolean;
  valid?: boolean;
  compact?: boolean;
  badge?: string;
  emptyLabel?: string;
  onChange: (value: string) => void;
};

/** iOS grouped-secondary surface — sits above page black so the sheet reads. */
const SHEET = '#1C1C1E';
const ROW = '#2C2C2E';

/**
 * Native-first select. Short lists use the system action sheet (iOS) or a
 * Material dialog (Android). Long / searchable lists use the iOS page sheet
 * or an Android dialog, with the keyboard pushing the list up — not a custom
 * black drawer on the page colour.
 */
export function SelectField({
  label,
  value,
  options,
  placeholder = 'Select',
  error,
  searchable,
  valid,
  compact = false,
  badge,
  emptyLabel = 'No matches.',
  onChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);
  const invalid = !!error;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  function choose(next: string) {
    onChange(next);
    close();
  }

  function openPicker() {
    if (searchable) {
      setOpen(true);
      return;
    }
    if (Platform.OS === 'ios') {
      const labels = options.map((o) => (o.value === value ? `${o.label}  ✓` : o.label));
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: label,
          options: [...labels, 'Cancel'],
          cancelButtonIndex: labels.length,
          userInterfaceStyle: 'dark',
        },
        (index) => {
          if (index != null && index < options.length) onChange(options[index].value);
        }
      );
      return;
    }
    setOpen(true);
  }

  return (
    <View className="mb-3">
      <Text
        className={`mb-1.5 ${compact ? 'text-[11px] font-bold uppercase tracking-wider' : 'text-[14px] font-semibold'}`}
        style={{ color: brand.label }}>
        {label}
      </Text>
      <Pressable
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label ?? placeholder }}
        accessibilityState={{ expanded: open }}
        className="h-[52px] flex-row items-center rounded-[14px] bg-elevated px-3.5"
        style={{
          gap: 8,
          borderWidth: 2,
          borderColor: invalid ? brand.danger : selected ? 'rgba(204,255,0,0.35)' : brand.edge,
        }}>
        {badge ? (
          <View
            className="mr-2.5 h-7 min-w-7 items-center justify-center rounded-md px-1.5"
            style={{ backgroundColor: 'rgba(204,255,0,0.12)' }}>
            <Text className="text-[11px] font-extrabold" style={{ color: brand.padel }}>
              {badge}
            </Text>
          </View>
        ) : null}
        <Text
          className="flex-1"
          style={{
            color: selected ? brand.premium : brand.placeholder,
            fontSize: compact ? 13 : 16,
            fontWeight: compact ? '600' : '400',
          }}
          numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        {valid && selected ? (
          <SymbolView
            name={{ ios: 'checkmark', android: 'check', web: 'check' }}
            size={14}
            tintColor={brand.padel}
            accessibilityElementsHidden
          />
        ) : null}
        <SymbolView name="chevron.down" size={13} tintColor={brand.placeholder} />
      </Pressable>
      {error ? (
        <Text className={`mt-2 px-1 leading-5 text-danger ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
          {error}
        </Text>
      ) : null}

      {searchable ? (
        <SearchSheet
          visible={open}
          label={label}
          value={value}
          query={query}
          onQuery={setQuery}
          options={filtered}
          emptyLabel={emptyLabel}
          insetsBottom={insets.bottom}
          onClose={close}
          onChoose={choose}
        />
      ) : Platform.OS !== 'ios' ? (
        <DialogSheet
          visible={open}
          label={label}
          value={value}
          options={options}
          onClose={close}
          onChoose={choose}
        />
      ) : null}
    </View>
  );
}

function SearchSheet({
  visible,
  label,
  value,
  query,
  onQuery,
  options,
  emptyLabel,
  insetsBottom,
  onClose,
  onChoose,
}: {
  visible: boolean;
  label: string;
  value: string;
  query: string;
  onQuery: (q: string) => void;
  options: Option[];
  emptyLabel: string;
  insetsBottom: number;
  onClose: () => void;
  onChoose: (value: string) => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType={Platform.OS === 'ios' ? 'none' : 'fade'}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: SHEET }}>
        <View className="flex-row items-center justify-between px-5 pt-4" style={{ minHeight: 52 }}>
          <Text accessibilityRole="header" className="text-[20px] font-extrabold text-premium">
            {label}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="h-11 justify-center px-1">
            <Text className="text-[16px] font-semibold" style={{ color: brand.padel }}>
              Done
            </Text>
          </Pressable>
        </View>

        <TextInput
          value={query}
          onChangeText={onQuery}
          placeholder="Search"
          placeholderTextColor={brand.placeholder}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={`Search ${label}`}
          className="mx-5 mt-2 h-[48px] rounded-[12px] px-4 text-[16px]"
          style={{
            backgroundColor: ROW,
            color: brand.premium,
            borderWidth: 2,
            borderColor: brand.edge,
          }}
          cursorColor={brand.padel}
          keyboardAppearance="dark"
        />

        <FlatList
          data={options}
          keyExtractor={(item) => item.value}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insetsBottom + 16, paddingTop: 8 }}
          ListEmptyComponent={
            <Text className="px-3 py-6 text-[15px]" style={{ color: brand.placeholder }}>
              {emptyLabel}
            </Text>
          }
          renderItem={({ item }) => (
            <OptionRow option={item} active={item.value === value} onPress={() => onChoose(item.value)} />
          )}
        />
      </View>
    </Modal>
  );
}

function DialogSheet({
  visible,
  label,
  value,
  options,
  onClose,
  onChoose,
}: {
  visible: boolean;
  label: string;
  value: string;
  options: Option[];
  onClose: () => void;
  onChoose: (value: string) => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(0,0,0,0.62)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onClose} className="absolute inset-0" />
        <View
          className="w-full overflow-hidden"
          style={{
            backgroundColor: SHEET,
            borderRadius: 16,
            maxHeight: '72%',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
          }}>
          <Text
            accessibilityRole="header"
            className="px-5 pb-2 pt-5 text-[18px] font-extrabold text-premium">
            {label}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {options.map((option) => (
              <OptionRow
                key={option.value}
                option={option}
                active={option.value === value}
                onPress={() => onChoose(option.value)}
              />
            ))}
          </ScrollView>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            className="min-h-12 items-center justify-center border-t border-edge">
            <Text className="text-[16px] font-semibold" style={{ color: brand.padel }}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function OptionRow({
  option,
  active,
  onPress,
}: {
  option: Option;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="mx-2 mb-1 min-h-12 flex-row items-center rounded-xl px-3"
      style={{ backgroundColor: active ? 'rgba(204,255,0,0.14)' : 'transparent' }}>
      <Text
        className="flex-1 text-[16px]"
        style={{
          color: active ? brand.padel : brand.premium,
          fontWeight: active ? '700' : '500',
        }}>
        {option.label}
      </Text>
      {active ? (
        <SymbolView
          name={{ ios: 'checkmark', android: 'check', web: 'check' }}
          size={16}
          tintColor={brand.padel}
          accessibilityElementsHidden
        />
      ) : null}
    </Pressable>
  );
}
