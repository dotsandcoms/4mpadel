module.exports = {
  // Expo regenerates these projects in EAS. The checked-in config, plugins,
  // targets and native modules continue to determine runtime compatibility.
  ignorePaths: ['ios/**/*', 'android/**/*'],
  sourceSkips: [
    'PackageJsonAndroidAndIosScriptsIfNotContainRun',
    // EAS injects remote version numbers during prebuild.
    'ExpoConfigVersions',
  ],
};
