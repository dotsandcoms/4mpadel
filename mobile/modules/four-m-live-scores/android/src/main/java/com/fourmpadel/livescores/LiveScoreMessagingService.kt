package com.fourmpadel.livescores

import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import org.json.JSONObject

class LiveScoreMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    val body = message.data["body"]?.takeIf { it.length <= 4096 }
      ?.let { runCatching { JSONObject(it) }.getOrNull() }
    if (body?.optString("type") != "pro_live_score") {
      // Expo still owns all other notifications, listeners, token changes and deletion callbacks.
      super.onMessageReceived(message)
      return
    }
    val pin = body.optString("pin")
    val match = body.optInt("match")
    val score = body.optJSONObject("score") ?: return
    LiveScoreNotifications.receive(this, pin, match, score.toString())
  }
}
