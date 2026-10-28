package ar.dia.agenteflotante

import android.util.Base64
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Llamadas HTTP a Claude y a ElevenLabs. Las claves quedan en el teléfono. */
object Red {
    private fun post(url: String, cuerpo: String, cabeceras: Map<String, String>): Pair<Int, ByteArray> {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = "POST"
        c.connectTimeout = 20000
        c.readTimeout = 120000
        c.doOutput = true
        cabeceras.forEach { (k, v) -> c.setRequestProperty(k, v) }
        c.outputStream.use { it.write(cuerpo.toByteArray(Charsets.UTF_8)) }
        val code = c.responseCode
        val bytes = (if (code in 200..299) c.inputStream else c.errorStream)?.use { it.readBytes() } ?: ByteArray(0)
        c.disconnect()
        return code to bytes
    }

    fun claude(clave: String, cuerpo: String): String {
        if (clave.isEmpty()) return JSONObject().put("error", "sin_clave").toString()
        return try {
            val (code, b) = post("https://api.anthropic.com/v1/messages", cuerpo, mapOf(
                "content-type" to "application/json", "x-api-key" to clave, "anthropic-version" to "2023-06-01"))
            val txt = String(b, Charsets.UTF_8)
            if (code in 200..299) txt else {
                val msg = try { JSONObject(txt).optJSONObject("error")?.optString("message") } catch (_: Exception) { null }
                JSONObject().put("error", msg ?: "HTTP $code").put("status", code).toString()
            }
        } catch (e: IOException) {
            JSONObject().put("error", "sin_conexion").put("detalle", e.message).toString()
        }
    }

    fun voz(clave: String, texto: String, vozId: String): String {
        if (clave.isEmpty() || vozId.isEmpty()) return JSONObject().put("error", "sin_clave").toString()
        return try {
            val cuerpo = JSONObject().put("text", texto.take(900)).put("model_id", "eleven_flash_v2_5").put("language_code", "es").toString()
            val (code, b) = post("https://api.elevenlabs.io/v1/text-to-speech/$vozId?output_format=mp3_44100_64", cuerpo, mapOf(
                "content-type" to "application/json", "xi-api-key" to clave, "accept" to "audio/mpeg"))
            if (code in 200..299) JSONObject().put("mp3", Base64.encodeToString(b, Base64.NO_WRAP)).toString()
            else JSONObject().put("error", "HTTP $code").toString()
        } catch (e: IOException) {
            JSONObject().put("error", "sin_conexion").toString()
        }
    }
}
