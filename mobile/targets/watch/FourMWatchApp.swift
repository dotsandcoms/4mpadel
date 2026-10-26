import SwiftUI
import WatchConnectivity
import WidgetKit
import MapKit

final class WatchSchedule: NSObject, ObservableObject, WCSessionDelegate {
  @Published var snapshot = ScheduleStore.read()
  @Published private var refreshState = WatchRefreshState()
  var message: String { refreshState.message }
  var isRefreshing: Bool { refreshState.isRefreshing }
  override init() {
    super.init()
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
  }
  private func receive(_ context: [String: Any], replyingTo requestID: UUID? = nil) {
    DispatchQueue.main.async {
      guard let text = context[ScheduleStore.key] as? String,
        ScheduleStore.decode(text) != nil else {
        if let requestID { self.refreshState.finish(requestID, outcome: .emptyReply) }
        return
      }
      if ScheduleStore.save(text) {
        self.snapshot = ScheduleStore.read()
        WidgetCenter.shared.reloadTimelines(ofKind: "FourMWatchNextUp")
      }
      // A valid older reply also completes refresh; keep the newer stored snapshot.
      self.refreshState.receivedSnapshot()
    }
  }
  func refresh() {
    guard let requestID = refreshState.begin(canReachPhone:
      WCSession.default.activationState == .activated && WCSession.default.isReachable) else { return }
    WCSession.default.sendMessage(["request": "schedule"], replyHandler: { self.receive($0, replyingTo: requestID) }, errorHandler: { _ in
      DispatchQueue.main.async { self.refreshState.finish(requestID, outcome: .unavailable) }
    })
    DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
      self?.refreshState.finish(requestID, outcome: .unavailable)
    }
  }
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    receive(session.receivedApplicationContext)
    DispatchQueue.main.async { self.refresh() }
  }
  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) { receive(applicationContext) }
}

@main
struct FourMWatchApp: App {
  @StateObject private var schedule = WatchSchedule()
  @AppStorage("schedule-category") private var preferredCategory = ""
  @State private var linkedCategory: String?
  @State private var navigationPath: [WatchDestination] = []
  @Environment(\.scenePhase) private var scenePhase
  private let lime = Color(red: 0.8, green: 1, blue: 0)
  var body: some Scene {
    WindowGroup {
      NavigationStack(path: $navigationPath) {
        TimelineView(.animation(minimumInterval: 60, paused: scenePhase != .active)) { context in
          let category = WatchScheduleRoute.category(preference: linkedCategory ?? preferredCategory,
            snapshot: schedule.snapshot, at: context.date)
          let items = schedule.snapshot.upcoming(at: context.date).filter { $0.kind == category }
          ScrollView {
            VStack(alignment: .leading, spacing: 14) {
              HStack(spacing: 6) {
                categoryButton("Matches", kind: "match", selected: category)
                categoryButton("Events", kind: "event", selected: category)
              }
              if let next = items.first {
                scheduleLink(next, featured: true)
                if !next.venue.isEmpty { WatchVenueButton(item: next, concise: true) }
                if items.count > 1 {
                  HStack {
                    Text("COMING UP").font(.system(size: 10, weight: .bold)).tracking(1.2)
                    Spacer()
                    Text("\(items.count - 1)").monospacedDigit()
                  }.font(.caption2).foregroundStyle(.secondary).padding(.top, 4)
                  ForEach(Array(items.dropFirst().prefix(4))) { item in
                    scheduleLink(item, featured: false)
                  }
                }
              } else {
                Image(systemName: category == "match" ? "tennisball" : "calendar").font(.largeTitle).foregroundStyle(lime)
                Text(schedule.snapshot.signedIn ? (category == "match" ? "No upcoming matches" : "No upcoming events") : "Your schedule").font(.headline)
                Text(schedule.snapshot.signedIn
                     ? (category == "match" ? "Your scheduled matches will appear here after syncing with iPhone." : "Save or enter an event in the iPhone app to see it here.")
                     : schedule.snapshot.emptyMessage).font(.caption).foregroundStyle(.secondary)
              }
              Divider()
              VStack(spacing: 10) {
              if schedule.snapshot.updatedAt > 0 {
                VStack(spacing: 2) {
                  Text("Synced \(schedule.snapshot.updated.formatted(date: .omitted, time: .shortened))")
                  if !Calendar.current.isDate(schedule.snapshot.updated, inSameDayAs: context.date) {
                    Text(schedule.snapshot.updated, format: .dateTime.day().month(.abbreviated))
                  }
                }.font(.caption2).foregroundStyle(.secondary)
                if schedule.snapshot.isStale(at: context.date) { Text("Schedule may have changed. Open 4M on iPhone.").font(.caption2).foregroundStyle(.orange) }
              }
              if !schedule.message.isEmpty { Text(schedule.message).font(.caption2).foregroundStyle(.secondary) }
              Button(action: schedule.refresh) {
                Label(schedule.isRefreshing ? "Refreshing…" : "Refresh", systemImage: "arrow.clockwise")
                  .font(.caption.bold()).lineLimit(1)
                  .frame(maxWidth: .infinity, minHeight: 44)
                  .background(lime.opacity(0.18), in: Capsule())
              }.buttonStyle(.plain).foregroundStyle(lime).disabled(schedule.isRefreshing)
                .accessibilityLabel("Refresh schedule from iPhone")
              Text("Entries & payments\non iPhone").font(.caption2).foregroundStyle(.secondary)
              }.multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 24)
            }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 8)
          }.id(category).navigationTitle("Next up").navigationBarTitleDisplayMode(.inline)
        }
        .navigationDestination(for: WatchDestination.self) { destination in
          switch destination {
          case .event(let id): WatchEventCard(schedule: schedule, eventID: id)
          }
        }
      }.tint(lime).onChange(of: scenePhase) { _, phase in if phase == .active { schedule.refresh() } }
        .onOpenURL { url in
          guard let route = WatchScheduleRoute(url: url) else { return }
          linkedCategory = route.category
          navigationPath = route.destination.map { [$0] } ?? []
        }
    }
  }

  @ViewBuilder private func scheduleLink(_ item: ScheduleItem, featured: Bool) -> some View {
    if item.kind == "event" {
      NavigationLink(value: WatchDestination.event(item.id)) {
        WatchScheduleCard(item: item, featured: featured)
      }.buttonStyle(.plain)
        .accessibilityLabel((["View event: " + item.title, item.when, item.venue, item.court, item.status]
          .filter { !$0.isEmpty }).joined(separator: ", "))
    } else {
      WatchScheduleCard(item: item, featured: featured)
    }
  }

  private func categoryButton(_ title: String, kind: String, selected: String) -> some View {
    Button { preferredCategory = kind; linkedCategory = nil } label: {
      Text(title).font(.caption.bold())
        .frame(maxWidth: .infinity, minHeight: 44)
        .foregroundStyle(selected == kind ? Color.black : Color.white)
        .background(selected == kind ? lime : Color.white.opacity(0.12), in: Capsule())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected == kind ? .isSelected : [])
  }
}

