import Foundation

enum WatchDestination: Hashable {
  case event(String)
}

struct WatchScheduleRoute {
  let category: String?
  let destination: WatchDestination?

  init?(url: URL) {
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
      components.scheme == "fourmpadel-watch", components.host == "schedule",
      components.path.isEmpty || components.path == "/" else { return nil }
    let query = components.queryItems ?? []
    guard query.filter({ $0.name == "kind" }).count <= 1,
      query.filter({ $0.name == "id" }).count <= 1 else { return nil }
    let kind = query.first { $0.name == "kind" }?.value
    let id = query.first { $0.name == "id" }?.value
    guard kind == nil || kind == "match" || kind == "event" else { return nil }
    if let id, kind == nil || id.isEmpty { return nil }
    category = kind
    destination = kind == "event" ? id.map(WatchDestination.event) : nil
  }

  static func category(preference: String, snapshot: ScheduleSnapshot, at date: Date) -> String {
    if preference == "match" || preference == "event" { return preference }
    // The phone snapshot is chronological. Keep automatic selection until the user chooses.
    return snapshot.upcoming(at: date).first?.kind == "event" ? "event" : "match"
  }
}
