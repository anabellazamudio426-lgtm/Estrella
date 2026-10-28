package ar.dia.agenteflotante

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Bundle
import android.webkit.WebChromeClient

/** Pide al sistema el permiso para mirar la pantalla y se lo pasa al servicio. */
class PermisoPantallaActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val mpm = getSystemService(MediaProjectionManager::class.java)
        @Suppress("DEPRECATION")
        startActivityForResult(mpm.createScreenCaptureIntent(), 7)
    }

    @Deprecated("API de Activity")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        val s = AgenteServicio.instancia
        if (resultCode == RESULT_OK && data != null && s != null) {
            try { s.captura.iniciar(resultCode, data); Captura.concedido = true } catch (e: Exception) { Captura.concedido = false }
        } else Captura.concedido = false
        Captura.esperando?.countDown()
        finish()
    }
}

/** Abre el selector de archivos del teléfono. */
class ElegirArchivoActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val i = Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "*/*"
            addCategory(Intent.CATEGORY_OPENABLE)
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        @Suppress("DEPRECATION")
        try { startActivityForResult(Intent.createChooser(i, "Elegí un archivo"), 8) } catch (e: Exception) { terminar(null) }
    }

    @Deprecated("API de Activity")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        var uris: Array<Uri>? = null
        if (resultCode == RESULT_OK && data != null) {
            val clip = data.clipData
            uris = if (clip != null) Array(clip.itemCount) { clip.getItemAt(it).uri }
            else WebChromeClient.FileChooserParams.parseResult(resultCode, data) ?: data.data?.let { arrayOf(it) }
        }
        terminar(uris)
    }

    private fun terminar(uris: Array<Uri>?) {
        AgenteServicio.eligiendoArchivo?.onReceiveValue(uris)
        AgenteServicio.eligiendoArchivo = null
        finish()
    }
}

/** Pide el micrófono. */
class PermisoMicActivity : Activity() {
    companion object { var alTerminar: ((Boolean) -> Unit)? = null }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestPermissions(arrayOf(android.Manifest.permission.RECORD_AUDIO), 9)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val ok = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
        alTerminar?.invoke(ok); alTerminar = null
        finish()
    }
}
