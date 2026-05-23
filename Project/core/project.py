import base64
import json
import os
import shutil
from datetime import datetime
from pathlib import Path
from .general import *



def _project_base_dir():
    try:
        base_dir = settings("project_path")
    except Exception:
        base_dir = None

    if not base_dir:
        base_dir = os.path.join(Path(__file__).resolve().parent, "data", "projects")

    os.makedirs(base_dir, exist_ok=True)
    return base_dir


def _projects_index_path(base_dir):
    return os.path.join(base_dir, ".projects.json")


def _load_projects_index(base_dir):
    index_path = _projects_index_path(base_dir)
    try:
        with open(index_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        data = []
    return data


def _write_projects_index(base_dir, data):
    index_path = _projects_index_path(base_dir)
    os.makedirs(base_dir, exist_ok=True)
    with open(index_path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=4)


def _touch_file(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8"):
        pass


def _project_dir(base_dir, name):
    return os.path.join(base_dir, name)


def _project_notes_path(base_dir, name):
    return os.path.join(base_dir, f"{name}.md")


def _version_dir(project_dir, version):
    return os.path.join(project_dir, f"V{version}")


def _version_notes_path(base_dir, name, version):
    return os.path.join(base_dir, f"{name}_{version}.md")


def _normalize_version_data(name, version, data):
    normalized = dict(data or {})
    normalized.setdefault("project_name", name)
    normalized.setdefault("version", version)
    normalized.setdefault("creation_date", datetime.now().isoformat(timespec="seconds"))
    normalized.setdefault("label", f"Version {version}")
    normalized.setdefault("meta", {})
    meta = normalized.get("meta") or {}
    meta.setdefault("material", "")
    meta.setdefault("color", "")
    meta.setdefault("weight", "")
    normalized["meta"] = meta
    normalized.setdefault("files", [])
    return normalized


def _load_version_data(name, version, version_dir):
    version_path = os.path.join(version_dir, ".version.json")
    try:
        with open(version_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    normalized = _normalize_version_data(name, version, data)

    if not normalized.get("files"):
        files = []
        try:
            for filename in os.listdir(version_dir):
                if filename.startswith("."):
                    continue
                path = os.path.join(version_dir, filename)
                if not os.path.isfile(path):
                    continue
                files.append({
                    "name": filename,
                    "type": os.path.splitext(filename)[1].lstrip(".").lower(),
                    "size": os.path.getsize(path),
                })
        except FileNotFoundError:
            files = []
        normalized["files"] = files

    return normalized


def _write_version_data(version_dir, data):
    os.makedirs(version_dir, exist_ok=True)
    version_path = os.path.join(version_dir, ".version.json")
    with open(version_path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=4)


def _create_project(name, description=None):
    project_id = unique_id("project")
    creation_date = datetime.now().isoformat(timespec="seconds")

    base_dir = _project_base_dir()
    project_dir = _project_dir(base_dir, name)
    os.makedirs(project_dir, exist_ok=True)

    path = os.path.join(project_dir, ".project.json")
    project_data = {
        "project_id": project_id,
        "name": name,
        "creation_date": creation_date,
        "description": description or "",
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(project_data, f, indent=4)

    index = _load_projects_index(base_dir)
    index.append(project_data)
    _write_projects_index(base_dir, index)

    project_md = _project_notes_path(base_dir, name)
    _touch_file(project_md)

    return project_data



# --- Projects ---
def add_project(name, description=None):
    return _create_project(name, description=description)


def update_project(name, new_name=None, **updates):
    base_dir = _project_base_dir()
    project_dir = _project_dir(base_dir, name)
    project_path = os.path.join(project_dir, ".project.json")

    try:
        with open(project_path, "r", encoding="utf-8") as f:
            project_data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        project_data = {"name": name}

    old_name = name
    if new_name and new_name != name:
        new_project_dir = _project_dir(base_dir, new_name)
        if os.path.isdir(project_dir):
            os.rename(project_dir, new_project_dir)
        project_dir = new_project_dir
        name = new_name

        old_md = _project_notes_path(base_dir, old_name)
        new_md = _project_notes_path(base_dir, new_name)
        if os.path.exists(old_md):
            os.rename(old_md, new_md)

        for filename in os.listdir(base_dir):
            if filename.startswith(f"{old_name}_") and filename.endswith(".md"):
                src = os.path.join(base_dir, filename)
                suffix = filename[len(old_name):]
                dst = os.path.join(base_dir, f"{new_name}{suffix}")
                os.rename(src, dst)

    project_data.update(updates)
    project_data["name"] = name

    os.makedirs(project_dir, exist_ok=True)
    project_path = os.path.join(project_dir, ".project.json")
    with open(project_path, "w", encoding="utf-8") as f:
        json.dump(project_data, f, indent=4)

    index = _load_projects_index(base_dir)
    project_id = project_data.get("project_id")
    updated = False
    for item in index:
        if project_id and item.get("project_id") == project_id:
            item.update(project_data)
            updated = True
            break
        if item.get("name") == old_name:
            item.update(project_data)
            updated = True
            break
    if not updated:
        index.append(project_data)
    _write_projects_index(base_dir, index)

    project_md = _project_notes_path(base_dir, name)
    _touch_file(project_md)

    return project_data


def remove_project(name, delete_files=False):
    base_dir = _project_base_dir()
    index = _load_projects_index(base_dir)
    index = [item for item in index if item.get("name") != name]
    _write_projects_index(base_dir, index)

    if delete_files:
        project_dir = _project_dir(base_dir, name)
        if os.path.isdir(project_dir):
            shutil.rmtree(project_dir)

        md_path = _project_notes_path(base_dir, name)
        if os.path.exists(md_path):
            os.remove(md_path)

        for filename in os.listdir(base_dir):
            if filename.startswith(f"{name}_") and filename.endswith(".md"):
                os.remove(os.path.join(base_dir, filename))


def add_project_version(name, version, file):
    base_dir = _project_base_dir()
    project_dir = _project_dir(base_dir, name)
    version_dir = _version_dir(project_dir, version)
    os.makedirs(version_dir, exist_ok=True)

    filename = os.path.basename(file)
    destination = os.path.join(version_dir, filename)
    shutil.move(file, destination)

    version_data = _load_version_data(name, version, version_dir)
    files = version_data.get("files") or []
    files.append({
        "name": filename,
        "type": os.path.splitext(filename)[1].lstrip(".").lower(),
        "size": os.path.getsize(destination),
    })
    version_data["files"] = files
    if not version_data.get("creation_date"):
        version_data["creation_date"] = datetime.now().isoformat(timespec="seconds")
    _write_version_data(version_dir, version_data)

    version_md = _version_notes_path(base_dir, name, version)
    _touch_file(version_md)

    return version_data


def list_projects():
    base_dir = _project_base_dir()
    index = _load_projects_index(base_dir)

    project_map = {}
    for item in index:
        name = item.get("name")
        if not name:
            continue
        project_map[name] = dict(item)

    try:
        for entry in os.listdir(base_dir):
            project_dir = os.path.join(base_dir, entry)
            if not os.path.isdir(project_dir):
                continue
            project_path = os.path.join(project_dir, ".project.json")
            if not os.path.exists(project_path):
                continue
            try:
                with open(project_path, "r", encoding="utf-8") as handle:
                    data = json.load(handle)
            except (FileNotFoundError, json.JSONDecodeError):
                data = {"name": entry}
            data.setdefault("name", entry)
            project_map[entry] = {**project_map.get(entry, {}), **data}
    except FileNotFoundError:
        pass

    projects = list(project_map.values())
    for project in projects:
        project.setdefault("description", "")
        project.setdefault("creation_date", "")

    projects.sort(key=lambda item: item.get("creation_date") or "")
    _write_projects_index(base_dir, projects)
    return projects


def list_project_versions(name):
    base_dir = _project_base_dir()
    project_dir = _project_dir(base_dir, name)
    if not os.path.isdir(project_dir):
        return []

    versions = []
    for entry in os.listdir(project_dir):
        if not entry.startswith("V"):
            continue
        version = entry[1:]
        version_dir = os.path.join(project_dir, entry)
        if not os.path.isdir(version_dir):
            continue
        versions.append(_load_version_data(name, version, version_dir))

    versions.sort(key=lambda item: item.get("creation_date") or "")
    return versions


def create_project_version(name, version, label=None, meta=None):
    base_dir = _project_base_dir()
    project_dir = _project_dir(base_dir, name)
    version_dir = _version_dir(project_dir, version)
    os.makedirs(version_dir, exist_ok=True)

    version_data = _load_version_data(name, version, version_dir)
    if label:
        version_data["label"] = label
    if meta:
        version_meta = version_data.get("meta") or {}
        version_meta.update(meta)
        version_data["meta"] = version_meta

    _write_version_data(version_dir, version_data)
    version_md = _version_notes_path(base_dir, name, version)
    _touch_file(version_md)
    return version_data


def update_project_version(name, version, **updates):
    base_dir = _project_base_dir()
    project_dir = _project_dir(base_dir, name)
    version_dir = _version_dir(project_dir, version)
    version_data = _load_version_data(name, version, version_dir)

    if "label" in updates and updates["label"] is not None:
        version_data["label"] = updates["label"]

    if "meta" in updates and isinstance(updates["meta"], dict):
        meta = version_data.get("meta") or {}
        meta.update({k: v for k, v in updates["meta"].items() if v is not None})
        version_data["meta"] = meta

    for key in ("creation_date",):
        if key in updates and updates[key] is not None:
            version_data[key] = updates[key]

    _write_version_data(version_dir, version_data)
    return version_data


def remove_project_version(name, version, delete_files=True):
    base_dir = _project_base_dir()
    project_dir = _project_dir(base_dir, name)
    version_dir = _version_dir(project_dir, version)
    if delete_files and os.path.isdir(version_dir):
        shutil.rmtree(version_dir)

    version_md = _version_notes_path(base_dir, name, version)
    if os.path.exists(version_md):
        os.remove(version_md)


def add_project_version_file_data(name, version, filename, data_base64):
    base_dir = _project_base_dir()
    project_dir = _project_dir(base_dir, name)
    version_dir = _version_dir(project_dir, version)
    os.makedirs(version_dir, exist_ok=True)

    if "," in data_base64:
        data_base64 = data_base64.split(",", 1)[1]

    raw = base64.b64decode(data_base64)
    destination = os.path.join(version_dir, filename)
    with open(destination, "wb") as handle:
        handle.write(raw)

    version_data = _load_version_data(name, version, version_dir)
    files = [item for item in version_data.get("files", []) if item.get("name") != filename]
    files.append({
        "name": filename,
        "type": os.path.splitext(filename)[1].lstrip(".").lower(),
        "size": len(raw),
    })
    version_data["files"] = files
    _write_version_data(version_dir, version_data)
    return files[-1]


def remove_project_version_file(name, version, filename):
    base_dir = _project_base_dir()
    project_dir = _project_dir(base_dir, name)
    version_dir = _version_dir(project_dir, version)
    target = os.path.join(version_dir, filename)
    if os.path.exists(target):
        os.remove(target)

    version_data = _load_version_data(name, version, version_dir)
    version_data["files"] = [item for item in version_data.get("files", []) if item.get("name") != filename]
    _write_version_data(version_dir, version_data)
    return True


def get_project_notes(name):
    base_dir = _project_base_dir()
    path = _project_notes_path(base_dir, name)
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()
    except FileNotFoundError:
        return ""


def set_project_notes(name, content):
    base_dir = _project_base_dir()
    path = _project_notes_path(base_dir, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(content or "")
    return True


def get_version_notes(name, version):
    base_dir = _project_base_dir()
    path = _version_notes_path(base_dir, name, version)
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()
    except FileNotFoundError:
        return ""


def set_version_notes(name, version, content):
    base_dir = _project_base_dir()
    path = _version_notes_path(base_dir, name, version)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(content or "")
    return True


