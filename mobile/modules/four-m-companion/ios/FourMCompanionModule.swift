import ExpoModulesCore
import WatchConnectivity
import WidgetKit

private let groupID = "group.com.fourmpadel.app.schedule"
private let snapshotKey = "schedule-v1"

public final class FourMCompanionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FourMCompanion")
    OnCreate { _ = PhoneScheduleSession.shared }
    AsyncFunction("setAccount") { (id: String?) in
      PhoneScheduleSession.shared.setAccount(id)
    }.runOnQueue(.main)
    AsyncFunction("publish") { (id: String, json: String) in
      try PhoneScheduleSession.shared.publish(account: id, json: json)
    }.runOnQueue(.main)
  }
}

private final class PhoneScheduleSession: NSObject, WCSessionDelegate {
  static let shared = PhoneScheduleSession()
  private let defaults = UserDefaults(suiteName: groupID)!
  private var session: WCSession?
  override private init() {
    super.init()
    if WCSession.isSupported() {
      session = WCSession.default
      session?.delegate = self
      session?.activate()
    }
  }
  func setAccount(_ id: String?) {
    let old = defaults.string(forKey: "schedule-account")
    guard old != id || defaults.string(forKey: snapshotKey) == nil else { return }
    defaults.set(id, forKey: "schedule-account")
    let empty: [String: Any] = ["version": 1, "updatedAt": Date().timeIntervalSince1970 * 1000, "signedIn": id != nil, "items": []]
    if let data = try? JSONSerialization.data(withJSONObject: empty), let json = String(data: data, encoding: .utf8) { save(json) }
  }
  func publish(account: String, json: String) throws {
    guard defaults.string(forKey: "schedule-account") == account else { return }
    guard let data = json.data(using: .utf8), data.count < 60000,
      let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      object["version"] as? Int == 1, object["signedIn"] as? Bool == true,
      object["items"] is [[String: Any]] else { throw NSError(domain: "FourMCompanion", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid schedule snapshot"]) }
    save(json)
  }
  private func save(_ json: String) {
    defaults.set(json, forKey: snapshotKey)
    WidgetCenter.shared.reloadTimelines(ofKind: "FourMNextUp")
    sendLatest()
  }
  private func sendLatest() {
    guard let session, session.activationState == .activated, session.isPaired, session.isWatchAppInstalled,
      let json = defaults.string(forKey: snapshotKey) else { return }
    // The system queues the latest state for delivery when the watch is available.
    do { try session.updateApplicationContext([snapshotKey: json]) }
    catch { NSLog("4M schedule transfer will retry on the next activation/update") }
  }
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    DispatchQueue.main.async { self.sendLatest() }
  }
  func sessionWatchStateDidChange(_ session: WCSession) { DispatchQueue.main.async { self.sendLatest() } }
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    DispatchQueue.main.async { replyHandler([snapshotKey: self.defaults.string(forKey: snapshotKey) ?? ""]) }
  }
}
