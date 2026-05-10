import json
import os
import shutil
from datetime import datetime
from general import *


# --- Projects ---
def create_project(name):
    project_id = unique_id("project")
    creation_date = datetime.now().isoformat(timespec="seconds")

    base_dir = settings("project_path")
    project_dir = os.path.join(base_dir, name)
    os.makedirs(project_dir, exist_ok=True)

    path = os.path.join(project_dir, ".project.json")
    with open(path, "w") as f:
        json.dump({
            "project_id": project_id,
            "name": name,
            "creation_date": creation_date,
        }, f, indent=4)

    return {
        "project_id": project_id,
        "name": name,
        "creation_date": creation_date,
    }


def add_project_version(name, version, file):
    base_dir = settings("project_path")
    project_dir = os.path.join(base_dir, name)
    version_dir = os.path.join(project_dir, f"V{version}")
    os.makedirs(version_dir, exist_ok=True)

    filename = os.path.basename(file)
    destination = os.path.join(version_dir, filename)
    shutil.move(file, destination)


