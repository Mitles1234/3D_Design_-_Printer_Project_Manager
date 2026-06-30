# 3D Design & Printer Project Manager

A local-first macOS desktop app for managing the full 3D design and printing workflow, project iteration history, printer management, and filament tracking, all in one place.

---

## Overview

Managing CAD iterations, filament spools, and printer state across separate applications creates real friction and data loss. This tool unifies those workflows under a single local interface, with no cloud dependency and no accounts required.

All data is stored in human-readable JSON and a structured file tree, so your projects remain fully accessible through a standard file browser even without the app open.

---

## Features

### Project Management
- Create projects with an auto-generated folder structure
- Save named design revisions with attached files and notes
- Visualise the full revision history as an interactive node graph, modelled after Blender geometry nodes, so branching and non-linear design paths are supported natively
- Drag-and-drop file import with extension validation against a configurable allowlist

### Printer Management
- Register Klipper-based printers (Mainsail / Fluidd) by IP address
- View live printer status, temperatures, and active job progress directly in the app
- Embed the printer's own web frontend inside the application window

### Filament Tracking
- Register filament spools with material, manufacturer, colour, and diameter
- Track remaining weight per spool
- Assign spools to printers via drag-and-drop; unassigned spools sit in a shared pool

### Apple Intelligence Integration
- Generate concise project and revision names from a plain-text description using on-device Apple Intelligence
- Processing is explicitly capped at 4000 tokens, keeping all inference on-device rather than routing to Apple's external servers

### Security
- Fully local: no data ever leaves the local network
- File imports are filtered by extension at the OS file picker level
- All user-supplied text is sanitised before rendering to prevent XSS
- Input validation and sanitisation applied to all fields before writing to JSON

---

## Requirements

- macOS (Apple Silicon or Intel)
- A modern Mac with Apple Intelligence support for AI naming features
- Klipper-based printer running Mainsail or Fluidd on the local network (optional)

---

## Installation

### From the DMG (recommended)
1. Download `Printer-Project-Manager.dmg` from the [Releases](https://github.com/Mitles1234/3D_Design_-_Printer_Project_Manager/releases) page
2. Open the DMG and drag **3D Design Manager** into your Applications folder
3. Launch the app

## Author

**Miles Cutting** - Software Engineering Stage 6, 2026
