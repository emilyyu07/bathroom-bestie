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
import { color, font, radius, space, type } from "./theme";

/**
 * Shared building blocks so every screen looks like the same friendly app. Screens use these
 * instead of setting sizes or colours themselves: text sizes come from `type`, gaps from `space`.
 */

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{
        paddingHorizontal: space.lg + 4,
        paddingTop: space.md,
        paddingBottom: space.xxl,
        gap: space.lg,
      }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets // iOS: lift fields above the keyboard (Android resizes the window itself)
    >
      {children}
    </ScrollView>
  );
}

/** A screen's title, with an optional one-line subtitle under it. */
export const Title = ({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) => (
  <View style={{ gap: space.xs, marginBottom: space.xs }}>
    <Text style={{ ...font.extrabold, ...type.title, color: color.text }}>{children}</Text>
    {subtitle && (
      <Text style={{ ...font.regular, ...type.body, color: color.muted }}>{subtitle}</Text>
    )}
  </View>
);

export const Heading = ({ children }: { children: ReactNode }) => (
  <Text style={{ ...font.bold, ...type.heading, color: color.text }}>{children}</Text>
);

/** A small all-caps label above a group, e.g. "ALERTS FOR YOU". */
export const Label = ({ children }: { children: ReactNode }) => (
  <Text
    style={{
      ...font.extrabold,
      ...type.label,
      color: color.muted,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginTop: space.sm,
      marginBottom: -space.xs,
    }}
  >
    {children}
  </Text>
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
    style={[{ ...font.regular, ...type.body }, { color: muted ? color.muted : color.text }, style]}
  >
    {children}
  </Text>
);

/** Secondary text: hints, timestamps, fine print. Muted unless told otherwise. */
export const Small = ({
  children,
  style,
  selectable,
}: {
  children: ReactNode;
  style?: TextStyle;
  selectable?: boolean;
}) => (
  <Text
    selectable={selectable}
    style={[{ ...font.regular, ...type.small, color: color.muted }, style]}
  >
    {children}
  </Text>
);

export const Card = ({
  children,
  style,
  tint,
}: {
  children: ReactNode;
  style?: ViewStyle;
  /** Soft pink instead of white: for the one card on a screen that matters most. */
  tint?: boolean;
}) => (
  <View
    style={[
      {
        backgroundColor: tint ? color.blush : color.card,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: color.blushBorder,
        padding: space.lg + 4,
        gap: space.md,
      },
      style,
    ]}
  >
    {children}
  </View>
);

/** A thin line between parts of a card. */
export const Divider = () => (
  <View style={{ height: 1, backgroundColor: color.blushBorder, marginVertical: space.xs }} />
);

/** Label on the left, value on the right: "Watching now · bea". */
export const InfoRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
    <Text style={{ ...font.regular, ...type.body, color: color.muted }}>{label}</Text>
    <Text
      style={{ ...font.bold, ...type.body, color: color.text, flexShrink: 1, textAlign: "right" }}
    >
      {value}
    </Text>
  </View>
);

type Tone = "primary" | "secondary" | "withHer" | "worry" | "quiet";
const TONES: Record<Tone, { bg: string; pressed: string; fg: string; border?: string }> = {
  // The important actions: dark, bold, unmissable.
  primary: { bg: color.primary, pressed: color.primaryPressed, fg: color.white },
  withHer: { bg: color.withHer, pressed: color.withHerPressed, fg: color.worry },
  worry: { bg: color.worry, pressed: color.worryPressed, fg: color.white },
  secondary: { bg: color.blush, pressed: color.blushBorder, fg: color.primary },
  quiet: { bg: "transparent", pressed: color.blush, fg: color.primary, border: color.blushBorder },
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
        minHeight: big ? 56 : 48,
        justifyContent: "center",
        paddingHorizontal: space.lg,
        alignItems: "center",
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <Text
        style={{ ...font.extrabold, fontSize: big ? 18 : 16, color: t.fg, textAlign: "center" }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

/** A text-only action for things she rarely needs, e.g. "Leave this night" or "Back". */
export const TextButton = ({ title, onPress }: { title: string; onPress: () => void }) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    hitSlop={8}
    style={({ pressed }) => ({
      alignSelf: "center",
      padding: space.sm,
      opacity: pressed ? 0.5 : 1,
    })}
  >
    <Text style={{ ...font.bold, ...type.small, color: color.muted }}>{title}</Text>
  </Pressable>
);

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
        minHeight: 40,
        justifyContent: "center",
        paddingHorizontal: 16,
        borderRadius: radius.chip,
        borderWidth: 1.5,
        borderColor: selected ? color.primary : color.blushBorder,
        backgroundColor: selected ? color.butter : color.card,
      }}
    >
      <Text style={{ ...font.bold, ...type.small, color: color.text }}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; /** One line of help under the box. */ hint?: string }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ ...font.bold, ...type.small, color: color.text }}>{label}</Text>
      <TextInput
        placeholderTextColor={color.placeholder}
        {...props}
        style={{
          ...font.regular,
          fontSize: 17,
          color: color.text,
          backgroundColor: color.card,
          borderWidth: 1.5,
          borderColor: color.blushBorder,
          borderRadius: radius.field,
          paddingVertical: 13,
          paddingHorizontal: 16,
          minHeight: props.multiline ? 84 : undefined,
          textAlignVertical: props.multiline ? "top" : "center",
        }}
      />
      {hint && <Small>{hint}</Small>}
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
    <Text style={{ ...font.bold, ...type.label, color: strong ? color.white : color.primary }}>
      {children}
    </Text>
  </View>
);

export const ErrorText = ({ children }: { children: ReactNode }) => (
  <Text style={{ ...font.semibold, ...type.small, color: color.error }}>{children}</Text>
);
