import Foundation
#if canImport(ImageIO)
import ImageIO
import CoreGraphics
#endif

struct ScheduleItem: Codable, Identifiable {
  let id: String
  let kind: String
  let title: String
  let subtitle: String
  let venue: String
  let court: String
  let startAt: Double?
  let expiresAt: Double?
  let allDay: Bool
  let status: String
  let imageUrl: String?
  let registrationOpensAt: Double?
  let registrationClosesAt: Double?
  let path: String
  var start: Date? { startAt.map { Date(timeIntervalSince1970: $0 / 1000) } }
  func isLive(at date: Date) -> Bool {
    guard kind == "event", let startAt, let expiresAt else { return false }
    let now = date.timeIntervalSince1970 * 1000
    return startAt <= now && now < expiresAt
  }
  func countdown(at date: Date) -> (label: String, end: Date)? {
    guard !isLive(at: date) else { return nil }
    let now = date.timeIntervalSince1970 * 1000
    if let opens = registrationOpensAt, opens > now {
      return ("Entries open", Date(timeIntervalSince1970: opens / 1000))
    }
    if let closes = registrationClosesAt, closes > now {
      return ("Entries close", Date(timeIntervalSince1970: closes / 1000))
    }
    if !allDay, let start, start > date { return ("Starts in", start) }
    return nil
  }
  var destination: URL { URL(string: "fourmpadel://" + path) ?? URL(string: "fourmpadel:///calendar")! }
  var watchDestination: URL {
    var components = URLComponents(string: "fourmpadel-watch://schedule")!
    components.queryItems = [URLQueryItem(name: "kind", value: kind), URLQueryItem(name: "id", value: id)]
    return components.url!
  }
  var mapsDestination: URL? {
    let name = venue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty else { return nil }
    // Event subtitles contain the city; match subtitles contain player names.
    let city = kind == "event" ? subtitle.trimmingCharacters(in: .whitespacesAndNewlines) : ""
    var components = URLComponents(string: "https://maps.apple.com/")!
    components.queryItems = [URLQueryItem(name: "q", value: [name, city].filter { !$0.isEmpty }.joined(separator: ", "))]
    return components.url
  }
  var when: String {
    guard let start else { return "Date and time TBC" }
    let format = DateFormatter()
    format.locale = Locale(identifier: "en_ZA")
    format.timeZone = TimeZone(identifier: "Africa/Johannesburg")
    format.dateFormat = allDay ? "EEE d MMM" : "EEE d MMM · HH:mm"
    return format.string(from: start) + (allDay ? " · Time TBC" : " SAST")
  }
}

struct ScheduleSnapshot: Codable {
  let version: Int
  let updatedAt: Double
  let signedIn: Bool
  let items: [ScheduleItem]
  static let empty = ScheduleSnapshot(version: 1, updatedAt: 0, signedIn: false, items: [])
  var updated: Date { Date(timeIntervalSince1970: updatedAt / 1000) }
  func upcoming(at now: Date = Date()) -> [ScheduleItem] {
    guard signedIn else { return [] }
    return items.filter { ($0.expiresAt ?? .greatestFiniteMagnitude) > now.timeIntervalSince1970 * 1000 }
  }
  func isStale(at now: Date = Date()) -> Bool { now.timeIntervalSince(updated) > 86400 }
  var emptyTitle: String { signedIn ? "Nothing scheduled" : "Your next game" }
  var emptyMessage: String { signedIn ? "Save or enter an event in the iPhone app." : "Open 4M on iPhone and sign in to sync your schedule." }
}

enum ScheduleStore {
  static let group = "group.com.fourmpadel.app.schedule"
  static let key = "schedule-v1"
  static func decode(_ text: String) -> ScheduleSnapshot? {
    guard let data = text.data(using: .utf8),
      let value = try? JSONDecoder().decode(ScheduleSnapshot.self, from: data),
      value.version == 1 else { return nil }
    return value
  }
  static func read() -> ScheduleSnapshot {
    guard let text = UserDefaults(suiteName: group)?.string(forKey: key),
      let value = decode(text) else { return .empty }
    return value
  }
  @discardableResult static func save(_ text: String) -> Bool {
    guard let value = decode(text) else { return false }
    // Ignore an older in-flight update that arrives after a newer account/sign-out snapshot.
    if value.updatedAt < read().updatedAt { return false }
    if UserDefaults(suiteName: group)?.string(forKey: key) == text { return false }
    UserDefaults(suiteName: group)?.set(text, forKey: key)
    return true
  }
}

#if canImport(ImageIO)
/** Cache only thumbnails; large posters never become full-resolution bitmaps. */
enum ScheduleArtwork {
  private static let session: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 8
    configuration.timeoutIntervalForResource = 12
    configuration.httpShouldSetCookies = false
    configuration.httpMaximumConnectionsPerHost = 3
    return URLSession(configuration: configuration)
  }()
  private static let cache: NSCache<NSString, CGImage> = {
    let cache = NSCache<NSString, CGImage>()
    cache.countLimit = 12
    cache.totalCostLimit = 6 * 1024 * 1024
    return cache
  }()
  static func load(_ text: String?, maxPixels: Int) async -> CGImage? {
    guard let text, let url = URL(string: text), url.scheme == "https" else { return nil }
    let key = "\(text)|\(maxPixels)" as NSString
    if let saved = cache.object(forKey: key) { return saved }
    do {
      let request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 8)
      let (file, response) = try await session.download(for: request)
      defer { try? FileManager.default.removeItem(at: file) }
      try Task.checkCancellation()
      guard let response = response as? HTTPURLResponse, response.statusCode == 200,
        response.url?.scheme == "https",
        let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 8_000_000,
        let source = CGImageSourceCreateWithURL(file as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
        let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
          kCGImageSourceCreateThumbnailFromImageAlways: true,
          kCGImageSourceThumbnailMaxPixelSize: maxPixels,
          kCGImageSourceCreateThumbnailWithTransform: true,
          kCGImageSourceShouldCacheImmediately: true
        ] as CFDictionary) else { return nil }
      cache.setObject(image, forKey: key, cost: image.bytesPerRow * image.height)
      return image
    } catch { return nil }
  }
}
#endif
