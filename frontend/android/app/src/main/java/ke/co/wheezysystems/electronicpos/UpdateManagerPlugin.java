package ke.co.wheezysystems.electronicpos;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "UpdateManager")
public class UpdateManagerPlugin extends Plugin {
    @PluginMethod
    public void getAppVersion(PluginCall call) {
        try {
            android.content.pm.PackageInfo packageInfo =
                getContext().getPackageManager().getPackageInfo(
                    getContext().getPackageName(),
                    0
                );
            com.getcapacitor.JSObject result = new com.getcapacitor.JSObject();
            result.put("version", packageInfo.versionName);
            result.put("versionCode", packageInfo.versionCode);
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Unable to read the application version.", exception);
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String downloadUrl = call.getString("downloadUrl");
        if (downloadUrl == null || downloadUrl.trim().isEmpty()) {
            call.reject("An APK download URL is required.");
            return;
        }

        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(downloadUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.connect();

                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    throw new IllegalStateException(
                        "APK server returned HTTP " + status
                    );
                }

                File directory = new File(getContext().getCacheDir(), "updates");
                if (!directory.exists() && !directory.mkdirs()) {
                    throw new IllegalStateException("Unable to create update cache.");
                }
                File apk = new File(directory, "electronics-pos-update.apk");
                if (apk.exists() && !apk.delete()) {
                    throw new IllegalStateException("Unable to replace the old update.");
                }

                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(apk)) {
                    byte[] buffer = new byte[8192];
                    int bytesRead;
                    while ((bytesRead = input.read(buffer)) != -1) {
                        output.write(buffer, 0, bytesRead);
                    }
                }

                Uri contentUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apk
                );
                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(
                    contentUri,
                    "application/vnd.android.package-archive"
                );
                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                getActivity().runOnUiThread(() -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        && !getContext().getPackageManager()
                            .canRequestPackageInstalls()) {
                        Intent settingsIntent = new Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + getContext().getPackageName())
                        );
                        settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        getContext().startActivity(settingsIntent);
                        call.reject(
                            "Allow installation from unknown apps, then try Update Now again."
                        );
                        return;
                    }
                    getContext().startActivity(installIntent);
                    call.resolve();
                });
            } catch (Exception exception) {
                call.reject("APK download failed: " + exception.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "pos-apk-updater").start();
    }
}
