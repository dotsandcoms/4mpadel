package com.fourmpadel.livescores

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FourMLiveScoresModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FourMLiveScores")
    Events("onPinChange")
    AsyncFunction("availability") { LiveScoreNotifications.availability(requireNotNull(appContext.reactContext)) }
    AsyncFunction("current") { LiveScoreNotifications.current(requireNotNull(appContext.reactContext)) }
    AsyncFunction("start") { pin: String, match: Int, score: String, stopKey: String, endpoint: String ->
      LiveScoreNotifications.start(requireNotNull(appContext.reactContext), pin, match, score, stopKey, endpoint)
    }
    AsyncFunction("stop") { pin: String -> LiveScoreNotifications.stop(requireNotNull(appContext.reactContext), pin) }
  }
}
