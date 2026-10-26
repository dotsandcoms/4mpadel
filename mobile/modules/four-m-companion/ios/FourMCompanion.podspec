Pod::Spec.new do |s|
  s.name = 'FourMCompanion'
  s.version = '1.0.0'
  s.summary = '4M personal schedule for Apple Watch and widgets'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = '4M Padel'
  s.homepage = 'https://4mpadel.co.za'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.frameworks = 'WatchConnectivity', 'WidgetKit'
  s.swift_version = '5.9'
end
