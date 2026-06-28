# --- Imports ---
import json # Used for reading and writing JSON files
import socket # Used for checking if a port is open on a network host
import sys # Used for accessing the module registry to look up functions at runtime
from urllib.error import URLError, HTTPError # Used for handling URL and HTTP errors when checking printer status
from urllib.request import urlopen # Used for making HTTP requests to the Moonraker printer API
from pathlib import Path # Used for building file paths
from .general import * # Python file for some general functions for the project


# --- Path Helpers ---

def _data_path(filename):
    '''
    Returns the full path to a file in the core data directory given just its filename.
    '''
    return Path(__file__).resolve().parent / "data" / filename # Builds and returns the path to the data directory file


# --- Fallback Functions ---
# These are used when the primary functions are not available, reading directly from JSON.

def _fallback_list_printers(include_status=False):
    '''
    Fallback function to list printers from the printers.json file directly, used when the
    primary list_printers function is not available. Optionally includes live status information
    for each printer.
    '''
    data = _load_list(_data_path("printers.json")) # Loads the printers data from the JSON file
    if include_status: # If status information is requested
        for printer in data: # Loops through each printer in the data
            backend_port = printer.get("backend_port") # Gets the backend port from the printer data
            if not isinstance(backend_port, int): # If the backend port is not an integer
                try: # Tries to convert it to an integer
                    backend_port = int(backend_port) # Converts the backend port to an integer
                except (TypeError, ValueError): # If the conversion fails
                    backend_port = 7125 # Defaults to port 7125 (Moonraker default)
            frontend_port = printer.get("frontend_port") # Gets the frontend port from the printer data
            hotend = {"c": None, "t": None} # Initialises hotend temperature as empty
            bed = {"c": None, "t": None} # Initialises bed temperature as empty
            if callable(getattr(sys.modules[__name__], "printer_status", None)): # Checks if the printer_status function exists in this module
                try: # Tries to get the printer status
                    try: # Tries calling with the include_temps parameter
                        result = printer_status( # Calls printer_status with all arguments
                            printer.get("IP_address"), # Passes the printer's IP address
                            backend_port, # Passes the backend port
                            frontend_port, # Passes the frontend port
                            include_temps=True, # Requests temperature data
                        )
                    except TypeError: # If that call signature fails (older function version)
                        result = printer_status( # Retries with fewer arguments
                            printer.get("IP_address"), # Passes the printer's IP address
                            backend_port, # Passes the backend port
                        )
                    if isinstance(result, (list, tuple)) and len(result) >= 2: # If the result is a list or tuple with at least 2 elements
                        color, label = result[0], result[1] # Unpacks the color and label from the result
                        if len(result) > 2 and isinstance(result[2], dict): # If temperature data is included in the result
                            hotend = result[2] # Sets the hotend temperature from the result
                        if len(result) > 3 and isinstance(result[3], dict): # If bed temperature data is also included
                            bed = result[3] # Sets the bed temperature from the result
                    else: # If the result format is not as expected
                        color, label = "red", "Offline" # Defaults to offline status
                except Exception: # If any other error occurs
                    color, label = "red", "Offline" # Defaults to offline status
            else: # If the printer_status function is not available in this module
                color, label = "red", "Offline" # Defaults to offline status
            printer["status_color"] = color # Saves the status colour to the printer dictionary
            printer["status_label"] = label # Saves the status label to the printer dictionary
            printer["status_hotend"] = hotend # Saves the hotend temperature to the printer dictionary
            printer["status_bed"] = bed # Saves the bed temperature to the printer dictionary
            if color == "orange": # If the printer is currently printing
                printer["status"] = "printing" # Sets the status to printing
            elif color == "green": # If the printer is idle and online
                printer["status"] = "idle" # Sets the status to idle
            else: # If the printer is offline or unreachable
                printer["status"] = "offline" # Sets the status to offline
    return data # Returns the list of printers with their statuses


