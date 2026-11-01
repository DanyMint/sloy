use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{Duration, Instant};
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SyncSettings {
    pub enabled: bool,
    pub url: String,
    pub api_key: String,
    pub folder_id: String,
    pub timeout_seconds: u64,
    pub trusted_pem: String,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub status: String,
    pub message: String,
    pub offline_devices: Vec<String>,
}
pub fn validate_url(s: &str) -> Result<reqwest::Url, String> {
    let u = reqwest::Url::parse(s).map_err(|_| "Некорректный адрес Syncthing")?;
    let loopback = matches!(
        u.host_str(),
        Some("localhost" | "127.0.0.1" | "[::1]" | "::1")
    );
    if !loopback
        || !matches!(u.scheme(), "http" | "https")
        || !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
        || u.path() != "/"
    {
        return Err("Укажите локальный адрес Syncthing, например http://127.0.0.1:8384".into());
    }
    Ok(u)
}
fn report(status: &str, message: &str, offline_devices: Vec<String>) -> SyncReport {
    SyncReport {
        status: status.into(),
        message: message.into(),
        offline_devices,
    }
}
async fn get(
    c: &reqwest::Client,
    url: &reqwest::Url,
    path: &str,
    args: &[(&str, &str)],
) -> Result<Value, String> {
    c.get(url.join(path).map_err(|e| e.to_string())?)
        .query(args)
        .send()
        .await
        .map_err(|_| "Нет связи с Syncthing")?
        .error_for_status()
        .map_err(|e| {
            format!(
                "Syncthing HTTP {}",
                e.status().map(|v| v.as_u16()).unwrap_or(0)
            )
        })?
        .json()
        .await
        .map_err(|_| "Некорректный ответ Syncthing".into())
}
fn zero(v: &Value, key: &str) -> bool {
    v.get(key).and_then(Value::as_u64) == Some(0)
}
pub async fn synchronize(s: &SyncSettings) -> Result<SyncReport, String> {
    if !s.enabled {
        return Ok(report(
            "disabled",
            "Syncthing выключен: выполняется локальная сверка",
            vec![],
        ));
    }
    let url = validate_url(&s.url)?;
    if s.folder_id.trim().is_empty() || s.api_key.trim().is_empty() {
        return Err("Укажите Folder ID и API key Syncthing".into());
    }
    let mut headers = reqwest::header::HeaderMap::new();
    let mut key =
        reqwest::header::HeaderValue::from_str(&s.api_key).map_err(|_| "Некорректный API key")?;
    key.set_sensitive(true);
    headers.insert("X-API-Key", key);
    let mut builder = reqwest::Client::builder()
        .default_headers(headers)
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .timeout(Duration::from_secs(8));
    if !s.trusted_pem.trim().is_empty() {
        builder = builder.add_root_certificate(
            reqwest::Certificate::from_pem(s.trusted_pem.as_bytes())
                .map_err(|_| "Некорректный сертификат PEM")?,
        );
    }
    let client = builder.build().map_err(|e| e.to_string())?;
    let folder = match get(
        &client,
        &url,
        &format!("rest/config/folders/{}", s.folder_id),
        &[],
    )
    .await
    {
        Ok(f) => f,
        Err(e) => {
            return Ok(report(
                "offline",
                &format!("{e}. Выполнена только локальная сверка."),
                vec![],
            ))
        }
    };
    if folder["paused"].as_bool() == Some(true) {
        return Ok(report(
            "partial",
            "Папка Syncthing на паузе. Выполнена только локальная сверка.",
            vec![],
        ));
    }
    let self_id = get(&client, &url, "rest/system/status", &[]).await?["myID"]
        .as_str()
        .unwrap_or("")
        .to_owned();
    let peers: Vec<String> = folder["devices"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|d| d["deviceID"].as_str())
                .filter(|d| *d != self_id)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    let scan = client
        .post(url.join("rest/db/scan").unwrap())
        .query(&[("folder", &s.folder_id)])
        .send()
        .await
        .map_err(|_| "Syncthing не ответил на запрос сканирования")?;
    if !scan.status().is_success() {
        return Err(format!(
            "Syncthing не принял сканирование: HTTP {}",
            scan.status().as_u16()
        ));
    }
    let deadline = Instant::now() + Duration::from_secs(s.timeout_seconds.clamp(5, 300));
    let mut stable = 0;
    let mut offline = vec![];
    loop {
        let status = get(&client, &url, "rest/db/status", &[("folder", &s.folder_id)]).await?;
        let connections = get(&client, &url, "rest/system/connections", &[]).await?;
        let local = status["state"].as_str() == Some("idle")
            && zero(&status, "needBytes")
            && zero(&status, "needDeletes")
            && zero(&status, "needFiles")
            && status["pullErrors"].as_u64().unwrap_or(0) == 0;
        offline.clear();
        let mut all = local;
        for peer in &peers {
            if connections["connections"][peer]["connected"].as_bool() != Some(true) {
                offline.push(peer.clone());
                all = false;
                continue;
            }
            let completion = get(
                &client,
                &url,
                "rest/db/completion",
                &[("folder", &s.folder_id), ("device", peer)],
            )
            .await?;
            if completion["remoteState"].as_str() != Some("valid")
                || completion["completion"].as_f64().unwrap_or(0.0) < 100.0
                || !zero(&completion, "needItems")
                || !zero(&completion, "needDeletes")
            {
                all = false;
            }
        }
        if all {
            stable += 1;
        } else {
            stable = 0;
        }
        if stable >= 2 {
            return Ok(report(
                "complete",
                "Syncthing завершил обмен. Хранилище сверено.",
                vec![],
            ));
        }
        if local && !offline.is_empty() {
            return Ok(report(
                "partial",
                "Локальные файлы сверены. Часть устройств недоступна; обмен с ними не подтверждён.",
                offline,
            ));
        }
        if Instant::now() >= deadline {
            return Ok(report(
                "pending",
                "Время ожидания истекло. Syncthing продолжает работу; выполнена локальная сверка.",
                offline,
            ));
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restrict_api() {
        for s in [
            "http://127.0.0.1:8384",
            "https://localhost:8384",
            "http://[::1]:8384",
        ] {
            assert!(validate_url(s).is_ok(), "{s}");
        }
        for s in [
            "http://example.com",
            "http://127.0.0.1.evil.test",
            "file:///tmp/a",
            "http://u:p@localhost",
            "http://localhost/path",
        ] {
            assert!(validate_url(s).is_err(), "{s}");
        }
    }
    #[tokio::test]
    async fn disabled_sync() {
        assert_eq!(
            synchronize(&SyncSettings::default()).await.unwrap().status,
            "disabled"
        );
    }
}
