import json
import os
import shutil
from datetime import datetime
from general import *


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
    with open(index_path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=4)


def _touch_file(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8"):
        pass


# --- Projects ---
def add_project(name):
    return create_project(name)


def create_project(name):
    project_id = unique_id("project")
    creation_date = datetime.now().isoformat(timespec="seconds")

    base_dir = settings("project_path")
    project_dir = os.path.join(base_dir, name)
    os.makedirs(project_dir, exist_ok=True)

    path = os.path.join(project_dir, ".project.json")
    project_data = {
        "project_id": project_id,
        "name": name,
        "creation_date": creation_date,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(project_data, f, indent=4)

    index = _load_projects_index(base_dir)
    index.append(project_data)
    _write_projects_index(base_dir, index)

    project_md = os.path.join(base_dir, f"{name}.md")
    _touch_file(project_md)

    return project_data


def update_project(name, new_name=None, **updates):
    base_dir = settings("project_path")
    project_dir = os.path.join(base_dir, name)
    project_path = os.path.join(project_dir, ".project.json")

    try:
        with open(project_path, "r", encoding="utf-8") as f:
            project_data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        project_data = {"name": name}

    old_name = name
    if new_name and new_name != name:
        new_project_dir = os.path.join(base_dir, new_name)
        if os.path.isdir(project_dir):
            os.rename(project_dir, new_project_dir)
        project_dir = new_project_dir
        name = new_name

        old_md = os.path.join(base_dir, f"{old_name}.md")
        new_md = os.path.join(base_dir, f"{new_name}.md")
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

    project_md = os.path.join(base_dir, f"{name}.md")
    _touch_file(project_md)

    return project_data


def remove_project(name, delete_files=False):
    base_dir = settings("project_path")
    index = _load_projects_index(base_dir)
    index = [item for item in index if item.get("name") != name]
    _write_projects_index(base_dir, index)

    if delete_files:
        project_dir = os.path.join(base_dir, name)
        if os.path.isdir(project_dir):
            shutil.rmtree(project_dir)

        md_path = os.path.join(base_dir, f"{name}.md")
        if os.path.exists(md_path):
            os.remove(md_path)

        for filename in os.listdir(base_dir):
            if filename.startswith(f"{name}_") and filename.endswith(".md"):
                os.remove(os.path.join(base_dir, filename))


def add_project_version(name, version, file):
    base_dir = settings("project_path")
    project_dir = os.path.join(base_dir, name)
    version_dir = os.path.join(project_dir, f"V{version}")
    os.makedirs(version_dir, exist_ok=True)

    filename = os.path.basename(file)
    destination = os.path.join(version_dir, filename)
    shutil.move(file, destination)

    version_data = {
        "project_name": name,
        "version": version,
        "creation_date": datetime.now().isoformat(timespec="seconds"),
        "filename": filename,
    }
    version_path = os.path.join(version_dir, ".version.json")
    with open(version_path, "w", encoding="utf-8") as f:
        json.dump(version_data, f, indent=4)

    version_md = os.path.join(base_dir, f"{name}_{version}.md")
    _touch_file(version_md)


