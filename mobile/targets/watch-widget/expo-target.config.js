module.exports = {
  type: 'watch-widget', name: 'FourMWatchWidget', displayName: '4M Next Up',
  bundleIdentifier: '.watchkitapp.nextup', deploymentTarget: '10.0',
  frameworks: ['WidgetKit', 'SwiftUI'],
  colors: { $accent: '#CCFF00', $widgetBackground: '#0A0A0A' },
  entitlements: { 'com.apple.security.application-groups': ['group.com.fourmpadel.app.schedule'] },
};
