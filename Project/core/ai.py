from __future__ import annotations
import subprocess
import sys
from pathlib import Path


def _run_ai(prompt: str) -> str:
    script_path = Path(__file__).with_name("ai.swift")
    completed = subprocess.run(
        ["swift", str(script_path), prompt],
        capture_output=True,
        text=True,
    )

    if completed.returncode != 0:
        error_output = completed.stderr.strip() or completed.stdout.strip() or "Swift execution failed."
        raise RuntimeError(error_output)

    return completed.stdout.strip()


def ai_process(prompt: str) -> None:
    prompt = prompt.strip()
    try:
        result = _run_ai(prompt)
        print(result)
    except RuntimeError as error:
        print(error)