module.exports = {
  type: 'widget', name: 'FourMWidget', displayName: '4M Next Up',
  bundleIdentifier: '.nextup', deploymentTarget: '17.0',
  frameworks: ['WidgetKit', 'SwiftUI'],
  colors: { $accent: '#CCFF00', $widgetBackground: '#0A0A0A' },
  entitlements: { 'com.apple.security.application-groups': ['group.com.fourmpadel.app.schedule'] },
};
