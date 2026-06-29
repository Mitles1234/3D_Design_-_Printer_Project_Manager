# --- Imports ---
import json # Used for reading and writing JSON files
import os # Used for file and directory operations
import re # Used for finding and replacing text
from datetime import datetime, date as date_type # Used for working with dates
from pathlib import Path # Used for Building file paths
import shutil # Used for working with files and directories
from .general import * # Python file for some general functions for the project

#--- Generic ---
def _now_iso():
    '''
    Returns the time in iso format.
    '''
    return datetime.now().isoformat() # Returns the current date and time.


def _projects_path():
    '''
    Returns the path to the projects.json file, which is used to store all of the project data.
    '''
    return _projects_dir() / "projects.json" # Returns the project.json file path


def _parse_md_fields(content: str) -> dict:
    '''
    This function takes the markdown files to deconstruct the title, description, and date from the file. It 
    looks for the first H1 as the title, the first non-empty line after the first H2 as the description, and 
    a date in YYYY-MM-DD format after the title.
    '''
    title = '' # Sets the Title Variable
    description = '' # Sets the Description Variable
    date = '' # Sets the Date Variable

    title_match = re.search(r'^# (.+)', content, re.MULTILINE) # Sees if a H1 Exists
    if title_match: # If a H1 is found
        title = title_match.group(1).strip() # Sets the Title Variable to the First H1

    date_match = re.search(r'^\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})\s*$', content, re.MULTILINE) # Sees if a Date Exists
    if date_match: # If a Date is found
        date = date_match.group(1) # Sets the Date Variable to the First Date

    in_section = False # Lets the program know if its in the Description Section
    for line in content.splitlines(): # Loops through each line of the markdown
        if line.startswith('## '): # If the Section is a H2
            in_section = True # Says it is in the right section
            continue # Continues
        if in_section: # If it is in a H2 Section
            if line.startswith('#'): # If the title changes
                break # Break the loop
            stripped = line.strip() # Clean the Description
            if stripped: # If the Description is not empty
                description = stripped # Set the Description to the Cleaned Line
                break # Break the loop

    return {'title': title, 'description': description, 'date': date} # Returns the Title, Description, and Date as a dictionary


def _validate_date(iso: str) -> bool:
    '''
    The function validates the date in the markdown file to ensure it is in the correct format of YYYY-MM-DD. 
    '''
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', iso): # If their is not a match for the date format
        return False # Returns False
    try: # Tries to split the date into year, month, and day and validate it
        y, m, d = iso.split('-') # Seperates the date into year, month, and day
        date_type(int(y), int(m), int(d)) # Validates the date by creating a date object
        return True # If it works, returns True
    except ValueError: # If it failes, because the date is not valid
        return False # Returns False


def _load_projects():
    '''
    Loads the projects.json file into the program to be edited with the system, with some error protection.
    '''
    path = _projects_path() # Gets the Projects.json file path
    try: # Tries to open the projects.json file and load it into the program
        with path.open("r", encoding="utf-8") as handle: # Opens the projects.json file
            data = json.load(handle) # Loads it into data
    except (FileNotFoundError, json.JSONDecodeError): # If theirs an error
        data = [] # Data becomes a blank list
    for project in data: # For each project in the data
        nodes = project.get("nodes", []) # Nodes is set to each of the nodes 
        for node in nodes: # For each node in the nodes
            notes_path = _node_dir(project["project_id"], node["node_id"]) / "notes.md" # Creates path to notes.md
            node["description"] = _parse_md_fields(notes_path.read_text(encoding="utf-8"))["description"] if notes_path.exists() else "" # Gets the Description from the notes.md file and adds it to the node dictionary
        nodes.sort(key=lambda n: n.get("date") or "") # Sorts the nodes by date, with empty dates at the end
        project["nodes"] = nodes # Adds the sorted nodes back to the project dictionary
    return data # Returns the updated data


