package ke.co.wheezysystems.electronicpos;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.OutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
    name = "BluetoothPrinter",
    permissions = {
        @Permission(
            alias = "bluetoothConnect",
            strings = { Manifest.permission.BLUETOOTH_CONNECT }
        )
    }
)
public class BluetoothPrinterPlugin extends Plugin {
    private static final String TAG = "BluetoothPrinter";
    private static final UUID SERIAL_PORT_PROFILE_UUID =
        UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    @PluginMethod
    public void getPairedDevices(PluginCall call) {
        if (needsBluetoothPermission()) {
            requestPermissionForAlias(
                "bluetoothConnect",
                call,
                "getPairedDevicesPermissionCallback"
            );
            return;
        }

        try {
            BluetoothAdapter adapter = getBluetoothAdapter();
            if (adapter == null) {
                call.reject("This device does not support Bluetooth.");
                return;
            }
            if (!adapter.isEnabled()) {
                call.reject("Turn on Bluetooth and pair a printer in Android settings.");
                return;
            }

            JSArray devices = new JSArray();
            Set<BluetoothDevice> pairedDevices = adapter.getBondedDevices();
            for (BluetoothDevice device : pairedDevices) {
                JSObject pairedDevice = new JSObject();
                pairedDevice.put("name", device.getName());
                pairedDevice.put("address", device.getAddress());
                devices.put(pairedDevice);
            }

            JSObject result = new JSObject();
            result.put("devices", devices);
            call.resolve(result);
        } catch (SecurityException exception) {
            call.reject("Bluetooth permission is required to list paired printers.");
        }
    }

    @PermissionCallback
    private void getPairedDevicesPermissionCallback(PluginCall call) {
        if (needsBluetoothPermission()) {
            call.reject("Bluetooth permission is required to list paired printers.");
            return;
        }
        getPairedDevices(call);
    }

    @PluginMethod
    public void printReceipt(PluginCall call) {
        if (needsBluetoothPermission()) {
            requestPermissionForAlias(
                "bluetoothConnect",
                call,
                "printReceiptPermissionCallback"
            );
            return;
        }

        String address = call.getString("address");
        String text = call.getString("text");
        if (address == null || text == null) {
            call.reject("A paired printer address and receipt text are required.");
            return;
        }

        new Thread(() -> printToPrinter(call, address, text), "pos-bt-receipt").start();
    }

    @PermissionCallback
    private void printReceiptPermissionCallback(PluginCall call) {
        if (needsBluetoothPermission()) {
            call.reject("Bluetooth permission is required to print receipts.");
            return;
        }
        printReceipt(call);
    }

    private boolean needsBluetoothPermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && getPermissionState("bluetoothConnect") != PermissionState.GRANTED;
    }

    private BluetoothAdapter getBluetoothAdapter() {
        BluetoothManager manager = (BluetoothManager)
            getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return manager == null ? null : manager.getAdapter();
    }

    private void printToPrinter(PluginCall call, String address, String text) {
        BluetoothSocket socket = null;
        try {
            BluetoothAdapter adapter = getBluetoothAdapter();
            if (adapter == null || !adapter.isEnabled()) {
                call.reject("Turn on Bluetooth before printing.");
                return;
            }

            BluetoothDevice device = adapter.getRemoteDevice(address);
            socket = device.createRfcommSocketToServiceRecord(
                SERIAL_PORT_PROFILE_UUID
            );
            socket.connect();

            OutputStream output = socket.getOutputStream();
            output.write(new byte[] { 0x1B, 0x40 });
            String logoBase64 = call.getString("logoBase64");
            if (logoBase64 != null && !logoBase64.isEmpty()) {
                output.write(new byte[] { 0x1B, 0x61, 0x01 });
                writeRasterLogo(output, logoBase64);
                output.write(new byte[] { 0x0A, 0x1B, 0x61, 0x00 });
            }
            output.write(text.getBytes(StandardCharsets.UTF_8));
            String qrBase64 = call.getString("qrBase64");
            if (qrBase64 != null && !qrBase64.isEmpty()) {
                output.write(new byte[] { 0x0A, 0x1B, 0x61, 0x01 });
                writeRasterLogo(output, qrBase64);
                output.write(new byte[] { 0x0A, 0x1B, 0x61, 0x00 });
            }
            output.write(new byte[] { 0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x00 });
            output.flush();
            call.resolve();
        } catch (IOException | SecurityException | IllegalArgumentException exception) {
            call.reject("Bluetooth receipt printing failed: " + exception.getMessage());
        } finally {
            if (socket != null) {
                try {
                    socket.close();
                } catch (IOException exception) {
                    Log.w(TAG, "Unable to close the Bluetooth printer connection.", exception);
                }
            }
        }
    }

    private void writeRasterLogo(OutputStream output, String logoBase64)
        throws IOException {
        byte[] imageBytes = Base64.decode(logoBase64, Base64.DEFAULT);
        Bitmap source = BitmapFactory.decodeByteArray(
            imageBytes,
            0,
            imageBytes.length
        );
        if (source == null) {
            throw new IllegalArgumentException("The receipt logo image is invalid.");
        }

        Bitmap bitmap = source;
        if (source.getWidth() > 384) {
            int height = Math.round(source.getHeight() * (384f / source.getWidth()));
            bitmap = Bitmap.createScaledBitmap(source, 384, height, true);
            source.recycle();
        }

        try {
            int width = bitmap.getWidth();
            int height = bitmap.getHeight();
            int bytesPerRow = (width + 7) / 8;
            output.write(new byte[] {
                0x1D,
                0x76,
                0x30,
                0x00,
                (byte) (bytesPerRow & 0xFF),
                (byte) ((bytesPerRow >> 8) & 0xFF),
                (byte) (height & 0xFF),
                (byte) ((height >> 8) & 0xFF),
            });

            byte[] row = new byte[bytesPerRow];
            for (int y = 0; y < height; y++) {
                java.util.Arrays.fill(row, (byte) 0);
                for (int x = 0; x < width; x++) {
                    int color = bitmap.getPixel(x, y);
                    int luminance = (
                        299 * Color.red(color)
                        + 587 * Color.green(color)
                        + 114 * Color.blue(color)
                    ) / 1000;
                    if (Color.alpha(color) >= 128 && luminance < 180) {
                        row[x / 8] |= (byte) (0x80 >> (x % 8));
                    }
                }
                output.write(row);
            }
        } finally {
            bitmap.recycle();
        }
    }
}
