use sloy_core::storage::{safe_relative, Entry, VaultFs};
use std::{
    cell::RefCell,
    collections::HashMap,
    io::Read,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri_plugin_android_fs::{AndroidFsExt, FsUri};
type Result<T> = std::result::Result<T, String>;
#[allow(dead_code)]
pub struct AndroidVault {
    app: tauri::AppHandle,
    root: FsUri,
    cache: RefCell<HashMap<String, FsUri>>,
}
#[allow(dead_code)]
impl AndroidVault {
    pub fn new(app: &tauri::AppHandle, path: &str, tree: Option<&str>) -> Result<Self> {
        let root = if path.starts_with("content://") {
            FsUri {
                uri: path.into(),
                document_top_tree_uri: tree.map(str::to_owned).or(Some(path.into())),
            }
        } else {
            FsUri::from_path(path)
        };
        Ok(Self {
            app: app.clone(),
            root,
            cache: RefCell::new(HashMap::new()),
        })
    }
    fn resolve(&self, path: &str) -> Result<FsUri> {
        safe_relative(path)?;
        if let Some(u) = self.cache.borrow().get(path) {
            return Ok(u.clone());
        }
        self.app
            .android_fs()
            .resolve_file_uri(&self.root, path)
            .map_err(|e| e.to_string())
    }
    fn walk(&self, uri: &FsUri, prefix: &str, out: &mut Vec<Entry>) -> Result<()> {
        for e in self
            .app
            .android_fs()
            .read_dir(uri)
            .map_err(|e| e.to_string())?
        {
            if e.name().starts_with('.') {
                continue;
            }
            let path = if prefix.is_empty() {
                e.name().to_owned()
            } else {
                format!("{prefix}/{}", e.name())
            };
            if e.is_dir() {
                self.walk(e.uri(), &path, out)?;
            } else if path.ends_with(".md") {
                self.cache
                    .borrow_mut()
                    .insert(path.clone(), e.uri().clone());
                out.push(Entry {
                    path,
                    modified: e
                        .last_modified()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as i64,
                    size: e.file_len().unwrap_or(0),
                    created: None,
                });
            }
        }
        Ok(())
    }
}
impl VaultFs for AndroidVault {
    fn entries(&self) -> Result<Vec<Entry>> {
        let mut out = vec![];
        self.cache.borrow_mut().clear();
        self.walk(&self.root, "", &mut out)?;
        Ok(out)
    }
    fn read(&self, path: &str, limit: Option<usize>) -> Result<Vec<u8>> {
        let uri = self.resolve(path)?;
        let file = self
            .app
            .android_fs()
            .open_file_readable(&uri)
            .map_err(|e| e.to_string())?;
        let mut b = vec![];
        file.take(limit.unwrap_or(32 * 1024 * 1024) as u64)
            .read_to_end(&mut b)
            .map_err(|e| e.to_string())?;
        Ok(b)
    }
    fn write(&self, path: &str, data: &[u8]) -> Result<()> {
        safe_relative(path)?;
        let fs = self.app.android_fs();
        let p = std::path::Path::new(path);
        let parent = p.parent().unwrap_or(std::path::Path::new(""));
        let name = p.file_name().unwrap().to_string_lossy();
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let tmp_path = parent.join(format!(".syncthing.sloy-{unique}.tmp"));
        let tmp = fs
            .create_new_file(&self.root, &tmp_path, Some("application/octet-stream"))
            .map_err(|e| e.to_string())?;
        if let Err(e) = fs.write(&tmp, data) {
            let _ = fs.remove_file(&tmp);
            return Err(e.to_string());
        }
        let old = fs.resolve_file_uri(&self.root, path).ok();
        let backup = if let Some(old) = old {
            Some(
                fs.rename(&old, format!(".syncthing.sloy-backup-{unique}.tmp"))
                    .map_err(|e| e.to_string())?,
            )
        } else {
            None
        };
        match fs.rename(&tmp, &name) {
            Ok(u) => {
                if fs.get_metadata(&u).map_err(|e| e.to_string())?.name() != name.as_ref() {
                    let _ = fs.remove_file(&u);
                    if let Some(b) = backup {
                        let _ = fs.rename(&b, &name);
                    }
                    return Err(
                        "Провайдер Android изменил имя заметки. Выберите локальную папку.".into(),
                    );
                }
                if let Some(b) = backup {
                    fs.remove_file(&b).map_err(|e| e.to_string())?;
                }
                self.cache.borrow_mut().insert(path.into(), u);
                Ok(())
            }
            Err(e) => {
                if let Some(b) = backup {
                    let _ = fs.rename(&b, &name);
                }
                let _ = fs.remove_file(&tmp);
                Err(e.to_string())
            }
        }
    }
    fn trash(&self, path: &str) -> Result<()> {
        let original = self.resolve(path)?;
        let data = self.read(path, None)?;
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        self.write(&format!(".trash/sloy/{stamp}-{path}"), &data)?;
        self.app
            .android_fs()
            .remove_file(&original)
            .map_err(|e| e.to_string())?;
        self.cache.borrow_mut().remove(path);
        Ok(())
    }
}
#[allow(dead_code)]
pub fn pick(app: &tauri::AppHandle) -> Result<Option<serde_json::Value>> {
    let fs = app.android_fs();
    let picked = fs
        .picker()
        .pick_dir(None, true)
        .map_err(|e| e.to_string())?;
    if let Some(uri) = picked {
        fs.picker()
            .persist_uri_permission(&uri)
            .map_err(|e| e.to_string())?;
        Ok(Some(
            serde_json::json!({"path":uri.uri,"androidTreeUri":uri.document_top_tree_uri}),
        ))
    } else {
        Ok(None)
    }
}
