import json
import socket
from urllib.error import URLError, HTTPError
from urllib.request import urlopen
from pathlib import Path
from .general import *

def _load_list(path):
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        data = []
    return data


def _write_list(path, data):
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=4)


def _try_json(url, timeout=1.0):
    try:
        with urlopen(url, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None


def _ping(url, timeout=1.0):
    try:
        with urlopen(url, timeout=timeout) as response:
            response.read(1)
        return True
    except HTTPError:
        return True
    except (URLError, TimeoutError):
        return False


def _port_open(host, port, timeout=1.0):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _normalize_printer(printer):
    if "model" not in printer:
        printer["model"] = None
    filament_ids = printer.get("filament_ids")
    if not isinstance(filament_ids, list):
        printer["filament_ids"] = []
    backend_port = printer.get("backend_port")
    if not isinstance(backend_port, int):
        try:
            backend_port = int(backend_port)
        except (TypeError, ValueError):
            backend_port = 7125
    printer["backend_port"] = backend_port
    frontend_port = printer.get("frontend_port")
    if not isinstance(frontend_port, int):
        try:
            frontend_port = int(frontend_port)
        except (TypeError, ValueError):
            frontend_port = None
    printer["frontend_port"] = frontend_port
    return printer


def _normalize_filament(filament):
    if "name" not in filament and "manufacturer" in filament:
        filament["name"] = filament.get("manufacturer")
    if "color" not in filament and "colour" in filament:
        filament["color"] = filament.get("colour")
    return filament


def add_printer(name, IP_address=None, frontend_port=None, backend_port=7125, model=None):
    printers_path = Path(__file__).resolve().parent / "data" / "printers.json"
    data = _load_list(printers_path)

    printer_id = unique_id("printer")
    data.append({
        "printer_id": printer_id,
        "name": name,
        "model": model,
        "IP_address": IP_address,
        "frontend_port": frontend_port,
        "backend_port": backend_port,
        "filament_ids": [],
    })

    _write_list(printers_path, data)

    return printer_id


def add_filament(name, material=None, color="Black", diameter=1.75, weight=None):
    filaments_path = Path(__file__).resolve().parent / "data" / "filaments.json"
    data = _load_list(filaments_path)

    filament_id = unique_id("filament")
    data.append({
        "filament_id": filament_id,
        "name": name,
        "material": material,
        "color": color,
        "diameter": diameter,
        "weight": weight,
    })

    _write_list(filaments_path, data)

    return filament_id


def update_printer(printer_id, **updates):
    printers_path = Path(__file__).resolve().parent / "data" / "printers.json"
    data = _load_list(printers_path)

    updated = None
    for printer in data:
        if printer.get("printer_id") == printer_id:
            printer.update({k: v for k, v in updates.items() if v is not None})
            updated = printer
            break

    _write_list(printers_path, data)
    return updated

def remove_printer(printer_id):
    printers_path = Path(__file__).resolve().parent / "data" / "printers.json"
    data = _load_list(printers_path)

    data = [item for item in data if item.get("printer_id") != printer_id]

    _write_list(printers_path, data)


def update_filament(filament_id, **updates):
    filaments_path = Path(__file__).resolve().parent / "data" / "filaments.json"
    data = _load_list(filaments_path)

    updated = None
    for filament in data:
        if filament.get("filament_id") == filament_id:
            filament.update({k: v for k, v in updates.items() if v is not None})
            updated = filament
            break

    _write_list(filaments_path, data)
    return updated


def remove_filament(filament_id):
    filaments_path = Path(__file__).resolve().parent / "data" / "filaments.json"
    data = _load_list(filaments_path)

    data = [item for item in data if item.get("filament_id") != filament_id]

    _write_list(filaments_path, data)

    printers_path = Path(__file__).resolve().parent / "data" / "printers.json"
    printers = _load_list(printers_path)
    for printer in printers:
        filament_ids = printer.get("filament_ids") or []
        printer["filament_ids"] = [fid for fid in filament_ids if fid != filament_id]
    _write_list(printers_path, printers)


def add_filament_to_printer(printer_id, filament_id):
    printers_path = Path(__file__).resolve().parent / "data" / "printers.json"
    data = _load_list(printers_path)

    for printer in data:
        filament_ids = printer.get("filament_ids") or []
        if filament_id in filament_ids:
            filament_ids.remove(filament_id)
        printer["filament_ids"] = filament_ids

    for printer in data:
        if printer.get("printer_id") == printer_id:
            filament_ids = printer.setdefault("filament_ids", [])
            if filament_id not in filament_ids:
                filament_ids.append(filament_id)
            break

    _write_list(printers_path, data)


def remove_filament_from_printer(printer_id, filament_id):
    printers_path = Path(__file__).resolve().parent / "data" / "printers.json"
    data = _load_list(printers_path)

    for printer in data:
        if printer.get("printer_id") == printer_id:
            filament_ids = printer.get("filament_ids") or []
            printer["filament_ids"] = [fid for fid in filament_ids if fid != filament_id]
            break

    _write_list(printers_path, data)


def list_printers(include_status=False):
    printers_path = Path(__file__).resolve().parent / "data" / "printers.json"
    data = [_normalize_printer(item) for item in _load_list(printers_path)]
    if include_status:
        for printer in data:
            color, label = printer_status(
                printer.get("IP_address"),
                printer.get("backend_port", 7125),
                printer.get("frontend_port"),
            )
            printer["status_color"] = color
            printer["status_label"] = label
            if color == "orange":
                printer["status"] = "printing"
            elif color == "green":
                printer["status"] = "idle"
            else:
                printer["status"] = "offline"
    return data


def list_filaments():
    filaments_path = Path(__file__).resolve().parent / "data" / "filaments.json"
    return [_normalize_filament(item) for item in _load_list(filaments_path)]


def printer_status(IP_address, backend_port=7125, frontend_port=None):
    if not IP_address:
        return "grey", "Disconnected"

    try:
        backend_port = int(backend_port)
    except (TypeError, ValueError):
        backend_port = 7125

    base_url = f"http://{IP_address}:{backend_port}"
    query_url = f"{base_url}/printer/objects/query?print_stats&virtual_sdcard"

    payload = _try_json(query_url, timeout=1.0)
    if payload:
        status = payload.get("result", {}).get("status", {})
        print_stats = status.get("print_stats", {})
        sdcard = status.get("virtual_sdcard", {})

        if print_stats.get("state") == "printing":
            progress = sdcard.get("progress")
            if isinstance(progress, (int, float)):
                percent = int(round(progress * 100))
                return "orange", f"{percent}%"
            return "orange", "Printing"

        return "green", "online"

    if _port_open(IP_address, backend_port, timeout=1.0):
        return "green", "online"

    return "red", "Offline"


print(printer_status("192.168.0.170", 7125, 4409))