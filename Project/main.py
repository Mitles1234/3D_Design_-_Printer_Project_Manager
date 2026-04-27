#--- Imports ---
import webview


class API:
    def say_hello(self, name):
        return f"Hello from Python, {name}!"

    def add_numbers(self, a, b):
        return a + b

api = API()
window = webview.create_window(
    "My App",       # Window title
    "ui/index.html",   # Your HTML file
    js_api=api,     # Expose the API class to JS
    width=900,
    height=600,
)
webview.start()