from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def run_ai(prompt: str) -> str:
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


def print_ai_result(prompt: str) -> None:
    try:
        result = run_ai(prompt)
        print(result)
    except RuntimeError as error:
        print(error)


def main(prompt: str) -> None:
    prompt = prompt.strip()
    print_ai_result(prompt)


if __name__ == "__main__":
    main(input("Enter your prompt: ") + "JUST GIVE THE RESPONSE AS JUST THE NAME, DO NOT INCLUDE AN EXPLAINATION")