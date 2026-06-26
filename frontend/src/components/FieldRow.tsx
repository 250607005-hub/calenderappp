/**
 * Field row component for the admin form — Google Calendar style.
 * Left icon, label, value (or children control on the right).
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type } from '@/src/theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  testID?: string;
  children?: React.ReactNode;
  destructive?: boolean;
};

export function FieldRow({ icon, label, value, onPress, testID, children, destructive }: Props) {
  const content = (
    <>
      <View style={[styles.iconWrap, destructive && { backgroundColor: '#FAD5D2' }]}>
        <Ionicons
          name={icon}
          size={18}
          color={destructive ? colors.error : colors.onBrandTertiary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {value !== undefined && <Text style={styles.value}>{value}</Text>}
      </View>
      {children ? (
        <View style={{ marginLeft: spacing.sm }}>{children}</View>
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={styles.row}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
    minHeight: 56,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: type.sm, color: colors.muted },
  value: { fontSize: type.base, color: colors.onSurface, marginTop: 2, fontWeight: '500' },
});
