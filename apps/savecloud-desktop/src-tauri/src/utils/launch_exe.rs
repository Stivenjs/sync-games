//! Lanzamiento de ejecutables de juegos. En Windows, si el proceso exige permisos de administrador,
//! `CreateProcess` falla con ERROR_ELEVATION_REQUIRED (740); en ese caso se usa `ShellExecuteW` con el verbo `runas`
//! para mostrar el diálogo UAC.

#[cfg(windows)]
const ERROR_ELEVATION_REQUIRED: i32 = 740;

/// Inicia un ejecutable por ruta absoluta. En Windows reintenta con elevación (UAC) si hace falta.
pub fn launch_game_executable(path: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        windows_launch(path)
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new(path)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

#[cfg(windows)]
fn windows_launch(path: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    match std::process::Command::new(path).spawn() {
        Ok(_) => Ok(()),
        Err(e) if e.raw_os_error() == Some(ERROR_ELEVATION_REQUIRED) => unsafe {
            let path_w: Vec<u16> = OsStr::new(path).encode_wide().chain(Some(0)).collect();
            let runas: Vec<u16> = OsStr::new("runas").encode_wide().chain(Some(0)).collect();
            let h = ShellExecuteW(
                std::ptr::null_mut(),
                runas.as_ptr(),
                path_w.as_ptr(),
                ptr::null(),
                ptr::null(),
                SW_SHOWNORMAL as i32,
            );
            if (h as isize) <= 32 {
                Err(format!(
                    "No se pudo solicitar elevación para el ejecutable (código {}).",
                    h as isize
                ))
            } else {
                Ok(())
            }
        },
        Err(e) => Err(e.to_string()),
    }
}
