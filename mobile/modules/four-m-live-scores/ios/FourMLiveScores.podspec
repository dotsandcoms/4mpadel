Pod::Spec.new do |s|
  s.name = 'FourMLiveScores'
  s.version = '1.0.0'
  s.summary = '4M Padel match score Live Activities'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = '4M Padel'
  s.homepage = 'https://4mpadel.co.za'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.frameworks = 'ActivityKit'
  s.swift_version = '5.9'
end