def _fallback_list_filaments():
    '''
    Fallback function to list filaments from the filaments.json file directly, used when the
    primary list_filaments function is not available. Normalises field names for compatibility.
    '''
    data = _load_list(_data_path("filaments.json")) # Loads the filaments data from the JSON file
    for filament in data: # Loops through each filament in the data
        if "name" not in filament and "manufacturer" in filament: # If the name field is missing but manufacturer is present
            filament["name"] = filament.get("manufacturer") # Uses the manufacturer field as the name
        if "color" not in filament and "colour" in filament: # If the color field is missing but the British spelling is present
            filament["color"] = filament.get("colour") # Uses the colour field as the color
        if "weight" not in filament: # If the weight field is missing
            filament["weight"] = None # Sets the weight to None
        if "material" not in filament: # If the material field is missing
            filament["material"] = None # Sets the material to None
    return data # Returns the normalised list of filaments


def _fallback_update_printer(printer_id, **updates):
    '''
    Fallback function to update a printer in the printers.json file directly, used when the
    primary update_printer function is not available.
    '''
    path = _data_path("printers.json") # Gets the path to the printers.json file
    data = _load_list(path) # Loads the existing printers data from the JSON file
    updated = None # Initialises the updated printer as None
    for printer in data: # Loops through each printer in the data
        if printer.get("printer_id") == printer_id: # If the printer ID matches
            printer.update({k: v for k, v in updates.items() if v is not None}) # Updates the printer with all non-None values
            updated = printer # Saves a reference to the updated printer
            break # Breaks the loop once the printer is found
    _write_list(path, data) # Writes the updated data back to the JSON file
    return updated # Returns the updated printer dictionary


def _fallback_update_filament(filament_id, **updates):
    '''
    Fallback function to update a filament in the filaments.json file directly, used when the
    primary update_filament function is not available.
    '''
    path = _data_path("filaments.json") # Gets the path to the filaments.json file
    data = _load_list(path) # Loads the existing filaments data from the JSON file
    updated = None # Initialises the updated filament as None
    for filament in data: # Loops through each filament in the data
        if filament.get("filament_id") == filament_id: # If the filament ID matches
            filament.update({k: v for k, v in updates.items() if v is not None}) # Updates the filament with all non-None values
            updated = filament # Saves a reference to the updated filament
            break # Breaks the loop once the filament is found
    _write_list(path, data) # Writes the updated data back to the JSON file
    return updated # Returns the updated filament dictionary


def _fallback_remove_filament_from_printer(printer_id, filament_id):
    '''
    Fallback function to remove a filament from a printer in the printers.json file directly,
    used when the primary remove_filament_from_printer function is not available.
    '''
    path = _data_path("printers.json") # Gets the path to the printers.json file
    data = _load_list(path) # Loads the existing printers data from the JSON file
    for printer in data: # Loops through each printer in the data
        if printer.get("printer_id") == printer_id: # If the printer ID matches
            filament_ids = printer.get("filament_ids") or [] # Gets the list of filament IDs, defaulting to empty
            printer["filament_ids"] = [fid for fid in filament_ids if fid != filament_id] # Removes the filament ID from the list
            break # Breaks the loop once the printer is found
    _write_list(path, data) # Writes the updated data back to the JSON file


# --- JSON List Helpers ---

def _load_list(path):
    '''
    Loads a JSON list from a file at the given path, with error protection if the file is
    missing or corrupted.
    '''
    try: # Tries to open and load the JSON file
        with path.open("r", encoding="utf-8") as handle: # Opens the file for reading
            data = json.load(handle) # Loads the JSON data into a Python list
    except (FileNotFoundError, json.JSONDecodeError): # If the file doesn't exist or is corrupted
        data = [] # Defaults to an empty list
    return data # Returns the loaded data


def _write_list(path, data):
    '''
    Writes a list of data to a JSON file at the given path.
    '''
    with path.open("w", encoding="utf-8") as handle: # Opens the file for writing
        json.dump(data, handle, indent=4) # Dumps the data into the JSON file with indentation


