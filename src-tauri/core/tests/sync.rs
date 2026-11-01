use sloy_core::sync::{synchronize, SyncSettings};
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
fn server(
    connected: bool,
) -> (
    String,
    Arc<Mutex<Vec<String>>>,
    Arc<AtomicBool>,
    thread::JoinHandle<()>,
) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = format!("http://{}", listener.local_addr().unwrap());
    listener.set_nonblocking(true).unwrap();
    let calls = Arc::new(Mutex::new(vec![]));
    let done = Arc::new(AtomicBool::new(false));
    let observed = calls.clone();
    let stop = done.clone();
    let handle = thread::spawn(move || {
        while !stop.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((mut socket, _)) => {
                    socket
                        .set_read_timeout(Some(Duration::from_secs(1)))
                        .unwrap();
                    let mut bytes = [0; 8192];
                    let n = socket.read(&mut bytes).unwrap();
                    let request = String::from_utf8_lossy(&bytes[..n]);
                    assert!(request.to_ascii_lowercase().contains("x-api-key: test-key"));
                    let first = request.lines().next().unwrap().to_owned();
                    observed.lock().unwrap().push(first.clone());
                    let body = if first.contains("/rest/config/folders/") {
                        r#"{"paused":false,"devices":[{"deviceID":"SELF"},{"deviceID":"PEER"}]}"#
                            .into()
                    } else if first.contains("/rest/system/status") {
                        r#"{"myID":"SELF"}"#.into()
                    } else if first.contains("/rest/db/scan") {
                        String::new()
                    } else if first.contains("/rest/db/status") {
                        r#"{"state":"idle","needBytes":0,"needDeletes":0,"needFiles":0,"pullErrors":0}"#.into()
                    } else if first.contains("/rest/system/connections") {
                        format!(r#"{{"connections":{{"PEER":{{"connected":{connected}}}}}}}"#)
                    } else {
                        r#"{"completion":100,"remoteState":"valid","needItems":0,"needDeletes":0}"#
                            .into()
                    };
                    write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(5))
                }
                Err(e) => panic!("{e}"),
            }
        }
    });
    (address, calls, done, handle)
}
#[tokio::test]
async fn scans_before_polling_and_reports_complete_only_after_peers_confirm() {
    let (url, calls, done, handle) = server(true);
    let result = synchronize(&SyncSettings {
        enabled: true,
        url,
        api_key: "test-key".into(),
        folder_id: "vault".into(),
        timeout_seconds: 5,
        ..Default::default()
    })
    .await;
    done.store(true, Ordering::SeqCst);
    handle.join().unwrap();
    assert_eq!(result.unwrap().status, "complete");
    let calls = calls.lock().unwrap();
    let scan = calls
        .iter()
        .position(|r| r.starts_with("POST /rest/db/scan"))
        .unwrap();
    let poll = calls
        .iter()
        .position(|r| r.starts_with("GET /rest/db/status"))
        .unwrap();
    assert!(scan < poll);
    assert_eq!(
        calls
            .iter()
            .filter(|r| r.starts_with("GET /rest/db/completion"))
            .count(),
        2
    );
}
#[tokio::test]
async fn disconnected_peer_is_partial_not_success() {
    let (url, _, done, handle) = server(false);
    let result = synchronize(&SyncSettings {
        enabled: true,
        url,
        api_key: "test-key".into(),
        folder_id: "vault".into(),
        timeout_seconds: 5,
        ..Default::default()
    })
    .await;
    done.store(true, Ordering::SeqCst);
    handle.join().unwrap();
    let r = result.unwrap();
    assert_eq!(r.status, "partial");
    assert_eq!(r.offline_devices, vec!["PEER"]);
}
