import os
import signal
import subprocess
import sys
import threading
from pathlib import Path


ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT / "my-react-flow-app"
VENV_PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"


def _stream_output(prefix: str, proc: subprocess.Popen) -> None:
    if proc.stdout is None:
        return
    for line in proc.stdout:
        print(f"[{prefix}] {line.rstrip()}")


def _resolve_backend_cmd() -> list[str]:
    python_exe = str(VENV_PYTHON) if VENV_PYTHON.exists() else sys.executable
    return [python_exe, "backend.py"]


def _resolve_frontend_cmd() -> list[str]:
    # Use node + vite.js directly so this works even when npm.ps1 is blocked.
    return ["node", "node_modules/vite/bin/vite.js"]


def _terminate(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    try:
        proc.terminate()
        proc.wait(timeout=8)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def main() -> int:
    if not FRONTEND_DIR.exists():
        print("Frontend folder not found: my-react-flow-app")
        return 1

    backend_cmd = _resolve_backend_cmd()
    frontend_cmd = _resolve_frontend_cmd()

    backend = subprocess.Popen(
        backend_cmd,
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    frontend = subprocess.Popen(
        frontend_cmd,
        cwd=str(FRONTEND_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env={**os.environ},
    )

    backend_thread = threading.Thread(target=_stream_output, args=("backend", backend), daemon=True)
    frontend_thread = threading.Thread(target=_stream_output, args=("frontend", frontend), daemon=True)
    backend_thread.start()
    frontend_thread.start()

    print("Running full app. Press Ctrl+C to stop both services.")
    print("Expected URLs: frontend http://localhost:5173 (or next free port), backend http://localhost:8000")

    try:
        while True:
            if backend.poll() is not None:
                print("Backend exited.")
                _terminate(frontend)
                return backend.returncode or 0
            if frontend.poll() is not None:
                print("Frontend exited.")
                _terminate(backend)
                return frontend.returncode or 0
            signal.pause() if hasattr(signal, "pause") else threading.Event().wait(0.5)
    except KeyboardInterrupt:
        print("Stopping services...")
        _terminate(frontend)
        _terminate(backend)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
