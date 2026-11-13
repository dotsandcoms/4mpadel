import Foundation

struct CourtReminder {
  let item: ScheduleItem
  let fireAt: Date
  static func plan(_ snapshot: ScheduleSnapshot, minutes: Int, at now: Date = Date()) -> [CourtReminder] {
    guard snapshot.signedIn, [5, 15, 30].contains(minutes) else { return [] }
    return Array(snapshot.upcoming(at: now).filter { $0.kind == "match" && !$0.allDay }.compactMap { item in
      guard let start = item.start else { return nil }
      let fire = start.addingTimeInterval(-Double(minutes * 60))
      return fire > now ? CourtReminder(item: item, fireAt: fire) : nil
    }.sorted { $0.fireAt < $1.fireAt }.prefix(32))
  }
}