private struct WatchEventCard: View {
  @ObservedObject var schedule: WatchSchedule
  let eventID: String
  private let lime = Color(red: 0.8, green: 1, blue: 0)

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        if schedule.snapshot.signedIn,
           let event = schedule.snapshot.items.first(where: { $0.id == eventID && $0.kind == "event" }) {
          Text(event.title).font(.system(.headline, design: .rounded, weight: .bold))
            .fixedSize(horizontal: false, vertical: true)
          HStack(spacing: 10) {
            WatchDateTile(item: event)
            VStack(alignment: .leading, spacing: 4) {
              Text(event.datePart("EEEE")).font(.caption.bold())
              WatchEventTiming(item: event)
            }
          }.padding(10).frame(maxWidth: .infinity, alignment: .leading)
            .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
          WatchStatus(item: event)
          WatchLiveBadge(item: event)
          VStack(alignment: .leading, spacing: 4) {
            Text("VENUE").font(.system(size: 9, weight: .bold)).tracking(1.3).foregroundStyle(.secondary)
            if !event.venue.isEmpty { WatchVenueButton(item: event) }
            else { Text("To be confirmed").font(.caption) }
            if !event.subtitle.isEmpty { Text(event.subtitle).font(.caption2).foregroundStyle(.secondary) }
          }.padding(10).frame(maxWidth: .infinity, alignment: .leading)
            .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
          WatchHero(item: event)
          Text("Manage your entry and payments in 4M on iPhone.")
            .font(.caption2).foregroundStyle(.secondary)
          Text("Synced \(schedule.snapshot.updated.formatted(date: .abbreviated, time: .shortened))")
            .font(.caption2).foregroundStyle(.secondary)
        } else {
          Text("Event unavailable").font(.headline)
          Text("Open 4M on iPhone to refresh your schedule.").font(.caption).foregroundStyle(.secondary)
        }
      }.padding(.horizontal, 4).padding(.bottom, 24)
    }.navigationTitle("Event").navigationBarTitleDisplayMode(.inline)
  }
}

