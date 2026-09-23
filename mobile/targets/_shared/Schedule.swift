import Foundation

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
  static func read() -> ScheduleSnapshot {
    guard let text = UserDefaults(suiteName: group)?.string(forKey: key),
      let data = text.data(using: .utf8), let value = try? JSONDecoder().decode(ScheduleSnapshot.self, from: data),
      value.version == 1 else { return .empty }
    return value
  }
  @discardableResult static func save(_ text: String) -> Bool {
    guard let data = text.data(using: .utf8), let value = try? JSONDecoder().decode(ScheduleSnapshot.self, from: data), value.version == 1 else { return false }
    // Ignore an older in-flight update that arrives after a newer account/sign-out snapshot.
    if value.updatedAt < read().updatedAt { return false }
    UserDefaults(suiteName: group)?.set(text, forKey: key)
    return true
  }
}
