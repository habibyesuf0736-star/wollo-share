package com.wolloshare.app;

import android.app.DownloadManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

/**
 * The phone surface hands files to the browser the same way the website does, and a stock
 * WebView quietly drops that hand-off. Catching it here is what makes a download actually
 * land in the device's Downloads folder.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView view = getBridge().getWebView();
        view.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            if (url.startsWith("http")) {
                saveWithDownloadManager(url, fileName, userAgent);
            } else {
                Toast.makeText(this, "Open this file from the website", Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void saveWithDownloadManager(String url, String fileName, String userAgent) {
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle(fileName);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            if (userAgent != null && !userAgent.isEmpty()) {
                request.addRequestHeader("User-Agent", userAgent);
            }
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            manager.enqueue(request);
            Toast.makeText(this, "Saving " + fileName, Toast.LENGTH_SHORT).show();
        } catch (IllegalArgumentException error) {
            Toast.makeText(this, "That link is not a file", Toast.LENGTH_SHORT).show();
        }
    }
}
