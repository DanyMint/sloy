package app.sloy.journal

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.annotation.Keep
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.PermissionState
import app.tauri.plugin.Plugin
import java.io.File

private const val LEGACY_STORAGE = "legacyStorage"
private const val ACCESS_DENIED = "Разрешите доступ к файлам или выберите другую папку."

@Keep
@TauriPlugin(permissions = [Permission(
    alias = LEGACY_STORAGE,
    strings = [Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE]
)])
class DefaultVaultPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun prepare(invoke: Invoke) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (Environment.isExternalStorageManager()) {
                createVault(invoke)
            } else {
                val intent = Intent(
                    Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                    Uri.fromParts("package", activity.packageName, null)
                )
                try {
                    startActivityForResult(invoke, intent, "onAllFilesAccess")
                } catch (_: android.content.ActivityNotFoundException) {
                    invoke.reject(ACCESS_DENIED)
                }
            }
        } else if (getPermissionState(LEGACY_STORAGE) == PermissionState.GRANTED) {
            createVault(invoke)
        } else {
            requestPermissionForAlias(LEGACY_STORAGE, invoke, "onLegacyStorageAccess")
        }
    }

    @ActivityCallback
    fun onAllFilesAccess(invoke: Invoke, @Suppress("UNUSED_PARAMETER") result: ActivityResult) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()) {
            createVault(invoke)
        } else {
            invoke.reject(ACCESS_DENIED)
        }
    }

    @PermissionCallback
    fun onLegacyStorageAccess(invoke: Invoke) {
        if (getPermissionState(LEGACY_STORAGE) == PermissionState.GRANTED) {
            createVault(invoke)
        } else {
            invoke.reject(ACCESS_DENIED)
        }
    }

    @Suppress("DEPRECATION")
    private fun createVault(invoke: Invoke) {
        val folder = File(Environment.getExternalStorageDirectory(), "Sloy")
        try {
            if (!folder.isDirectory && !folder.mkdirs() && !folder.isDirectory) {
                invoke.reject("Не удалось создать папку Sloy в корне внутреннего хранилища.")
                return
            }
            if (!folder.canRead() || !folder.canWrite()) {
                invoke.reject(ACCESS_DENIED)
                return
            }
            invoke.resolve(JSObject().apply { put("path", folder.absolutePath) })
        } catch (_: SecurityException) {
            invoke.reject(ACCESS_DENIED)
        }
    }
}
