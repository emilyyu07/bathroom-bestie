// React Native 0.76 bundles fmt 11.0.2, whose consteval format strings Xcode 26's compiler rejects
// ("call to consteval function ... is not a constant expression"). fmt turns consteval off under
// C++17, so build just that pod as C++17. The ios/ folder is generated, so the fix lives here.
// It must run AFTER react_native_post_install, which sets every pod to C++20, so it is inserted
// at the end of post_install. Remove this plugin once React Native is upgraded past the bundled fmt.
const { withPodfile } = require("expo/config-plugins");

const MARKER = "# bathroombestie: build fmt as C++17 (Xcode 26)";
const FIX =
  `    ${MARKER}\n` +
  "    installer.pods_project.targets.each do |t|\n" +
  "      next unless t.name == 'fmt'\n" +
  "      t.build_configurations.each { |bc| bc.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17' }\n" +
  "    end\n";

module.exports = (config) =>
  withPodfile(config, (c) => {
    const src = c.modResults.contents;
    if (src.includes(MARKER)) return c;
    const start = src.indexOf("post_install do |installer|\n");
    const end = start === -1 ? -1 : src.indexOf("\n  end\n", start); // post_install's own `end`
    if (end === -1) throw new Error("withFmtCxx17: could not find post_install in the Podfile");
    c.modResults.contents = src.slice(0, end + 1) + FIX + src.slice(end + 1);
    return c;
  });
