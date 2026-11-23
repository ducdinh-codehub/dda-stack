# Without the xcframework, CocoaPods would silently leave Rust out of the app
# and Xcode would fail later with "Undefined symbol: _rust_core_...".
unless File.exist?(File.join(__dir__, 'RustCore.xcframework'))
  raise '[RustCore] ios/RustCore.xcframework is missing. Run the build:rust script ' \
        '(e.g. npm run build:rust), then pod install or npx expo prebuild again'
end

Pod::Spec.new do |s|
  s.name           = 'RustCore'
  s.version        = '1.0.0'
  s.summary        = 'Rust code, callable from JS'
  s.description    = 'An Expo module that calls into a Rust static library'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  # rust_core.h is in here, so the Swift code can call the Rust functions directly.
  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  # Built by `build:rust` — checked at the top of this file.
  s.vendored_frameworks = 'RustCore.xcframework'
end
