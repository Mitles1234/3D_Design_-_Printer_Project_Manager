import json
from pathlib import Path
import secrets

PRESETS = {
    "project":  (4, 2, 4),
    "filament": (3, 3, 3),
    "printer":  (2, 2, 2, 2),
    "node":     (3, 2, 3)
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

def get_all_settings():
    settings_path = Path(__file__).resolve().parent / "data" / "settings.json"
    try:
        with settings_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def update_settings(updates: dict):
    settings_path = Path(__file__).resolve().parent / "data" / "settings.json"
    try:
        with settings_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    if "Project_Directory" in updates:
        new_dir = updates["Project_Directory"]
        if new_dir and not Path(new_dir).is_dir():
            updates = {k: v for k, v in updates.items() if k != "Project_Directory"}
    data.update(updates)
    with settings_path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=4)
    return data

