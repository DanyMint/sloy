use sloy_core::storage::*;
use std::fs;
use tempfile::tempdir;
#[test]
fn warm_index_does_not_reread_ten_thousand_notes() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("Knowledge")).unwrap();
    for n in 0..10050 {
        fs::write(
            dir.path().join(format!("Knowledge/{n}.md")),
            "---\ncreated: 2026-10-30\n---\n# Note\n",
        )
        .unwrap();
    }
    let f = DiskFs::new(dir.path()).unwrap();
    let mut db = database(&dir.path().join("index.sqlite")).unwrap();
    let start = std::time::Instant::now();
    let cold = scan(&f, &mut db, &Folders::default(), false, true).unwrap();
    let cold_time = start.elapsed();
    let start = std::time::Instant::now();
    let warm = scan(&f, &mut db, &Folders::default(), false, false).unwrap();
    eprintln!(
        "10050 files: cold={cold_time:?}, warm={:?}, warm reads={}",
        start.elapsed(),
        warm.files_read
    );
    assert_eq!(cold.files_read, 10050);
    assert_eq!(cold.knowledge["2026-10-30"], 10050);
    assert_eq!(warm.files_read, 0);
    fs::write(
        dir.path().join("Knowledge/0.md"),
        "---\ncreated: 2026-10-31\n---\nChanged and longer\n",
    )
    .unwrap();
    let changed = scan(&f, &mut db, &Folders::default(), false, false).unwrap();
    assert_eq!(changed.files_read, 1);
    assert_eq!(changed.knowledge["2026-10-31"], 1);
}
#[test]
fn optimistic_conflict_does_not_overwrite_and_deletes_are_recoverable() {
    let dir = tempdir().unwrap();
    let f = DiskFs::new(dir.path()).unwrap();
    f.write("Areas/A.md", b"Original").unwrap();
    let expected = digest(b"Original");
    f.write("Areas/A.md", b"Edited in Obsidian").unwrap();
    assert!(commit(
        &f,
        &Changes {
            writes: vec![Write {
                path: "Areas/A.md".into(),
                text: "Sloy".into(),
                expected_hash: Some(expected)
            }],
            deletes: vec![]
        }
    )
    .is_err());
    assert_eq!(f.read("Areas/A.md", None).unwrap(), b"Edited in Obsidian");
    commit(
        &f,
        &Changes {
            writes: vec![],
            deletes: vec![Delete {
                path: "Areas/A.md".into(),
                expected_hash: Some(digest(b"Edited in Obsidian")),
            }],
        },
    )
    .unwrap();
    assert!(!dir.path().join("Areas/A.md").exists());
    assert!(dir.path().join(".trash/sloy").exists());
}
#[test]
fn scan_reports_conflicts_and_uses_creation_property_timezone() {
    let dir = tempdir().unwrap();
    let f = DiskFs::new(dir.path()).unwrap();
    f.write(
        "Knowledge/A.md",
        b"---\ncreated: 2026-10-30T23:00:00Z\n---\n",
    )
    .unwrap();
    f.write("Projects/P.sync-conflict-x.md", b"# Conflict")
        .unwrap();
    let mut db = database(&dir.path().join("index.sqlite")).unwrap();
    let s = scan(&f, &mut db, &Folders::default(), false, true).unwrap();
    assert_eq!(s.knowledge["2026-10-31"], 1);
    assert_eq!(s.conflicts.len(), 1);
    assert_eq!(s.documents.len(), 0);
}
#[test]
fn incremental_reports_include_only_changed_and_deleted_documents() {
    let dir = tempdir().unwrap();
    let f = DiskFs::new(dir.path()).unwrap();
    f.write("Projects/A.md", b"A").unwrap();
    f.write("Projects/B.md", b"B").unwrap();
    let mut db = database(&dir.path().join("index.sqlite")).unwrap();
    assert_eq!(
        scan(&f, &mut db, &Folders::default(), false, true)
            .unwrap()
            .documents
            .len(),
        2
    );
    let warm = scan(&f, &mut db, &Folders::default(), false, false).unwrap();
    assert!(warm.documents.is_empty());
    f.write("Projects/A.md", b"Updated").unwrap();
    fs::remove_file(dir.path().join("Projects/B.md")).unwrap();
    let next = scan(&f, &mut db, &Folders::default(), false, false).unwrap();
    assert_eq!(next.documents.len(), 1);
    assert_eq!(next.deleted_paths, vec!["Projects/B.md"]);
}
#[test]
fn paths_and_folder_overlap_are_rejected() {
    for p in ["../a", "/etc/passwd", "a/../b", "C:/data", "a\\b", ""] {
        assert!(safe_relative(p).is_err(), "{p}");
    }
    let mut f = Folders::default();
    f.knowledge = "Projects/Knowledge".into();
    assert!(f.validate().is_err());
}
#[cfg(unix)]
#[test]
fn symlink_escape_is_rejected() {
    let root = tempdir().unwrap();
    let outside = tempdir().unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join("Areas")).unwrap();
    let fs = DiskFs::new(root.path()).unwrap();
    assert!(fs.write("Areas/A.md", b"data").is_err());
}

