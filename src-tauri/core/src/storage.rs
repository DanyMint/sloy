use chrono::{DateTime, Utc};
use chrono_tz::Tz;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};
use walkdir::WalkDir;
type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum KnowledgeMode {
    #[default]
    Folders,
    Properties,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct KnowledgeRule {
    pub folder: String,
    pub value: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct KnowledgeTypes {
    pub quotes: KnowledgeRule,
    pub reflections: KnowledgeRule,
    pub thoughts: KnowledgeRule,
}
impl Default for KnowledgeTypes {
    fn default() -> Self {
        let rule = |folder: &str, value: &str| KnowledgeRule {
            folder: folder.into(),
            value: value.into(),
        };
        Self {
            quotes: rule("Cites", "quote"),
            reflections: rule("Reflections", "reflection"),
            thoughts: rule("Thoughts", "thought"),
        }
    }
}
impl KnowledgeTypes {
    fn rules(&self) -> [(&str, &KnowledgeRule); 3] {
        [
            ("quotes", &self.quotes),
            ("reflections", &self.reflections),
            ("thoughts", &self.thoughts),
        ]
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Folders {
    pub areas: String,
    pub projects: String,
    pub habits: String,
    pub habit_records: String,
    pub journals: String,
    pub knowledge: String,
    pub knowledge_mode: KnowledgeMode,
    pub knowledge_type_property: String,
    pub knowledge_types: KnowledgeTypes,
    pub created_property: String,
    pub timezone: String,
}
impl Default for Folders {
    fn default() -> Self {
        Self {
            areas: "Areas".into(),
            projects: "Projects".into(),
            habits: "Habits/Definitions".into(),
            habit_records: "Habits/Records".into(),
            journals: "Journals".into(),
            knowledge: "Knowledge".into(),
            knowledge_mode: KnowledgeMode::Folders,
            knowledge_type_property: "type".into(),
            knowledge_types: KnowledgeTypes::default(),
            created_property: "created".into(),
            timezone: "Asia/Aqtobe".into(),
        }
    }
}
impl Folders {
    pub fn validate(&self) -> Result<()> {
        let dirs = [
            &self.areas,
            &self.projects,
            &self.habits,
            &self.habit_records,
            &self.journals,
            &self.knowledge,
        ];
        for d in dirs {
            safe_relative(d)?;
        }
        for (i, a) in dirs.iter().enumerate() {
            for b in dirs.iter().skip(i + 1) {
                if a == b || a.starts_with(&format!("{b}/")) || b.starts_with(&format!("{a}/")) {
                    return Err("Папки сущностей не должны пересекаться".into());
                }
            }
        }
        self.timezone
            .parse::<Tz>()
            .map_err(|_| "Неизвестный часовой пояс")?;
        if self.created_property.trim().is_empty() {
            return Err("Укажите свойство даты создания".into());
        }
        if self.knowledge_mode == KnowledgeMode::Properties
            && self.knowledge_type_property.trim().is_empty()
        {
            return Err("Укажите свойство типа Knowledge".into());
        }
        let mut folders = HashSet::new();
        let mut values = HashSet::new();
        for (_, rule) in self.knowledge_types.rules() {
            if self.knowledge_mode == KnowledgeMode::Folders && !rule.folder.is_empty() {
                safe_relative(&rule.folder)?;
                if !folders.insert(rule.folder.clone()) {
                    return Err("Подпапки типов Knowledge должны различаться".into());
                }
            }
            if self.knowledge_mode == KnowledgeMode::Properties
                && !rule.value.trim().is_empty()
                && !values.insert(rule.value.trim().to_lowercase())
            {
                return Err("Значения свойства типов Knowledge должны различаться".into());
            }
        }
        Ok(())
    }
    fn managed(&self, p: &str) -> bool {
        [
            &self.areas,
            &self.projects,
            &self.habits,
            &self.habit_records,
            &self.journals,
        ]
        .iter()
        .any(|d| p.starts_with(&format!("{d}/")))
    }
    fn knowledge(&self, p: &str) -> bool {
        p.starts_with(&format!("{}/", self.knowledge))
    }
}
#[derive(Clone, Debug)]
pub struct Entry {
    pub path: String,
    pub modified: i64,
    pub size: u64,
    pub created: Option<i64>,
}
pub trait VaultFs {
    fn entries(&self) -> Result<Vec<Entry>>;
    fn read(&self, path: &str, limit: Option<usize>) -> Result<Vec<u8>>;
    fn write(&self, path: &str, data: &[u8]) -> Result<()>;
    fn trash(&self, path: &str) -> Result<()>;
}
pub struct DiskFs {
    pub root: PathBuf,
}
pub fn safe_relative(value: &str) -> Result<PathBuf> {
    let p = Path::new(value);
    if value.is_empty()
        || value.contains('\\')
        || value.contains(':')
        || p.is_absolute()
        || p.components().any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(format!("Недопустимый путь: {value}"));
    }
    Ok(p.into())
}
impl DiskFs {
    pub fn new(root: &Path) -> Result<Self> {
        let root = fs::canonicalize(root).map_err(|e| e.to_string())?;
        if !root.is_dir() {
            return Err("Выберите каталог хранилища".into());
        }
        Ok(Self { root })
    }
    fn resolve(&self, path: &str) -> Result<PathBuf> {
        let rel = safe_relative(path)?;
        let mut current = self.root.clone();
        for part in rel.components() {
            current.push(part);
            if current.exists()
                && fs::symlink_metadata(&current)
                    .map_err(|e| e.to_string())?
                    .file_type()
                    .is_symlink()
            {
                return Err("Символические ссылки внутри хранилища не поддерживаются".into());
            }
        }
        Ok(current)
    }
}
fn millis(t: std::time::SystemTime) -> i64 {
    t.duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}
impl VaultFs for DiskFs {
    fn entries(&self) -> Result<Vec<Entry>> {
        let mut entries = vec![];
        for e in WalkDir::new(&self.root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.'))
        {
            let e = e.map_err(|e| e.to_string())?;
            if !e.file_type().is_file()
                || e.path().extension().and_then(|v| v.to_str()) != Some("md")
            {
                continue;
            }
            let m = e.metadata().map_err(|e| e.to_string())?;
            entries.push(Entry {
                path: e
                    .path()
                    .strip_prefix(&self.root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/"),
                modified: millis(m.modified().map_err(|e| e.to_string())?),
                size: m.len(),
                created: m.created().ok().map(millis),
            });
        }
        Ok(entries)
    }
    fn read(&self, path: &str, limit: Option<usize>) -> Result<Vec<u8>> {
        let file = fs::File::open(self.resolve(path)?).map_err(|e| e.to_string())?;
        let mut b = vec![];
        file.take(limit.unwrap_or(32 * 1024 * 1024) as u64)
            .read_to_end(&mut b)
            .map_err(|e| e.to_string())?;
        Ok(b)
    }
    fn write(&self, path: &str, data: &[u8]) -> Result<()> {
        let path = self.resolve(path)?;
        let parent = path.parent().ok_or("Нет родителя")?;
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let tmp = parent.join(format!(
            ".syncthing.sloy-{}-{}.tmp",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)
            .map_err(|e| e.to_string())?;
        use std::io::Write;
        f.write_all(data)
            .and_then(|_| f.sync_all())
            .map_err(|e| e.to_string())?;
        drop(f);
        #[cfg(windows)]
        {
            if path.exists() {
                let backup = path.with_extension("sloy-backup");
                fs::rename(&path, &backup).map_err(|e| e.to_string())?;
                match fs::rename(&tmp, &path) {
                    Ok(_) => {
                        let _ = fs::remove_file(backup);
                    }
                    Err(e) => {
                        let _ = fs::rename(backup, &path);
                        return Err(e.to_string());
                    }
                }
            } else {
                fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
            }
        }
        #[cfg(not(windows))]
        fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
        Ok(())
    }
    fn trash(&self, path: &str) -> Result<()> {
        let from = self.resolve(path)?;
        let dest = self.resolve(&format!(
            ".trash/sloy/{}-{path}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ))?;
        fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
        fs::rename(from, dest).map_err(|e| e.to_string())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Document {
    pub path: String,
    pub text: String,
    pub hash: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scan {
    pub documents: Vec<Document>,
    pub full: bool,
    pub deleted_paths: Vec<String>,
    pub knowledge: BTreeMap<String, u64>,
    pub knowledge_by_type: BTreeMap<String, BTreeMap<String, u64>>,
    pub conflicts: Vec<String>,
    pub files_checked: usize,
    pub files_read: usize,
    pub unknown_dates: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Write {
    pub path: String,
    pub text: String,
    pub expected_hash: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Delete {
    pub path: String,
    pub expected_hash: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Changes {
    pub writes: Vec<Write>,
    pub deletes: Vec<Delete>,
}
pub fn digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
pub fn database(path: &Path) -> Result<Connection> {
    let db = Connection::open(path).map_err(|e| e.to_string())?;
    db.execute_batch("PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY, modified INTEGER, size INTEGER, hash TEXT, text TEXT, day TEXT);CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);").map_err(|e|e.to_string())?;
    let has_kind = db.prepare("SELECT kind FROM files LIMIT 0").is_ok();
    if !has_kind {
        db.execute_batch("ALTER TABLE files ADD COLUMN kind TEXT")
            .map_err(|e| e.to_string())?;
    }
    Ok(db)
}
fn knowledge_kind(bytes: &[u8], path: &str, cfg: &Folders) -> String {
    let text = String::from_utf8_lossy(bytes);
    let rules = cfg.knowledge_types.rules();
    // Only the selected mode participates in classification.
    if cfg.knowledge_mode == KnowledgeMode::Properties {
        if let Some(yaml) = text
            .strip_prefix("---\n")
            .or_else(|| text.strip_prefix("---\r\n"))
            .and_then(|s| s.split("\n---").next())
        {
            if let Ok(v) = serde_yaml::from_str::<serde_yaml::Value>(yaml) {
                if let Some(value) = v.get(&cfg.knowledge_type_property) {
                    let values: Vec<_> = match value {
                        serde_yaml::Value::Sequence(list) => {
                            list.iter().filter_map(|v| v.as_str()).collect()
                        }
                        _ => value.as_str().into_iter().collect(),
                    };
                    let matches: Vec<_> = rules
                        .iter()
                        .filter(|(_, rule)| {
                            !rule.value.trim().is_empty()
                                && values.iter().any(|v| {
                                    v.trim().to_lowercase() == rule.value.trim().to_lowercase()
                                })
                        })
                        .collect();
                    if matches.len() == 1 {
                        return matches[0].0.into();
                    }
                }
            }
        }
        return "other".into();
    }
    let relative = path
        .strip_prefix(&format!("{}/", cfg.knowledge))
        .unwrap_or("");
    rules
        .iter()
        .filter(|(_, rule)| {
            !rule.folder.is_empty() && relative.starts_with(&format!("{}/", rule.folder))
        })
        .max_by_key(|(_, rule)| rule.folder.len())
        .map(|(kind, _)| *kind)
        .unwrap_or("other")
        .into()
}
fn created_day(bytes: &[u8], created: Option<i64>, cfg: &Folders) -> Option<String> {
    let text = String::from_utf8_lossy(bytes);
    let zone = cfg.timezone.parse::<Tz>().ok()?;
    if let Some(yaml) = text
        .strip_prefix("---\n")
        .or_else(|| text.strip_prefix("---\r\n"))
        .and_then(|s| s.split("\n---").next())
    {
        if let Ok(v) = serde_yaml::from_str::<serde_yaml::Value>(yaml) {
            if let Some(s) = v.get(&cfg.created_property).and_then(|x| x.as_str()) {
                if s.len() == 10 && chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok() {
                    return Some(s.into());
                }
                if (chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S").is_ok()
                    || chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M").is_ok())
                    && s.len() >= 10
                {
                    return Some(s[..10].into());
                }
                if let Ok(d) = DateTime::parse_from_rfc3339(s) {
                    return Some(d.with_timezone(&zone).format("%Y-%m-%d").to_string());
                }
            }
        }
    }
    created
        .and_then(DateTime::<Utc>::from_timestamp_millis)
        .map(|d| d.with_timezone(&zone).format("%Y-%m-%d").to_string())
}
pub fn scan(
    fs: &dyn VaultFs,
    db: &mut Connection,
    cfg: &Folders,
    rebuild: bool,
    initial: bool,
) -> Result<Scan> {
    cfg.validate()?;
    let config = serde_json::to_string(cfg).unwrap();
    let prev_config: String = db
        .query_row("SELECT value FROM meta WHERE key='folders'", [], |r| {
            r.get(0)
        })
        .unwrap_or_default();
    let rebuild = rebuild || config != prev_config;
    let entries = fs.entries()?;
    let mut old = HashMap::new();
    {
        let mut stmt = db
            .prepare("SELECT path,modified,size,hash,text,day,kind FROM files")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    (
                        r.get::<_, i64>(1)?,
                        r.get::<_, i64>(2)? as u64,
                        r.get::<_, String>(3)?,
                        r.get::<_, Option<String>>(4)?,
                        r.get::<_, Option<String>>(5)?,
                        r.get::<_, Option<String>>(6)?,
                    ),
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (p, v) = row.map_err(|e| e.to_string())?;
            old.insert(p, v);
        }
    }
    let mut documents = vec![];
    let mut knowledge = BTreeMap::new();
    let mut knowledge_by_type: BTreeMap<String, BTreeMap<String, u64>> = BTreeMap::new();
    let mut conflicts = vec![];
    let mut seen = HashSet::new();
    let mut files_read = 0;
    let mut unknown_dates = 0;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for e in &entries {
        if e.path.contains(".sync-conflict-") {
            conflicts.push(e.path.clone());
            continue;
        }
        if !cfg.managed(&e.path) && !cfg.knowledge(&e.path) {
            continue;
        }
        seen.insert(e.path.clone());
        let cached = old.get(&e.path);
        let changed = rebuild
            || cached
                .map(|c| c.0 != e.modified || c.1 != e.size)
                .unwrap_or(true);
        let (hash, text, day, kind) = if changed {
            files_read += 1;
            let bytes = fs.read(
                &e.path,
                if cfg.knowledge(&e.path) {
                    Some(256 * 1024)
                } else {
                    None
                },
            )?;
            let text = if cfg.managed(&e.path) {
                if bytes.len() >= 32 * 1024 * 1024 {
                    return Err(format!("Слишком большая заметка: {}", e.path));
                }
                Some(
                    String::from_utf8(bytes.clone())
                        .map_err(|_| format!("Заметка не UTF-8: {}", e.path))?,
                )
            } else {
                None
            };
            let day = if cfg.knowledge(&e.path) {
                created_day(&bytes, e.created, cfg)
            } else {
                None
            };
            let kind = if cfg.knowledge(&e.path) {
                Some(knowledge_kind(&bytes, &e.path, cfg))
            } else {
                None
            };
            (digest(&bytes), text, day, kind)
        } else {
            let c = cached.unwrap();
            (c.2.clone(), c.3.clone(), c.4.clone(), c.5.clone())
        };
        if cfg.knowledge(&e.path) {
            if let Some(day) = &day {
                *knowledge.entry(day.clone()).or_default() += 1;
                *knowledge_by_type
                    .entry(day.clone())
                    .or_default()
                    .entry(kind.clone().unwrap_or_else(|| "other".into()))
                    .or_default() += 1;
            } else {
                unknown_dates += 1;
            }
        }
        if let Some(text) = &text {
            if changed || initial {
                documents.push(Document {
                    path: e.path.clone(),
                    text: text.clone(),
                    hash: hash.clone(),
                });
            }
        }
        if changed {
            tx.execute(
                "INSERT OR REPLACE INTO files (path,modified,size,hash,text,day,kind) VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![e.path, e.modified, e.size as i64, hash, text, day, kind],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    let deleted_paths: Vec<_> = old.keys().filter(|p| !seen.contains(*p)).cloned().collect();
    for p in &deleted_paths {
        tx.execute("DELETE FROM files WHERE path=?1", [p])
            .map_err(|e| e.to_string())?;
    }
    tx.execute(
        "INSERT OR REPLACE INTO meta VALUES ('folders',?1)",
        [config],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(Scan {
        documents,
        full: initial || rebuild,
        deleted_paths,
        knowledge,
        knowledge_by_type,
        conflicts,
        files_checked: entries.len(),
        files_read,
        unknown_dates,
    })
}
pub fn commit(fs: &dyn VaultFs, changes: &Changes) -> Result<()> {
    let mut paths = HashSet::new();
    for (path, expected) in changes
        .writes
        .iter()
        .map(|w| (&w.path, &w.expected_hash))
        .chain(changes.deletes.iter().map(|w| (&w.path, &w.expected_hash)))
    {
        safe_relative(path)?;
        if !paths.insert(path) {
            return Err(format!("Два изменения одного файла: {path}"));
        }
        let actual = match fs.read(path, None) {
            Ok(b) => Some(digest(&b)),
            Err(_) => {
                if fs.entries()?.iter().any(|e| &e.path == path) {
                    return Err(format!("Не удалось прочитать {path}"));
                }
                None
            }
        };
        if &actual != expected {
            return Err(format!(
                "Файл изменён в Obsidian или Syncthing: {path}. Черновик сохранён локально."
            ));
        }
    }
    for w in &changes.writes {
        fs.write(&w.path, w.text.as_bytes())?;
    }
    for d in &changes.deletes {
        fs.trash(&d.path)?;
    }
    Ok(())
}
