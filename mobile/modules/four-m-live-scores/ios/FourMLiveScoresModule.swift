import ActivityKit
import ExpoModulesCore
import Foundation

// This Codable contract is shared with ProLiveScoreWidget and the APNs score payload.
@available(iOS 17.0, *)
struct ProMatchScoreAttributes: ActivityAttributes {
  let pin: String
  let match: Int

  struct ContentState: Codable, Hashable {
    let teams: [String]
    let games: [Int]?
    let sets: [[Int]]
    let status: String
    let timestamp: Int
    let freshUntil: Int
  }
}

public final class FourMLiveScoresModule: Module {
  private var tokens: Task<Void, Never>?
  private var states: Task<Void, Never>?

  public func definition() -> ModuleDefinition {
    Name("FourMLiveScores")
    Events("onPinChange")
    OnDestroy { self.tokens?.cancel(); self.states?.cancel() }
    AsyncFunction("availability") { () -> String in
      if #available(iOS 17.0, *), ActivityAuthorizationInfo().areActivitiesEnabled { return "ready" }
      return "disabled"
    }.runOnQueue(.main)
    AsyncFunction("current") { () -> [String: Any]? in
      guard #available(iOS 17.0, *),
            let activity = Activity<ProMatchScoreAttributes>.activities.first(where: { $0.activityState == .active || $0.activityState == .stale }) else { return nil }
      self.observe(activity)
      var result: [String: Any] = ["pin": activity.attributes.pin, "match": activity.attributes.match]
      if let token = activity.pushToken { result["token"] = Self.hex(token) }
      return result
    }.runOnQueue(.main)
    AsyncFunction("start") { (pin: String, match: Int, score: String, _: String, _: String) in
      guard #available(iOS 17.0, *), ActivityAuthorizationInfo().areActivitiesEnabled else {
        throw NSError(domain: "4M Live Scores", code: 1, userInfo: [NSLocalizedDescriptionKey: "Live Activities are unavailable."])
      }
      let state = try JSONDecoder().decode(ProMatchScoreAttributes.ContentState.self, from: Data(score.utf8))
      let activity = try Activity<ProMatchScoreAttributes>.request(
        attributes: .init(pin: pin, match: match),
        content: .init(state: state, staleDate: Date(timeIntervalSince1970: Double(state.freshUntil))),
        pushType: .token
      )
      self.observe(activity)
    }.runOnQueue(.main)
    AsyncFunction("stop") { (pin: String) async in
      guard #available(iOS 17.0, *) else { return }
      for activity in Activity<ProMatchScoreAttributes>.activities where activity.attributes.pin == pin {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }

  @available(iOS 17.0, *)
  private func observe(_ activity: Activity<ProMatchScoreAttributes>) {
    tokens?.cancel()
    states?.cancel()
    tokens = Task { [weak self] in
      for await token in activity.pushTokenUpdates {
        self?.sendEvent("onPinChange", ["pin": activity.attributes.pin, "token": Self.hex(token)])
      }
    }
    states = Task { [weak self] in
      for await state in activity.activityStateUpdates where state == .ended || state == .dismissed {
        self?.sendEvent("onPinChange", ["pin": activity.attributes.pin, "ended": true])
        break
      }
    }
  }

  private static func hex(_ data: Data) -> String { data.map { String(format: "%02x", $0) }.joined() }
}
