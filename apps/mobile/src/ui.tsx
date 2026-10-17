import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { color, font, radius, space } from "./theme";

/** Shared building blocks so every screen looks like the same friendly app. */

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export const Title = ({ children }: { children: ReactNode }) => (
  <Text style={{ ...font.extrabold, fontSize: 26, color: color.text }}>{children}</Text>
);

export const Heading = ({ children }: { children: ReactNode }) => (
  <Text style={{ ...font.bold, fontSize: 19, color: color.text }}>{children}</Text>
);

export const Body = ({
  children,
  muted,
  style,
  selectable,
}: {
  children: ReactNode;
  muted?: boolean;
  style?: TextStyle;
  selectable?: boolean;
}) => (
  <Text
    selectable={selectable}
    style={[
      { ...font.regular, fontSize: 16, lineHeight: 22 },
      { color: muted ? color.muted : color.text },
      style,
    ]}
  >
    {children}
  </Text>
);

export const Card = ({ children, style }: { children: ReactNode; style?: ViewStyle }) => (
  <View
    style={[
      {
        backgroundColor: color.card,
        borderRadius: radius.card,
        borderWidth: 1.5,
        borderColor: color.blushBorder,
        padding: space.lg,
        gap: space.sm,
      },
      style,
    ]}
  >
    {children}
  </View>
);

type Tone = "primary" | "secondary" | "withHer" | "worry" | "quiet";
const TONES: Record<Tone, { bg: string; pressed: string; fg: string; border?: string }> = {
  // The important actions: dark, bold, unmissable.
  primary: { bg: color.primary, pressed: color.primaryPressed, fg: color.white },
  withHer: { bg: color.withHer, pressed: color.withHerPressed, fg: color.worry },
  worry: { bg: color.worry, pressed: color.worryPressed, fg: color.white },
  secondary: { bg: color.blush, pressed: color.blushBorder, fg: color.primary },
  quiet: { bg: "transparent", pressed: color.blush, fg: color.muted, border: color.blushBorder },
};

/** A pill button. Primary is for the one thing she should do next on a screen. */
export function Button({
  title,
  onPress,
  tone = "primary",
  disabled,
  big,
}: {
  title: string;
  onPress: () => void;
  tone?: Tone;
  disabled?: boolean;
  big?: boolean;
}) {
  const t = TONES[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? t.pressed : t.bg,
        borderRadius: radius.button,
        borderWidth: t.border ? 1.5 : 0,
        borderColor: t.border,
        paddingVertical: big ? 18 : 13,
        paddingHorizontal: space.xl,
        alignItems: "center",
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <Text style={{ ...font.extrabold, fontSize: big ? 20 : 17, color: t.fg }}>{title}</Text>
    </Pressable>
  );
}

/** A small rounded choice, e.g. a preset or a reason. Butter yellow when picked. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={{
        paddingVertical: 9,
        paddingHorizontal: 16,
        borderRadius: radius.chip,
        borderWidth: 1.5,
        borderColor: selected ? color.primary : color.blushBorder,
        backgroundColor: selected ? color.butter : color.card,
      }}
    >
      <Text style={{ ...font.bold, fontSize: 15, color: color.text }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={{ ...font.bold, fontSize: 15, color: color.text }}>{label}</Text>
      <TextInput
        placeholderTextColor={color.muted}
        {...props}
        style={{
          ...font.regular,
          fontSize: 17,
          color: color.text,
          backgroundColor: color.card,
          borderWidth: 1.5,
          borderColor: color.blushBorder,
          borderRadius: radius.field,
          paddingVertical: 12,
          paddingHorizontal: 14,
        }}
      />
    </View>
  );
}

/** A soft, rounded label, e.g. "You're her watcher". */
export const Pill = ({ children, strong }: { children: ReactNode; strong?: boolean }) => (
  <View
    style={{
      alignSelf: "flex-start",
      backgroundColor: strong ? color.berry : color.blush,
      borderRadius: radius.chip,
      paddingVertical: 4,
      paddingHorizontal: 12,
    }}
  >
    <Text style={{ ...font.bold, fontSize: 13, color: strong ? color.white : color.primary }}>
      {children}
    </Text>
  </View>
);

export const ErrorText = ({ children }: { children: ReactNode }) => (
  <Text style={{ ...font.semibold, fontSize: 15, color: color.error }}>{children}</Text>
);
