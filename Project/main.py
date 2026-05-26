#--- Imports ---
import json
import os
import sys
from pathlib import Path
import webview

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

try:
    from Project.core import equipment, project
except ModuleNotFoundError:
    project_root = os.path.dirname(os.path.abspath(__file__))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    from core import equipment, project


def _data_path(filename):
    return Path(__file__).resolve().parent / "core" / "data" / filename


def _load_list(path):
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _write_list(path, data):
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=4)


def _fallback_list_printers(include_status=False):
    data = _load_list(_data_path("printers.json"))
    if include_status:
        for printer in data:
            backend_port = printer.get("backend_port")
            if not isinstance(backend_port, int):
                try:
                    backend_port = int(backend_port)
                except (TypeError, ValueError):
                    backend_port = 7125
            frontend_port = printer.get("frontend_port")
            hotend = {"c": None, "t": None}
            bed = {"c": None, "t": None}
            if callable(getattr(equipment, "printer_status", None)):
                try:
                    try:
                        result = equipment.printer_status(
                            printer.get("IP_address"),
                            backend_port,
                            frontend_port,
                            include_temps=True,
                        )
                    except TypeError:
                        result = equipment.printer_status(
                            printer.get("IP_address"),
                            backend_port,
                        )
                    if isinstance(result, (list, tuple)) and len(result) >= 2:
                        color, label = result[0], result[1]
                        if len(result) > 2 and isinstance(result[2], dict):
                            hotend = result[2]
                        if len(result) > 3 and isinstance(result[3], dict):
                            bed = result[3]
                    else:
                        color, label = "red", "Offline"
                except Exception:
                    color, label = "red", "Offline"
            else:
                color, label = "red", "Offline"
            printer["status_color"] = color
            printer["status_label"] = label
            printer["status_hotend"] = hotend
            printer["status_bed"] = bed
            if color == "orange":
                printer["status"] = "printing"
            elif color == "green":
                printer["status"] = "idle"
            else:
                printer["status"] = "offline"
    return data


def _fallback_list_filaments():
    data = _load_list(_data_path("filaments.json"))
    for filament in data:
        if "name" not in filament and "manufacturer" in filament:
            filament["name"] = filament.get("manufacturer")
        if "color" not in filament and "colour" in filament:
            filament["color"] = filament.get("colour")
        if "weight" not in filament:
            filament["weight"] = None
        if "material" not in filament:
            filament["material"] = None
    return data


def _fallback_update_printer(printer_id, **updates):
    path = _data_path("printers.json")
    data = _load_list(path)
    updated = None
    for printer in data:
        if printer.get("printer_id") == printer_id:
            printer.update({k: v for k, v in updates.items() if v is not None})
            updated = printer
            break
    _write_list(path, data)
    return updated


def _fallback_update_filament(filament_id, **updates):
    path = _data_path("filaments.json")
    data = _load_list(path)
    updated = None
    for filament in data:
        if filament.get("filament_id") == filament_id:
            filament.update({k: v for k, v in updates.items() if v is not None})
            updated = filament
            break
    _write_list(path, data)
    return updated


def _fallback_remove_filament_from_printer(printer_id, filament_id):
    path = _data_path("printers.json")
    data = _load_list(path)
    for printer in data:
        if printer.get("printer_id") == printer_id:
            filament_ids = printer.get("filament_ids") or []
            printer["filament_ids"] = [fid for fid in filament_ids if fid != filament_id]
            break
    _write_list(path, data)


