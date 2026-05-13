#--- Imports ---
import os
import sys
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


class API:
    def ADD_PROJECT(self, name):
        return project.add_project(name)

    def UPDATE_PROJECT(self, name, new_name, **updates):
        return project.update_project(name, new_name, **updates)
    
    def REMOVE_PROJECT(self, name, delete_files):
        return project.remove_project(name, delete_files)
    
    def ADD_PROJECT_VERSION(self, name, version, file):
        return project.add_project_version(name, version, file)
    
    def ADD_PRINTER(self, name, IP_address, frontend_port, backend_port, model=None):
        return equipment.add_printer(name, IP_address, frontend_port, backend_port, model)
    
    def ADD_FILAMENT(self, name, material, color, diameter, weight=None):
        return equipment.add_filament(name, material, color, diameter, weight)
    
    def REMOVE_PRINTER(self, printer_id):
        return equipment.remove_printer(printer_id)

    def UPDATE_PRINTER(self, printer_id, **updates):
        return equipment.update_printer(printer_id, **updates)
    
    def REMOVE_FILAMENT(self, filament_id):
        return equipment.remove_filament(filament_id)

    def UPDATE_FILAMENT(self, filament_id, **updates):
        return equipment.update_filament(filament_id, **updates)
    
    def ADD_FILAMENT_TO_PRINTER(self, printer_id, filament_id):
        return equipment.add_filament_to_printer(printer_id, filament_id)

    def REMOVE_FILAMENT_FROM_PRINTER(self, printer_id, filament_id):
        return equipment.remove_filament_from_printer(printer_id, filament_id)

    def LIST_PRINTERS(self, include_status=False):
        return equipment.list_printers(include_status)

    def LIST_FILAMENTS(self):
        return equipment.list_filaments()
    
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