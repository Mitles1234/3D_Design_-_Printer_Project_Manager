#--- Imports ---
import os # Used for getting file paths and directory information
import sys # Used for modifying the Python module search path
import webview # Used for creating the native desktop window with web content

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # Gets the root directory of the repository
if repo_root not in sys.path: # Checks if the root directory is already in the Python path
    sys.path.insert(0, repo_root) # Adds the root directory to the path so package imports work correctly

try: # Tries to import from the package structure when run as part of the Project package
    from Project.core import equipment, project, ai # Imports the core modules from the installed package
except ModuleNotFoundError: # If the package import fails (e.g. when run directly from the Project folder)
    project_root = os.path.dirname(os.path.abspath(__file__)) # Gets the current file's directory
    if project_root not in sys.path: # Checks if it's already in the path
        sys.path.insert(0, project_root) # Adds it to the path as a fallback
    from core import equipment, project, ai # Imports the core modules directly as a fallback


class API:
    '''
    The API class exposes all backend Python functions to the JavaScript frontend via the
    pywebview js_api bridge. Each method is named in UPPER_CASE to match the convention used
    when calling them from JavaScript.
    '''
    def __init__(self):
        '''
        Initialises the API with no window reference, which is assigned after the window is created.
        '''
        self.window = None # Window reference set later once the webview window has started

    # --- Project Management ---
    def CREATE_PROJECT(self, name, accent_colour, description=""):
        '''
        Creates a new project with the given name, accent colour, and optional description.
        '''
        return project.create_project(name, accent_colour, description) # Delegates to the project module

    def GENERATE_PROJECT_DETAILS(self, description):
        '''
        Uses Apple Intelligence AI to generate a name and summary for a new project based on a description.
        '''
        return ai.generate_project_details(description) # Delegates to the AI module

    def GENERATE_REVISION_DETAILS(self, description):
        '''
        Uses Apple Intelligence AI to generate a name and summary for a new revision based on a description.
        '''
        return ai.generate_revision_details(description) # Delegates to the AI module

    def GET_PROJECT(self, project_id):
        '''
        Returns the project data dictionary for the given project ID.
        '''
        return project.get_project(project_id) # Delegates to the project module

    def LIST_PROJECTS(self):
        '''
        Returns a list of all projects.
        '''
        return project.list_projects() # Delegates to the project module

    def UPDATE_PROJECT(self, project_id, fields):
        '''
        Updates the project with the given ID using the provided fields dictionary.
        '''
        return project.update_project(project_id, fields) # Delegates to the project module

    def DELETE_PROJECT(self, project_id):
        '''
        Deletes the project with the given ID.
        '''
        return project.delete_project(project_id) # Delegates to the project module

    def CREATE_NODE(self, project_id, name, description=""):
        '''
        Creates a new node (revision or iteration) within the given project.
        '''
        return project.create_node(project_id, name, description) # Delegates to the project module

    def GET_NODE(self, project_id, node_id):
        '''
        Returns the node data dictionary for the given project and node IDs.
        '''
        return project.get_node(project_id, node_id) # Delegates to the project module

    def LIST_NODES(self, project_id):
        '''
        Returns a list of all nodes within the given project.
        '''
        return project.list_nodes(project_id) # Delegates to the project module

    def UPDATE_NODE(self, project_id, node_id, fields):
        '''
        Updates the node with the given IDs using the provided fields dictionary.
        '''
        return project.update_node(project_id, node_id, fields) # Delegates to the project module

    def DELETE_NODE(self, project_id, node_id):
        '''
        Deletes the node with the given project and node IDs.
        '''
        return project.delete_node(project_id, node_id) # Delegates to the project module

    def CREATE_CONNECTION(self, project_id, from_node_id, to_node_id):
        '''
        Creates a directional connection from one node to another within the given project.
        '''
        return project.create_connection(project_id, from_node_id, to_node_id) # Delegates to the project module

    def DELETE_CONNECTION(self, project_id, connection_id):
        '''
        Deletes the connection identified by connection_id from the given project.
        '''
        return project.delete_connection(project_id, connection_id) # Delegates to the project module

    def VALIDATE_CONNECTION(self, project_id):
        '''
        Validates all connections in the given project, checking that both nodes in each
        connection still exist.
        '''
        return project.validate_connection(project_id) # Delegates to the project module

    def GET_SETTINGS(self):
        '''
        Returns all settings as a dictionary from the settings.json file.
        '''
        return project.get_all_settings() # Delegates to the general settings function via the project module

    def UPDATE_SETTINGS(self, updates):
        '''
        Updates the settings with the provided dictionary of key-value pairs and saves them
        to the settings.json file.
        '''
        return project.update_settings(updates) # Delegates to the general settings function via the project module

    def PICK_DIRECTORY(self):
        '''
        Opens a native folder picker dialog and returns the selected directory path, or None
        if the user cancels.
        '''
        result = self.window.create_file_dialog(webview.FOLDER_DIALOG) # Opens the native folder picker dialog
        if not result: # If the user cancels or no folder is selected
            return None # Returns None
        return result[0] # Returns the first (and only) selected directory path

    def GET_PROJECT_STATS(self):
        '''
        Returns statistics about all projects, including total node and file counts.
        '''
        return project.get_stats() # Delegates to the project module

    def ADD_FILE_TO_NODE(self, project_id, node_id):
        '''
        Opens a native file picker dialog filtered to supported design file types, then copies
        the selected files into the node's folder and registers them in the JSON data.
        '''
        pattern = ";".join(f"*.{ext}" for ext in project._file_types()) # Builds the file type filter pattern from the supported extensions in settings
        file_types = (f"Design files ({pattern})", "All files (*.*)") # Defines the file type filter options for the dialog
        result = self.window.create_file_dialog( # Opens the native file picker dialog
            webview.OPEN_DIALOG, allow_multiple=True, file_types=file_types # Allows the user to select multiple files of the specified types
        )
        if not result: # If the user cancels or no files are selected
            return {"message": "No file selected", "error": True} # Returns an error response to the frontend
        return project.add_files_to_node(project_id, node_id, result) # Copies and registers the selected files in the node

    def REMOVE_FILE_FROM_NODE(self, project_id, node_id, filename):
        '''
        Removes a file from a node's folder by moving it to the system trash.
        '''
        return project.remove_file_from_node(project_id, node_id, filename) # Delegates to the project module

    def LIST_FILES_IN_NODE(self, project_id, node_id):
        '''
        Returns a list of all files stored in a node's folder on disk.
        '''
        return project.list_files_in_node(project_id, node_id) # Delegates to the project module

    # --- Equipment Management ---
    def GET_EQUIPMENT_STATS(self):
        '''
        Returns statistics about all equipment, including printer and filament spool counts.
        '''
        return equipment.get_stats() # Delegates to the equipment module

    def GET_NODE_NOTES(self, project_id, node_id):
        '''
        Returns the raw markdown content of a node's notes.md file.
        '''
        return project.get_node_notes(project_id, node_id) # Delegates to the project module

    def SET_NODE_NOTES(self, project_id, node_id, content):
        '''
        Saves markdown content to a node's notes.md file and syncs the node name and date
        from the parsed markdown fields back to the JSON data.
        '''
        return project.set_node_notes(project_id, node_id, content) # Delegates to the project module

    def ADD_FILE(self, project_id, node_id, file):
        '''
        Adds a file reference to a node's file list in the JSON data.
        '''
        return project.add_file(project_id, node_id, file) # Delegates to the project module

    def REMOVE_FILE(self, project_id, node_id, filename):
        '''
        Removes a file reference from a node's file list in the JSON data.
        '''
        return project.remove_file(project_id, node_id, filename) # Delegates to the project module

    def LIST_FILES(self, project_id, node_id):
        '''
        Returns the list of file references stored in a node's JSON data.
        '''
        return project.list_files(project_id, node_id) # Delegates to the project module

    def GET_FILE(self, project_id, node_id, filename):
        '''
        Checks if a specific file reference exists in a node's file list, returning the
        filename if found or None if not.
        '''
        return project.get_file(project_id, node_id, filename) # Delegates to the project module

    def ADD_PRINTER(self, name, IP_address, frontend_port, backend_port, model=None):
        '''
        Adds a new printer to the equipment system with the given network and model details.
        '''
        return equipment.safe_add_printer(name, IP_address, frontend_port, backend_port, model) # Delegates to the equipment module

    def ADD_FILAMENT(self, name, material, color, diameter, weight=None):
        '''
        Adds a new filament spool to the equipment system with the given material details.
        '''
        return equipment.safe_add_filament(name, material, color, diameter, weight) # Delegates to the equipment module

    def REMOVE_PRINTER(self, printer_id):
        '''
        Removes the printer with the given ID from the equipment system.
        '''
        return equipment.remove_printer(printer_id) # Delegates to the equipment module

    def UPDATE_PRINTER(self, printer_id, updates=None, **kwargs):
        '''
        Updates a printer's details, accepting either a dictionary of updates or keyword
        arguments, merging both if provided.
        '''
        if isinstance(updates, dict): # If updates was provided as a dictionary from JavaScript
            kwargs.update(updates) # Merges the updates dictionary into kwargs
        return equipment.safe_update_printer(printer_id, **kwargs) # Delegates to the equipment module with the merged kwargs

    def REMOVE_FILAMENT(self, filament_id):
        '''
        Removes the filament with the given ID from the equipment system.
        '''
        return equipment.remove_filament(filament_id) # Delegates to the equipment module

    def UPDATE_FILAMENT(self, filament_id, updates=None, **kwargs):
        '''
        Updates a filament's details, accepting either a dictionary of updates or keyword
        arguments, merging both if provided.
        '''
        if isinstance(updates, dict): # If updates was provided as a dictionary from JavaScript
            kwargs.update(updates) # Merges the updates dictionary into kwargs
        return equipment.safe_update_filament(filament_id, **kwargs) # Delegates to the equipment module with the merged kwargs

    def ADD_FILAMENT_TO_PRINTER(self, printer_id, filament_id):
        '''
        Assigns a filament spool to a printer.
        '''
        return equipment.add_filament_to_printer(printer_id, filament_id) # Delegates to the equipment module

    def REMOVE_FILAMENT_FROM_PRINTER(self, printer_id, filament_id):
        '''
        Removes a filament spool from a printer's assigned filament list.
        '''
        return equipment.safe_remove_filament_from_printer(printer_id, filament_id) # Delegates to the equipment module

    def LIST_PRINTERS(self, include_status=False):
        '''
        Returns a list of all printers, optionally including their live status from the
        Moonraker API.
        '''
        return equipment.safe_list_printers(include_status) # Delegates to the equipment module

    def LIST_FILAMENTS(self):
        '''
        Returns a list of all filament spools.
        '''
        return equipment.safe_list_filaments() # Delegates to the equipment module

    def PRINTER_STATUS(self, printer_id):
        '''
        Returns the live status of a specific printer by its ID.
        '''
        return equipment.printer_status(printer_id) # Delegates to the equipment module


api = API() # Creates the single API instance that handles all JS-to-Python calls

window = webview.create_window( # Creates the main application window
    "3D Design Manger", # Title displayed in the window title bar
    "ui/index.html", # The HTML file to load as the application UI
    js_api=api, # Exposes the API class to JavaScript via window.pywebview.api
    width=900, # Sets the initial window width in pixels
    height=600, # Sets the initial window height in pixels
)

def on_started():
    '''
    Callback function called once the webview window has started, used to give the API a
    reference to the window so it can open native file dialogs.
    '''
    api.window = window # Saves the window reference to the API so it can call create_file_dialog

webview.start(on_started) # Starts the webview event loop with the on_started callback and application icon
