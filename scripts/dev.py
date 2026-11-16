#!/usr/bin/env python3
"""Start FitPilot's local API and UI; stop only the processes we start."""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
PYTHON = BACKEND / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def stop(process: subprocess.Popen) -> None:
    """Terminate the owned process group, including Vite/Uvicorn children."""
    try:
        if os.name == "posix":
            os.killpg(process.pid, signal.SIGTERM)
        elif process.poll() is None:
            process.terminate()
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        if os.name == "posix":
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
        process.wait()
    except ProcessLookupError:
        pass


def main() -> int:
    if not PYTHON.exists():
        print("Create backend/.venv and install backend/requirements.txt first; see README.md.", file=sys.stderr)
        return 1
    if not (FRONTEND / "node_modules").is_dir():
        print("Install frontend dependencies first: cd frontend && npm ci", file=sys.stderr)
        return 1
    npm = shutil.which("npm")
    if not npm:
        print("Node.js 20+ and npm must be available on PATH.", file=sys.stderr)
        return 1

    api_command = [str(PYTHON), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"]
    for env_file in (ROOT / ".env.local", ROOT / ".env", BACKEND / ".env"):
        if env_file.exists():
            api_command += ["--env-file", str(env_file)]
    ui_command = [npm, "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"]
    processes: list[subprocess.Popen] = []

    def interrupted(_signum: int, _frame: object) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupted)
    print("Starting FitPilot. UI: http://127.0.0.1:5173  API docs: http://127.0.0.1:8000/docs", flush=True)
    print("Press Ctrl+C to stop both services. Saved database records will be kept.", flush=True)
    try:
        for command, directory in ((api_command, BACKEND), (ui_command, FRONTEND)):
            processes.append(subprocess.Popen(command, cwd=directory, start_new_session=(os.name == "posix")))
        while True:
            for process in processes:
                code = process.poll()
                if code is not None:
                    print(f"A development service exited ({code}); stopping the other service.", file=sys.stderr)
                    return code or 1
            time.sleep(0.2)
    except KeyboardInterrupt:
        print("\nStopping FitPilot services…", flush=True)
        return 0
    except OSError as error:
        print(f"Could not start development services: {error}", file=sys.stderr)
        return 1
    finally:
        # Ignore a second Ctrl+C while cleaning up our own children.
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        for process in reversed(processes):
            stop(process)


if __name__ == "__main__":
    raise SystemExit(main())
