import SwiftUI

/// Mirrors the phone's lightBrand tokens in src/theme/tokens.ts.
enum WatchTheme {
  static let page = Color(red: 245/255, green: 246/255, blue: 243/255)
  static let card = Color.white
  static let surface = Color(red: 237/255, green: 240/255, blue: 235/255)
  static let ink = Color(red: 22/255, green: 37/255, blue: 31/255)
  static let muted = Color(red: 82/255, green: 98/255, blue: 90/255)
  static let accent = Color(red: 56/255, green: 96/255, blue: 24/255)
  static let border = Color(red: 220/255, green: 226/255, blue: 218/255)
  static let danger = Color(red: 183/255, green: 53/255, blue: 45/255)
}

extension View {
  func watchPage() -> some View {
    foregroundStyle(WatchTheme.ink)
      .containerBackground(WatchTheme.page, for: .navigation)
      .toolbarColorScheme(.light, for: .navigationBar)
  }
}
