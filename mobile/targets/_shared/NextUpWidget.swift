import SwiftUI
import WidgetKit
import AppIntents
#if os(iOS)
import UIKit
import ImageIO
#endif

enum ScheduleCategory: String, AppEnum {
  case all, matches, events
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Schedule"
  static var caseDisplayRepresentations: [ScheduleCategory: DisplayRepresentation] = [
    .all: "Matches & events", .matches: "Matches", .events: "Events"
  ]
  var kind: String? { self == .all ? nil : self == .matches ? "match" : "event" }
  var heading: String { self == .all ? "NEXT UP" : self == .matches ? "NEXT MATCH" : "NEXT EVENT" }
  var emptyTitle: String { self == .all ? "Nothing scheduled" : self == .matches ? "No upcoming matches" : "No upcoming events" }
}

@available(iOS 17.0, watchOS 10.0, *)
struct ScheduleConfiguration: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Your 4M schedule"
  static var description = IntentDescription("Choose upcoming matches, events, or both.")
  @Parameter(title: "Show", default: .all) var category: ScheduleCategory
}

struct ScheduleEntry: TimelineEntry {
  let date: Date
  let snapshot: ScheduleSnapshot
  var category: ScheduleCategory = .all
  var artwork: Data? = nil
  var next: ScheduleItem? {
    snapshot.upcoming(at: date).first { category.kind == nil || $0.kind == category.kind }
  }
  var emptyTitle: String { snapshot.signedIn ? category.emptyTitle : snapshot.emptyTitle }
  var emptyMessage: String {
    snapshot.signedIn && category == .matches
      ? "Your scheduled matches appear after syncing with 4M on iPhone."
      : snapshot.emptyMessage
  }
}

