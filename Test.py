import json
import socket
from urllib.error import URLError, HTTPError
from urllib.request import urlopen

_TIMEOUT = 3.0

def _get_json(url: str) -> dict | None:
    print(f"[_get_json] Attempting to fetch: {url}")
    try:
        with urlopen(url, timeout=_TIMEOUT) as r:
            print(f"[_get_json] Got response, status code: {r.status}")
            data = r.read().decode("utf-8")
            print(f"[_get_json] Raw response: {data[:200]}")
            parsed = json.loads(data)
            print(f"[_get_json] JSON parsed successfully")
            return parsed
    except HTTPError as e:
        print(f"[_get_json] HTTPError: {e.code} - {e.reason}")
        return None
    except URLError as e:
        print(f"[_get_json] URLError: {e.reason}")
        return None
    except TimeoutError as e:
        print(f"[_get_json] TimeoutError: {e}")
        return None
    except json.JSONDecodeError as e:
        print(f"[_get_json] JSONDecodeError: {e}")
        return None
    except Exception as e:
        print(f"[_get_json] Unexpected exception: {type(e).__name__}: {e}")
        return None


def _port_open(host: str, port: int) -> bool:
    print(f"[_port_open] Checking {host}:{port}")
    try:
        with socket.create_connection((host, port), timeout=_TIMEOUT):
            print(f"[_port_open] Port {port} is OPEN")
            return True
    except OSError as e:
        print(f"[_port_open] OSError: {e}")
        return False


def printer_status(ip: str, backend_port: int = 7125) -> tuple[str, str]:
    print(f"\n[printer_status] Called with ip={ip!r}, backend_port={backend_port!r}")

    if not ip:
        print("[printer_status] No IP provided, returning Disconnected")
        return "grey", "Disconnected"

    try:
        backend_port = int(backend_port)
        print(f"[printer_status] backend_port parsed as: {backend_port}")
    except (TypeError, ValueError) as e:
        print(f"[printer_status] Could not parse backend_port ({e}), defaulting to 7125")
        backend_port = 7125

    url = f"http://{ip}:{backend_port}/printer/objects/query?print_stats&virtual_sdcard"
    print(f"[printer_status] Querying URL: {url}")

    payload = _get_json(url)

    if payload:
        print(f"[printer_status] Payload received, extracting status...")
        status      = payload.get("result", {}).get("status", {})
        print_stats = status.get("print_stats", {})
        sdcard      = status.get("virtual_sdcard", {})
        state       = print_stats.get("state", "")
        print(f"[printer_status] state={state!r}, print_stats={print_stats}, sdcard={sdcard}")

        if state == "printing":
            progress = sdcard.get("progress")
            print(f"[printer_status] Printing, progress={progress}")
            if isinstance(progress, (int, float)):
                return "orange", f"{round(progress * 100)}%"
            return "orange", "Printing"

        print(f"[printer_status] Not printing, returning Online")
        return "green", "Online"

    print(f"[printer_status] No payload received, trying port check...")
    if _port_open(ip, backend_port):
        print(f"[printer_status] Port open but API unreachable")
        return "yellow", "API Unreachable"

    print(f"[printer_status] Port closed, returning Offline")
    return "red", "Offline"


result = printer_status("192.168.0.170", 7125)
print(f"\n[result] {result}")