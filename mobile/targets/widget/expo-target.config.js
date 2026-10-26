module.exports = {
  type: 'widget', name: 'FourMWidget', displayName: '4M Next Up',
  bundleIdentifier: '.nextup', deploymentTarget: '17.0',
  frameworks: ['WidgetKit', 'SwiftUI'],
  colors: { $accent: '#386018', $widgetBackground: '#F5F6F3' },
  entitlements: { 'com.apple.security.application-groups': ['group.com.fourmpadel.app.schedule'] },
};