class API:
    def ADD_PROJECT(self, name, description=None):
        return project.add_project(name, description=description)

    def LIST_PROJECTS(self):
        return project.list_projects()

    def LIST_PROJECTS_BUNDLE(self, include_notes=False):
        return project.list_projects_bundle(include_notes)

    def UPDATE_PROJECT(self, name, new_name, **updates):
        return project.update_project(name, new_name, **updates)
    
    def REMOVE_PROJECT(self, name, delete_files):
        return project.remove_project(name, delete_files)
    
    def ADD_PROJECT_VERSION(self, name, version, file):
        return project.add_project_version(name, version, file)

    def LIST_PROJECT_VERSIONS(self, name):
        return project.list_project_versions(name)

    def CREATE_PROJECT_VERSION(self, name, version, label=None, meta=None):
        return project.create_project_version(name, version, label=label, meta=meta)

    def CREATE_PROJECT_VERSION_AUTO(self, name, label=None, meta=None):
        return project.create_project_version_auto(name, label=label, meta=meta)

    def UPDATE_PROJECT_VERSION(self, name, version, updates=None, **kwargs):
        if isinstance(updates, dict):
            kwargs.update(updates)
        return project.update_project_version(name, version, **kwargs)

    def DUPLICATE_PROJECT_VERSION(self, name, version, step=0.1):
        return project.duplicate_project_version(name, version, step=step)

    def REMOVE_PROJECT_VERSION(self, name, version, delete_files=True):
        return project.remove_project_version(name, version, delete_files)

    def ADD_PROJECT_VERSION_FILE_DATA(self, name, version, filename, data_base64):
        return project.add_project_version_file_data(name, version, filename, data_base64)

    def REMOVE_PROJECT_VERSION_FILE(self, name, version, filename):
        return project.remove_project_version_file(name, version, filename)

    def GET_PROJECT_NOTES(self, name):
        return project.get_project_notes(name)

    def SET_PROJECT_NOTES(self, name, content):
        return project.set_project_notes(name, content)

    def GET_PROJECT_VERSION_NOTES(self, name, version):
        return project.get_version_notes(name, version)

    def SET_PROJECT_VERSION_NOTES(self, name, version, content):
        return project.set_version_notes(name, version, content)
    
    def ADD_PRINTER(self, name, IP_address, frontend_port, backend_port, model=None):
        try:
            return equipment.add_printer(name, IP_address, frontend_port, backend_port, model)
        except TypeError:
            printer_id = equipment.add_printer(name, IP_address, frontend_port, backend_port)
            if model:
                if callable(getattr(equipment, "update_printer", None)):
                    equipment.update_printer(printer_id, model=model)
                else:
                    _fallback_update_printer(printer_id, model=model)
            return printer_id
    
    def ADD_FILAMENT(self, name, material, color, diameter, weight=None):
        try:
            return equipment.add_filament(name, material, color, diameter, weight)
        except TypeError:
            filament_id = equipment.add_filament(name, material, color, diameter)
            updates = {
                "name": name,
                "material": material,
                "color": color,
                "diameter": diameter,
            }
            if weight is not None:
                updates["weight"] = weight
            if callable(getattr(equipment, "update_filament", None)):
                equipment.update_filament(filament_id, **updates)
            else:
                _fallback_update_filament(filament_id, **updates)
            return filament_id
    
    def REMOVE_PRINTER(self, printer_id):
        return equipment.remove_printer(printer_id)

    def UPDATE_PRINTER(self, printer_id, updates=None, **kwargs):
        if isinstance(updates, dict):
            kwargs.update(updates)
        if callable(getattr(equipment, "update_printer", None)):
            return equipment.update_printer(printer_id, **kwargs)
        return _fallback_update_printer(printer_id, **kwargs)
    
    def REMOVE_FILAMENT(self, filament_id):
        return equipment.remove_filament(filament_id)

    def UPDATE_FILAMENT(self, filament_id, updates=None, **kwargs):
        if isinstance(updates, dict):
            kwargs.update(updates)
        if callable(getattr(equipment, "update_filament", None)):
            return equipment.update_filament(filament_id, **kwargs)
        return _fallback_update_filament(filament_id, **kwargs)
    
    def ADD_FILAMENT_TO_PRINTER(self, printer_id, filament_id):
        return equipment.add_filament_to_printer(printer_id, filament_id)

    def REMOVE_FILAMENT_FROM_PRINTER(self, printer_id, filament_id):
        if callable(getattr(equipment, "remove_filament_from_printer", None)):
            return equipment.remove_filament_from_printer(printer_id, filament_id)
        return _fallback_remove_filament_from_printer(printer_id, filament_id)

    def LIST_PRINTERS(self, include_status=False):
        if callable(getattr(equipment, "list_printers", None)):
            return equipment.list_printers(include_status)
        return _fallback_list_printers(include_status)

    def LIST_FILAMENTS(self):
        if callable(getattr(equipment, "list_filaments", None)):
            return equipment.list_filaments()
        return _fallback_list_filaments()
    
    def PRINTER_STATUS(self, printer_id):
        return equipment.printer_status(printer_id)

api = API()

window = webview.create_window(
    "My App",       # Window title
    "ui/index.html",   # Your HTML file
    js_api=api,     # Expose the API class to JS
    width=900,
    height=600,
)
webview.start()