# --- Network Helpers ---

def _try_json(url, timeout=1.0):
    '''
    Tries to fetch and parse JSON from a given URL, returning None if the request fails for
    any reason.
    '''
    try: # Tries to fetch and parse the JSON from the URL
        with urlopen(url, timeout=timeout) as response: # Opens the URL with a timeout
            return json.loads(response.read().decode("utf-8")) # Reads and parses the JSON response
    except (URLError, TimeoutError, json.JSONDecodeError, ValueError): # If any network or parsing error occurs
        return None # Returns None to indicate failure


def _ping(url, timeout=1.0):
    '''
    Pings a URL to check if it is reachable, returning True if the server responds and
    False if it is unreachable.
    '''
    try: # Tries to open the URL
        with urlopen(url, timeout=timeout) as response: # Opens the URL with a timeout
            response.read(1) # Reads a single byte to confirm the connection
        return True # Returns True if the connection was successful
    except HTTPError: # If an HTTP error occurs (like 404), the server is still reachable
        return True # Returns True since the server responded even with an error
    except (URLError, TimeoutError): # If the URL is unreachable or times out
        return False # Returns False to indicate the server is offline


def _port_open(host, port, timeout=1.0):
    '''
    Checks if a TCP port is open on a given host, returning True if it is reachable and
    False otherwise.
    '''
    try: # Tries to create a TCP connection to the host and port
        with socket.create_connection((host, port), timeout=timeout): # Attempts the TCP connection
            return True # Returns True if the connection was successful
    except OSError: # If the connection fails for any reason
        return False # Returns False to indicate the port is not open


# --- Temperature Helpers ---

def _safe_temp(value):
    '''
    Safely converts a temperature value to an integer, returning None if the value is not
    a valid number.
    '''
    if isinstance(value, (int, float)): # If the value is a number
        return int(round(value)) # Rounds and converts the value to an integer
    return None # Returns None if the value is not a valid number


def _extract_first_temp(status, keys):
    '''
    Extracts the first matching temperature reading from a printer status dictionary given a
    list of keys to try. Returns a dictionary with current (c) and target (t) temperature values.
    '''
    for key in keys: # Loops through each key to try
        data = status.get(key) # Gets the temperature data for this key
        if isinstance(data, dict): # If the temperature data is a dictionary
            return { # Returns the current and target temperatures
                "c": _safe_temp(data.get("temperature")), # Current temperature
                "t": _safe_temp(data.get("target")), # Target temperature
            }
    return {"c": None, "t": None} # Returns None values if no temperature data is found


# --- Normalisation Helpers ---

def _normalize_printer(printer):
    '''
    Normalises a printer dictionary to ensure it has all required fields with valid types,
    filling in defaults for any missing or invalid values.
    '''
    if "model" not in printer: # If the model field is missing
        printer["model"] = None # Sets the model to None
    filament_ids = printer.get("filament_ids") # Gets the current list of filament IDs
    if not isinstance(filament_ids, list): # If the filament IDs is not a list
        printer["filament_ids"] = [] # Sets the filament IDs to an empty list
    backend_port = printer.get("backend_port") # Gets the backend port
    if not isinstance(backend_port, int): # If the backend port is not an integer
        try: # Tries to convert it to an integer
            backend_port = int(backend_port) # Converts the backend port to an integer
        except (TypeError, ValueError): # If the conversion fails
            backend_port = 7125 # Defaults to port 7125 (Moonraker default)
    printer["backend_port"] = backend_port # Saves the validated backend port back to the printer
    frontend_port = printer.get("frontend_port") # Gets the frontend port
    if not isinstance(frontend_port, int): # If the frontend port is not an integer
        try: # Tries to convert it to an integer
            frontend_port = int(frontend_port) if frontend_port else None # Converts if present, otherwise None
        except (TypeError, ValueError): # If the conversion fails
            frontend_port = None # Defaults to None
    printer["frontend_port"] = frontend_port # Saves the validated frontend port back to the printer
    return printer # Returns the normalised printer dictionary