def _write_projects(projects):
    '''
    Writes the projects.json file with the updated data from the program, stripping any
    runtime-injected fields (like description) that live in notes.md rather than the JSON.
    '''
    path = _projects_path() # Gets the path to the projects.json file
    path.parent.mkdir(parents=True, exist_ok=True) # Creates the parent directory if it doesn't exist
    # Strip runtime-injected `description` from nodes — it lives in notes.md, not JSON
    clean = [] # Initialises an empty list to hold the cleaned project data
    for proj in projects: # Loops through each project
        p = {k: v for k, v in proj.items() if k != "nodes"} # Copies all project fields except the nodes list
        p["nodes"] = [{k: v for k, v in n.items() if k != "description"} for n in proj.get("nodes", [])] # Copies all node fields except the runtime-injected description
        clean.append(p) # Appends the cleaned project to the clean list
    with path.open("w", encoding="utf-8") as handle: # Opens the projects.json file for writing
        json.dump(clean, handle, indent=2) # Dumps the cleaned data into the JSON file with indentation


def _new_id(prefix, *groups):
    '''
    Generates a new unique ID with the given prefix, using the provided group sizes for the
    UUID format. Falls back to a timestamp-based ID if unique_id raises an error.
    '''
    try: # Tries to generate a unique ID using the custom UUID function
        if groups:
            value = unique_id(None, *groups) # Pass None as preset so integers aren't consumed as the preset arg
        elif prefix in PRESETS:
            value = unique_id(prefix) # Use the prefix as a preset name if one exists
        else:
            value = unique_id("project") # Fall back to the project preset
    except Exception: # If the unique_id function fails for any reason
        value = datetime.now().strftime("%Y%m%d%H%M%S") # Falls back to a timestamp-based ID
    return f"{prefix}_{value}" # Returns the ID with the prefix and underscore separator

def _file_types():
    '''
    Returns the list of allowed file extensions from the settings.json file, used to filter
    the file picker dialog when adding files to a node.
    '''
    settings_path = Path(__file__).resolve().parent / "data" / "settings.json" # Gets the path to the settings.json file
    try: # Tries to load the settings file
        with settings_path.open("r", encoding="utf-8") as handle: # Opens the settings file for reading
            settings = json.load(handle) # Loads the settings as a dictionary
            return settings.get("File_Extensions", []) # Returns the file extensions list, or empty if not set
    except (FileNotFoundError, json.JSONDecodeError): # If the file is missing or corrupted
        return [] # Returns an empty list as a fallback


# --- Folder helpers ---

def _projects_dir() -> Path:
    '''
    Returns the root directory where all project folders are stored, using the configured
    path from settings if it exists and is valid, otherwise defaulting to the data/projects folder.
    '''
    configured = settings("Project_Directory") # Gets the custom project directory from settings
    if configured: # If a custom directory is configured
        p = Path(configured) # Creates a Path object for the configured directory
        if p.is_dir(): # If the configured directory actually exists
            return p # Returns the custom project directory
    return Path(__file__).resolve().parent / "data" / "projects" # Falls back to the default data/projects directory

def _find_dir(parent: Path, id_prefix: str) -> Path:
    if parent.is_dir():
        for entry in parent.iterdir():
            if entry.is_dir() and (entry.name == id_prefix or entry.name.startswith(id_prefix + " (")):
                return entry
    return parent / id_prefix

def _project_dir(project_id: str) -> Path:
    '''
    Returns the path to a specific project's folder given its ID.
    '''
    return _find_dir(_projects_dir(), project_id)

def _node_dir(project_id: str, node_id: str) -> Path:
    '''
    Returns the path to a specific node's folder given its project and node IDs.
    '''
    return _find_dir(_project_dir(project_id), node_id)

def _init_project_folder(project_id: str, name: str, description: str = "") -> None:
    '''
    Creates the folder for a new project and writes its initial notes.md file with the
    project name and optional description as headings.
    '''
    folder = _projects_dir() / f"{project_id} ({name})" # Gets the path to the project folder
    folder.mkdir(parents=True, exist_ok=True) # Creates the folder, including any parent directories
    notes = folder / "notes.md" # Builds the path to the notes.md file
    if not notes.exists(): # Only writes the file if it doesn't already exist
        lines = [f"# {name}", ""] # Starts the markdown with the project name as an H1
        if description: # If a description was provided
            lines += ["## Description", "", description, ""] # Adds a description section
        lines += ["## Notes", "", ""] # Adds a blank notes section at the end
        notes.write_text("\n".join(lines), encoding="utf-8") # Writes the markdown content to the file

