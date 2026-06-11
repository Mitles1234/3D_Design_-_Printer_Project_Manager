#--- Imports ---
import os
import sys
import webview

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

try:
    from Project.core import equipment, project, ai
except ModuleNotFoundError:
    project_root = os.path.dirname(os.path.abspath(__file__))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    from core import equipment, project, ai


class API:
    def CREATE_PROJECT(self, name, accent_colour, description=""):
        return project.create_project(name, accent_colour, description)

    def GENERATE_PROJECT_DETAILS(self, description):
        return ai.generate_project_details(description)

    def GENERATE_REVISION_DETAILS(self, description):
        return ai.generate_revision_details(description)

    def GET_PROJECT(self, project_id):
        return project.get_project(project_id)

    def LIST_PROJECTS(self):
        return project.list_projects()

    def UPDATE_PROJECT(self, project_id, fields):
        return project.update_project(project_id, fields)

    def DELETE_PROJECT(self, project_id):
        return project.delete_project(project_id)

    def CREATE_NODE(self, project_id, name, description=""):
        return project.create_node(project_id, name, description)

    def GET_NODE(self, project_id, node_id):
        return project.get_node(project_id, node_id)

    def LIST_NODES(self, project_id):
        return project.list_nodes(project_id)

    def UPDATE_NODE(self, project_id, node_id, fields):
        return project.update_node(project_id, node_id, fields)

    def DELETE_NODE(self, project_id, node_id):
        return project.delete_node(project_id, node_id)

    def CREATE_CONNECTION(self, project_id, from_node_id, to_node_id):
        return project.create_connection(project_id, from_node_id, to_node_id)

    def DELETE_CONNECTION(self, project_id, connection_id):
        return project.delete_connection(project_id, connection_id)

    def VALIDATE_CONNECTION(self, project_id):
        return project.validate_connection(project_id)

    def ADD_FILE(self, project_id, node_id, file):
        return project.add_file(project_id, node_id, file)

    def REMOVE_FILE(self, project_id, node_id, filename):
        return project.remove_file(project_id, node_id, filename)

    def LIST_FILES(self, project_id, node_id):
        return project.list_files(project_id, node_id)

    def GET_FILE(self, project_id, node_id, filename):
        return project.get_file(project_id, node_id, filename)

    def ADD_PRINTER(self, name, IP_address, frontend_port, backend_port, model=None):
        return equipment.safe_add_printer(name, IP_address, frontend_port, backend_port, model)
    
    def ADD_FILAMENT(self, name, material, color, diameter, weight=None):
        return equipment.safe_add_filament(name, material, color, diameter, weight)
    
    def REMOVE_PRINTER(self, printer_id):
        return equipment.remove_printer(printer_id)

    def UPDATE_PRINTER(self, printer_id, updates=None, **kwargs):
        if isinstance(updates, dict):
            kwargs.update(updates)
        return equipment.safe_update_printer(printer_id, **kwargs)
    
    def REMOVE_FILAMENT(self, filament_id):
        return equipment.remove_filament(filament_id)

    def UPDATE_FILAMENT(self, filament_id, updates=None, **kwargs):
        if isinstance(updates, dict):
            kwargs.update(updates)
        return equipment.safe_update_filament(filament_id, **kwargs)
    
    def ADD_FILAMENT_TO_PRINTER(self, printer_id, filament_id):
        return equipment.add_filament_to_printer(printer_id, filament_id)

    def REMOVE_FILAMENT_FROM_PRINTER(self, printer_id, filament_id):
        return equipment.safe_remove_filament_from_printer(printer_id, filament_id)

    def LIST_PRINTERS(self, include_status=False):
        return equipment.safe_list_printers(include_status)

    def LIST_FILAMENTS(self):
        return equipment.safe_list_filaments()
    
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