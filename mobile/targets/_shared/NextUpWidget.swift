import SwiftUI
import WidgetKit
import AppIntents

enum ScheduleCategory: String, AppEnum {
  case all, matches, events
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Schedule"
  static var caseDisplayRepresentations: [ScheduleCategory: DisplayRepresentation] = [
    .all: "Matches & events", .matches: "Matches", .events: "Events"
  ]
  var kind: String? { self == .all ? nil : self == .matches ? "match" : "event" }
  var heading: String { self == .all ? "Next up" : self == .matches ? "Next match" : "Next event" }
  var emptyTitle: String { self == .all ? "Nothing scheduled" : self == .matches ? "No upcoming matches" : "No upcoming events" }
}

@available(iOS 17.0, watchOS 10.0, *)
struct ScheduleConfiguration: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Your 4M schedule"
  static var description = IntentDescription("Choose upcoming matches, events, or both.")
  @Parameter(title: "Show", default: .all) var category: ScheduleCategory
}

enum WidgetSelection {
  static func read(_ category: ScheduleCategory, snapshot: ScheduleSnapshot) -> String? {
    let defaults = UserDefaults(suiteName: ScheduleStore.group)
    let key = "widget-selection-" + category.rawValue
    guard defaults?.double(forKey: key + "-snapshot") == snapshot.updatedAt else { return nil }
    return defaults?.string(forKey: key)
  }
  static func save(_ id: String, category: ScheduleCategory, snapshot: ScheduleSnapshot) {
    let defaults = UserDefaults(suiteName: ScheduleStore.group)
    let key = "widget-selection-" + category.rawValue
    defaults?.set(id, forKey: key); defaults?.set(snapshot.updatedAt, forKey: key + "-snapshot")
  }
}

#if os(iOS)
@available(iOS 17.0, *)
struct NextScheduleItem: AppIntent {
  static var title: LocalizedStringResource = "Show next 4M item"
  static var openAppWhenRun = false
  static var isDiscoverable = false
  @Parameter(title: "Schedule") var categoryValue: String
  @Parameter(title: "Current item") var currentID: String
  init() { categoryValue = "all"; currentID = "" }
  init(category: ScheduleCategory, currentID: String) { categoryValue = category.rawValue; self.currentID = currentID }
  func perform() async throws -> some IntentResult {
    guard let category = ScheduleCategory(rawValue: categoryValue) else { return .result() }
    let snapshot = ScheduleStore.read()
    let items = WidgetSchedule.items(snapshot, kind: category.kind, at: Date())
    guard !items.isEmpty else { return .result() }
    let index = items.firstIndex { $0.id == currentID } ?? -1
    WidgetSelection.save(items[(index + 1) % items.count].id, category: category, snapshot: snapshot)
    WidgetCenter.shared.reloadTimelines(ofKind: "FourMNextUp")
    return .result()
  }
}
#endif

struct ScheduleEntry: TimelineEntry {
  let date: Date
  let snapshot: ScheduleSnapshot
  var category: ScheduleCategory = .all
  var selectedID: String? = nil
  var items: [ScheduleItem] { WidgetSchedule.items(snapshot, kind: category.kind, at: date) }
  var next: ScheduleItem? { WidgetSchedule.selected(items, id: selectedID) }
  var position: Int { items.firstIndex { $0.id == next?.id } ?? 0 }
  var emptyTitle: String { snapshot.signedIn ? category.emptyTitle : snapshot.emptyTitle }
  var emptyMessage: String {
    snapshot.signedIn && category == .matches ? "Your scheduled matches appear after syncing with 4M on iPhone." : snapshot.emptyMessage
  }
}