private struct WatchVenueButton: View {
  let item: ScheduleItem
  var concise = false
  @State private var searching = false
  @State private var failure: String?
  private let lime = Color(red: 0.8, green: 1, blue: 0)

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      Button {
        Task { await openVenue() }
      } label: {
        HStack(spacing: 6) {
          if searching { ProgressView().controlSize(.mini) }
          else { Image(systemName: "mappin.and.ellipse") }
          Text(searching ? "Finding venue…" : concise ? "Open venue in Maps" : item.venue)
            .fixedSize(horizontal: false, vertical: true)
          Spacer(minLength: 0)
          Image(systemName: "arrow.up.right").font(.caption2)
        }.font(.caption).foregroundStyle(lime)
          .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
          .contentShape(Rectangle())
      }.buttonStyle(.plain).disabled(searching)
        .accessibilityLabel("Open \(item.venue) in Maps")
      if let failure { Text(failure).font(.caption2).foregroundStyle(.orange) }
    }
  }

  @MainActor private func openVenue() async {
    guard !searching else { return }
    searching = true
    failure = nil
    defer { searching = false }
    let request = MKLocalSearch.Request()
    request.naturalLanguageQuery = [item.venue, item.kind == "event" ? item.subtitle : ""]
      .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.joined(separator: ", ")
    do {
      let response = try await MKLocalSearch(request: request).start()
      guard !response.mapItems.isEmpty else {
        failure = "Venue not found in Maps. Check the location in 4M on iPhone."
        return
      }
      // Pass native places to Maps. watchOS cannot open the HTTPS search page.
      if !MKMapItem.openMaps(with: Array(response.mapItems.prefix(5)), launchOptions: nil) {
        failure = "Maps couldn’t open. Please try again."
      }
    } catch {
      failure = "Couldn’t find the venue. Check your connection and tap to retry."
    }
  }
}

private let watchLime = Color(red: 0.8, green: 1, blue: 0)

private extension ScheduleItem {
  var statusColor: Color {
    status == "Payment pending" ? Color(red: 1, green: 0.48, blue: 0.42)
      : status == "Saved event" ? Color(red: 0.7, green: 0.76, blue: 0.83) : watchLime
  }
  var statusIcon: String {
    status == "Payment pending" ? "exclamationmark.circle.fill"
      : status == "Saved event" ? "bookmark.fill" : "checkmark.circle.fill"
  }
  func datePart(_ pattern: String) -> String {
    guard let start else { return "TBC" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_ZA")
    formatter.timeZone = TimeZone(identifier: "Africa/Johannesburg")
    formatter.dateFormat = pattern
    return formatter.string(from: start)
  }
}

private struct WatchDateTile: View {
  let item: ScheduleItem
  var body: some View {
    VStack(spacing: 0) {
      Text(item.datePart("dd")).font(.system(size: 26, weight: .bold, design: .rounded)).monospacedDigit()
      Text(item.datePart("MMM").uppercased()).font(.system(size: 9, weight: .heavy)).tracking(1)
    }.foregroundStyle(watchLime).frame(width: 44, height: 52)
      .background(watchLime.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
      .accessibilityLabel(item.when)
  }
}

private struct WatchStatus: View {
  let item: ScheduleItem
  var body: some View {
    Label(item.status, systemImage: item.statusIcon)
      .font(.system(size: 11, weight: .semibold))
      .foregroundStyle(item.statusColor).padding(.horizontal, 8).padding(.vertical, 6)
      .background(item.statusColor.opacity(0.12), in: Capsule())
      .fixedSize(horizontal: false, vertical: true)
  }
}

private struct WatchHero: View {
  let item: ScheduleItem
  var compact = false
  @State private var artwork: CGImage?
  @Environment(\.scenePhase) private var scenePhase
  var body: some View {
    Group {
      if let artwork {
            // Event posters contain text and sponsor marks: preserve the full graphic.
            Image(decorative: artwork, scale: 1).resizable().scaledToFit()
              .frame(maxWidth: .infinity).frame(height: compact ? 100 : 145)
              .background(Color.black)
      } else { fallback }
    }.clipShape(RoundedRectangle(cornerRadius: 16))
      .accessibilityLabel("Event graphic for \(item.title)")
      .task(id: scenePhase == .active ? item.imageUrl : nil) {
        guard scenePhase == .active else { return }
        artwork = nil
        let image = await ScheduleArtwork.load(item.imageUrl, maxPixels: 600)
        if !Task.isCancelled { artwork = image }
      }
  }
  private var fallback: some View {
    ZStack(alignment: .bottomLeading) {
      GeometryReader { geometry in
        Image("PadelHero").resizable().scaledToFill()
          .frame(width: geometry.size.width, height: geometry.size.height).clipped()
      }
      LinearGradient(colors: [.clear, .black.opacity(0.8)], startPoint: .top, endPoint: .bottom)
      HStack(alignment: .bottom) {
        Spacer()
        Text("4M").font(.system(size: 25, weight: .black, design: .rounded)).italic().foregroundStyle(.white)
      }.padding(10)
    }.frame(height: compact ? 80 : 100)
  }
}

private struct WatchScheduleCard: View {
  let item: ScheduleItem
  let featured: Bool
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 7) {
        if featured {
          Text(item.title).font(.system(size: 15, weight: .bold, design: .rounded))
            .lineLimit(3).frame(maxWidth: .infinity, alignment: .leading)
          Text(item.allDay ? item.datePart("EEE d MMM") : item.when).font(.caption2.bold()).foregroundStyle(watchLime)
            .fixedSize(horizontal: false, vertical: true)
        } else {
          HStack(alignment: .top, spacing: 9) {
            WatchDateTile(item: item)
            Text(item.title).font(.system(size: 13, weight: .semibold))
              .lineLimit(3).frame(maxWidth: .infinity, alignment: .leading)
          }
        }
        if !item.court.isEmpty { Label(item.court, systemImage: "sportscourt").font(.caption2) }
        if !item.venue.isEmpty {
          Label(item.venue, systemImage: "mappin.and.ellipse")
            .font(.caption2).foregroundStyle(.secondary).lineLimit(2)
        }
        WatchEventTiming(item: item)
        if item.kind == "match" && !item.subtitle.isEmpty {
          Text(item.subtitle).font(.caption2).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        WatchStatus(item: item)
        WatchLiveBadge(item: item)
      }.padding(10)
      if featured || item.kind == "event" { WatchHero(item: item, compact: !featured) }
    }.frame(maxWidth: .infinity, alignment: .leading)
      .background(Color(white: 0.075), in: RoundedRectangle(cornerRadius: 16))
      .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(.white.opacity(0.08), lineWidth: 0.5))
  }
}

