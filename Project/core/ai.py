# --- Imports ---
import subprocess # Allows python to run the swift program
from pathlib import Path # Used for Building file paths

# --- Supporting Functions ---
def _run_ai(prompt: str) -> str:
    '''
    This function runs the swift function, so Apple Intelligence can be used, as swift is the only language it can
    be run in. Then it copies the output from the swift as a variable to be used with the main function.
    '''
    script_path = Path(__file__).with_name("ai.swift") # Location of the swift program
    completed = subprocess.run( # Uses Subprocess to run the swift program
        ["swift", str(script_path), prompt], # Runs the swift program with the prompt as an argument
        capture_output=True, # Captures the output of the swift program
        text=True, # Returns the output as a string instead of bytes
    )

    if completed.returncode != 0: # If running the program fails
        error_output = completed.stderr.strip() or completed.stdout.strip() or "Swift execution failed." # Creates an Error Message
        raise RuntimeError(error_output) # Raises an error with the error message

    return completed.stdout.strip() # Returns the output of the swift program as a string

def _clean(s: str) -> str:
    '''
    Cleans the AI prompt output by removing any leading/trailing whitespace and quote makrs which could mess 
    with parsing into the HTML.
    '''
    return s.strip().strip('"').strip("'").strip() # Cleans the string

# --- Main Functions ---
def generate_revision_details(description: str) -> dict:
    '''
    Generates names and descriptions for the revision function of the 3D printing project system, with 
    some prompt engineering.
    '''
    desc = description.strip() # Cleans the User input

    name = _run_ai( # Runs the AI prompt with the supporting prompt
        f'Give a short, descriptive, funny and witty name for a revision or iteration of a 3D printing design. '
        f'The changes made are: "{desc}". '
        f'Reply with just the revision name, nothing else. '
        f'Examples: "Revised geometry – wider flanges", "Heat-resistant rebuild", "Dual blower variant".'
    )

    summary = _run_ai( # Runs the AI prompt with the supporting prompt
        f'Write one sentence describing the specific improvements and changes made in this design revision: "{desc}". '
        f'Focus on what changed and why, not the overall project purpose. '
        f'Reply with just the sentence, nothing else.'
    )

    return {"name": _clean(name), "description": _clean(summary)} # Returns the cleaned prompt output as a dictionary


def generate_project_details(description: str) -> dict:
    '''
    Generates names and descriptions for the project function of the 3D printing project system, with 
    some prompt engineering.
    '''
    desc = description.strip() # Cleans the User input

    name = _run_ai( # Runs the AI prompt with the supporting prompt
        f'Give a short, creative, funny, and witty name for a 3D printing project described as: "{desc}". '
        f'Reply with just the name, nothing else.'
    )

    summary = _run_ai( # Runs the AI prompt with the supporting prompt
        f'Write one sentence describing a 3D printing project described as: "{desc}". '
        f'Reply with just the sentence, nothing else.'
    )

    return {"name": _clean(name), "description": _clean(summary)} # Returns the cleaned prompt output as a dictionary
