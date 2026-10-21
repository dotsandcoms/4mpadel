import Foundation

@main
enum WatchNavigationTests {
  static func main() {
    let now = Date(timeIntervalSince1970: 1_791_520_000)
    let timestamp = now.timeIntervalSince1970 * 1000
    func item(_ id: String, kind: String, expires: Double? = nil) -> ScheduleItem {
      ScheduleItem(id: id, kind: kind, title: "Padel event", subtitle: "Cape Town", venue: "Club", court: "",
        startAt: timestamp + 3600000, expiresAt: expires ?? timestamp + 86400000, allDay: false,
        status: "Saved event", imageUrl: nil, registrationOpensAt: nil, registrationClosesAt: nil,
        path: kind == "event" ? "/events/test-event" : "/profile")
    }
    func snapshot(_ items: [ScheduleItem], signedIn: Bool = true) -> ScheduleSnapshot {
      ScheduleSnapshot(version: 1, updatedAt: timestamp, signedIn: signedIn, items: items)
    }
    let event = item("event-42", kind: "event")
    let match = item("match-A / B & C? #é", kind: "match")
    func category(_ items: [ScheduleItem], preference: String = "") -> String {
      WatchScheduleRoute.category(preference: preference, snapshot: snapshot(items), at: now)
    }
    assert(category([]) == "match")
    assert(category([event]) == "event", "The first event sync must not get stuck on an empty Matches category")
    assert(category([match]) == "match")
    assert(category([event, match]) == "event", "Use the next item in the chronological snapshot")
    assert(category([match, event]) == "match")
    assert(category([event], preference: "match") == "match", "Remember an explicit choice even when it is empty")
    assert(category([match], preference: "event") == "event")
    assert(category([event], preference: "invalid") == "event")
    assert(category([item("expired", kind: "event", expires: timestamp - 1)]) == "match")
    assert(WatchScheduleRoute.category(preference: "", snapshot: snapshot([event], signedIn: false), at: now) == "match")

    let eventRoute = WatchScheduleRoute(url: event.watchDestination)!
    assert(eventRoute.category == "event" && eventRoute.destination == .event(event.id))
    let matchRoute = WatchScheduleRoute(url: match.watchDestination)!
    assert(matchRoute.category == "match" && matchRoute.destination == nil)
    assert(URLComponents(url: match.watchDestination, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "id" }?.value == match.id)
    let encodedEvent = item("event-A & B / é ? #", kind: "event")
    assert(WatchScheduleRoute(url: encodedEvent.watchDestination)?.destination == .event(encodedEvent.id))
    let home = WatchScheduleRoute(url: URL(string: "fourmpadel-watch://schedule")!)!
    assert(home.category == nil && home.destination == nil)
    assert(WatchScheduleRoute(url: URL(string: "fourmpadel-watch://schedule?kind=event")!)?.category == "event")
    for invalid in [
      "fourmpadel:///events/42", "https://schedule?kind=event&id=42", "fourmpadel-watch://other",
      "fourmpadel-watch://schedule/other", "fourmpadel-watch://schedule?kind=unknown&id=42",
      "fourmpadel-watch://schedule?id=42", "fourmpadel-watch://schedule?kind=event&id=",
      "fourmpadel-watch://schedule?kind=event&kind=match", "fourmpadel-watch://schedule?kind=event&id=1&id=2"
    ] { assert(WatchScheduleRoute(url: URL(string: invalid)!) == nil, "Reject invalid schedule route: \(invalid)") }
    assert(event.destination.scheme == "fourmpadel", "iPhone widget links retain the phone's route")
    print("Watch navigation checks passed: automatic and remembered categories, expiry/sign-out, event/match links, encoded IDs, and invalid links.")
  }
}
