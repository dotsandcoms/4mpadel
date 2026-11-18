const { withAndroidManifest } = require('expo/config-plugins');

const optionalFeatures = ['android.hardware.screen.portrait', 'android.hardware.wifi'];

module.exports = function withOptionalAndroidHardware(config) {
  return withAndroidManifest(config, (mod) => {
    // Play can infer these requirements from the activity orientation and Wi-Fi permission.
    const features = mod.modResults.manifest['uses-feature'] ??= [];
    for (const name of optionalFeatures) {
      const existing = features.find((feature) => feature.$['android:name'] === name);
      if (existing) {
        existing.$['android:required'] = 'false';
      } else {
        features.push({ $: { 'android:name': name, 'android:required': 'false' } });
      }
    }
    return mod;
  });
};
