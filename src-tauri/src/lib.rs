mod android_fs;
use serde::{Deserialize, Serialize};
use sloy_core::{
    storage::{self, Changes, Folders, VaultFs},
    sync::{self, SyncReport, SyncSettings},
};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, State};
#[cfg(not(target_os = "android"))]
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Settings {
    vault_path: String,
    android_tree_uri: Option<String>,
    folders: Folders,
    syncthing: SyncSettings,
}
struct Native {
    settings: Mutex<Settings>,
    io: Mutex<()>,
    data: PathBuf,
}
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn settings_write(data: &Path, s: &Settings) -> Result<(), String> {
    let path = data.join("settings.json");
    let tmp = data.join("settings.tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(s).map_err(error)?).map_err(error)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600)).map_err(error)?;
    }
    fs::rename(tmp, path).map_err(error)
}
fn redact(mut s: Settings) -> serde_json::Value {
    let configured = !s.syncthing.api_key.is_empty();
    s.syncthing.api_key.clear();
    let mut v = serde_json::to_value(s).unwrap();
    v["apiKeyConfigured"] = configured.into();
    v
}
#[tauri::command]
fn settings_get(n: State<Native>) -> Result<serde_json::Value, String> {
    Ok(redact(n.settings.lock().map_err(error)?.clone()))
}
#[tauri::command]
fn settings_save(n: State<Native>, mut settings: Settings) -> Result<serde_json::Value, String> {
    let _io = n.io.lock().map_err(error)?;
    settings.folders.validate()?;
    if settings.syncthing.enabled {
        sync::validate_url(&settings.syncthing.url)?;
    }
    let mut current = n.settings.lock().map_err(error)?;
    if settings.syncthing.api_key.is_empty() {
        settings.syncthing.api_key = current.syncthing.api_key.clone();
    }
    settings_write(&n.data, &settings)?;
    *current = settings.clone();
    Ok(redact(settings))
}
fn file_system(app: &tauri::AppHandle, s: &Settings) -> Result<Box<dyn VaultFs>, String> {
    if s.vault_path.trim().is_empty() {
        return Err("Сначала выберите хранилище в настройках".into());
    }
    #[cfg(target_os = "android")]
    {
        return Ok(Box::new(android_fs::AndroidVault::new(
            app,
            &s.vault_path,
            s.android_tree_uri.as_deref(),
        )?));
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(Box::new(storage::DiskFs::new(Path::new(&s.vault_path))?))
    }
}
fn same_vault(s: &Settings, path: &str) -> Result<(), String> {
    if s.vault_path != path {
        return Err("Хранилище изменилось. Перечитайте данные перед записью.".into());
    }
    Ok(())
}
fn db_path(n: &Native, s: &Settings) -> PathBuf {
    n.data.join(format!(
        "index-{}.sqlite",
        storage::digest(s.vault_path.as_bytes())
    ))
}
#[tauri::command]
async fn vault_scan(
    app: tauri::AppHandle,
    rebuild: bool,
    initial: bool,
    vault_path: String,
) -> Result<storage::Scan, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let n = app.state::<Native>();
        let _io = n.io.lock().map_err(error)?;
        let s = n.settings.lock().map_err(error)?.clone();
        same_vault(&s, &vault_path)?;
        let fs = file_system(&app, &s)?;
        let mut db = storage::database(&db_path(&n, &s))?;
        storage::scan(fs.as_ref(), &mut db, &s.folders, rebuild, initial)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn vault_commit(
    app: tauri::AppHandle,
    changes: Changes,
    vault_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let n = app.state::<Native>();
        let _io = n.io.lock().map_err(error)?;
        let s = n.settings.lock().map_err(error)?.clone();
        same_vault(&s, &vault_path)?;
        let fs = file_system(&app, &s)?;
        let recovery = n.data.join("recovery");
        fs::create_dir_all(&recovery).map_err(error)?;
        let pending = recovery.join(format!(
            "{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let bytes =
            serde_json::to_vec_pretty(&serde_json::json!({"vault":s.vault_path,"changes":changes}))
                .map_err(error)?;
        use std::io::Write;
        let mut intent = fs::File::create(&pending).map_err(error)?;
        intent
            .write_all(&bytes)
            .and_then(|_| intent.sync_all())
            .map_err(error)?;
        drop(intent);
        storage::commit(fs.as_ref(), &changes)?;
        fs::remove_file(pending).map_err(error)?;
        Ok(())
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn vault_pick(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "android")]
        {
            android_fs::pick(&app)
        }
        #[cfg(not(target_os = "android"))]
        {
            Ok(app
                .dialog()
                .file()
                .set_title("Хранилище Obsidian")
                .blocking_pick_folder()
                .map(|f| serde_json::json!({"path":f.to_string()})))
        }
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn syncthing_sync(n: State<'_, Native>) -> Result<SyncReport, String> {
    let s = n.settings.lock().map_err(error)?.syncthing.clone();
    sync::synchronize(&s).await
}
#[tauri::command]
fn vault_recovery(n: State<Native>) -> Result<Vec<serde_json::Value>, String> {
    let dir = n.data.join("recovery");
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    for entry in fs::read_dir(dir).map_err(error)? {
        let p = entry.map_err(error)?.path();
        if p.extension().and_then(|v| v.to_str()) == Some("json") {
            let text = fs::read_to_string(&p).map_err(error)?;
            out.push(
                serde_json::json!({"name":p.file_name().unwrap().to_string_lossy(),"text":text}),
            );
        }
    }
    Ok(out)
}
#[tauri::command]
fn open_obsidian(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("obsidian://open?") {
        return Err("Поддерживаются только ссылки открытия Obsidian".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(error)
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_android_fs::builder().build())
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            fs::create_dir_all(&data)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&data, fs::Permissions::from_mode(0o700))?;
            }
            let path = data.join("settings.json");
            let settings = if path.exists() {
                serde_json::from_slice(&fs::read(path)?)?
            } else {
                Settings::default()
            };
            app.manage(Native {
                settings: Mutex::new(settings),
                io: Mutex::new(()),
                data,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            settings_get,
            settings_save,
            vault_pick,
            vault_scan,
            vault_commit,
            syncthing_sync,
            vault_recovery,
            open_obsidian
        ])
        .run(tauri::generate_context!())
        .expect("Sloy native application failed");
}