def _normalize_filament(filament):
    '''
    Normalises a filament dictionary to ensure it uses consistent field names, mapping legacy
    field names to their current equivalents.
    '''
    if "name" not in filament and "manufacturer" in filament: # If the name field is missing but manufacturer is present
        filament["name"] = filament.get("manufacturer") # Uses the manufacturer field as the name
    if "color" not in filament and "colour" in filament: # If the color field is missing but the British spelling is present
        filament["color"] = filament.get("colour") # Uses the colour field as the color
    return filament # Returns the normalised filament dictionary


# --- Safe Wrapper Functions ---
# These wrap the primary functions to handle version differences and missing functions gracefully.

def safe_add_printer(name, IP_address, frontend_port, backend_port, model=None):
    '''
    Safely adds a printer to the system, handling older versions of the add_printer function
    that may not support the model parameter by updating it separately if needed.
    '''
    try: # Tries to add the printer with all parameters including the model
        return add_printer(name, IP_address, frontend_port, backend_port, model) # Calls add_printer with the model parameter
    except TypeError: # If the function signature doesn't support the model parameter
        printer_id = add_printer(name, IP_address, frontend_port, backend_port) # Adds the printer without the model
        if model: # If a model was provided
            update_fn = getattr(sys.modules[__name__], "update_printer", None) # Checks if the update_printer function exists
            if callable(update_fn): # If the update_printer function exists
                update_printer(printer_id, model=model) # Updates the printer with the model separately
            else: # If the update_printer function is not available
                _fallback_update_printer(printer_id, model=model) # Uses the fallback update function
        return printer_id # Returns the newly created printer ID


def safe_add_filament(name, material, color, diameter, weight=None):
    '''
    Safely adds a filament to the system, handling older versions of the add_filament function
    that may not support all parameters by updating them separately if needed.
    '''
    try: # Tries to add the filament with all parameters including weight
        return add_filament(name, material, color, diameter, weight) # Calls add_filament with all parameters
    except TypeError: # If the function signature doesn't support the weight parameter
        filament_id = add_filament(name, material, color, diameter) # Adds the filament without the weight
        updates = { # Builds the updates dictionary with all the filament fields
            "name": name, # Sets the filament name
            "material": material, # Sets the filament material type
            "color": color, # Sets the filament color
            "diameter": diameter, # Sets the filament diameter
        }
        if weight is not None: # If a weight was provided
            updates["weight"] = weight # Adds the weight to the updates
        update_fn = getattr(sys.modules[__name__], "update_filament", None) # Checks if the update_filament function exists
        if callable(update_fn): # If the update_filament function exists
            update_filament(filament_id, **updates) # Updates the filament with all the fields
        else: # If the update_filament function is not available
            _fallback_update_filament(filament_id, **updates) # Uses the fallback update function
        return filament_id # Returns the newly created filament ID


def safe_update_printer(printer_id, **updates):
    '''
    Safely updates a printer by using the primary update_printer function if available,
    otherwise falling back to the direct JSON update.
    '''
    update_fn = getattr(sys.modules[__name__], "update_printer", None) # Checks if the update_printer function exists in this module
    if callable(update_fn): # If the update_printer function exists
        return update_printer(printer_id, **updates) # Calls the primary update function
    return _fallback_update_printer(printer_id, **updates) # Falls back to the direct JSON update


def safe_update_filament(filament_id, **updates):
    '''
    Safely updates a filament by using the primary update_filament function if available,
    otherwise falling back to the direct JSON update.
    '''
    update_fn = getattr(sys.modules[__name__], "update_filament", None) # Checks if the update_filament function exists in this module
    if callable(update_fn): # If the update_filament function exists
        return update_filament(filament_id, **updates) # Calls the primary update function
    return _fallback_update_filament(filament_id, **updates) # Falls back to the direct JSON update


