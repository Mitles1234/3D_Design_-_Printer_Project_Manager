import json
from urllib.error import URLError
from urllib.request import urlopen
from pathlib import Path

from .general import *


def add_printer(name, IP_address=None, frontend_port=None, backend_port=7125):
    printers_path = Path(__file__).resolve().parent / "data" / "printers.json"
    try:
        with printers_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        data = []

    printer_id = unique_id("printer")
    data.append({
        "printer_id": printer_id,
        "name": name,
        "IP_address": IP_address,
        "frontend_port": frontend_port,
        "backend_port": backend_port,
        "filament_ids": [],
    })

    with printers_path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=4)

    return printer_id

def add_filament(manufacturer, material=None, colour="black", diameter=1.75):
    filaments_path = Path(__file__).resolve().parent / "data" / "filaments.json"
    try:
        with filaments_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        data = []

    filament_id = unique_id("filament")
    data.append({
        "filament_id": filament_id,
        "manufacturer": manufacturer,
        "material": material,
        "colour": colour,
        "diameter": diameter,
    })

    with filaments_path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=4)

    return filament_id

def remove_printer(printer_id):
    printers_path = Path(__file__).resolve().parent / "data" / "printers.json"
    try:
        with printers_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        data = []

    data = [item for item in data if item.get("printer_id") != printer_id]

    with printers_path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=4)

def remove_filament(filament_id):
    filaments_path = Path(__file__).resolve().parent / "data" / "filaments.json"
    try:
        with filaments_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        data = []

    data = [item for item in data if item.get("filament_id") != filament_id]

    with filaments_path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=4)

def add_filament_to_printer(printer_id, filament_id):
    printers_path = Path(__file__).resolve().parent / "data" / "printers.json"
    try:
        with printers_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        data = []

    for printer in data:
        if printer.get("printer_id") == printer_id:
            filament_ids = printer.setdefault("filament_ids", [])
            if filament_id not in filament_ids:
                filament_ids.append(filament_id)
            break

    with printers_path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=4)

def printer_status(IP_address, backend_port=7125):
    if not IP_address:
        return "grey", "Disconnected"

    base_url = f"http://{IP_address}:{backend_port}"
    url = f"{base_url}/printer/objects/query?print_stats&virtual_sdcard"

    try:
        with urlopen(url, timeout=2) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError, json.JSONDecodeError):
        return "red", "Offline"

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
