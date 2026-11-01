package com.example.wolloshare

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Message
import android.provider.MediaStore
import android.util.Base64
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

/**
 * The phone surface IS the website's /mobile.html: same origin, same /api/* routes, so the app
 * reads and writes the same server state as the browser. Nothing about courses, accounts or
 * download rules is duplicated here.
 */
class PhoneShellActivity : ComponentActivity() {

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url.toString()
                    if (url.startsWith(SITE_ORIGIN)) return false
                    openExternally(url)
                    return true
                }
            }
            // The site opens cross-origin links in a new window; without this the tap does nothing.
            webChromeClient = object : WebChromeClient() {
                override fun onCreateWindow(
                    view: WebView,
                    isDialog: Boolean,
                    isUserGesture: Boolean,
                    resultMsg: Message?
                ): Boolean {
                    val popup = WebView(view.context).apply {
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(
                                popupView: WebView,
                                request: WebResourceRequest
                            ): Boolean {
                                openExternally(request.url.toString())
                                return true
                            }
                        }
                        setDownloadListener { url, agent, disposition, mime, _ ->
                            queueDownload(url, URLUtil.guessFileName(url, disposition, mime), agent)
                        }
                    }
                    (resultMsg?.obj as? WebView.WebViewTransport)?.webView = popup
                    resultMsg?.sendToTarget()
                    return true
                }
            }
            setDownloadListener { url, agent, disposition, mime, _ ->
                val fileName = URLUtil.guessFileName(url, disposition, mime)
                when {
                    url.startsWith("http") -> queueDownload(url, fileName, agent)
                    url.startsWith("data:") -> saveInlineFile(url, fileName)
                    else -> openExternally(url)
                }
            }
        }

        setContentView(web)
        web.loadUrl(APP_URL)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack()
                else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    private fun queueDownload(url: String, fileName: String, userAgent: String?) {
        val request = DownloadManager.Request(Uri.parse(url)).apply {
            setTitle(fileName)
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
            if (!userAgent.isNullOrBlank()) addRequestHeader("User-Agent", userAgent)
        }
        val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        try {
            manager.enqueue(request)
        } catch (_: IllegalStateException) {
            toast("No app can save $fileName")
        }
    }

    /** A generated file reaches the WebView as a data: URI, which DownloadManager cannot read. */
    private fun saveInlineFile(url: String, fileName: String) {
        val comma = url.indexOf(',')
        if (comma < 0) return
        val meta = url.substring(0, comma)
        val body = url.substring(comma + 1)
        val bytes = if (meta.contains(";base64")) Base64.decode(body, Base64.DEFAULT)
        else Uri.decode(body).toByteArray()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                put(MediaStore.Downloads.MIME_TYPE, meta.substringAfter(':').substringBefore(';'))
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            }
            val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            if (uri != null) {
                contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                toast("Saved to Downloads")
                return
            }
        }
        getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)?.let {
            java.io.File(it, fileName).writeBytes(bytes)
        }
        toast("Saved in the app folder")
    }

    private fun openExternally(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: ActivityNotFoundException) {
            toast("Nothing on this phone opens that link")
        }
    }

    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()

    private companion object {
        const val APP_URL = "https://wollo-share.vercel.app/mobile.html"
        const val SITE_ORIGIN = "https://wollo-share.vercel.app"
    }
}