def safe_remove_filament_from_printer(printer_id, filament_id):
    '''
    Safely removes a filament from a printer by using the primary remove_filament_from_printer
    function if available, otherwise falling back to the direct JSON update.
    '''
    remove_fn = getattr(sys.modules[__name__], "remove_filament_from_printer", None) # Checks if the remove_filament_from_printer function exists in this module
    if callable(remove_fn): # If the remove_filament_from_printer function exists
        return remove_filament_from_printer(printer_id, filament_id) # Calls the primary remove function
    return _fallback_remove_filament_from_printer(printer_id, filament_id) # Falls back to the direct JSON update


def safe_list_printers(include_status=False):
    '''
    Safely lists all printers by using the primary list_printers function if available,
    otherwise falling back to reading directly from the JSON file.
    '''
    list_fn = getattr(sys.modules[__name__], "list_printers", None) # Checks if the list_printers function exists in this module
    if callable(list_fn): # If the list_printers function exists
        try: # Tries to call the primary list function
            return list_printers(include_status) # Calls the primary list function
        except Exception: # If the primary function fails for any reason
            return _fallback_list_printers(include_status) # Falls back to the direct JSON read
    return _fallback_list_printers(include_status) # Falls back if the function doesn't exist at all


def safe_list_filaments():
    '''
    Safely lists all filaments by using the primary list_filaments function if available,
    otherwise falling back to reading directly from the JSON file.
    '''
    list_fn = getattr(sys.modules[__name__], "list_filaments", None) # Checks if the list_filaments function exists in this module
    if callable(list_fn): # If the list_filaments function exists
        return list_filaments() # Calls the primary list function
    return _fallback_list_filaments() # Falls back to the direct JSON read


def get_stats() -> dict:
    '''
    Returns a dictionary with the total number of printers, filament spools, and how many
    spools are attached to or available for printers.
    '''
    printers = safe_list_printers() # Gets the list of all printers
    filaments = safe_list_filaments() # Gets the list of all filaments
    attached_ids = {fid for p in printers for fid in (p.get("filament_ids") or [])} # Builds a set of all filament IDs that are currently attached to a printer
    attached = len(attached_ids) # Counts the number of attached filaments
    return { # Returns the stats as a dictionary
        "printers": len(printers), # Total number of printers
        "spools": len(filaments), # Total number of filament spools
        "attached": attached, # Number of spools currently attached to a printer
        "available": len(filaments) - attached, # Number of spools not attached to any printer
    }


# --- Printer Functions ---

def add_printer(name, IP_address=None, frontend_port=None, backend_port=7125, model=None):
    '''
    Adds a new printer to the printers.json file with the given network and model details,
    generating a unique ID for it.
    '''
    printers_path = Path(__file__).resolve().parent / "data" / "printers.json" # Gets the path to the printers.json file
    data = _load_list(printers_path) # Loads the existing printers data from the JSON file

    printer_id = unique_id("printer") # Generates a unique ID for the new printer
    data.append({ # Appends the new printer dictionary to the data list
        "printer_id": printer_id, # Sets the unique printer ID
        "name": name, # Sets the printer name
        "model": model, # Sets the printer model
        "IP_address": IP_address, # Sets the network IP address
        "frontend_port": frontend_port, # Sets the frontend (web UI) port
        "backend_port": backend_port, # Sets the backend (Moonraker API) port
        "filament_ids": [], # Initialises the assigned filament IDs as an empty list
    })

    _write_list(printers_path, data) # Writes the updated printers data back to the JSON file

    return printer_id # Returns the newly created printer ID