def _init_node_folder(project_id: str, node_id: str, name: str, description: str = "", date: str = "") -> None:
    '''
    Creates the folder for a new node and writes its initial notes.md file with the node
    name, optional date, and optional description as headings.
    '''
    folder = _project_dir(project_id) / f"{node_id} ({name})" # Gets the path to the node folder
    folder.mkdir(parents=True, exist_ok=True) # Creates the folder, including any parent directories
    notes = folder / "notes.md" # Builds the path to the notes.md file
    if not notes.exists(): # Only writes the file if it doesn't already exist
        lines = [f"# {name}", ""] # Starts the markdown with the node name as an H1
        if date: # If a date was provided
            lines += [f"**Date:** {date}", ""] # Adds the date in bold below the title
        if description: # If a description was provided
            lines += ["## Changes & Improvements", "", description, ""] # Adds a changes section with the description
        lines += ["## Notes", "", ""] # Adds a blank notes section at the end
        notes.write_text("\n".join(lines), encoding="utf-8") # Writes the markdown content to the file



#--- Project Functions ---
def create_project(name, accent_colour, description=""):
    '''
    Creates a new project with the given name, accent colour, and optional description,
    saves it to the projects.json file, and creates its folder with an initial notes.md.
    '''
    projects = _load_projects() # Loads all existing projects from the JSON file
    now = _now_iso() # Gets the current timestamp in ISO format
    project = { # Builds the new project dictionary
        "project_id": _new_id("proj"), # Generates a unique ID for the project
        "project_name": name, # Sets the project name
        "description": description, # Sets the project description
        "accent_colour": accent_colour, # Sets the accent colour used in the UI
        "collapsed": False, # Starts the project as expanded in the UI
        "created_at": now, # Records the creation timestamp
        "last_updated": now, # Sets last updated to the creation time
        "connections": [], # Initialises the connections list as empty
        "nodes": [], # Initialises the nodes list as empty
    }
    projects.append(project) # Appends the new project to the list
    _write_projects(projects) # Writes the updated list back to the JSON file
    _init_project_folder(project["project_id"], name, description) # Creates the project's folder and notes.md file
    return project # Returns the newly created project dictionary

def get_project(project_id):
    '''
    Returns the project data dictionary for the given project ID, or None if not found.
    '''
    projects = _load_projects() # Loads all existing projects from the JSON file
    for project in projects: # Loops through each project
        if project.get("project_id") == project_id: # If the project ID matches
            return project # Returns the matching project
    return None # Returns None if no project with that ID was found

def list_projects():
    '''
    Returns a list of all projects loaded from the projects.json file.
    '''
    return _load_projects() # Loads and returns all projects

def update_project(project_id, fields):
    '''
    Updates the project with the given ID by merging the provided fields dictionary into it,
    then saves the changes. Returns the updated project, or None if not found.
    '''
    if not isinstance(fields, dict): # If the fields argument is not a dictionary
        return None # Returns None to indicate invalid input
    projects = _load_projects() # Loads all existing projects from the JSON file
    for project in projects: # Loops through each project
        if project.get("project_id") == project_id: # If the project ID matches
            project.update(fields) # Merges the provided fields into the project
            project["last_updated"] = _now_iso() # Updates the last_updated timestamp
            _write_projects(projects) # Writes the updated list back to the JSON file
            return project # Returns the updated project
    return None # Returns None if no project with that ID was found

def delete_project(project_id):
    '''
    Deletes the project with the given ID from the projects.json file.
    Returns True if the project was found and deleted, or False if it was not found.
    '''
    projects = _load_projects() # Loads all existing projects from the JSON file
    filtered = [p for p in projects if p.get("project_id") != project_id] # Filters out the project with the matching ID
    if len(filtered) == len(projects): # If the length is the same, no project was removed
        return False # Returns False to indicate the project was not found
    _write_projects(filtered) # Writes the filtered list back to the JSON file
    return True # Returns True to indicate the project was successfully deleted



