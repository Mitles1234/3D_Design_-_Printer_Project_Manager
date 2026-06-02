import base64
import json
import os
import shutil
from datetime import datetime
from pathlib import Path
from .general import *
from .ai import run_ai

#--- Generic ---
def _now_iso():
    return datetime.now().isoformat()

def _get_json():
    return "Project/core/data/projects.json"

#--- Project Functions ---
def create_project(name, accent_colour):
    # Creates a New Project
    pass

def get_project(project_id):
    # Gets a project by ID
    pass

def list_projects():
    # Lists all projects
    pass

def update_project(project_id, fields):
    # Updates a project
    pass

def delete_project(project_id):
    # Deletes a project
    pass



#--- Node Functions ---
def create_node(project_id, name):
    # Creates a new node in a project
    pass

def get_node(project_id, node_id):
    # Gets a node by ID
    pass

def list_nodes(project_id):
    # Lists all nodes in a project
    pass

def update_node(project_id, node_id, fields):
    # Updates a node
    pass

def delete_node(project_id, node_id):
    # Deletes a node
    pass



#--- Connection Functions ---
def create_connection(project_id, from_node_id, to_node_id):
    # Creates a new connection between two nodes
    pass

def delete_connection(project_id, connection_id):
    # Deletes a connection
    pass

def validate_connection(project_id):
    # Validates a connection between nodes of a project
    pass



#--- File Functions ---
def add_file(project_id, node_id, file):
    # Adds a file to a node
    pass

def remove_file(project_id, node_id, filename):
    # Removes a file from a node
    pass

def list_files(project_id, node_id):
    # Lists all files in a node
    pass

def get_file(project_id, node_id, filename):
    # Gets a file from a node
    pass