def add_filament(name, material=None, color="Black", diameter=1.75, weight=None):
    '''
    Adds a new filament spool to the filaments.json file with the given material details,
    generating a unique ID for it.
    '''
    filaments_path = Path(__file__).resolve().parent / "data" / "filaments.json" # Gets the path to the filaments.json file
    data = _load_list(filaments_path) # Loads the existing filaments data from the JSON file

    filament_id = unique_id("filament") # Generates a unique ID for the new filament
    data.append({ # Appends the new filament dictionary to the data list
        "filament_id": filament_id, # Sets the unique filament ID
        "name": name, # Sets the filament brand or name
        "material": material, # Sets the filament material type (e.g. PLA, ABS, PETG)
        "color": color, # Sets the filament color
        "diameter": diameter, # Sets the filament diameter in mm
        "weight": weight, # Sets the spool weight in grams
    })

    _write_list(filaments_path, data) # Writes the updated filaments data back to the JSON file

    return filament_id # Returns the newly created filament ID


def update_printer(printer_id, **updates):
    '''
    Updates an existing printer in the printers.json file with the provided keyword arguments,
    ignoring any None values to avoid overwriting existing data.
    '''
    printers_path = Path(__file__).resolve().parent / "data" / "printers.json" # Gets the path to the printers.json file
    data = _load_list(printers_path) # Loads the existing printers data from the JSON file

    updated = None # Initialises the updated printer as None
    for printer in data: # Loops through each printer in the data
        if printer.get("printer_id") == printer_id: # If the printer ID matches
            printer.update({k: v for k, v in updates.items() if v is not None}) # Updates the printer with all non-None values
            updated = printer # Saves a reference to the updated printer
            break # Breaks the loop once the printer is found

    _write_list(printers_path, data) # Writes the updated printers data back to the JSON file
    return updated # Returns the updated printer dictionary


def remove_printer(printer_id):
    '''
    Removes a printer from the printers.json file by its ID.
    '''
    printers_path = Path(__file__).resolve().parent / "data" / "printers.json" # Gets the path to the printers.json file
    data = _load_list(printers_path) # Loads the existing printers data from the JSON file

    data = [item for item in data if item.get("printer_id") != printer_id] # Filters out the printer with the matching ID

    _write_list(printers_path, data) # Writes the updated printers data back to the JSON file


def update_filament(filament_id, **updates):
    '''
    Updates an existing filament in the filaments.json file with the provided keyword arguments,
    ignoring any None values to avoid overwriting existing data.
    '''
    filaments_path = Path(__file__).resolve().parent / "data" / "filaments.json" # Gets the path to the filaments.json file
    data = _load_list(filaments_path) # Loads the existing filaments data from the JSON file

    updated = None # Initialises the updated filament as None
    for filament in data: # Loops through each filament in the data
        if filament.get("filament_id") == filament_id: # If the filament ID matches
            filament.update({k: v for k, v in updates.items() if v is not None}) # Updates the filament with all non-None values
            updated = filament # Saves a reference to the updated filament
            break # Breaks the loop once the filament is found

    _write_list(filaments_path, data) # Writes the updated filaments data back to the JSON file
    return updated # Returns the updated filament dictionary


def remove_filament(filament_id):
    '''
    Removes a filament from the filaments.json file by its ID, and also removes its ID from
    any printers that have it currently assigned.
    '''
    filaments_path = Path(__file__).resolve().parent / "data" / "filaments.json" # Gets the path to the filaments.json file
    data = _load_list(filaments_path) # Loads the existing filaments data from the JSON file

    data = [item for item in data if item.get("filament_id") != filament_id] # Filters out the filament with the matching ID

    _write_list(filaments_path, data) # Writes the updated filaments data back to the JSON file

    printers_path = Path(__file__).resolve().parent / "data" / "printers.json" # Gets the path to the printers.json file
    printers = _load_list(printers_path) # Loads the existing printers data from the JSON file
    for printer in printers: # Loops through each printer to clean up the filament reference
        filament_ids = printer.get("filament_ids") or [] # Gets the list of filament IDs, defaulting to empty
        printer["filament_ids"] = [fid for fid in filament_ids if fid != filament_id] # Removes the filament ID from the printer
    _write_list(printers_path, printers) # Writes the updated printers data back to the JSON file


