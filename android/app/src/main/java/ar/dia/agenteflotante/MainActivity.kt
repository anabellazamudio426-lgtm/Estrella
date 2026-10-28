package ar.dia.agenteflotante

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

/** Pantalla de inicio: pide los permisos de a uno y enciende al agente. */
class MainActivity : Activity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.parseColor("#0B1612")
        window.navigationBarColor = Color.parseColor("#0B1612")
        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#0B1612"))
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = true
        web.webViewClient = WebViewClient()
        web.addJavascriptInterface(Inicio(), "AgenteInicio")
        setContentView(web)
        web.loadUrl("file:///android_asset/inicio.html")
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) web.evaluateJavascript("window.refrescar && refrescar()", null)
    }

    private fun puedeFlotar() = Settings.canDrawOverlays(this)
    private fun tieneNotif() = Build.VERSION.SDK_INT < 33 || checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    private fun tieneMic() = checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        web.evaluateJavascript("window.refrescar && refrescar()", null)
    }

    inner class Inicio {
        @JavascriptInterface
        fun estado(): String = JSONObject()
            .put("flotar", puedeFlotar()).put("notif", tieneNotif()).put("mic", tieneMic())
            .put("activo", AgenteServicio.activo()).toString()

        @JavascriptInterface
        fun pedirFlotar() = runOnUiThread {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        }

        @JavascriptInterface
        fun pedirNotif() = runOnUiThread {
            if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
        }

        @JavascriptInterface
        fun pedirMic() = runOnUiThread { requestPermissions(arrayOf(android.Manifest.permission.RECORD_AUDIO), 2) }

        @JavascriptInterface
        fun encender() = runOnUiThread {
            if (!puedeFlotar()) { pedirFlotar(); return@runOnUiThread }
            startForegroundService(Intent(this@MainActivity, AgenteServicio::class.java))
            web.postDelayed({ web.evaluateJavascript("refrescar()", null); moveTaskToBack(true) }, 600)
        }

        @JavascriptInterface
        fun apagar() = runOnUiThread {
            stopService(Intent(this@MainActivity, AgenteServicio::class.java))
            web.postDelayed({ web.evaluateJavascript("refrescar()", null) }, 400)
        }
    }
}
