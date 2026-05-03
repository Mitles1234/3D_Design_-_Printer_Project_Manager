import json
import os
import shutil
import uuid
from datetime import datetime


# ── Helpers ───────────────────────────────────────────────────────────────────

def now_iso():
    return datetime.now().isoformat(timespec="seconds")

TEMPLATE_DIR = os.path.join(os.path.expanduser("~"), "3DProjectManager", "templates")
ALLOWED_EXTENSIONS = {".stl", ".step", ".f3d", ".3mf"}

DEFAULT_VERSION_TEMPLATE = """# Testing
_Write testing notes here_

# Changes
_Write what changed in this version_

# Notes
_Any other notes_
"""

DEFAULT_PROJECT_TEMPLATE = """# Project Overview
_Describe the project here_

# Goals
_What are you trying to achieve_

# References
_Links, measurements, or references_
"""


def ensure_templates():
    os.makedirs(TEMPLATE_DIR, exist_ok=True)
    version_path = os.path.join(TEMPLATE_DIR, "version_template.md")
    project_path = os.path.join(TEMPLATE_DIR, "project_template.md")
    if not os.path.exists(version_path):
        with open(version_path, "w") as f:
            f.write(DEFAULT_VERSION_TEMPLATE)
    if not os.path.exists(project_path):
        with open(project_path, "w") as f:
            f.write(DEFAULT_PROJECT_TEMPLATE)


# ── Project Class ─────────────────────────────────────────────────────────────