# --- Filament-Printer Assignment Functions ---

def add_filament_to_printer(printer_id, filament_id):
    '''
    Assigns a filament to a printer. Since a filament can only be attached to one printer at
    a time, it is first removed from any printer it is currently assigned to before being added
    to the target printer.
    '''
    printers_path = Path(__file__).resolve().parent / "data" / "printers.json" # Gets the path to the printers.json file
    data = _load_list(printers_path) # Loads the existing printers data from the JSON file

    for printer in data: # Loops through all printers to unassign the filament from its current printer
        filament_ids = printer.get("filament_ids") or [] # Gets the list of filament IDs, defaulting to empty
        if filament_id in filament_ids: # If the filament is currently assigned to this printer
            filament_ids.remove(filament_id) # Removes the filament from this printer
        printer["filament_ids"] = filament_ids # Saves the updated filament IDs list

    for printer in data: # Loops through all printers to assign the filament to the target printer
        if printer.get("printer_id") == printer_id: # If the printer ID matches the target
            filament_ids = printer.setdefault("filament_ids", []) # Gets or creates the filament IDs list
            if filament_id not in filament_ids: # If the filament is not already assigned to this printer
                filament_ids.append(filament_id) # Adds the filament ID to the printer
            break # Breaks the loop once the target printer is found

    _write_list(printers_path, data) # Writes the updated printers data back to the JSON file


def remove_filament_from_printer(printer_id, filament_id):
    '''
    Removes a filament from a specific printer's assigned filament list.
    '''
    printers_path = Path(__file__).resolve().parent / "data" / "printers.json" # Gets the path to the printers.json file
    data = _load_list(printers_path) # Loads the existing printers data from the JSON file

    for printer in data: # Loops through each printer in the data
        if printer.get("printer_id") == printer_id: # If the printer ID matches
            filament_ids = printer.get("filament_ids") or [] # Gets the list of filament IDs, defaulting to empty
            printer["filament_ids"] = [fid for fid in filament_ids if fid != filament_id] # Removes the filament ID from the list
            break # Breaks the loop once the printer is found

    _write_list(printers_path, data) # Writes the updated printers data back to the JSON file


def list_printers(include_status=False):
    '''
    Lists all printers from the printers.json file, normalising their fields. Optionally
    fetches live status and temperature information from each printer's Moonraker API.
    '''
    printers_path = Path(__file__).resolve().parent / "data" / "printers.json" # Gets the path to the printers.json file
    data = [_normalize_printer(item) for item in _load_list(printers_path)] # Loads and normalises all printers
    if include_status: # If live status information is requested
        for printer in data: # Loops through each printer to fetch its live status
            color, label, hotend, bed = printer_status( # Gets the live status from the printer's API
                printer.get("IP_address"), # Passes the printer's IP address
                printer.get("backend_port", 7125), # Passes the backend port, defaulting to Moonraker's default
                printer.get("frontend_port"), # Passes the frontend port
                include_temps=True, # Requests temperature data along with the status
            )
            printer["status_color"] = color # Saves the status colour to the printer dictionary
            printer["status_label"] = label # Saves the status label to the printer dictionary
            printer["status_hotend"] = hotend # Saves the hotend temperature to the printer dictionary
            printer["status_bed"] = bed # Saves the bed temperature to the printer dictionary
            if color == "orange": # If the printer is currently printing
                printer["status"] = "printing" # Sets the status to printing
            elif color == "green": # If the printer is idle and online
                printer["status"] = "idle" # Sets the status to idle
            else: # If the printer is offline or unreachable
                printer["status"] = "offline" # Sets the status to offline
    return data # Returns the list of printers


def list_filaments():
    '''
    Lists all filaments from the filaments.json file, normalising their field names for
    consistency.
    '''
    filaments_path = Path(__file__).resolve().parent / "data" / "filaments.json" # Gets the path to the filaments.json file
    return [_normalize_filament(item) for item in _load_list(filaments_path)] # Loads, normalises, and returns all filaments