#--- Node Functions ---
def create_node(project_id, name, description=""):
    '''
    Creates a new node (revision or iteration) within the given project, saves it to the
    projects.json file, and creates its folder with an initial notes.md. Returns the new
    node with its description populated from the notes file.
    '''
    projects = _load_projects() # Loads all existing projects from the JSON file
    now = _now_iso() # Gets the current timestamp in ISO format
    for project in projects: # Loops through each project to find the matching one
        if project.get("project_id") == project_id: # If the project ID matches
            node = { # Builds the new node dictionary
                "node_id": _new_id("node"), # Generates a unique ID for the node using the "node" preset
                "node_name": name, # Sets the node name
                "date": now.split("T")[0], # Sets the date to today's date (YYYY-MM-DD)
                "files": [], # Initialises the files list as empty
                "created_at": now, # Records the creation timestamp
                "last_updated": now, # Sets last updated to the creation time
            }
            project.setdefault("nodes", []).append(node) # Adds the node to the project's nodes list
            project["last_updated"] = now # Updates the project's last_updated timestamp
            _write_projects(projects) # Writes the updated list back to the JSON file
            _init_node_folder(project_id, node["node_id"], name, description, node["date"]) # Creates the node's folder and notes.md file
            notes_path = _node_dir(project_id, node["node_id"]) / "notes.md" # Builds the path to the new notes.md file
            node["description"] = _parse_md_fields(notes_path.read_text(encoding="utf-8"))["description"] if notes_path.exists() else "" # Reads the description back from the notes.md file and injects it into the node
            return node # Returns the newly created node dictionary
    return None # Returns None if no project with that ID was found

def get_node(project_id, node_id):
    '''
    Returns the node data dictionary for the given project and node IDs, or None if not found.
    '''
    project = get_project(project_id) # Gets the parent project
    if not project: # If the project doesn't exist
        return None # Returns None
    for node in project.get("nodes", []): # Loops through each node in the project
        if node.get("node_id") == node_id: # If the node ID matches
            return node # Returns the matching node
    return None # Returns None if no node with that ID was found

def list_nodes(project_id):
    '''
    Returns a list of all nodes within the given project, or an empty list if not found.
    '''
    project = get_project(project_id) # Gets the parent project
    if not project: # If the project doesn't exist
        return [] # Returns an empty list
    return project.get("nodes", []) # Returns the project's nodes list

def update_node(project_id, node_id, fields):
    '''
    Updates the node with the given IDs by merging the provided fields dictionary into it,
    then saves the changes. Returns the updated node, or None if not found.
    '''
    if not isinstance(fields, dict): # If the fields argument is not a dictionary
        return None # Returns None to indicate invalid input
    projects = _load_projects() # Loads all existing projects from the JSON file
    for project in projects: # Loops through each project
        if project.get("project_id") != project_id: # If the project ID doesn't match
            continue # Skips to the next project
        for node in project.get("nodes", []): # Loops through each node in the matching project
            if node.get("node_id") == node_id: # If the node ID matches
                node.update(fields) # Merges the provided fields into the node
                node["last_updated"] = _now_iso() # Updates the node's last_updated timestamp
                project["last_updated"] = node["last_updated"] # Also updates the parent project's last_updated
                _write_projects(projects) # Writes the updated list back to the JSON file
                return node # Returns the updated node
    return None # Returns None if no matching project or node was found

def delete_node(project_id, node_id):
    '''
    Deletes the node with the given IDs from the project, and also removes any connections
    that referenced the deleted node. Returns True if deleted, or False if not found.
    '''
    projects = _load_projects() # Loads all existing projects from the JSON file
    for project in projects: # Loops through each project
        if project.get("project_id") != project_id: # If the project ID doesn't match
            continue # Skips to the next project
        nodes = project.get("nodes", []) # Gets the project's nodes list
        filtered = [n for n in nodes if n.get("node_id") != node_id] # Filters out the node with the matching ID
        if len(filtered) == len(nodes): # If the length is the same, no node was removed
            return False # Returns False to indicate the node was not found
        project["nodes"] = filtered # Replaces the nodes list with the filtered version
        project["connections"] = [ # Filters out any connections that referenced the deleted node
            c for c in project.get("connections", [])
            if c.get("from") != node_id and c.get("to") != node_id # Keeps only connections that don't involve the deleted node
        ]
        project["last_updated"] = _now_iso() # Updates the project's last_updated timestamp
        _write_projects(projects) # Writes the updated list back to the JSON file
        return True # Returns True to indicate the node was successfully deleted
    return False # Returns False if no project with that ID was found



