import json
from pathlib import Path
import secrets

PRESETS = {
    "project":  (4, 2, 4),
    "filament": (3, 3, 3),
    "printer":  (2, 2, 2, 2),
}

def unique_id(preset=None, *groups, chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"):
    groups = PRESETS.get(preset, groups) if preset else groups
    return "-".join(
        "".join(secrets.choice(chars) for _ in range(n))
        for n in groups
    )

def settings(setting):
    settings_path = Path(__file__).resolve().parent / "data" / "settings.json"
    with settings_path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data.get(setting)

