# 3D Design & Printer Project Manager — Feature Plan

---

## Core Application

- [ ] **App Entry Point**
  - [ ] pywebview window launches correctly from main.py
  - [ ] HTML shell loads with correct absolute path
  - [ ] Python API bridge mounts and is accessible from JS
  - [ ] App config directory created on first launch (`~/3DProjectManager/`)

---

## Home Screen

- [ ] **Navigation Bar**
  - [ ] Projects tab
  - [ ] Printers tab
  - [ ] Filaments tab
  - [ ] Active tab highlighting

- [ ] **Printer Sidebar**
  - [ ] Registered printers listed as icons
  - [ ] Status dot per printer (green / orange / red)
    - [ ] Green — online and idle
    - [ ] Orange — printing or paused
    - [ ] Red — unreachable
  - [ ] Status polled on load via Mainsail / Fluidd API
  - [ ] Click printer icon to open printer view in second pywebview window
  - [ ] Settings cog at bottom of sidebar

- [ ] **New Project Card**
  - [ ] Large dashed button at top of main area
  - [ ] Click opens new project creation modal
    - [ ] Input for project name
    - [ ] Folder picker for save location
    - [ ] On confirm — creates folder structure and copies project_template.md

- [ ] **Project Rows**
  - [ ] Pinned section
  - [ ] Recent section
  - [ ] Each row shows project name and scrollable version cards
  - [ ] Version cards scroll horizontally with arrow button
    - [ ] Arrow only appears when cards overflow visible area
  - [ ] NEW card sits at front of each row
    - [ ] Click opens new version modal (without a file — blank version)
  - [ ] Version cards labelled V1, V2, V3 etc
  - [ ] Click version card to open version detail panel

---

## Drag and Drop Import

- [ ] **Drop Target**
  - [ ] Entire project row is a valid drop zone
  - [ ] Subtle CSS highlight on dragover
  - [ ] Highlight clears on dragleave and drop

- [ ] **File Handling**
  - [ ] Collect `pywebviewFullPath` from all dropped files
  - [ ] Pass file path list and project_id to Python
  - [ ] Validate each file against allowed extensions (.stl, .step, .f3d, .3mf)
  - [ ] Per-file rejection with clear error message if invalid

- [ ] **Version Creation on Drop**
  - [ ] Auto-increment version number from existing versions in project.json
  - [ ] Create `versions/VN/files/` folder structure
  - [ ] Copy all valid files into `versions/VN/files/` via shutil.copy2
  - [ ] Copy `version_template.md` into `versions/VN/documentation.md`
  - [ ] Record full ISO 8601 datetime on version and per-file
  - [ ] Append version record to project.json

- [ ] **UI Response**
  - [ ] New version card injected into DOM without page reload
  - [ ] Toast notification on failure listing rejected files and reasons
    - [ ] Toast auto-dismisses after 4 seconds
    - [ ] Toasts stackable for multiple simultaneous errors
    - [ ] Manual dismiss button on each toast

---

## Version Detail Panel

- [ ] **Version Info**
  - [ ] Version label (V1, V2 etc)
  - [ ] Created date and time
  - [ ] List of files in this version with extension badges
  - [ ] Open individual file in Finder button
  - [ ] Open file in OrcaSlicer button (per file)

- [ ] **Documentation Editor**
  - [ ] Opens documentation.md for this version
  - [ ] Split pane — raw markdown left, live preview right
  - [ ] Supported markdown — headings, bold, italic, bullet points, ordered lists, horizontal rules
  - [ ] Explicit save button — writes back to documentation.md via Python
  - [ ] No auto-save

---

## Project Detail

- [ ] **Project Overview**
  - [ ] Project name
  - [ ] Created date and time
  - [ ] Total version count
  - [ ] Pin / unpin toggle

- [ ] **Project.md Editor**
  - [ ] Opens project.md for this project
  - [ ] Same split pane markdown editor as version documentation
  - [ ] Save writes back to project.md via Python

---

## Markdown Templates

- [ ] **Version Template (version_template.md)**
  - [ ] Default headings — Testing, Changes, Notes
  - [ ] Editable from Settings via same markdown editor component
  - [ ] Saved changes only affect future versions — existing documentation.md files untouched

- [ ] **Project Template (project_template.md)**
  - [ ] Default headings — Project Overview, Goals, References
  - [ ] Editable from Settings
  - [ ] Saved changes only affect future projects — existing project.md files untouched

- [ ] **Template Editor UI**
  - [ ] Accessible from Settings panel
  - [ ] Separate editor instances for version template and project template
  - [ ] Clear label indicating which template is being edited

---

## Printer Management

- [ ] **Register Printer**
  - [ ] Input for printer name
  - [ ] Input for API base URL (Mainsail or Fluidd local IP)
  - [ ] Test connection button before saving
  - [ ] Saved to printers.json

- [ ] **Printer View**
  - [ ] Opens full Mainsail / Fluidd UI in a second pywebview window
  - [ ] Window titled with printer name
  - [ ] Launched from sidebar printer icon click

- [ ] **Maintenance Logging**
  - [ ] Log entry form — type (lubrication, belt tension, nozzle change, other), date, notes
  - [ ] Maintenance history list per printer
  - [ ] Full datetime recorded per entry

- [ ] **Usage Logging**
  - [ ] Log hours used per session
  - [ ] Running total hours displayed per printer

---

## Filament Management

- [ ] **Register Spool**
  - [ ] Material type input
  - [ ] Starting weight (grams) input
  - [ ] Colour picker or label
  - [ ] Saved to filaments.json

- [ ] **Spool Detail**
  - [ ] Remaining weight display
  - [ ] Last humidity reading with timestamp
  - [ ] Update humidity button — input and save new reading

- [ ] **Usage Tracking**
  - [ ] Record grams used against a specific version
  - [ ] Remaining weight auto-decremented
  - [ ] Error if usage would exceed remaining weight

---

## OrcaSlicer Integration

- [ ] **Launch from Version Card**
  - [ ] Button per file in version detail panel
  - [ ] Python builds CLI command with file path argument
  - [ ] Subprocess launches OrcaSlicer with selected file
  - [ ] Graceful error if OrcaSlicer not found at expected path
    - [ ] Show actionable message with path that was checked
    - [ ] Settings option to override OrcaSlicer path

---

## Settings Panel

- [ ] **General**
  - [ ] OrcaSlicer executable path — override default
  - [ ] Default projects root directory

- [ ] **Templates**
  - [ ] Edit version_template.md
  - [ ] Edit project_template.md

- [ ] **File Types**
  - [ ] View currently allowed extensions
  - [ ] Option to add additional accepted extensions for advanced users

---

## Reliability and Edge Cases

- [ ] Printer offline — surfaces clear message, does not crash app
- [ ] Design file missing from disk — surfaces warning in version detail, does not crash
- [ ] OrcaSlicer not installed — actionable error with path shown
- [ ] Corrupted project.json — caught and reported, other projects unaffected
- [ ] Drop of unsupported file type — per-file toast, valid files in same drop still processed
- [ ] Version folder already exists — handled without overwrite, error surfaced
- [ ] App launched with no projects — home screen renders correctly with just the New Project card