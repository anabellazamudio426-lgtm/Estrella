package ar.dia.agenteflotante

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.view.Gravity
import android.view.MotionEvent
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.Executors

/** Servicio en primer plano: dibuja la isla del agente sobre las otras apps y le da ojos, voz y oído. */
class AgenteServicio : Service() {

    companion object {
        var instancia: AgenteServicio? = null
        var eligiendoArchivo: ValueCallback<Array<Uri>>? = null
        const val CANAL_FIJO = "agente_fijo"
        const val CANAL_AVISOS = "agente_avisos"
        const val NOTIF_ID = 1
        fun activo() = instancia != null
    }

    private val main = Handler(Looper.getMainLooper())
    private val hilos = Executors.newCachedThreadPool()
    private lateinit var wm: WindowManager
    private lateinit var web: WebView
    private lateinit var lp: WindowManager.LayoutParams
    private var tts: TextToSpeech? = null
    private var oido: SpeechRecognizer? = null
    val captura by lazy { Captura(this) }
    private var conProyeccion = false
    private val densidad get() = resources.displayMetrics.density

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instancia = this
        crearCanales()
        ponerEnPrimerPlano(false)
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        crearIsla()
        tts = TextToSpeech(this) { ok ->
            if (ok == TextToSpeech.SUCCESS) {
                val r = tts?.setLanguage(Locale("es", "AR"))
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts?.setLanguage(Locale("es"))
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "APAGAR" -> { stopSelf(); return START_NOT_STICKY }
            "MIRAR" -> accion("mirar")
            "CHAT" -> accion("chat")
        }
        return START_STICKY
    }

    override fun onDestroy() {
        instancia = null
        try { captura.detener() } catch (_: Exception) {}
        try { tts?.shutdown() } catch (_: Exception) {}
        try { oido?.destroy() } catch (_: Exception) {}
        try { wm.removeView(web) } catch (_: Exception) {}
        try { web.destroy() } catch (_: Exception) {}
        hilos.shutdownNow()
        super.onDestroy()
    }

