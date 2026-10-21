module.exports = ({ config }) => {
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  return {
    ...config,
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
