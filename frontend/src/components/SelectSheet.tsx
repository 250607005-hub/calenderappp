import { Ionicons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, type } from '@/src/theme';

export type SelectOption<T extends string | number> = {
  value: T;
  label: string;
  hint?: string;
};

type Props<T extends string | number> = {
  visible: boolean;
  title: string;
  value: T;
  options: SelectOption<T>[];
  onSelect: (value: T) => void;
  onClose: () => void;
};

export function SelectSheet<T extends string | number>({
  visible,
  title,
  value,
  options,
  onSelect,
  onClose,
}: Props<T>) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheetWrap} onPress={(e) => e.stopPropagation()}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.sheet}>
              <View style={styles.handle} />
              <View style={styles.headerRow}>
                <Text style={styles.title}>{title}</Text>
                <Pressable hitSlop={10} onPress={onClose}>
                  <Ionicons name="close" size={22} color={colors.muted} />
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: 360 }}>
                {options.map((opt) => {
                  const active = opt.value === value;
                  return (
                    <Pressable
                      key={String(opt.value)}
                      testID={`select-option-${opt.value}`}
                      onPress={() => {
                        onSelect(opt.value);
                        onClose();
                      }}
                      style={({ pressed }) => [
                        styles.row,
                        active && styles.rowActive,
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.label, active && styles.labelActive]}
                        >
                          {opt.label}
                        </Text>
                        {opt.hint && (
                          <Text style={styles.hint}>{opt.hint}</Text>
                        )}
                      </View>
                      {active && (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={colors.brand}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetWrap: { backgroundColor: 'transparent' },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: { fontSize: type.lg, fontWeight: '500', color: colors.onSurface },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  rowActive: { backgroundColor: colors.brandSecondary },
  label: { fontSize: type.base, color: colors.onSurface },
  labelActive: { color: colors.onBrandSecondary, fontWeight: '500' },
  hint: { fontSize: type.sm, color: colors.muted, marginTop: 2 },
});