    /* ---------------- notificación fija ---------------- */
    private fun crearCanales() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CANAL_FIJO, getString(R.string.app_name) + " flotando", NotificationManager.IMPORTANCE_MIN))
        nm.createNotificationChannel(NotificationChannel(CANAL_AVISOS, "Avisos de " + getString(R.string.app_name), NotificationManager.IMPORTANCE_HIGH))
    }

    private fun pi(accion: String, req: Int): PendingIntent =
        PendingIntent.getService(this, req, Intent(this, AgenteServicio::class.java).setAction(accion), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private fun notificacionFija(): Notification =
        Notification.Builder(this, CANAL_FIJO)
            .setSmallIcon(R.drawable.agente_cara)
            .setContentTitle(getString(R.string.app_name) + " está flotando")
            .setContentText(if (conProyeccion) "Puede mirar tu pantalla cuando se lo pedís" else "Tocá la isla de arriba para charlar")
            .setOngoing(true)
            .setContentIntent(pi("CHAT", 1))
            .addAction(Notification.Action.Builder(null, "Mirá mi pantalla", pi("MIRAR", 2)).build())
            .addAction(Notification.Action.Builder(null, "Apagar", pi("APAGAR", 3)).build())
            .build()

    fun ponerEnPrimerPlano(proyeccion: Boolean) {
        conProyeccion = proyeccion
        val n = notificacionFija()
        if (Build.VERSION.SDK_INT >= 34) {
            var tipo = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            if (proyeccion) tipo = tipo or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            startForeground(NOTIF_ID, n, tipo)
        } else if (Build.VERSION.SDK_INT >= 29 && proyeccion) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIF_ID, n)
        }
    }

    /* ---------------- la isla ---------------- */
    private fun altoBarra(): Int {
        val id = resources.getIdentifier("status_bar_height", "dimen", "android")
        return if (id > 0) resources.getDimensionPixelSize(id) else (24 * densidad).toInt()
    }

    @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
    private fun crearIsla() {
        web = WebView(this)
        web.setBackgroundColor(Color.TRANSPARENT)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            @Suppress("DEPRECATION") allowFileAccessFromFileURLs = true
            @Suppress("DEPRECATION") allowUniversalAccessFromFileURLs = true
            mediaPlaybackRequiresUserGesture = false
        }
        web.addJavascriptInterface(Puente(), "AgenteAndroid")
        web.webViewClient = WebViewClient()
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(v: WebView?, cb: ValueCallback<Array<Uri>>?, p: FileChooserParams?): Boolean {
                eligiendoArchivo?.onReceiveValue(null)
                eligiendoArchivo = cb
                startActivity(Intent(this@AgenteServicio, ElegirArchivoActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return true
            }
        }
        web.setOnTouchListener { _, ev ->
            if (ev.action == MotionEvent.ACTION_OUTSIDE) accion("afuera")
            false
        }
        lp = WindowManager.LayoutParams(
            ((300 + 12) * densidad).toInt(), ((56 + 12) * densidad).toInt(),
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH or WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = altoBarra() + (2 * densidad).toInt()
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN
        }
        wm.addView(web, lp)
        web.loadUrl("file:///android_asset/web/index.html")
    }

    private fun actualizar() { try { wm.updateViewLayout(web, lp) } catch (_: Exception) {} }

    fun accion(a: String): Boolean = main.post { web.evaluateJavascript("window.__agenteAccion && window.__agenteAccion(${JSONObject.quote(a)})", null) }

    private fun responder(id: String, json: String): Boolean = main.post {
        web.evaluateJavascript("window.__agenteResp(${JSONObject.quote(id)}, ${JSONObject.quote(json)})", null)
    }

    private fun voz(tipo: String, texto: String): Boolean = main.post {
        web.evaluateJavascript("window.__agenteVoz && window.__agenteVoz(${JSONObject.quote(tipo)}, ${JSONObject.quote(texto)})", null)
    }

    /* ---------------- oído ---------------- */
    fun empezarAEscuchar(): Boolean = main.post {
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            PermisoMicActivity.alTerminar = { ok -> if (ok) empezarAEscuchar() else voz("error", "") }
            startActivity(Intent(this, PermisoMicActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return@post
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { voz("error", ""); return@post }
        oido?.destroy()
        oido = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onResults(b: Bundle?) { voz("final", b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: "") }
                override fun onPartialResults(b: Bundle?) { b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { voz("parcial", it) } }
                override fun onError(error: Int) { voz("error", "") }
                override fun onReadyForSpeech(p: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rms: Float) {}
                override fun onBufferReceived(b: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onEvent(t: Int, p: Bundle?) {}
            })
            startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-AR")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            })
        }
    }

    /* ---------------- puente con la isla ---------------- */
    inner class Puente {
        private val prefs get() = getSharedPreferences("agente", Context.MODE_PRIVATE)
        private fun estadoClaves() = JSONObject()
            .put("claude", !prefs.getString("clave_claude", "").isNullOrEmpty())
            .put("eleven", !prefs.getString("clave_eleven", "").isNullOrEmpty()).toString()

        @JavascriptInterface
        fun tamano(w: Double, h: Double): Boolean = main.post {
            val ancho = resources.displayMetrics.widthPixels
            lp.width = if (w >= 9000) ancho else minOf(ancho, ((w + 12) * densidad).toInt())
            lp.height = minOf((resources.displayMetrics.heightPixels * 0.88).toInt(), ((h + 12) * densidad).toInt())
            actualizar()
        }

        @JavascriptInterface
        fun posicion(p: String): Boolean = main.post {
            lp.gravity = Gravity.TOP or when (p) { "izquierda" -> Gravity.START; "derecha" -> Gravity.END; else -> Gravity.CENTER_HORIZONTAL }
            actualizar()
        }

        @JavascriptInterface
        fun foco(si: Boolean): Boolean = main.post {
            lp.flags = if (si) lp.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE.inv()
            else lp.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
            actualizar()
            if (si) web.requestFocus()
        }

        @JavascriptInterface fun observando(si: Boolean) { /* el indicador lo muestra la isla */ }

        @JavascriptInterface
        fun notificar(titulo: String, cuerpo: String) {
            val n = Notification.Builder(this@AgenteServicio, CANAL_AVISOS)
                .setSmallIcon(R.drawable.agente_cara).setContentTitle(titulo).setContentText(cuerpo)
                .setStyle(Notification.BigTextStyle().bigText(cuerpo))
                .setAutoCancel(true).setContentIntent(pi("CHAT", 4)).build()
            try { getSystemService(NotificationManager::class.java).notify((System.currentTimeMillis() % 100000).toInt() + 10, n) } catch (_: Exception) {}
        }

        @JavascriptInterface
        fun hablar(texto: String) { tts?.speak(texto, TextToSpeech.QUEUE_FLUSH, null, "agente") }

        @JavascriptInterface
        fun callar() { tts?.stop() }

        @JavascriptInterface
        fun escuchar() { empezarAEscuchar() }

        @JavascriptInterface
        fun pedir(id: String, metodo: String, args: String) {
            hilos.execute {
                val r = try {
                    val a = if (args == "null" || args.isBlank()) JSONObject() else JSONObject(args)
                    when (metodo) {
                        "claude" -> Red.claude(prefs.getString("clave_claude", "") ?: "", args)
                        "voz" -> Red.voz(prefs.getString("clave_eleven", "") ?: "", a.optString("texto"), a.optString("vozId"))
                        "claveEstado" -> estadoClaves()
                        "claveGuardar" -> {
                            val k = if (a.optString("tipo") == "eleven") "clave_eleven" else "clave_claude"
                            prefs.edit().putString(k, a.optString("clave").trim()).apply()
                            estadoClaves()
                        }
                        "pantalla" -> captura.mirar(a.optInt("max", 1400), a.optBoolean("comparar", false), a.optBoolean("silencioso", false))
                        else -> JSONObject().put("error", "método desconocido").toString()
                    }
                } catch (e: Exception) {
                    JSONObject().put("error", e.message ?: "error").toString()
                }
                responder(id, r)
            }
        }
    }
}
