import ActivityKit
import SwiftUI
import WidgetKit

// This Codable contract is shared with FourMLiveScoresModule and the APNs score payload.
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

struct ProLiveScoreWidget: Widget {
  private let accent = Color(red: 0.56, green: 0.79, blue: 0.35)
  typealias MatchContext = ActivityViewContext<ProMatchScoreAttributes>

  var body: some WidgetConfiguration {
    ActivityConfiguration(for: ProMatchScoreAttributes.self) { context in
      VStack(alignment: .leading, spacing: 8) {
        HStack {
          Label("4M Padel", systemImage: "figure.tennis")
            .font(.caption.weight(.semibold))
            .foregroundStyle(accent)
          Spacer(minLength: 8)
          status(context)
        }
        scoreboard(context)
      }
      .padding(16)
      .activityBackgroundTint(Color(red: 0.07, green: 0.12, blue: 0.09))
      .activitySystemActionForegroundColor(.white)
      .widgetURL(url(context.attributes.match))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label("4M Padel", systemImage: "figure.tennis")
            .font(.caption.weight(.semibold))
            .foregroundStyle(accent)
        }
        DynamicIslandExpandedRegion(.trailing) { status(context) }
        DynamicIslandExpandedRegion(.bottom) {
          scoreboard(context).padding(.top, 3)
        }
      } compactLeading: {
        Image(systemName: "figure.tennis").foregroundStyle(accent).accessibilityLabel("4M Padel")
      } compactTrailing: {
        Text(compact(context)).font(.caption.monospacedDigit().weight(.bold))
          .foregroundStyle(context.isStale ? .secondary : .primary)
      } minimal: {
        Image(systemName: "figure.tennis").foregroundStyle(accent).accessibilityLabel("4M Padel live score")
      }
      .keylineTint(accent)
      .widgetURL(url(context.attributes.match))
    }
  }

  private func compact(_ context: MatchContext) -> String {
    if context.state.status == "final" { return "Final" }
    if context.isStale { return "Paused" }
    guard let games = context.state.games, games.count == 2 else { return "Live" }
    return "\(games[0])–\(games[1])"
  }

  private func status(_ context: MatchContext) -> some View {
    let label = context.state.status == "final" ? "FINAL" : context.isStale ? "UPDATES PAUSED" : "LIVE"
    return Text(label).font(.caption2.weight(.bold)).foregroundStyle(context.isStale ? .secondary : accent)
  }

  private func scoreboard(_ context: MatchContext) -> some View {
    let final = context.state.status == "final"
    let columns = context.state.sets + (final ? [] : (context.state.games.map { [$0] } ?? []))
    return VStack(alignment: .leading, spacing: 5) {
      ForEach(0..<2, id: \.self) { index in
        HStack(spacing: 9) {
          Text(context.state.teams.indices.contains(index) ? context.state.teams[index] : "Pair")
            .font(.footnote.weight(.semibold)).lineLimit(1)
          Spacer(minLength: 2)
          ForEach(columns.indices, id: \.self) { column in
            Text(columns[column].indices.contains(index) ? String(columns[column][index]) : "–")
              .font(.footnote.monospacedDigit().weight(.bold))
              .frame(minWidth: 16)
              .foregroundStyle(!final && column == columns.count - 1 ? accent : .white)
          }
        }
      }
      if !final && context.isStale {
        Text("Last confirmed score").font(.caption2).foregroundStyle(.secondary)
      }
    }
    .foregroundStyle(.white)
  }

  private func url(_ match: Int) -> URL? { URL(string: "fourmpadel://pro/match/\(match)") }
}