class Project:

    def __init__(self, project_dir):
        """Load an existing project from a directory."""
        self.project_dir = project_dir
        self.json_path   = os.path.join(project_dir, "project.json")
        self.data        = self._load()

    # ── Constructors ──────────────────────────────────────────────────────────

    @classmethod
    def create(cls, name, parent_dir):
        """Create a brand new project on disk and return a loaded instance.
        
        Raises FileExistsError if the folder already exists and is not empty.
        """
        project_dir = os.path.join(parent_dir, name)

        if os.path.exists(project_dir) and os.listdir(project_dir):
            raise FileExistsError(f"Directory already exists and is not empty: {project_dir}")

        os.makedirs(os.path.join(project_dir, "versions"), exist_ok=True)
        ensure_templates()

        # Copy project template in as the starting project.md
        project_md = os.path.join(project_dir, "project.md")
        shutil.copy2(os.path.join(TEMPLATE_DIR, "project_template.md"), project_md)

        data = {
            "project_id":       str(uuid.uuid4()),
            "project_name":     name,
            "created_datetime": now_iso(),
            "last_updated":     now_iso(),
            "revision_number":  0,
            "pinned":           False,
            "project_dir":      project_dir,
        }

        with open(os.path.join(project_dir, "project.json"), "w") as f:
            json.dump(data, f, indent=2)

        return cls(project_dir)

    # ── Internal Load / Save ──────────────────────────────────────────────────

    def _load(self):
        """Read project.json from disk into self.data."""
        if not os.path.exists(self.json_path):
            raise FileNotFoundError(f"No project.json found at: {self.json_path}")
        with open(self.json_path, "r") as f:
            return json.load(f)

    def save(self):
        """Write the current state of self.data back to project.json."""
        self.data["last_updated"] = now_iso()
        with open(self.json_path, "w") as f:
            json.dump(self.data, f, indent=2)

    # ── Path Helpers ──────────────────────────────────────────────────────────
    # Everything is derived from project_dir — nothing extra stored in JSON

    def _versions_dir(self):
        return os.path.join(self.project_dir, "versions")

    def _revision_dir(self, label):
        return os.path.join(self._versions_dir(), label)

    def _revision_files_dir(self, label):
        return os.path.join(self._revision_dir(label), "files")

    def _revision_doc_path(self, label):
        return os.path.join(self._revision_dir(label), "documentation.md")

    def _project_md_path(self):
        return os.path.join(self.project_dir, "project.md")

    # ── Attributes ────────────────────────────────────────────────────────────

    @property
    def name(self):
        return self.data["project_name"]

    @property
    def project_id(self):
        return self.data["project_id"]

    @property
    def revision_number(self):
        return self.data["revision_number"]

    @property
    def pinned(self):
        return self.data["pinned"]

    @property
    def created(self):
        return self.data["created_datetime"]

    @property
    def last_updated(self):
        return self.data["last_updated"]

    # ── Revisions ─────────────────────────────────────────────────────────────

    def new_revision(self):
        """Create the next revision folder and copy the version template in.
        
        Returns the label of the new revision e.g. 'V3'.
        """
        ensure_templates()

        next_number   = self.data["revision_number"] + 1
        label         = f"V{next_number}"
        files_dir     = self._revision_files_dir(label)
        os.makedirs(files_dir, exist_ok=True)

        # Copy current version template as starting documentation
        shutil.copy2(
            os.path.join(TEMPLATE_DIR, "version_template.md"),
            self._revision_doc_path(label)
        )

        self.data["revision_number"] = next_number
        self.save()

        return label

    def list_revisions(self):
        """Return a list of all revision labels that exist on disk, sorted newest first.
        
        Example: ['V4', 'V3', 'V2', 'V1']
        """
        versions_dir = self._versions_dir()
        if not os.path.exists(versions_dir):
            return []

        labels = [
            name for name in os.listdir(versions_dir)
            if os.path.isdir(os.path.join(versions_dir, name))
            and name.startswith("V")
        ]

        # Sort numerically by the number after V
        labels.sort(key=lambda x: int(x[1:]), reverse=True)
        return labels

    def get_revision(self, label):
        """Return all information about a specific revision.
        
        Returns a dict with the label, files list, doc path, and creation time.
        Returns None if the revision folder does not exist.
        """
        revision_dir = self._revision_dir(label)
        if not os.path.exists(revision_dir):
            return None

        files_dir = self._revision_files_dir(label)
        files = []
        if os.path.exists(files_dir):
            for filename in os.listdir(files_dir):
                full_path = os.path.join(files_dir, filename)
                if os.path.isfile(full_path):
                    files.append({
                        "filename":  filename,
                        "extension": os.path.splitext(filename)[1].lower(),
                        "full_path": full_path,
                    })

        return {
            "label":              label,
            "revision_dir":       revision_dir,
            "files":              files,
            "documentation_path": self._revision_doc_path(label),
        }

    # ── Files ─────────────────────────────────────────────────────────────────

    def add_file(self, label, file_path):
        """Copy a file into the specified revision's files/ folder.
        
        Validates the extension before copying.
        Raises ValueError for unsupported file types.
        Raises FileNotFoundError if the revision does not exist.
        """
        ext = os.path.splitext(file_path)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(f"Unsupported file type: {ext}")

        files_dir = self._revision_files_dir(label)
        if not os.path.exists(files_dir):
            raise FileNotFoundError(f"Revision {label} does not exist.")

        dest = os.path.join(files_dir, os.path.basename(file_path))
        shutil.copy2(file_path, dest)
        return dest

    # ── Documentation ─────────────────────────────────────────────────────────

    def read_doc(self, label=None):
        """Read a markdown documentation file.
        
        Pass a revision label e.g. 'V2' to read that version's documentation.md.
        Pass nothing (or None) to read the project-level project.md.
        """
        path = self._revision_doc_path(label) if label else self._project_md_path()
        if not os.path.exists(path):
            return ""
        with open(path, "r") as f:
            return f.read()

    def write_doc(self, content, label=None):
        """Write content to a markdown documentation file.
        
        Pass a revision label e.g. 'V2' to write to that version's documentation.md.
        Pass nothing (or None) to write to the project-level project.md.
        """
        path = self._revision_doc_path(label) if label else self._project_md_path()
        with open(path, "w") as f:
            f.write(content)

    # ── Pinning ───────────────────────────────────────────────────────────────

    def set_pinned(self, value: bool):
        """Set the pinned state and save."""
        self.data["pinned"] = value
        self.save()