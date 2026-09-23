module.exports = {
  type: 'watch', name: 'FourMWatch', displayName: '4M Padel',
  bundleIdentifier: '.watchkitapp', deploymentTarget: '10.0',
  icon: '../../assets/images/icon.png',
  frameworks: ['WatchConnectivity', 'WidgetKit'],
  colors: { $accent: '#CCFF00' },
  entitlements: { 'com.apple.security.application-groups': ['group.com.fourmpadel.app.schedule'] },
};
