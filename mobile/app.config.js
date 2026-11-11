module.exports = ({ config }) => {
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  // Apple targets read this config during prebuild, before EAS stamps the host
  // plist. Give the widgets/watch targets the same remotely assigned build.
  const iosBuildNumber = process.env.EAS_BUILD_IOS_BUILD_NUMBER?.trim();
  return {
    ...config,
    ios: {
      ...config.ios,
      ...(iosBuildNumber ? { buildNumber: iosBuildNumber } : {}),
    },
    android: {
      ...config.android,
      ...(mapsKey ? {
        config: {
          ...config.android?.config,
          googleMaps: { apiKey: mapsKey },
        },
      } : {}),
    },
  };
};
