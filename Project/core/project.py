import json
import os
import re
from datetime import datetime, date as date_type
from pathlib import Path
from .general import *
#from .ai import run_ai

#--- Generic ---
def _now_iso():
    return datetime.now().isoformat()

def _projects_path():
    return Path(__file__).resolve().parent / "data" / "projects.json"


def _parse_md_fields(content: str) -> dict:
    title = ''
    description = ''
    date = ''

    title_match = re.search(r'^# (.+)', content, re.MULTILINE)
    if title_match:
        title = title_match.group(1).strip()

    date_match = re.search(r'^\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})\s*$', content, re.MULTILINE)
    if date_match:
        date = date_match.group(1)

    in_section = False
    for line in content.splitlines():
        if line.startswith('## '):
            in_section = True
            continue
        if in_section:
            if line.startswith('#'):
                break
            stripped = line.strip()
            if stripped:
                description = stripped
                break

    return {'title': title, 'description': description, 'date': date}


def _validate_date(iso: str) -> bool:
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', iso):
        return False
    try:
        y, m, d = iso.split('-')
        date_type(int(y), int(m), int(d))
        return True
    except ValueError:
        return False


def _extract_node_description(project_id: str, node_id: str) -> str:
    notes_path = _node_dir(project_id, node_id) / "notes.md"
    if not notes_path.exists():
        return ""
    lines = notes_path.read_text(encoding="utf-8").splitlines()
    in_section = False
    for line in lines:
        if line.startswith("## "):
            in_section = True
            continue
        if in_section:
            if line.startswith("#"):
                break
            stripped = line.strip()
            if stripped:
                return stripped
    return ""


def _load_projects():
    path = _projects_path()
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        data = []
    for project in data:
        nodes = project.get("nodes", [])
        for node in nodes:
            node["description"] = _extract_node_description(
                project["project_id"], node["node_id"]
            )
        nodes.sort(key=lambda n: n.get("date") or "")
        project["nodes"] = nodes
    return data


def _write_projects(projects):
    path = _projects_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    # Strip runtime-injected `description` from nodes — it lives in notes.md, not JSON
    clean = []
    for proj in projects:
        p = {k: v for k, v in proj.items() if k != "nodes"}
        p["nodes"] = [{k: v for k, v in n.items() if k != "description"} for n in proj.get("nodes", [])]
        clean.append(p)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(clean, handle, indent=2)


def _new_id(prefix, *groups):
    try:
        value = unique_id(*groups) if groups else unique_id("project")
    except Exception:
        value = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"{prefix}_{value}"


# --- Folder helpers ---

def _projects_dir() -> Path:
    return Path(__file__).resolve().parent / "data" / "projects"

def _project_dir(project_id: str) -> Path:
    return _projects_dir() / project_id

def _node_dir(project_id: str, node_id: str) -> Path:
    return _project_dir(project_id) / node_id

def _init_project_folder(project_id: str, name: str, description: str = "") -> None:
    folder = _project_dir(project_id)
    folder.mkdir(parents=True, exist_ok=True)
    notes = folder / "notes.md"
    if not notes.exists():
        lines = [f"# {name}", ""]
        if description:
            lines += ["## Description", "", description, ""]
        lines += ["## Notes", "", ""]
        notes.write_text("\n".join(lines), encoding="utf-8")

def _init_node_folder(project_id: str, node_id: str, name: str, description: str = "") -> None:
    folder = _node_dir(project_id, node_id)
    folder.mkdir(parents=True, exist_ok=True)
    notes = folder / "notes.md"
    if not notes.exists():
        lines = [f"# {name}", ""]
        if description:
            lines += ["## Changes & Improvements", "", description, ""]
        lines += ["## Notes", "", ""]
        notes.write_text("\n".join(lines), encoding="utf-8")