@available(iOS 17.0, watchOS 10.0, *)
struct ScheduleTimeline: AppIntentTimelineProvider {
  func recommendations() -> [AppIntentRecommendation<ScheduleConfiguration>] {
    [ScheduleCategory.all, .matches, .events].map { category in
      let configuration = ScheduleConfiguration()
      configuration.category = category
      return AppIntentRecommendation(intent: configuration, description: category == .all ? "Matches & events" : category == .matches ? "Matches" : "Events")
    }
  }
  func placeholder(in context: Context) -> ScheduleEntry { ScheduleEntry(date: .now, snapshot: .empty) }
  func snapshot(for configuration: ScheduleConfiguration, in context: Context) async -> ScheduleEntry {
    var entry = ScheduleEntry(date: .now, snapshot: ScheduleStore.read(), category: configuration.category)
    entry.artwork = await loadArtwork(entry.next?.imageUrl)
    return entry
  }
  func timeline(for configuration: ScheduleConfiguration, in context: Context) async -> Timeline<ScheduleEntry> {
    let now = Date()
    let snapshot = ScheduleStore.read()
    // Advance past expired events even when the phone has not been opened.
    let changes = snapshot.items.flatMap { [$0.expiresAt, $0.startAt, $0.registrationOpensAt, $0.registrationClosesAt].compactMap { $0 } }.map { Date(timeIntervalSince1970: $0 / 1000) }
      .filter { $0 > now && $0 < now.addingTimeInterval(86400) }
    // Rebuild the day column when the remaining duration crosses a whole day.
    // SwiftUI's native timer keeps the hours/minutes/seconds ticking between entries.
    let dayChanges = snapshot.items.compactMap { item -> Date? in
      guard let countdown = item.countdown(at: now) else { return nil }
      let remaining = countdown.end.timeIntervalSince(now)
      guard remaining >= 86400 else { return nil }
      return now.addingTimeInterval(remaining.truncatingRemainder(dividingBy: 86400) + 1)
    }
    let dates = Array(Set([now] + changes + dayChanges)).sorted()
    let current = ScheduleEntry(date: now, snapshot: snapshot, category: configuration.category)
    let artwork = await loadArtwork(current.next?.imageUrl)
    return Timeline(entries: dates.map {
      var entry = ScheduleEntry(date: $0, snapshot: snapshot, category: configuration.category)
      if entry.next?.id == current.next?.id { entry.artwork = artwork }
      return entry
    }, policy: .after(now.addingTimeInterval(1800)))
  }
  // Widget views cannot load AsyncImage. Fetch and downsample before producing entries.
  private func loadArtwork(_ text: String?) async -> Data? {
    #if os(iOS)
    guard let text, let url = URL(string: text), url.scheme == "https" else { return nil }
    do {
      let request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 8)
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let response = response as? HTTPURLResponse, response.statusCode == 200,
        data.count <= 8_000_000,
        let source = CGImageSourceCreateWithData(data as CFData, nil),
        let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
          kCGImageSourceCreateThumbnailFromImageAlways: true,
          kCGImageSourceThumbnailMaxPixelSize: 800,
          kCGImageSourceCreateThumbnailWithTransform: true
        ] as CFDictionary) else { return nil }
      return UIImage(cgImage: thumbnail).jpegData(compressionQuality: 0.8)
    } catch { return nil }
    #else
    return nil
    #endif
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
          Text(entry.snapshot.isStale(at: entry.date) && entry.snapshot.updatedAt > 0 ? "4M · CHECK IPHONE" : "4M · \(entry.category.heading)").font(.caption2.bold()).widgetAccentable()
          Text(entry.next?.title ?? entry.emptyTitle).font(.headline).lineLimit(1)
          Text(entry.next?.when ?? "Open 4M on iPhone").font(.caption).lineLimit(1)
          if let next = entry.next { Text(next.court.isEmpty ? next.status : next.court).font(.caption2).lineLimit(1) }
        }.frame(maxWidth: .infinity, alignment: .leading)
      } else {
        phoneCard

      }
    }
    .privacySensitive()
    .widgetURL(entry.next?.destination ?? URL(string: "fourmpadel:///calendar"))
    .containerBackground(for: .widget) { widgetBackground }
  }

  @ViewBuilder private var widgetBackground: some View {
    #if os(iOS)
    if family == .systemSmall || family == .systemMedium {
      page
    } else { Color(red: 0.04, green: 0.04, blue: 0.04) }
    #else
    Color(red: 0.04, green: 0.04, blue: 0.04)
    #endif
  }

  private func datePart(_ item: ScheduleItem, _ pattern: String) -> String {
    guard let date = item.start else { return "TBC" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_ZA")
    formatter.timeZone = TimeZone(identifier: "Africa/Johannesburg")
    formatter.dateFormat = pattern
    return formatter.string(from: date)
  }

  private func statusColor(_ item: ScheduleItem) -> Color {
    item.status == "Payment pending" ? Color(red: 183/255, green: 53/255, blue: 45/255)
      : item.status == "Saved event" ? muted : accent
  }

  private func statusBadge(_ item: ScheduleItem) -> some View {
    Label(item.status, systemImage: item.status == "Payment pending" ? "exclamationmark.circle.fill" : item.status == "Saved event" ? "bookmark.fill" : "checkmark.circle.fill")
      .font(.system(size: 10, weight: .semibold)).lineLimit(1)
      .foregroundStyle(statusColor(item))
      .padding(.horizontal, 8).padding(.vertical, 4)
      .background(statusColor(item).opacity(0.12), in: Capsule())
  }

  @ViewBuilder private func eventTiming(_ item: ScheduleItem) -> some View {
    if item.isLive(at: entry.date) {
      Text("Tournament underway").lineLimit(1)
    } else if let countdown = item.countdown(at: entry.date) {
      let days = max(0, Int(countdown.end.timeIntervalSince(entry.date)) / 86400)
      let clockEnd = countdown.end.addingTimeInterval(-Double(days * 86400))
      VStack(alignment: .leading, spacing: 2) {
        Text(countdown.label == "Starts in" ? countdown.label : "\(countdown.label) in").font(.system(size: 9, weight: .semibold))
        HStack(spacing: 6) {
          VStack(spacing: 1) {
            Text(String(format: "%02d", days)).font(.system(size: 14, weight: .semibold, design: .monospaced))
            Text("DAYS").font(.system(size: 7, weight: .medium))
          }.frame(maxWidth: .infinity)
          Text(":").font(.system(size: 14)).padding(.bottom, 9)
          VStack(spacing: 1) {
            Text(timerInterval: entry.date...max(entry.date, clockEnd), countsDown: true, showsHours: true)
              .font(.system(size: 14, weight: .semibold, design: .monospaced))
              .monospacedDigit().multilineTextAlignment(.center)
            HStack(spacing: 0) {
              ForEach(["HRS", "MINS", "SECS"], id: \.self) { label in
                Text(label).font(.system(size: 7, weight: .medium)).frame(maxWidth: .infinity)
              }
            }
          }.frame(minWidth: 72, maxWidth: 92)
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity)
        .foregroundStyle(ink)
        .padding(.horizontal, 6).padding(.vertical, 3)
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(accent.opacity(0.35), lineWidth: 1))
      }
      .accessibilityElement(children: .combine)
    } else if let closes = item.registrationClosesAt, closes <= entry.date.timeIntervalSince1970 * 1000 {
      Text("Registration closed").lineLimit(1)
    } else {
      Text(item.allDay ? "Start time TBC" : datePart(item, "HH:mm") + " SAST").lineLimit(1)
    }
  }

  private var isMedium: Bool {
    #if os(watchOS)
    false
    #else
    family == .systemMedium
    #endif
  }

  private var phoneCard: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(alignment: .center) {
        Text("4M").font(.system(size: 17, weight: .black)).foregroundStyle(ink)
        Text(entry.category.heading).font(.system(size: 9, weight: .bold)).tracking(1.2).foregroundStyle(muted)
        Spacer(minLength: 0)
        if let next = entry.next, next.isLive(at: entry.date) {
          HStack(spacing: 4) {
            Circle().fill(accent).frame(width: 5, height: 5)
            Text("LIVE").font(.system(size: 9, weight: .heavy)).tracking(0.8)
          }.foregroundStyle(accent).padding(.horizontal, 6).padding(.vertical, 3)
            .background(accent.opacity(0.1), in: Capsule())
            .accessibilityLabel("Tournament underway, based on event dates")
        } else {
          Image(systemName: entry.next?.kind == "event" ? "calendar" : "tennisball.fill").font(.system(size: 13)).foregroundStyle(accent)
        }
      }
      if let next = entry.next {
        if isMedium {
          HStack(alignment: .top, spacing: 13) {
            VStack(spacing: 1) {
              Text(datePart(next, "MMM").uppercased()).font(.system(size: 10, weight: .heavy)).tracking(1.5)
              Text(datePart(next, "dd")).font(.system(size: 34, weight: .bold, design: .rounded)).monospacedDigit()
              Text(datePart(next, "EEE").uppercased()).font(.system(size: 9, weight: .bold)).tracking(1)
            }.foregroundStyle(accent).frame(width: 62, height: 80)
              .background(accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 13))
            VStack(alignment: .leading, spacing: 3) {
              Text(next.title).font(.system(size: 14, weight: .bold)).lineLimit(1)
                .minimumScaleFactor(0.85)
              eventTiming(next).font(.system(size: 11, weight: .semibold)).foregroundStyle(accent)
              if !next.venue.isEmpty {
                Label(next.venue, systemImage: "mappin.and.ellipse")
                  .font(.system(size: 10)).foregroundStyle(muted).lineLimit(1)
              }
              if !next.court.isEmpty { Text(next.court).font(.system(size: 10)).foregroundStyle(muted).lineLimit(1) }
            }.frame(maxWidth: .infinity, alignment: .leading)
          }
        } else {
          HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text(datePart(next, "dd")).font(.system(size: 27, weight: .bold, design: .rounded))
            Text(datePart(next, "MMM").uppercased()).font(.system(size: 11, weight: .bold))
            Spacer(minLength: 0)
          }.foregroundStyle(accent)
          Text(next.title).font(.system(size: 13, weight: .bold)).lineLimit(2)
          eventTiming(next).font(.system(size: 10)).foregroundStyle(accent)
        }
        Spacer(minLength: 0)
        HStack(alignment: .center, spacing: 4) {
          statusBadge(next)
          Spacer(minLength: 0)
          if isMedium {
            Text(entry.snapshot.isStale(at: entry.date) ? "Refresh in app" : "Updated " + entry.snapshot.updated.formatted(date: .omitted, time: .shortened))
              .font(.system(size: 8)).foregroundStyle(muted).lineLimit(1)
          }
        }
      } else {
        Spacer(minLength: 0)
        Label(entry.emptyTitle, systemImage: "calendar.badge.clock").font(.headline)
        Text(entry.emptyMessage).font(.caption).foregroundStyle(muted).lineLimit(3)
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
      .description("Choose matches, events, or both from your personal 4M schedule.")
      #if os(watchOS)
      .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline])
      #else
      .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular, .accessoryInline])
      #endif
  }
}
