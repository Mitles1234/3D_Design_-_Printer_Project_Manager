import os

project_directory = os.path.dirname("/Users/miles/3D Models")

class Project:
    def __init__(self, name):
        self.name = name
        self.directory = os.path.join(project_directory, name)
        self.revision = 1

    def add_file(self, revision=self.revision):
        print()