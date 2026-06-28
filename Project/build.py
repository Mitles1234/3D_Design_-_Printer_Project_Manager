'''
Command to Run Script -> python build.py py2app
'''

from setuptools import setup
import os
import sys
import subprocess

# Define the application entry point
APP = ['main.py']

# Gather all frontend assets and UI files dynamically
DATA_FILES = [
    ('ui', [
        os.path.join('ui', f) for f in os.listdir('ui') 
        if os.path.isfile(os.path.join('ui', f))
    ]),
    ('ui/assets', [
        os.path.join('ui/assets', f) for f in os.listdir('ui/assets') 
        if os.path.isfile(os.path.join('ui/assets', f))
    ]),
    ('', ['logo.icns']), # Packaged globally into the Resources root
]

OPTIONS = {
    'argv_emulation': False,
    'iconfile': 'logo.icns',  # Sets your custom 3D cube squircle icon
    'packages': ['webview', 'core'],
    'plist': {
        'CFBundleName': '3D Design Manager',
        'CFBundleDisplayName': '3D Design Manager',
        'CFBundleShortVersionString': '1.0.0',
        'NSAppleEventsUsageDescription': 'Please allow access.',
    },
}

# 1. Execute the standard py2app setup operation
setup(
    app=APP,
    data_files=DATA_FILES,
    options={'py2app': OPTIONS},
    setup_requires=['py2app'],
)

# 2. Automated Post-Build Pipeline (Runs ONLY when building the production app bundle)
if 'py2app' in sys.argv and '--alias' not in sys.argv:
    print("\n🚀 py2app compilation finished successfully!")
    print("📦 Starting automated DMG installation packager...")
    
    dmg_output = "dist/Printer-Project-Manager.dmg"
    
    # Clean out any pre-existing DMG files to prevent build overlap errors
    if os.path.exists(dmg_output):
        os.remove(dmg_output)
        
    # Programmatic configuration string matching your file coordinates exactly
    dmg_command = [
        "create-dmg",
        "--volname", "3D Design Manager Installer",
        "--volicon", "logo.icns",
        "--window-pos", "200", "120",
        "--window-size", "600", "400",
        "--icon-size", "100",
        "--icon", "3D Design Manager.app", "150", "185",
        "--app-drop-link", "450", "185",
        "--hide-extension", "3D Design Manager.app",
        dmg_output,
        "dist/3D Design Manager.app"
    ]
    
    try:
        # Launch create-dmg directly through python's subprocess stream
        subprocess.run(dmg_command, check=True)
        print(f"\Success! Your installer is completely compiled and ready: {dmg_output}")
    except FileNotFoundError:
        print("\nError: 'create-dmg' command line engine could not be located.")
        print("Please fix this by running: brew install create-dmg")
    except subprocess.CalledProcessError as e:
        print(f"\nError: The DMG compilation process encountered an issue: {e}")
