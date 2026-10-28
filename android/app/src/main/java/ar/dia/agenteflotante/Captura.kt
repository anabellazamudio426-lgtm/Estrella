package ar.dia.agenteflotante

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.abs

/** Los ojos del agente: pantalla compartida con MediaProjection (con el permiso del sistema y el ícono de transmisión visible). */
class Captura(private val servicio: AgenteServicio) {

    private var proyeccion: MediaProjection? = null
    private var pantalla: VirtualDisplay? = null
    private var lector: ImageReader? = null
    private var ultima: Image? = null
    private var ultimoChico: IntArray? = null
    private val bloqueo = Object()
    private val hilo = HandlerThread("agente-ojos").apply { start() }
    private val h = Handler(hilo.looper)

    companion object {
        var esperando: CountDownLatch? = null
        var concedido = false
    }

    val activa get() = proyeccion != null

    /** Llamado por PermisoPantallaActivity cuando la persona acepta compartir pantalla. */
    fun iniciar(resultCode: Int, data: Intent) {
        servicio.ponerEnPrimerPlano(true)
        val mpm = servicio.getSystemService(MediaProjectionManager::class.java)
        val p = mpm.getMediaProjection(resultCode, data) ?: return
        p.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() { detener() }
        }, h)
        val dm = servicio.resources.displayMetrics
        val escala = if (maxOf(dm.widthPixels, dm.heightPixels) > 1600) 0.5f else 0.75f
        val w = (dm.widthPixels * escala).toInt(); val hh = (dm.heightPixels * escala).toInt()
        val r = ImageReader.newInstance(w, hh, PixelFormat.RGBA_8888, 3)
        r.setOnImageAvailableListener({ lr ->
            val img = try { lr.acquireLatestImage() } catch (_: Exception) { null } ?: return@setOnImageAvailableListener
            synchronized(bloqueo) { ultima?.close(); ultima = img }
        }, h)
        pantalla = p.createVirtualDisplay("agente-ojos", w, hh, dm.densityDpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, h)
        lector = r
        proyeccion = p
    }

    fun detener() {
        synchronized(bloqueo) { try { ultima?.close() } catch (_: Exception) {}; ultima = null }
        try { pantalla?.release() } catch (_: Exception) {}
        try { lector?.close() } catch (_: Exception) {}
        try { proyeccion?.stop() } catch (_: Exception) {}
        pantalla = null; lector = null; proyeccion = null
        try { servicio.ponerEnPrimerPlano(false) } catch (_: Exception) {}
    }

    /** Devuelve {jpeg, ancho, alto, cambio, ventanas:[]} o {error}. Corre en un hilo de fondo. */
    fun mirar(max: Int, comparar: Boolean, silencioso: Boolean): String {
        if (!activa) {
            if (silencioso) return JSONObject().put("error", "sin_permiso").toString()
            val latch = CountDownLatch(1); esperando = latch; concedido = false
            servicio.startActivity(Intent(servicio, PermisoPantallaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            latch.await(90, TimeUnit.SECONDS)
            if (!concedido || !activa) return JSONObject().put("error", "No me diste permiso para mirar la pantalla.").toString()
            Thread.sleep(700)
        }
        var bmp: Bitmap? = null
        for (i in 0 until 10) {
            bmp = synchronized(bloqueo) { ultima?.let { aBitmap(it) } }
            if (bmp != null) break
            Thread.sleep(150)
        }
        if (bmp == null) return JSONObject().put("error", "Todavía no llegó la imagen de la pantalla, probá de nuevo.").toString()
        val k = minOf(1f, max.toFloat() / maxOf(bmp.width, bmp.height))
        val fin = if (k < 1f) Bitmap.createScaledBitmap(bmp, (bmp.width * k).toInt(), (bmp.height * k).toInt(), true) else bmp
        var cambio = 1.0
        if (comparar) {
            val chico = Bitmap.createScaledBitmap(fin, 48, (48f * fin.height / fin.width).toInt().coerceAtLeast(1), true)
            val px = IntArray(chico.width * chico.height); chico.getPixels(px, 0, chico.width, 0, 0, chico.width, chico.height)
            val prev = ultimoChico
            if (prev != null && prev.size == px.size) {
                var dif = 0
                for (i in px.indices) {
                    val a = ((px[i] shr 16 and 255) + (px[i] shr 8 and 255) + (px[i] and 255)) / 3
                    val b = ((prev[i] shr 16 and 255) + (prev[i] shr 8 and 255) + (prev[i] and 255)) / 3
                    if (abs(a - b) > 18) dif++
                }
                cambio = dif.toDouble() / px.size
            }
            ultimoChico = px
        }
        val out = ByteArrayOutputStream()
        fin.compress(Bitmap.CompressFormat.JPEG, 72, out)
        return JSONObject()
            .put("jpeg", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP))
            .put("ancho", fin.width).put("alto", fin.height).put("cambio", cambio)
            .put("ventanas", JSONArray()).toString()
    }

    private fun aBitmap(img: Image): Bitmap {
        val plano = img.planes[0]
        val buf = plano.buffer.duplicate(); buf.rewind()
        val paso = plano.pixelStride; val fila = plano.rowStride
        val anchoFila = fila / paso
        val b = Bitmap.createBitmap(anchoFila, img.height, Bitmap.Config.ARGB_8888)
        b.copyPixelsFromBuffer(buf)
        return if (anchoFila != img.width) Bitmap.createBitmap(b, 0, 0, img.width, img.height) else b
    }
}
