package com.fourmpadel.livescores

import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

class LiveScoreMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    if (message.data["type"] != "pro_live_score") {
      // Expo still owns all other notifications, listeners, token changes and deletion callbacks.
      super.onMessageReceived(message)
      return
    }
    val pin = message.data["pin"] ?: return
    val match = message.data["match"]?.toIntOrNull() ?: return
    val score = message.data["score"] ?: return
    LiveScoreNotifications.receive(this, pin, match, score)
  }
}