#--- Connection Functions ---
def create_connection(project_id, from_node_id, to_node_id):
    '''
    Creates a new directional connection from one node to another within the given project
    and saves it to the projects.json file. Returns the connection dictionary, or None if
    the project was not found.
    '''
    projects = _load_projects() # Loads all existing projects from the JSON file
    for project in projects: # Loops through each project to find the matching one
        if project.get("project_id") == project_id: # If the project ID matches
            connection = {"from": from_node_id, "to": to_node_id} # Builds the connection dictionary
            project.setdefault("connections", []).append(connection) # Adds the connection to the project's connections list
            project["last_updated"] = _now_iso() # Updates the project's last_updated timestamp
            _write_projects(projects) # Writes the updated list back to the JSON file
            return connection # Returns the newly created connection dictionary
    return None # Returns None if no project with that ID was found

def delete_connection(project_id, connection_id):
    '''
    Deletes a connection from the given project. The connection_id can be a dictionary with
    "from" and "to" keys, a two-element list or tuple, or a "from->to" string. Returns True
    if deleted, or False if not found.
    '''
    projects = _load_projects() # Loads all existing projects from the JSON file
    for project in projects: # Loops through each project
        if project.get("project_id") != project_id: # If the project ID doesn't match
            continue # Skips to the next project
        connections = project.get("connections", []) # Gets the project's connections list
        if isinstance(connection_id, dict): # If the connection_id is provided as a dictionary
            def matches(conn): # Defines a matcher function for the dictionary format
                return conn.get("from") == connection_id.get("from") and conn.get("to") == connection_id.get("to") # Matches if both from and to match
        elif isinstance(connection_id, (list, tuple)) and len(connection_id) == 2: # If the connection_id is a list or tuple with two elements
            def matches(conn): # Defines a matcher function for the list/tuple format
                return conn.get("from") == connection_id[0] and conn.get("to") == connection_id[1] # Matches if both from and to match
        elif isinstance(connection_id, str) and "->" in connection_id: # If the connection_id is a string in "from->to" format
            frm, to = connection_id.split("->", 1) # Splits the string into from and to node IDs
            def matches(conn): # Defines a matcher function for the string format
                return conn.get("from") == frm and conn.get("to") == to # Matches if both from and to match
        else: # If the connection_id format is not recognised
            return False # Returns False to indicate invalid input
        filtered = [c for c in connections if not matches(c)] # Filters out the matching connection
        if len(filtered) == len(connections): # If the length is the same, no connection was removed
            return False # Returns False to indicate the connection was not found
        project["connections"] = filtered # Replaces the connections list with the filtered version
        project["last_updated"] = _now_iso() # Updates the project's last_updated timestamp
        _write_projects(projects) # Writes the updated list back to the JSON file
        return True # Returns True to indicate the connection was successfully deleted
    return False # Returns False if no project with that ID was found

def validate_connection(project_id):
    '''
    Validates all connections in the given project by checking that both the "from" and "to"
    nodes still exist. Returns a dictionary with a "valid" boolean and a list of any
    "invalid" connections found.
    '''
    project = get_project(project_id) # Gets the project data
    if not project: # If the project doesn't exist
        return {"valid": False, "invalid": []} # Returns invalid result if the project was not found
    node_ids = {n.get("node_id") for n in project.get("nodes", [])} # Builds a set of all existing node IDs
    invalid = [ # Finds all connections where either node no longer exists
        c for c in project.get("connections", [])
        if c.get("from") not in node_ids or c.get("to") not in node_ids # Checks if either end of the connection is a missing node
    ]
    return {"valid": len(invalid) == 0, "invalid": invalid} # Returns whether all connections are valid and the list of invalid ones



#--- File Functions ---
def add_file(project_id, node_id, file):
    '''
    Adds a file reference to a node's file list in the JSON data. Accepts the file as either
    a dictionary with a name key, or a string file path. Returns the filename if added, or
    None if the input is invalid or the node was not found.
    '''
    filename = None # Initialises the filename as None
    if isinstance(file, dict): # If the file is provided as a dictionary
        filename = file.get("name") or file.get("filename") # Gets the filename from the dictionary
    elif isinstance(file, str): # If the file is provided as a string path
        filename = os.path.basename(file) # Extracts just the filename from the full path
    if not filename: # If no filename could be determined
        return None # Returns None to indicate invalid input
    projects = _load_projects() # Loads all existing projects from the JSON file
    for project in projects: # Loops through each project
        if project.get("project_id") != project_id: # If the project ID doesn't match
            continue # Skips to the next project
        for node in project.get("nodes", []): # Loops through each node in the matching project
            if node.get("node_id") != node_id: # If the node ID doesn't match
                continue # Skips to the next node
            files = node.setdefault("files", []) # Gets or creates the files list
            if filename not in files: # If the file is not already in the list
                files.append(filename) # Adds the filename to the node's file list
            node["last_updated"] = _now_iso() # Updates the node's last_updated timestamp
            project["last_updated"] = node["last_updated"] # Also updates the parent project's last_updated
            _write_projects(projects) # Writes the updated list back to the JSON file
            return filename # Returns the filename to confirm it was added
    return None # Returns None if no matching project or node was found