@available(iOS 17.0, watchOS 10.0, *)
struct ScheduleTimeline: AppIntentTimelineProvider {
  func recommendations() -> [AppIntentRecommendation<ScheduleConfiguration>] {
    [ScheduleCategory.all, .matches, .events].map { category in
      let configuration = ScheduleConfiguration(); configuration.category = category
      return AppIntentRecommendation(intent: configuration, description: category == .all ? "Matches & events" : category == .matches ? "Matches" : "Events")
    }
  }
  func placeholder(in context: Context) -> ScheduleEntry { ScheduleEntry(date: .now, snapshot: .empty) }
  func snapshot(for configuration: ScheduleConfiguration, in context: Context) async -> ScheduleEntry {
    let snapshot = ScheduleStore.read()
    return ScheduleEntry(date: .now, snapshot: snapshot, category: configuration.category, selectedID: WidgetSelection.read(configuration.category, snapshot: snapshot))
  }
  func timeline(for configuration: ScheduleConfiguration, in context: Context) async -> Timeline<ScheduleEntry> {
    let now = Date(), snapshot = ScheduleStore.read()
    let selected = WidgetSelection.read(configuration.category, snapshot: snapshot)
    let changes = snapshot.items.flatMap { [$0.expiresAt, $0.startAt].compactMap { $0 } }
      .map { Date(timeIntervalSince1970: $0 / 1000) }.filter { $0 > now && $0 < now.addingTimeInterval(86400) }
    var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Africa/Johannesburg")!
    let midnight = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))!
    let dates = Array(Set([now, midnight] + changes)).sorted()
    return Timeline(entries: dates.map { ScheduleEntry(date: $0, snapshot: snapshot, category: configuration.category, selectedID: selected) }, policy: .after(now.addingTimeInterval(1800)))
  }
}