# --- Printer Status ---

def printer_status(IP_address, backend_port=7125, frontend_port=None, include_temps=False):
    '''
    Checks the live status of a printer by querying its Moonraker API. Returns a colour code
    and label indicating whether the printer is offline, idle, or printing with its progress
    percentage. Optionally returns hotend and bed temperature data as well. Falls back to a
    TCP port check if the API is unreachable.
    '''
    hotend = {"c": None, "t": None} # Initialises hotend temperature as empty
    bed = {"c": None, "t": None} # Initialises bed temperature as empty
    if not IP_address: # If no IP address is provided
        if include_temps: # If temperature data is also requested
            return "grey", "Disconnected", hotend, bed # Returns disconnected status with empty temps
        return "grey", "Disconnected" # Returns disconnected status

    try: # Tries to convert the backend port to an integer
        backend_port = int(backend_port) # Converts to integer
    except (TypeError, ValueError): # If the conversion fails
        backend_port = 7125 # Defaults to port 7125 (Moonraker default)

    try: # Tries to convert the frontend port to an integer
        frontend_port = int(frontend_port) if frontend_port else None # Converts if present, otherwise None
    except (TypeError, ValueError): # If the conversion fails
        frontend_port = None # Defaults to None

    moonraker_query = "/printer/objects/query?print_stats&virtual_sdcard&extruder&heater_bed" # The Moonraker API query string for printer status and temperatures

    # Try backend port (direct Moonraker), then frontend port (nginx proxy)
    ports_to_try = [backend_port] # Starts the list of ports to try with the backend port
    if frontend_port and frontend_port != backend_port: # If the frontend port is different from the backend port
        ports_to_try.append(frontend_port) # Adds the frontend port as a fallback

    for port in ports_to_try: # Loops through each port to try
        payload = _try_json(f"http://{IP_address}:{port}{moonraker_query}", timeout=2.0) # Tries to fetch the printer status from the Moonraker API
        if payload: # If the request was successful and returned data
            status = payload.get("result", {}).get("status", {}) # Extracts the status object from the API response
            print_stats = status.get("print_stats", {}) # Extracts the print stats from the status
            sdcard = status.get("virtual_sdcard", {}) # Extracts the virtual SD card stats (for print progress)
            hotend = _extract_first_temp(status, ("extruder", "extruder0")) # Extracts the hotend temperature
            bed = _extract_first_temp(status, ("heater_bed", "heater_bed0")) # Extracts the bed temperature

            if print_stats.get("state") == "printing": # If the printer is currently printing
                progress = sdcard.get("progress") # Gets the print progress as a decimal between 0 and 1
                if isinstance(progress, (int, float)): # If the progress is a valid number
                    percent = int(round(progress * 100)) # Converts the progress to a whole percentage
                    if include_temps: # If temperature data is also requested
                        return "orange", f"{percent}%", hotend, bed # Returns printing status with progress percentage and temps
                    return "orange", f"{percent}%" # Returns printing status with progress percentage
                if include_temps: # If temperature data is requested but no progress available
                    return "orange", "Printing", hotend, bed # Returns printing status with temps
                return "orange", "Printing" # Returns printing status without a percentage

            if include_temps: # If the printer is idle and temperature data is requested
                return "green", "online", hotend, bed # Returns idle status with temps
            return "green", "online" # Returns idle status

    # Fall back to TCP port-open check on backend, then frontend
    for port in ports_to_try: # Loops through each port to try a basic TCP check
        if _port_open(IP_address, port, timeout=2.0): # If the port is open (server is reachable)
            if include_temps: # If temperature data is also requested
                return "green", "online", hotend, bed # Returns online status with empty temps
            return "green", "online" # Returns online status

    if include_temps: # If all checks failed and temperature data is requested
        return "red", "Offline", hotend, bed # Returns offline status with empty temps
    return "red", "Offline" # Returns offline status