#--- Project Functions ---
def create_project(name, accent_colour, description=""):
    # Creates a New Project
    projects = _load_projects()
    now = _now_iso()
    project = {
        "project_id": _new_id("proj"),
        "project_name": name,
        "description": description,
        "accent_colour": accent_colour,
        "collapsed": False,
        "created_at": now,
        "last_updated": now,
        "connections": [],
        "nodes": [],
    }
    projects.append(project)
    _write_projects(projects)
    _init_project_folder(project["project_id"], name, description)
    return project

def get_project(project_id):
    # Gets a project by ID
    projects = _load_projects()
    for project in projects:
        if project.get("project_id") == project_id:
            return project
    return None

def list_projects():
    # Lists all projects
    return _load_projects()

def update_project(project_id, fields):
    # Updates a project
    if not isinstance(fields, dict):
        return None
    projects = _load_projects()
    for project in projects:
        if project.get("project_id") == project_id:
            project.update(fields)
            project["last_updated"] = _now_iso()
            _write_projects(projects)
            return project
    return None

def delete_project(project_id):
    # Deletes a project
    projects = _load_projects()
    filtered = [p for p in projects if p.get("project_id") != project_id]
    if len(filtered) == len(projects):
        return False
    _write_projects(filtered)
    return True



#--- Node Functions ---
def create_node(project_id, name, description=""):
    # Creates a new node in a project
    projects = _load_projects()
    now = _now_iso()
    for project in projects:
        if project.get("project_id") == project_id:
            node = {
                "node_id": _new_id("node", 3, 3, 3),
                "node_name": name,
                "date": now.split("T")[0],
                "files": [],
                "created_at": now,
                "last_updated": now,
            }
            project.setdefault("nodes", []).append(node)
            project["last_updated"] = now
            _write_projects(projects)
            _init_node_folder(project_id, node["node_id"], name, description)
            node["description"] = _extract_node_description(project_id, node["node_id"])
            return node
    return None

def get_node(project_id, node_id):
    # Gets a node by ID
    project = get_project(project_id)
    if not project:
        return None
    for node in project.get("nodes", []):
        if node.get("node_id") == node_id:
            return node
    return None

def list_nodes(project_id):
    # Lists all nodes in a project
    project = get_project(project_id)
    if not project:
        return []
    return project.get("nodes", [])

def update_node(project_id, node_id, fields):
    # Updates a node
    if not isinstance(fields, dict):
        return None
    projects = _load_projects()
    for project in projects:
        if project.get("project_id") != project_id:
            continue
        for node in project.get("nodes", []):
            if node.get("node_id") == node_id:
                node.update(fields)
                node["last_updated"] = _now_iso()
                project["last_updated"] = node["last_updated"]
                _write_projects(projects)
                return node
    return None

def delete_node(project_id, node_id):
    # Deletes a node
    projects = _load_projects()
    for project in projects:
        if project.get("project_id") != project_id:
            continue
        nodes = project.get("nodes", [])
        filtered = [n for n in nodes if n.get("node_id") != node_id]
        if len(filtered) == len(nodes):
            return False
        project["nodes"] = filtered
        project["connections"] = [
            c for c in project.get("connections", [])
            if c.get("from") != node_id and c.get("to") != node_id
        ]
        project["last_updated"] = _now_iso()
        _write_projects(projects)
        return True
    return False



#--- Connection Functions ---
def create_connection(project_id, from_node_id, to_node_id):
    # Creates a new connection between two nodes
    projects = _load_projects()
    for project in projects:
        if project.get("project_id") == project_id:
            connection = {"from": from_node_id, "to": to_node_id}
            project.setdefault("connections", []).append(connection)
            project["last_updated"] = _now_iso()
            _write_projects(projects)
            return connection
    return None

