#--- Imports ---
import webview
import project
import equipment


class API:
    def ADD_PROJECT(self, name):
        return project.add_project(name)

    def UPDATE_PROJECT(self, name, new_name, **updates):
        return project.update_project(name, new_name, **updates)
    
    def REMOVE_PROJECT(self, name, delete_files):
        return project.remove_project(name, delete_files)
    
    def ADD_PROJECT_VERSION(self, name, version, file):
        return project.add_project_version(name, version, file)
    
    def ADD_PRINTER(self, name, IP_address, frontend_port, backend_port):
        return equipment.add_printer(name, IP_address, frontend_port, backend_port)
    
    def ADD_FILAMENT(self, manufacturer, material, colour, diameter):
        return equipment.add_filament(manufacturer, material, colour, diameter)
    
    def REMOVE_PRINTER(self, printer_id):
        return equipment.remove_printer(printer_id)
    
    def REMOVE_FILAMENT(self, filament_id):
        return equipment.remove_filament(filament_id)
    
    def ADD_FILAMENT_TO_PRINTER(self, printer_id, filament_id):
        return equipment.add_filament_to_printer(printer_id, filament_id)
    
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
webview.start(gui='edgechromium')