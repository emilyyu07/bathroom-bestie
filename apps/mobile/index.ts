import { registerRootComponent } from "expo";
// Background tasks must be defined before anything else runs (Android may start the app for them).
import "./src/background";
import "./src/home";
import App from "./App";

registerRootComponent(App);
