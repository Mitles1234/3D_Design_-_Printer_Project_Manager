# --- Imports ---
import json # Allows for reading and writing JSON files
from pathlib import Path # Used for Building file paths
import secrets # Used for generating random strings for UUIDs

PRESETS = { # Preset character groupings for UUID generation
    "project":  (4, 2, 4), # Gives a UUID like "ABCD-EF-1234"
    "filament": (3, 3, 3), # Gives a UUID like "ABC-DEF-123"
    "printer":  (2, 2, 2, 2), # Gives a UUID like "AB-CD-EF-12"
    "node":     (3, 2, 3) # Gives a UUID like "ABC-DE-123"
}

def unique_id(preset=None, *groups, chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"):
    '''
    This is a UUID function that generates a UUID for all of the different objects in the system. This was
    a custom system as the standard UUID library in python didn't support the unique formatting I wanted for
    each object.
    '''
    groups = PRESETS.get(preset, groups) if preset else groups # Retrieves the preset character groupings for the UUID generation
    return "-".join( # Has 2 nested for loops for generating the UUID for each of the sections, joining them with a "-"
        "".join(secrets.choice(chars) for _ in range(n)) # Loops through for the value of each section
        for n in groups # Loops through for the number of sections in the UUID
    )

def settings(setting):
    '''
    This function retrieves specific settings from the settings.json
    '''
    return get_all_settings().get(setting) # Returns the Specific Setting

def get_all_settings():
    '''
    Loads the settings.json file into the program to be edited with the system, with some error protection.
    '''
    settings_path = Path(__file__).resolve().parent / "data" / "settings.json" # Path to the settings.json file
    try: # Reads the settings.json file and returns it as a dictionary
        with settings_path.open("r", encoding="utf-8") as handle: # Loads in the file
            return json.load(handle) # Returns the json data
    except (FileNotFoundError, json.JSONDecodeError): # If theirs an error
        return {} # Return a empty dictionary

def update_settings(updates: dict):
    '''
    Updates the settings in the settings.json file with the provided updates.
    '''
    settings_path = Path(__file__).resolve().parent / "data" / "settings.json" # Path to the settings.json file
    try: # Reads the settings.json file and returns it as a dictionary
        with settings_path.open("r", encoding="utf-8") as handle: # Loads in the file
            data = json.load(handle) # Saves it to the data variable
    except (FileNotFoundError, json.JSONDecodeError): # If theirs an error
        data = {} # Sets data to a empty dictionary
    if "Project_Directory" in updates: # Chacks if the user updated the project diectory
        new_dir = updates["Project_Directory"] # Sets new_dir to the new project directory
        if new_dir and not Path(new_dir).is_dir(): # Checks to ensure that the new project directory exists
            updates = {k: v for k, v in updates.items() if k != "Project_Directory"} # Loops through and applies the updates, excluding the updating of project directory
    data.update(updates) # Merges updates into the data
    with settings_path.open("w", encoding="utf-8") as handle: # Saves the updated settings
        json.dump(data, handle, indent=4) # Dumps the data into the json
    return data # Returns the updated settings as a dictionary