def delete_connection(project_id, connection_id):
    # Deletes a connection
    projects = _load_projects()
    for project in projects:
        if project.get("project_id") != project_id:
            continue
        connections = project.get("connections", [])
        if isinstance(connection_id, dict):
            def matches(conn):
                return conn.get("from") == connection_id.get("from") and conn.get("to") == connection_id.get("to")
        elif isinstance(connection_id, (list, tuple)) and len(connection_id) == 2:
            def matches(conn):
                return conn.get("from") == connection_id[0] and conn.get("to") == connection_id[1]
        elif isinstance(connection_id, str) and "->" in connection_id:
            frm, to = connection_id.split("->", 1)
            def matches(conn):
                return conn.get("from") == frm and conn.get("to") == to
        else:
            return False
        filtered = [c for c in connections if not matches(c)]
        if len(filtered) == len(connections):
            return False
        project["connections"] = filtered
        project["last_updated"] = _now_iso()
        _write_projects(projects)
        return True
    return False

def validate_connection(project_id):
    # Validates a connection between nodes of a project
    project = get_project(project_id)
    if not project:
        return {"valid": False, "invalid": []}
    node_ids = {n.get("node_id") for n in project.get("nodes", [])}
    invalid = [
        c for c in project.get("connections", [])
        if c.get("from") not in node_ids or c.get("to") not in node_ids
    ]
    return {"valid": len(invalid) == 0, "invalid": invalid}



#--- File Functions ---
def add_file(project_id, node_id, file):
    # Adds a file to a node
    filename = None
    if isinstance(file, dict):
        filename = file.get("name") or file.get("filename")
    elif isinstance(file, str):
        filename = os.path.basename(file)
    if not filename:
        return None
    projects = _load_projects()
    for project in projects:
        if project.get("project_id") != project_id:
            continue
        for node in project.get("nodes", []):
            if node.get("node_id") != node_id:
                continue
            files = node.setdefault("files", [])
            if filename not in files:
                files.append(filename)
            node["last_updated"] = _now_iso()
            project["last_updated"] = node["last_updated"]
            _write_projects(projects)
            return filename
    return None

def remove_file(project_id, node_id, filename):
    # Removes a file from a node
    projects = _load_projects()
    for project in projects:
        if project.get("project_id") != project_id:
            continue
        for node in project.get("nodes", []):
            if node.get("node_id") != node_id:
                continue
            files = node.get("files", [])
            filtered = [f for f in files if f != filename]
            if len(filtered) == len(files):
                return False
            node["files"] = filtered
            node["last_updated"] = _now_iso()
            project["last_updated"] = node["last_updated"]
            _write_projects(projects)
            return True
    return False

def list_files(project_id, node_id):
    # Lists all files in a node
    node = get_node(project_id, node_id)
    if not node:
        return []
    return node.get("files", [])

def get_stats() -> dict:
    projects = _load_projects()
    total_nodes = sum(len(p.get("nodes", [])) for p in projects)
    total_files = sum(
        len(n.get("files", []))
        for p in projects
        for n in p.get("nodes", [])
    )
    return {"projects": len(projects), "iterations": total_nodes, "files": total_files}

def get_node_notes(project_id: str, node_id: str) -> str:
    notes_path = _node_dir(project_id, node_id) / "notes.md"
    if notes_path.exists():
        return notes_path.read_text(encoding="utf-8")
    return ""

def set_node_notes(project_id: str, node_id: str, content: str):
    # Validate the date line before writing anything
    fields = _parse_md_fields(content)
    if fields['date'] and not _validate_date(fields['date']):
        return None  # Signals to JS that the date value is invalid

    folder = _node_dir(project_id, node_id)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "notes.md").write_text(content, encoding="utf-8")

    # Sync node_name and date from the parsed markdown fields
    updates = {}
    if fields['title']:
        updates['node_name'] = fields['title']
    if fields['date']:
        updates['date'] = fields['date']
    if updates:
        update_node(project_id, node_id, updates)

    return get_node(project_id, node_id)

def get_file(project_id, node_id, filename):
    # Gets a file from a node
    node = get_node(project_id, node_id)
    if not node:
        return None
    files = node.get("files", [])
    return filename if filename in files else None