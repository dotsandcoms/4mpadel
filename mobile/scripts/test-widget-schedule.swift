import Foundation

@main enum WidgetScheduleTests {
  static func main() {
    let now = ISO8601DateFormatter().date(from: "2026-11-12T12:00:00Z")!
    let timestamp = now.timeIntervalSince1970 * 1000
    func item(_ id: String, kind: String = "event", status: String = "Saved event", offset: Double = 86400000, allDay: Bool = true) -> ScheduleItem {
      ScheduleItem(id: id, kind: kind, title: "The Durban Open–CHANGAN SA GRAND TOUR", subtitle: "Durban", venue: "Sibaya Casino", court: kind == "match" ? "Court 2" : "",
        startAt: timestamp + offset, expiresAt: timestamp + offset + 86400000, allDay: allDay, status: status,
        imageUrl: nil, registrationOpensAt: nil, registrationClosesAt: timestamp - 1000, path: "/events/durban")
    }
    let saved = item("saved"), entered = item("entered", status: "Registered", offset: 5 * 86400000)
    let match = item("match", kind: "match", status: "Scheduled match", offset: 3 * 86400000, allDay: false)
    let snapshot = ScheduleSnapshot(version: 1, updatedAt: timestamp, signedIn: true, items: [saved, entered, match])
    let items = WidgetSchedule.items(snapshot, kind: nil, at: now)
    assert(items.map(\.id) == ["match", "entered", "saved"], "Own matches and entries lead, with saved events still available")
    assert(WidgetSchedule.items(snapshot, kind: "event", at: now).map(\.id) == ["entered", "saved"])
    assert(WidgetSchedule.items(snapshot, kind: "match", at: now).map(\.id) == ["match"])
    assert(WidgetSchedule.selected(items, id: "saved")?.id == "saved")
    assert(WidgetSchedule.selected(items, id: "removed")?.id == "match")
    assert(WidgetSchedule.items(.empty, kind: nil, at: now).isEmpty)
    assert(WidgetSchedule.timing(saved, at: now) == "Tomorrow · Time TBC", "Registration closed must not replace useful start timing")
    assert(WidgetSchedule.timing(match, at: now) == "In 3 days · 14:00 SAST")
    let lateUTC = ISO8601DateFormatter().date(from: "2026-11-12T23:00:00Z")!
    assert(WidgetSchedule.timing(saved, at: lateUTC) == "Today · Time TBC", "Relative dates follow SAST, independently of the simulator timezone")
    let timed = item("timed", kind: "match", status: "Scheduled match", offset: 3600000, allDay: false)
    let unknown = item("tbc", kind: "match", offset: 3600000, allDay: true)
    let soon = item("soon", kind: "match", offset: 60000, allDay: false)
    let reminders = ScheduleSnapshot(version: 1, updatedAt: timestamp, signedIn: true, items: [timed, unknown, soon, saved])
    let plan = CourtReminder.plan(reminders, minutes: 15, at: now)
    assert(plan.count == 1 && plan[0].item.id == "timed")
    assert(plan[0].fireAt == now.addingTimeInterval(2700))
    assert(CourtReminder.plan(reminders, minutes: 0, at: now).isEmpty)
    assert(CourtReminder.plan(.empty, minutes: 15, at: now).isEmpty)
    assert(WidgetSchedule.items(snapshot, kind: nil, at: now.addingTimeInterval(7 * 86400)).isEmpty)
    print("Widget and reminder checks passed: entry priority, category filtering, browsing fallback, expiry, SAST relative dates, Time TBC, confirmed-only reminders and sign-out.")
  }
}
