#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::error::Error;
use std::io::{BufRead, BufReader};
use std::net::TcpListener;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, RunEvent, Url};

// Printed by the backend's DesktopShellBridge once it serves requests
const READY_MARKER: &str = "JOBRADAR_READY";
const SHUTDOWN_GRACE: Duration = Duration::from_secs(5);

struct Backend(Mutex<Option<Child>>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| focus_main_window(app)))
        .manage(Backend(Mutex::new(None)))
        .setup(|app| {
            if let Err(error) = start_backend(app.handle()) {
                eprintln!("Cannot start the backend: {error}");
                show_error(app.handle());
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Job Radar")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                stop_backend(app);
            }
        });
}

fn start_backend(app: &AppHandle) -> Result<(), Box<dyn Error>> {
    let backend_dir = dunce::simplified(&app.path().resource_dir()?).join("backend");
    let port = free_port()?;
    let mut child = spawn_backend(&backend_dir, port)?;
    let stdout = child.stdout.take().expect("stdout is piped");
    *app.state::<Backend>().0.lock().unwrap() = Some(child);

    let app = app.clone();
    thread::spawn(move || {
        let mut is_ready = false;
        // Keep draining after the marker so the backend never blocks on a full pipe
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if !is_ready && line.trim() == READY_MARKER {
                is_ready = true;
                show_backend(&app, port);
            }
        }
        if !is_ready {
            show_error(&app);
        }
    });
    Ok(())
}

fn spawn_backend(backend_dir: &Path, port: u16) -> std::io::Result<Child> {
    let java = if cfg!(windows) { "java.exe" } else { "java" };
    let mut command = Command::new(backend_dir.join("runtime").join("bin").join(java));
    command
        .arg("--enable-native-access=ALL-UNNAMED")
        .arg("-jar")
        .arg(backend_dir.join("app.jar"))
        .arg(format!("--server.port={port}"))
        .arg("--jobradar.is-desktop-shell=true")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command.spawn()
}

// Another program could grab the port before the backend binds it, unlikely on a desktop
fn free_port() -> std::io::Result<u16> {
    Ok(TcpListener::bind("127.0.0.1:0")?.local_addr()?.port())
}

fn show_backend(app: &AppHandle, port: u16) {
    if let Some(window) = app.get_webview_window("main") {
        let url = Url::parse(&format!("http://127.0.0.1:{port}/")).expect("valid backend URL");
        let _ = window.navigate(url);
    }
}

// A fragment instead of eval, so it also works before the loading page has finished loading
fn show_error(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(mut url) = window.url() {
            url.set_fragment(Some("failed"));
            let _ = window.navigate(url);
        }
    }
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

// Closing stdin lets the backend shut down gracefully, kill it if that takes too long
fn stop_backend(app: &AppHandle) {
    let Some(mut child) = app.state::<Backend>().0.lock().unwrap().take() else {
        return;
    };
    drop(child.stdin.take());
    let deadline = Instant::now() + SHUTDOWN_GRACE;
    while Instant::now() < deadline {
        if let Ok(Some(_)) = child.try_wait() {
            return;
        }
        thread::sleep(Duration::from_millis(50));
    }
    let _ = child.kill();
    let _ = child.wait();
}
