import Foundation

// Correlate replies/errors/timeouts so an old request cannot overwrite a later sync.
struct WatchRefreshState {
  enum Outcome { case emptyReply, unavailable }
  private(set) var requestID: UUID?
  private(set) var message = ""
  var isRefreshing: Bool { requestID != nil }

  mutating func begin(canReachPhone: Bool) -> UUID? {
    guard !isRefreshing else { return nil }
    guard canReachPhone else {
      message = "Open 4M on your iPhone to refresh."
      return nil
    }
    let id = UUID()
    requestID = id
    message = "Checking iPhone…"
    return id
  }

  mutating func finish(_ id: UUID, outcome: Outcome) {
    guard requestID == id else { return }
    requestID = nil
    switch outcome {
    case .emptyReply: message = "Open 4M on iPhone to sync your schedule."
    case .unavailable: message = "Couldn’t reach iPhone. Open 4M on iPhone and try again."
    }
  }

  mutating func receivedSnapshot() {
    requestID = nil
    message = ""
  }
}