@available(iOS 17.0, watchOS 10.0, *)
struct ScheduleWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: ScheduleEntry
  private let accent = Color(red: 56/255, green: 96/255, blue: 24/255)
  private let ink = Color(red: 22/255, green: 37/255, blue: 31/255)
  private let muted = Color(red: 82/255, green: 98/255, blue: 90/255)
  private let page = Color(red: 245/255, green: 246/255, blue: 243/255)
  var body: some View {
    Group {
      if family == .accessoryInline {
        if let next = entry.next { Text("4M · \(next.title) · \(next.when)") }
        else { Text(entry.snapshot.signedIn ? "4M · \(entry.emptyTitle)" : "4M · Open iPhone to sync") }
      } else if family == .accessoryCircular {
        VStack(spacing: 1) {
          Image(systemName: entry.next?.kind == "match" ? "tennisball.fill" : "calendar")
          if let date = entry.next?.start { Text(date, format: .dateTime.day()).font(.title3.bold()) }
          else { Text("4M").font(.caption.bold()) }
        }.widgetAccentable()
      } else if family == .accessoryRectangular {
        VStack(alignment: .leading, spacing: 2) {
          Text(entry.snapshot.isStale(at: entry.date) && entry.snapshot.updatedAt > 0 ? "4M · Check iPhone" : "4M · \(entry.category.heading)").font(.caption2.weight(.semibold)).widgetAccentable()
          Text(entry.next?.title ?? entry.emptyTitle).font(.headline).lineLimit(1)
          Text(entry.next?.when ?? "Open 4M on iPhone").font(.caption).lineLimit(1)
          if let next = entry.next { Text(next.court.isEmpty ? next.status : next.court).font(.caption2).lineLimit(1) }
        }.frame(maxWidth: .infinity, alignment: .leading)
      } else { phoneCard }
    }
    .privacySensitive()
    #if os(watchOS)
    .widgetURL(entry.next?.watchDestination ?? URL(string: "fourmpadel-watch://schedule"))
    #else
    .widgetURL(entry.next?.destination ?? URL(string: "fourmpadel:///calendar"))
    #endif
    .containerBackground(for: .widget) { widgetBackground }
  }
  @ViewBuilder private var widgetBackground: some View {
    #if os(iOS)
    if family == .systemSmall || family == .systemMedium { page }
    else { Color(red: 0.04, green: 0.04, blue: 0.04) }
    #else
    Color(red: 0.04, green: 0.04, blue: 0.04)
    #endif
  }
  private func datePart(_ item: ScheduleItem, _ pattern: String) -> String {
    guard let date = item.start else { return "TBC" }
    let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_ZA")
    formatter.timeZone = TimeZone(identifier: "Africa/Johannesburg"); formatter.dateFormat = pattern
    return formatter.string(from: date)
  }
  private var isMedium: Bool {
    #if os(watchOS)
    false
    #else
    family == .systemMedium
    #endif
  }
  @ViewBuilder private func eventTiming(_ item: ScheduleItem) -> some View {
    if !item.allDay, let start = item.start, start > entry.date, start.timeIntervalSince(entry.date) <= 21600 {
      HStack(spacing: 4) {
        Text("Starts in")
        Text(timerInterval: entry.date...start, countsDown: true, showsHours: true).monospacedDigit()
      }.lineLimit(1)
    } else { Text(WidgetSchedule.timing(item, at: entry.date)).lineLimit(1) }
  }
  private var phoneCard: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 8) {
        Text("4M").font(.system(size: 17, weight: .black)).foregroundStyle(ink)
        Text(entry.category.heading).font(.system(size: 11, weight: .medium)).foregroundStyle(muted)
        Spacer(minLength: 0)
        #if os(iOS)
        if let next = entry.next, entry.items.count > 1 {
          Text("\(entry.position + 1)/\(entry.items.count)").font(.system(size: 10)).monospacedDigit().foregroundStyle(muted)
          Button(intent: NextScheduleItem(category: entry.category, currentID: next.id)) {
            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold))
              .foregroundStyle(ink).frame(width: 32, height: 24).contentShape(Rectangle())
          }.buttonStyle(.plain).accessibilityLabel("Show next \(entry.category == .matches ? "match" : entry.category == .events ? "event" : "schedule item")")
        }
        #endif
      }
      if let next = entry.next {
        if isMedium {
          HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 0) {
              Text(datePart(next, "MMM")).font(.system(size: 11, weight: .medium))
              Text(datePart(next, "d")).font(.system(size: 32, weight: .semibold, design: .rounded)).monospacedDigit()
              Text(datePart(next, "EEE")).font(.system(size: 10, weight: .medium))
            }.foregroundStyle(accent).frame(width: 56, height: 76)
              .background(accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 2) {
              Text(next.title).font(.system(size: 14, weight: .semibold)).lineLimit(2).fixedSize(horizontal: false, vertical: true)
              eventTiming(next).font(.system(size: 11, weight: .medium)).foregroundStyle(accent)
              if !next.court.isEmpty { Text(next.court).font(.system(size: 12, weight: .semibold)).foregroundStyle(ink).lineLimit(1) }
              if !next.venue.isEmpty { Text(next.venue).font(.system(size: 11)).foregroundStyle(muted).lineLimit(1) }
            }.frame(maxWidth: .infinity, alignment: .leading)
          }
        } else {
          HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(datePart(next, "d")).font(.system(size: 26, weight: .semibold, design: .rounded)).monospacedDigit()
            Text(datePart(next, "MMM")).font(.system(size: 11, weight: .medium))
          }.foregroundStyle(accent)
          Text(next.title).font(.system(size: 13, weight: .semibold)).lineLimit(2).fixedSize(horizontal: false, vertical: true)
          eventTiming(next).font(.system(size: 11)).foregroundStyle(accent)
          if !next.court.isEmpty { Text(next.court).font(.system(size: 11, weight: .semibold)).lineLimit(1) }
        }
        Spacer(minLength: 0)
        HStack(spacing: 4) {
          let pending = next.status == "Payment pending"
          Text(next.status).font(.system(size: 10, weight: .medium))
            .foregroundStyle(pending ? Color(red: 183/255, green: 53/255, blue: 45/255) : muted).lineLimit(1)
          Spacer(minLength: 0)
          if isMedium {
            Text(entry.snapshot.isStale(at: entry.date) ? "Refresh in app" : "Updated " + entry.snapshot.updated.formatted(date: .omitted, time: .shortened))
              .font(.system(size: 9)).foregroundStyle(muted).lineLimit(1)
          }
        }
      } else {
        Spacer(minLength: 0)
        Text(entry.emptyTitle).font(.system(size: 15, weight: .semibold))
        Text(entry.emptyMessage).font(.system(size: 12)).foregroundStyle(muted).lineLimit(3)
        Spacer(minLength: 0)
      }
    }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .foregroundStyle(ink).environment(\.colorScheme, .light)
  }
}

@available(iOS 17.0, watchOS 10.0, *)
struct NextUpWidget: Widget {
  var kind: String {
    #if os(watchOS)
    "FourMWatchNextUp"
    #else
    "FourMNextUp"
    #endif
  }
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: kind, intent: ScheduleConfiguration.self, provider: ScheduleTimeline()) { ScheduleWidgetView(entry: $0) }
      .configurationDisplayName("Next match or event")
      .description("Your personal matches, entered events and saved events at a glance.")
      #if os(watchOS)
      .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline])
      #else
      .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular, .accessoryInline])
      #endif
  }
}