#[test]
fn knowledge_modes_use_only_folders_or_only_properties() {
    let dir = tempdir().unwrap();
    let f = DiskFs::new(dir.path()).unwrap();
    let notes = [
        ("Cites/nested/A", ""),
        ("Reflections/B", ""),
        ("Thoughts/C", ""),
        ("D", "type: quote\n"),
        ("E", "type: reflection\n"),
        ("F", "type: [other, THOUGHT]\n"),
        ("Cites/G", "type: thought\n"),
        ("Other/H", "type: unknown\n"),
        ("Cites-like/I", ""),
        ("Cites/J", "type: [quote, thought]\n"),
    ];
    for (path, props) in notes {
        f.write(
            &format!("Knowledge/{path}.md"),
            format!("---\ncreated: 2026-11-01\n{props}---\nText\n").as_bytes(),
        )
        .unwrap();
    }
    f.write(
        "Knowledge/Cites/conflict.sync-conflict-x.md",
        b"---\ncreated: 2026-11-01\n---\n",
    )
    .unwrap();
    f.write(
        "Elsewhere/Cites/outside.md",
        b"---\ncreated: 2026-11-01\n---\n",
    )
    .unwrap();
    let mut db = database(&dir.path().join("index.sqlite")).unwrap();
    let mut cfg = Folders::default();
    let cold = scan(&f, &mut db, &cfg, false, true).unwrap();
    assert_eq!(cold.knowledge["2026-11-01"], 10);
    let counts = &cold.knowledge_by_type["2026-11-01"];
    assert_eq!(counts["quotes"], 3);
    assert_eq!(counts["reflections"], 1);
    assert_eq!(counts["thoughts"], 1);
    assert_eq!(counts["other"], 5);
    assert!(cold.documents.is_empty());
    let warm = scan(&f, &mut db, &cfg, false, false).unwrap();
    assert_eq!(warm.files_read, 0);
    assert_eq!(warm.knowledge_by_type, cold.knowledge_by_type);
    cfg.knowledge_mode = KnowledgeMode::Properties;
    let properties = scan(&f, &mut db, &cfg, false, false).unwrap();
    assert!(properties.full);
    assert_eq!(properties.files_read, 10);
    let counts = &properties.knowledge_by_type["2026-11-01"];
    assert_eq!(counts["quotes"], 1);
    assert_eq!(counts["reflections"], 1);
    assert_eq!(counts["thoughts"], 2);
    assert_eq!(counts["other"], 6);
    let warm = scan(&f, &mut db, &cfg, false, false).unwrap();
    assert_eq!(warm.files_read, 0);
    assert_eq!(warm.knowledge_by_type, properties.knowledge_by_type);
    f.write(
        "Knowledge/D.md",
        b"---\ncreated: 2026-11-01\ntype: reflection\n---\nText\n",
    )
    .unwrap();
    let changed = scan(&f, &mut db, &cfg, false, false).unwrap();
    assert_eq!(changed.files_read, 1);
    assert_eq!(changed.knowledge_by_type["2026-11-01"].get("quotes"), None);
    assert_eq!(changed.knowledge_by_type["2026-11-01"]["reflections"], 2);
}

