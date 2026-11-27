module.exports = ({ config }) => {
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  // Apple targets read this config during prebuild, before EAS stamps the host
  // plist. Give the widgets/watch targets the same remotely assigned build.
  const iosBuildNumber = process.env.EAS_BUILD_IOS_BUILD_NUMBER?.trim();
  const sentryProject = process.env.SENTRY_PROJECT?.trim();
  const sentryOrg = process.env.SENTRY_ORG?.trim();
  // Credentials are only available during upload. Native config must match between EAS CLI and worker.
  const sentryPlugin = sentryProject && sentryOrg ? [
    ['@sentry/react-native/expo', {
      organization: sentryOrg, project: sentryProject,
      ...(process.env.SENTRY_URL ? { url: process.env.SENTRY_URL } : {}),
    }],
  ] : [];
  return {
    ...config,
    plugins: [...(config.plugins || []), ...sentryPlugin],
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