def remove_file(project_id, node_id, filename):
    '''
    Removes a file reference from a node's file list in the JSON data. Returns True if the
    file was found and removed, or False if it was not found.
    '''
    projects = _load_projects() # Loads all existing projects from the JSON file
    for project in projects: # Loops through each project
        if project.get("project_id") != project_id: # If the project ID doesn't match
            continue # Skips to the next project
        for node in project.get("nodes", []): # Loops through each node in the matching project
            if node.get("node_id") != node_id: # If the node ID doesn't match
                continue # Skips to the next node
            files = node.get("files", []) # Gets the node's current files list
            filtered = [f for f in files if f != filename] # Filters out the matching filename
            if len(filtered) == len(files): # If the length is the same, the file wasn't in the list
                return False # Returns False to indicate the file was not found
            node["files"] = filtered # Replaces the files list with the filtered version
            node["last_updated"] = _now_iso() # Updates the node's last_updated timestamp
            project["last_updated"] = node["last_updated"] # Also updates the parent project's last_updated
            _write_projects(projects) # Writes the updated list back to the JSON file
            return True # Returns True to indicate the file was successfully removed
    return False # Returns False if no matching project or node was found

def list_files(project_id, node_id):
    '''
    Returns the list of file references stored in a node's JSON data, or an empty list if
    the node was not found.
    '''
    node = get_node(project_id, node_id) # Gets the node data
    if not node: # If the node doesn't exist
        return [] # Returns an empty list
    return node.get("files", []) # Returns the node's files list

def get_stats() -> dict:
    '''
    Returns a dictionary with the total number of projects, nodes (iterations), and files
    across the entire project system.
    '''
    projects = _load_projects() # Loads all existing projects from the JSON file
    total_nodes = sum(len(p.get("nodes", [])) for p in projects) # Counts the total number of nodes across all projects
    total_files = sum( # Counts the total number of files across all nodes across all projects
        len(n.get("files", []))
        for p in projects
        for n in p.get("nodes", [])
    )
    return {"projects": len(projects), "iterations": total_nodes, "files": total_files} # Returns the stats as a dictionary

def get_node_notes(project_id: str, node_id: str) -> str:
    '''
    Returns the raw markdown content of a node's notes.md file, or an empty string if the
    file does not exist.
    '''
    notes_path = _node_dir(project_id, node_id) / "notes.md" # Builds the path to the node's notes.md file
    if notes_path.exists(): # If the notes file exists
        return notes_path.read_text(encoding="utf-8") # Reads and returns the raw markdown content
    return "" # Returns an empty string if the file doesn't exist

def set_node_notes(project_id: str, node_id: str, content: str):
    '''
    Saves markdown content to a node's notes.md file and syncs the node name and date from
    the parsed markdown fields back to the JSON data. Returns None if the date is invalid,
    or the updated node dictionary on success.
    '''
    # Validate the date line before writing anything
    fields = _parse_md_fields(content) # Parses the markdown content to extract the title, description, and date
    if fields['date'] and not _validate_date(fields['date']): # If a date is present but not valid
        return None  # Signals to JS that the date value is invalid

    folder = _node_dir(project_id, node_id) # Gets the path to the node's folder
    folder.mkdir(parents=True, exist_ok=True) # Creates the folder if it doesn't exist
    (folder / "notes.md").write_text(content, encoding="utf-8") # Writes the markdown content to the notes.md file

    # Sync node_name and date from the parsed markdown fields
    updates = {} # Initialises an empty updates dictionary
    if fields['title']: # If a title was found in the markdown
        updates['node_name'] = fields['title'] # Queues an update to the node's name
    if fields['date']: # If a date was found in the markdown
        updates['date'] = fields['date'] # Queues an update to the node's date
    if updates: # If there are any fields to update
        update_node(project_id, node_id, updates) # Updates the node's JSON data with the parsed fields

    return get_node(project_id, node_id) # Returns the updated node dictionary