#[test]
fn knowledge_rules_are_configurable_and_invalidate_cached_types() {
    let dir = tempdir().unwrap();
    let f = DiskFs::new(dir.path()).unwrap();
    f.write(
        "Notes/Ideas/A.md",
        "---\r\ncreated: 2026-11-01\r\nвид: ' Моя мысль '\r\n---\r\n".as_bytes(),
    )
    .unwrap();
    f.write(
        "Notes/Quotes/Nested/B.md",
        b"---\ncreated: 2026-11-01\n---\n",
    )
    .unwrap();
    let mut cfg = Folders::default();
    cfg.knowledge = "Notes".into();
    cfg.knowledge_type_property = "вид".into();
    cfg.knowledge_types.thoughts.value = "моя мысль".into();
    cfg.knowledge_types.quotes.folder = "Quotes".into();
    cfg.knowledge_types.reflections.folder = "Quotes/Nested".into();
    let mut db = database(&dir.path().join("index.sqlite")).unwrap();
    let folders = scan(&f, &mut db, &cfg, false, true).unwrap();
    assert_eq!(folders.knowledge_by_type["2026-11-01"]["other"], 1);
    assert_eq!(folders.knowledge_by_type["2026-11-01"]["reflections"], 1);
    cfg.knowledge_mode = KnowledgeMode::Properties;
    let properties = scan(&f, &mut db, &cfg, false, false).unwrap();
    assert_eq!(properties.knowledge_by_type["2026-11-01"]["thoughts"], 1);
    assert_eq!(properties.knowledge_by_type["2026-11-01"]["other"], 1);
    cfg.knowledge_types.thoughts.value.clear();
    let changed = scan(&f, &mut db, &cfg, false, false).unwrap();
    assert_eq!(changed.files_read, 2);
    assert!(changed.full);
    assert_eq!(changed.knowledge_by_type["2026-11-01"]["other"], 2);
    cfg.knowledge_mode = KnowledgeMode::Folders;
    cfg.knowledge_types.reflections.folder.clear();
    let changed = scan(&f, &mut db, &cfg, false, false).unwrap();
    assert_eq!(changed.knowledge_by_type["2026-11-01"]["other"], 1);
    assert_eq!(changed.knowledge_by_type["2026-11-01"]["quotes"], 1);
}

#[test]
fn knowledge_settings_upgrade_and_reject_ambiguous_or_unsafe_rules() {
    let old: Folders = serde_json::from_str(r#"{"knowledge":"Notes"}"#).unwrap();
    assert_eq!(old.knowledge_types.quotes.folder, "Cites");
    assert_eq!(old.knowledge_type_property, "type");
    assert_eq!(old.knowledge_mode, KnowledgeMode::Folders);
    assert!(serde_json::from_str::<Folders>(r#"{"knowledgeMode":"both"}"#).is_err());
    let mut cfg = Folders::default();
    cfg.knowledge_types.quotes.folder = "../outside".into();
    assert!(cfg.validate().is_err());
    cfg.knowledge_types.quotes.folder = cfg.knowledge_types.thoughts.folder.clone();
    assert!(cfg.validate().is_err());
    cfg.knowledge_types.quotes.folder.clear();
    cfg.knowledge_types.quotes.value = " THOUGHT ".into();
    assert!(cfg.validate().is_ok()); // Inactive property rules do not affect folder mode.
    cfg.knowledge_mode = KnowledgeMode::Properties;
    assert!(cfg.validate().is_err());
    cfg.knowledge_types.quotes.value.clear();
    cfg.knowledge_types.quotes.folder = "../unused".into();
    assert!(cfg.validate().is_ok()); // Inactive folders do not affect property mode.
    cfg.knowledge_type_property.clear();
    assert!(cfg.validate().is_err());
}

#[test]
fn old_index_schema_is_upgraded_and_rebuilt_from_markdown() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("index.sqlite");
    let old = rusqlite::Connection::open(&path).unwrap();
    old.execute_batch("CREATE TABLE files(path TEXT PRIMARY KEY, modified INTEGER, size INTEGER, hash TEXT, text TEXT, day TEXT);CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO meta VALUES ('folders','{}');").unwrap();
    drop(old);
    let f = DiskFs::new(dir.path()).unwrap();
    f.write("Knowledge/Cites/A.md", b"---\ncreated: 2026-11-01\n---\n")
        .unwrap();
    let mut db = database(&path).unwrap();
    let report = scan(&f, &mut db, &Folders::default(), false, false).unwrap();
    assert!(report.full);
    assert_eq!(report.knowledge_by_type["2026-11-01"]["quotes"], 1);
}
