import SwiftUI
import UserNotifications
import CryptoKit

final class WatchReminders: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
  @Published var enabled = UserDefaults.standard.bool(forKey: "court-reminders-enabled")
  @Published var minutes = UserDefaults.standard.integer(forKey: "court-reminders-minutes") == 0 ? 15 : UserDefaults.standard.integer(forKey: "court-reminders-minutes")
  @Published var message = ""
  @Published var destination: URL?
  private var generation = 0
  private var pendingTask: Task<Void, Never>?
  override init() { super.init(); UNUserNotificationCenter.current().delegate = self }
  func setEnabled(_ value: Bool, snapshot: ScheduleSnapshot) {
    Task { @MainActor in
      if value {
        do {
          guard try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) else {
            message = "Notifications are off. Enable them for 4M in Watch settings."; enabled = false
            UserDefaults.standard.set(false, forKey: "court-reminders-enabled"); reconcile(snapshot); return
          }
          enabled = true; message = ""
        } catch { message = "Could not enable reminders. Please try again."; return }
      } else { enabled = false; message = "" }
      UserDefaults.standard.set(enabled, forKey: "court-reminders-enabled")
      reconcile(snapshot)
    }
  }
  func setMinutes(_ value: Int, snapshot: ScheduleSnapshot) {
    guard [5, 15, 30].contains(value) else { return }
    minutes = value; UserDefaults.standard.set(value, forKey: "court-reminders-minutes"); reconcile(snapshot)
  }
  func reconcile(_ snapshot: ScheduleSnapshot) {
    generation += 1; let version = generation, lead = minutes, active = enabled
    let previous = pendingTask
    pendingTask = Task { @MainActor in
      await previous?.value
      let center = UNUserNotificationCenter.current()
      let old = await center.pendingNotificationRequests()
      guard version == generation else { return }
      center.removePendingNotificationRequests(withIdentifiers: old.map(\.identifier).filter { $0.hasPrefix("4m-court-") })
      guard active, snapshot.signedIn else { return }
      let settings = await center.notificationSettings()
      guard version == generation else { return }
      guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
        message = "Notifications are off. Enable them in Watch settings."; return
      }
      do {
        for reminder in CourtReminder.plan(snapshot, minutes: lead) {
          guard version == generation else { return }
          let content = UNMutableNotificationContent()
          content.title = "On court in \(lead) minutes"
          content.body = [reminder.item.title, reminder.item.court, reminder.item.venue].filter { !$0.isEmpty }.joined(separator: " · ")
          content.sound = .default
          content.userInfo = ["url": reminder.item.watchDestination.absoluteString]
          let hash = SHA256.hash(data: Data(reminder.item.id.utf8)).prefix(12).map { String(format: "%02x", $0) }.joined()
          let date = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: reminder.fireAt)
          try await center.add(UNNotificationRequest(identifier: "4m-court-" + hash, content: content,
            trigger: UNCalendarNotificationTrigger(dateMatching: date, repeats: false)))
        }
        if version == generation { message = "Reminders update whenever your iPhone schedule syncs." }
      } catch { if version == generation { message = "Some reminders could not be scheduled. Turn reminders off and on to retry." } }
    }
  }
  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
    if let text = response.notification.request.content.userInfo["url"] as? String, let url = URL(string: text) {
      DispatchQueue.main.async { self.destination = url }
    }
    completionHandler()
  }
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    completionHandler([.banner, .sound])
  }
}

struct WatchReminderSettings: View {
  @ObservedObject var reminders: WatchReminders
  let snapshot: ScheduleSnapshot
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        Toggle("Court reminders", isOn: Binding(get: { reminders.enabled }, set: { reminders.setEnabled($0, snapshot: snapshot) })).tint(WatchTheme.accent)
        Text("A wrist alert before matches with a confirmed start time.").font(.caption).foregroundStyle(WatchTheme.muted)
        if reminders.enabled {
          Picker("Remind me", selection: Binding(get: { reminders.minutes }, set: { reminders.setMinutes($0, snapshot: snapshot) })) {
            ForEach([5, 15, 30], id: \.self) { Text("\($0) min before").tag($0) }
          }.pickerStyle(.navigationLink)
          Text("\(CourtReminder.plan(snapshot, minutes: reminders.minutes).count) upcoming reminders").font(.caption).foregroundStyle(WatchTheme.accent)
        }
        if !reminders.message.isEmpty { Text(reminders.message).font(.caption2).foregroundStyle(WatchTheme.muted) }
        Text("Keep your schedule current by opening Home on iPhone. Matches marked Time TBC do not get an alert.").font(.caption2).foregroundStyle(WatchTheme.muted)
      }.padding(.horizontal, 4).padding(.bottom, 20)
    }.watchPage().navigationTitle("Reminders")
  }
}
