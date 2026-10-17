import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/nunito";
import { useEffect, useState } from "react";
import { StatusBar, View } from "react-native";
import App from "../App";
import { color, setNunitoLoaded } from "./theme";

/**
 * Loads the rounded font, then shows the app. Butter yellow while loading (no white flash).
 * The app must never wait on a font: if loading fails or takes over 2.5 s it shows anyway, in the
 * system font. (Release builds embed the fonts, so this is instant there.)
 */
export default function Root() {
  const [loaded, error] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (error) console.warn("fonts did not load; using the system font", error);
  }, [error]);
  useEffect(() => {
    const h = setTimeout(() => setGaveUp(true), 2_500);
    return () => clearTimeout(h);
  }, []);
  // Read during render by every text style (see theme.ts); Root re-renders when this flips.
  setNunitoLoaded(loaded);
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <StatusBar barStyle="dark-content" backgroundColor={color.bg} />
      {(loaded || error || gaveUp) && <App />}
    </View>
  );
}
