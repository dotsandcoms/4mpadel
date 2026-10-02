const { withStringsXml, AndroidConfig } = require('expo/config-plugins');

// Keep the brand label while using a letter-first native product name to avoid
// Expo SDK 57's release-only ExpoModulesProvider lookup failure (expo/expo#47550).
module.exports = function withDisplayName(config) {
  return withStringsXml(config, (mod) => {
    mod.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'app_name' }, _: '4M Padel' }],
      mod.modResults,
    );
    return mod;
  });
};
