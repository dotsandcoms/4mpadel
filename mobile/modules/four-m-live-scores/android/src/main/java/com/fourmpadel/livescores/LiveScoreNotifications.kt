package com.fourmpadel.livescores

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

internal object LiveScoreNotifications {
  private const val channel = "pro-live-scores"
  private const val notificationId = 6041
  private const val preferenceName = "fourm_live_score"
  private fun store(context: Context) = context.getSharedPreferences(preferenceName, Context.MODE_PRIVATE)
  private fun manager(context: Context) = context.getSystemService(NotificationManager::class.java)

  fun availability(context: Context): String {
    if (Build.VERSION.SDK_INT >= 26) {
      manager(context).createNotificationChannel(NotificationChannel(channel, "Live match scores", NotificationManager.IMPORTANCE_LOW))
    }
    if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      return "permission"
    }
    val channelEnabled = Build.VERSION.SDK_INT < 26 || manager(context).getNotificationChannel(channel)?.importance != NotificationManager.IMPORTANCE_NONE
    return if (manager(context).areNotificationsEnabled() && channelEnabled) {
      "ready"
    } else "disabled"
  }

  @Synchronized fun current(context: Context): Map<String, Any>? {
    val preferences = store(context)
    val pin = preferences.getString("pin", null) ?: return null
    return mapOf("pin" to pin, "match" to preferences.getInt("match", 0))
  }

  @Synchronized fun start(context: Context, pin: String, match: Int, body: String, stopKey: String, endpoint: String) {
    check(availability(context) == "ready") { "Live score notifications are disabled." }
    val score = JSONObject(body)
    val now = System.currentTimeMillis() / 1000
    check(score.optString("status") == "live" && score.optLong("freshUntil") > now) { "Live score is unavailable." }
    store(context).edit().putString("pin", pin).putString("shown", pin).putInt("match", match)
      .putString("stopKey", stopKey).putString("endpoint", endpoint).putLong("timestamp", score.optLong("timestamp")).commit()
    post(context, pin, match, score)
  }

  @Synchronized fun receive(context: Context, pin: String, match: Int, body: String) {
    val preferences = store(context)
    if (pin != preferences.getString("pin", null) || match != preferences.getInt("match", 0) || body.length > 3000) return
    val score = runCatching { JSONObject(body) }.getOrNull() ?: return
    val status = score.optString("status")
    val timestamp = score.optLong("timestamp", -1)
    val now = System.currentTimeMillis() / 1000
    if (timestamp < preferences.getLong("timestamp", 0) || timestamp > now + 60 || now - timestamp >= 300) return
    if (status != "live" && status != "final" || status == "live" && score.optLong("freshUntil") <= now) return
    preferences.edit().putLong("timestamp", timestamp).apply()
    if (status == "final") preferences.edit().remove("pin").apply()
    if (availability(context) != "ready") return
    runCatching { post(context, pin, match, score) }
  }

  @Synchronized fun stop(context: Context, pin: String) {
    val preferences = store(context)
    if (preferences.getString("shown", null) != pin) return
    preferences.edit().clear().commit()
    manager(context).cancel(notificationId)
  }

  @Synchronized fun unpin(context: Context, pin: String) {
    val preferences = store(context)
    if (preferences.getString("pin", null) != pin) return
    val key = preferences.getString("stopKey", null)
    val endpoint = preferences.getString("endpoint", null)
    stop(context, pin)
    if (key == null || endpoint == null) return
    val work = OneTimeWorkRequest.Builder(StopLiveScoreWorker::class.java)
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setInputData(workDataOf("pin" to pin, "stopKey" to key, "endpoint" to endpoint)).build()
    WorkManager.getInstance(context).enqueueUniqueWork("unpin-live-score-$pin", ExistingWorkPolicy.KEEP, work)
  }

  private fun pair(values: JSONArray?): String? {
    if (values == null || values.length() != 2) return null
    val first = values.optInt(0, -1)
    val second = values.optInt(1, -1)
    return if (first in 0..99 && second in 0..99) "$first–$second" else null
  }

  private fun post(context: Context, pin: String, match: Int, score: JSONObject) {
    val final = score.optString("status") == "final"
    val games = pair(score.optJSONArray("games"))
    val sets = score.optJSONArray("sets") ?: JSONArray()
    val finishedSets = (0 until sets.length().coerceAtMost(5)).mapNotNull { pair(sets.optJSONArray(it)) }
    val teams = score.optJSONArray("teams") ?: return
    val title = "${teams.optString(0, "Pair")} vs ${teams.optString(1, "Pair")}"
    val detail = (finishedSets + listOfNotNull(if (final) null else games?.let { "Games $it" })).joinToString(" · ")
    val summary = if (final) "Final score" else games?.let { "Games $it" } ?: "Live match"
    val expanded = if (detail.isBlank()) summary else if (final) "Final · $detail" else detail
    val matchLink = Intent(Intent.ACTION_VIEW, Uri.parse("fourmpadel://pro/match/$match")).setPackage(context.packageName)
    val open = PendingIntent.getActivity(context, notificationId, matchLink, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val remove = PendingIntent.getBroadcast(context, notificationId,
      Intent(context, UnpinLiveScoreReceiver::class.java).putExtra("pin", pin).setData(Uri.parse("fourmpadel://unpin/$pin")),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val remaining = ((score.optLong("freshUntil") * 1000) - System.currentTimeMillis()).coerceAtLeast(1)
    val notification = NotificationCompat.Builder(context, channel)
      .setSmallIcon(R.drawable.ic_live_score)
      .setContentTitle(title)
      .setContentText(expanded)
      .setStyle(NotificationCompat.BigTextStyle().bigText(expanded))
      .setContentIntent(open)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setOngoing(!final)
      .setTimeoutAfter(if (final) 300_000 else remaining)
    if (!final) {
      notification.addAction(0, "Unpin", remove).setDeleteIntent(remove)
      if (Build.VERSION.SDK_INT >= 36 && manager(context).canPostPromotedNotifications()) {
        notification.setRequestPromotedOngoing(true)
        if (games != null) notification.setShortCriticalText(games)
      }
    }
    manager(context).notify(notificationId, notification.build())
  }
}

class UnpinLiveScoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    intent.getStringExtra("pin")?.let { LiveScoreNotifications.unpin(context, it) }
  }
}

class StopLiveScoreWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val endpoint = inputData.getString("endpoint") ?: return Result.failure()
    val pin = inputData.getString("pin") ?: return Result.failure()
    val stopKey = inputData.getString("stopKey") ?: return Result.failure()
    if (runCatching { UUID.fromString(pin) }.isFailure || !stopKey.matches(Regex("[a-f0-9]{64}"))) return Result.failure()
    val url = runCatching { URL(endpoint) }.getOrNull() ?: return Result.failure()
    if (url.protocol != "https" || url.path != "/functions/v1/pro-live-score-pin" || url.userInfo != null) return Result.failure()
    val request = url.openConnection() as HttpURLConnection
    return try {
      request.instanceFollowRedirects = false
      request.connectTimeout = 7000
      request.readTimeout = 7000
      request.requestMethod = "POST"
      request.setRequestProperty("Content-Type", "application/json")
      request.doOutput = true
      val body = JSONObject().put("action", "revoke").put("pin", pin).put("stopKey", stopKey)
      request.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
      when (request.responseCode) {
        in 200..299 -> Result.success()
        429, in 500..599 -> Result.retry()
        else -> Result.failure()
      }
    } catch (_: java.io.IOException) {
      if (runAttemptCount >= 8) Result.failure() else Result.retry()
    } finally {
      request.disconnect()
    }
  }
}
