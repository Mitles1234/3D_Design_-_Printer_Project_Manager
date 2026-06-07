from __future__ import annotations
import subprocess
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


def generate_revision_details(description: str) -> dict:
    desc = description.strip()

    name = _run_ai(
        f'Give a short, descriptive name for a revision or iteration of a 3D printing design. '
        f'The changes made are: "{desc}". '
        f'Reply with just the revision name, nothing else. '
        f'Examples: "Revised geometry – wider flanges", "Heat-resistant rebuild", "Dual blower variant".'
    )

    summary = _run_ai(
        f'Write one sentence describing the specific improvements and changes made in this design revision: "{desc}". '
        f'Focus on what changed and why, not the overall project purpose. '
        f'Reply with just the sentence, nothing else.'
    )

    def _clean(s: str) -> str:
        return s.strip().strip('"').strip("'").strip()

    return {"name": _clean(name), "description": _clean(summary)}


def generate_project_details(description: str) -> dict:
    desc = description.strip()

    name = _run_ai(
        f'Give a short, creative name for a 3D printing project described as: "{desc}". '
        f'Reply with just the name, nothing else.'
    )

    summary = _run_ai(
        f'Write one sentence describing a 3D printing project described as: "{desc}". '
        f'Reply with just the sentence, nothing else.'
    )

    def _clean(s: str) -> str:
        return s.strip().strip('"').strip("'").strip()

    return {"name": _clean(name), "description": _clean(summary)}
