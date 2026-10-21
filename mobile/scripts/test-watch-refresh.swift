import Foundation

@main
enum WatchRefreshTests {
  static func main() {
    var state = WatchRefreshState()
    assert(state.begin(canReachPhone: false) == nil)
    assert(!state.isRefreshing && state.message.contains("Open 4M"))

    let emptyRequest = state.begin(canReachPhone: true)!
    assert(state.isRefreshing)
    assert(state.begin(canReachPhone: true) == nil, "Ignore repeated refresh taps")
    state.finish(emptyRequest, outcome: .emptyReply)
    assert(!state.isRefreshing && !state.message.contains("Checking"))
    assert(state.message.contains("sync your schedule"))

    let successfulRequest = state.begin(canReachPhone: true)!
    state.receivedSnapshot()
    state.finish(successfulRequest, outcome: .unavailable)
    assert(!state.isRefreshing && state.message.isEmpty, "Ignore a late error/timeout after sync")

    let timedOutRequest = state.begin(canReachPhone: true)!
    state.finish(timedOutRequest, outcome: .unavailable)
    assert(!state.isRefreshing && state.message.contains("try again"))
    let retry = state.begin(canReachPhone: true)!
    state.finish(timedOutRequest, outcome: .emptyReply)
    assert(state.requestID == retry && state.message == "Checking iPhone…", "An old callback must not finish a retry")
    state.receivedSnapshot()
    assert(!state.isRefreshing && state.message.isEmpty)

    assert(ScheduleStore.decode("") == nil)
    assert(ScheduleStore.decode("not json") == nil)
    assert(ScheduleStore.decode("{\"version\":2,\"updatedAt\":1,\"signedIn\":true,\"items\":[]}") == nil)
    let signedOut = ScheduleStore.decode("{\"version\":1,\"updatedAt\":2,\"signedIn\":false,\"items\":[]}")
    assert(signedOut != nil && signedOut?.signedIn == false, "Sign-out snapshots are valid replies")
    let oldReply = ScheduleStore.decode("{\"version\":1,\"updatedAt\":1,\"signedIn\":true,\"items\":[]}")
    assert(oldReply != nil, "An older valid snapshot can finish refresh without replacing newer storage")
    print("Watch refresh checks passed: unreachable phone, duplicate taps, empty reply, success, timeout, retry, late callbacks, and snapshot validation.")
  }
}