private struct WatchLiveBadge: View {
  let item: ScheduleItem
  @Environment(\.scenePhase) private var scenePhase
  var body: some View {
    TimelineView(.animation(minimumInterval: 60, paused: scenePhase != .active)) { context in
      if item.isLive(at: context.date) {
        HStack(spacing: 5) {
          Circle().fill(.orange).frame(width: 5, height: 5)
          Text("LIVE").font(.system(size: 10, weight: .heavy)).tracking(1)
        }.foregroundStyle(.orange).padding(.horizontal, 8).padding(.vertical, 5)
          .background(Color.orange.opacity(0.15), in: Capsule())
          .accessibilityLabel("Tournament underway, based on event dates")
      }
    }
  }
}

private struct WatchEventTiming: View {
  let item: ScheduleItem
  @Environment(\.scenePhase) private var scenePhase
  var body: some View {
    TimelineView(.animation(minimumInterval: 60, paused: scenePhase != .active)) { context in
      if item.isLive(at: context.date) {
        Text("Tournament underway").font(.caption2).foregroundStyle(.orange)
      } else if let countdown = item.countdown(at: context.date) {
        let seconds = max(0, Int(countdown.end.timeIntervalSince(context.date)))
        let days = seconds / 86400
        let hours = (seconds % 86400) / 3600
        let minutes = (seconds % 3600) / 60
        VStack(alignment: .leading, spacing: 7) {
          Text(countdown.label == "Entries close" ? "Registration closes in" : countdown.label == "Entries open" ? "Registration opens in" : "Starts in")
            .font(.caption2).foregroundStyle(.secondary)
          if seconds < 60 {
            Text("Less than a minute").font(.caption.bold()).foregroundStyle(watchLime)
          } else {
            HStack(spacing: 6) {
              if days > 0 { unit(days, label: days == 1 ? "day" : "days") }
              unit(hours, label: "hrs")
              unit(minutes, label: "min")
            }.accessibilityElement(children: .ignore)
              .accessibilityLabel("\(days) days, \(hours) hours, \(minutes) minutes remaining")
          }
        }
      } else {
        Label(item.allDay ? "Time TBC" : item.datePart("HH:mm") + " SAST", systemImage: "clock")
          .font(.caption2).foregroundStyle(.secondary)
      }
    }
  }

  private func unit(_ value: Int, label: String) -> some View {
    VStack(spacing: 2) {
      Text(String(value)).font(.system(size: 20, weight: .bold, design: .rounded)).monospacedDigit().foregroundStyle(watchLime)
      Text(label).font(.system(size: 9, weight: .medium)).foregroundStyle(.secondary)
    }.frame(maxWidth: .infinity).padding(.vertical, 7)
      .background(watchLime.opacity(0.07), in: RoundedRectangle(cornerRadius: 8))
  }
}