def get_file(project_id, node_id, filename):
    '''
    Checks if a specific file reference exists in a node's file list. Returns the filename
    if found, or None if the node doesn't exist or the file is not in the list.
    '''
    node = get_node(project_id, node_id) # Gets the node data
    if not node: # If the node doesn't exist
        return None # Returns None
    files = node.get("files", []) # Gets the node's files list
    return filename if filename in files else None # Returns the filename if present, otherwise None



#--- File Handling ---
def add_files_to_node(project_id, node_id, files):
    '''
    Copies a list of files from their source paths into a node's folder on disk, and
    registers each one in the node's file list in the JSON data. Returns a result dictionary
    with a message, an error flag, and the updated file list.
    '''
    if not files: # If no files were provided
        return {"message": "No files provided", "error": True} # Returns an error response
    added, errors = [], [] # Initialises empty lists for added files and errors
    for file in files: # Loops through each file path provided
        src = Path(file) # Creates a Path object for the source file
        if not src.is_file(): # If the source file doesn't exist
            errors.append(f"Not found: {src.name}") # Records an error for this file
            continue # Skips to the next file
        dest = _node_dir(project_id, node_id) / src.name # Builds the destination path inside the node's folder
        if dest.exists(): # If a file with the same name already exists in the node's folder
            errors.append(f"Already exists: {src.name}") # Records an error for this file
            continue # Skips to the next file
        shutil.copy2(src, dest) # Copies the file to the node's folder, preserving metadata
        add_file(project_id, node_id, src.name) # Registers the filename in the node's JSON data
        added.append(src.name) # Records the successful addition
    node = get_node(project_id, node_id) # Gets the updated node data
    files_list = node.get("files", []) if node else [] # Gets the updated file list from the node
    if added and not errors: # If all files were added successfully
        msg = f"Added {len(added)} file{'s' if len(added) > 1 else ''}" # Builds a success message with the count
    elif added: # If some files were added and some were skipped
        msg = f"Added {len(added)}, skipped {len(errors)}" # Builds a partial success message
    else: # If no files were added
        msg = errors[0] if errors else "No files added" # Uses the first error as the message
    return {"message": msg, "error": not added, "files": files_list} # Returns the result dictionary

def remove_file_from_node(project_id, node_id, filename):
    '''
    Removes a file from a node's folder by moving it to the macOS Trash, then removes its
    reference from the node's JSON data. Returns a result dictionary with a message, an error
    flag, and the updated file list.
    '''
    file_path = _node_dir(project_id, node_id) / filename # Builds the path to the file in the node's folder
    if not file_path.exists(): # If the file doesn't exist in the node's folder
        return {"message": f"File not found: {filename}", "error": True} # Returns an error response
    try: # Tries to move the file to the macOS Trash
        trash = Path.home() / ".Trash" # Gets the path to the macOS Trash folder
        dest = trash / file_path.name # Builds the destination path in the Trash
        if dest.exists(): # If a file with the same name already exists in the Trash
            dest = trash / f"{file_path.stem}_{file_path.stat().st_ino}{file_path.suffix}" # Appends the inode number to avoid a naming conflict
        shutil.move(str(file_path), dest) # Moves the file to the Trash
    except Exception as e: # If the move fails for any reason
        return {"message": f"Could not move to trash: {e}", "error": True} # Returns an error response with the exception message
    remove_file(project_id, node_id, filename) # Removes the filename reference from the node's JSON data
    node = get_node(project_id, node_id) # Gets the updated node data
    files_list = node.get("files", []) if node else [] # Gets the updated file list from the node
    return {"message": f"Removed {filename}", "error": False, "files": files_list} # Returns the success result dictionary

def list_files_in_node(project_id, node_id):
    '''
    Returns a list of all files stored in a node's folder on disk, excluding the notes.md
    file. Returns an empty list if the folder doesn't exist.
    '''
    files = [] # Initialises an empty list to hold the filenames
    folder_path = _node_dir(project_id, node_id) # Gets the path to the node's folder
    if not folder_path.exists(): # If the folder doesn't exist
        return files # Returns the empty list
    for item in folder_path.iterdir(): # Loops through each item in the node's folder
        if item.is_file() and item.name != "notes.md": # If the item is a file and not the notes.md
            files.append(item.name) # Adds the filename to the list
    return files # Returns the list of filenames