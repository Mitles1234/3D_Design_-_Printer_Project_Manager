***
# Project Title: 3D Design & Printer Project Manager

Student Name: Miles Cutting

Date: 1/7/2026

Course: Software Engineering Stage 6

GitHub URL: https://github.com/Mitles1234/3D_Design_-_Printer_Project_Manager
***

# Notes for Later Miles
Orcaslicer CLI Commands - https://github.com/OrcaSlicer/OrcaSlicer/discussions/8593
Apache JMeter - Stress Testing
Corrupt stl - Just  go in and delete a bunch of stuff
Pywebview - Viewing Printer API's

## Table of Content
- [1. Identifying & Defining](#1-identifying--defining)
  - [1.1 Problem Statement](#11-problem-statement)
  - [1.2 Project Purpose and Boundaries](#12-project-purpose-and-boundaries)
  - [1.3 Stakeholder Requirements](#13-stakeholder-requirements)
  - [1.4 Functional Requirements](#14-functional-requirements)
  - [1.5 Non-Functional Requirements](#15-non-functional-requirements)
  - [1.6 Constraints](#16-constraints)
  - [1.7 Requirements Analysis and Prioritisation](#17-requirements-analysis-and-prioritisation)

- [2. Research & Planning](#2-research--planning)
  - [2.1 Development Methodology](#21-development-methodology)
  - [2.2 Tools and Technologies](#22-tools-and-technologies)
  - [2.3 Gantt Chart / Timeline](#23-gantt-chart--timeline)
  - [2.4 Communication Plan](#24-communication-plan)
  - [2.5 Resource Allocation Justification](#25-resource-allocation-justification)

- [3. System Design](#3-system-design)
  - [3.1 Context Diagram](#31-context-diagram)
  - [3.2 Data Flow Diagram](#32-data-flow-diagram)
  - [3.3 Structure Chart](#33-structure-chart)
  - [3.4 IPO Chart](#34-ipo-chart)
  - [3.5 Data Dictionary](#35-data-dictionary)
  - [3.6 UML Class Diagram (OOP)](#36-uml-class-diagram-oop)
  - [3.7 Storyboards](#37-storyboards)

- [4. Producing and Implementing](#4-producing-and-implementing)
  - [4.1 Development Process](#41-development-process)
  - [4.2 Key Features Developed](#42-key-features-developed)
  - [4.2.1 Back-End Engineering Contribution](#421-back-end-engineering-contribution)
  - [4.3 Screenshots of Interface](#43-screenshots-of-interface)
  - [4.4 Version Control Summary (Optional)](#44-version-control-summary-optional)

- [5. Testing and Evaluation](#5-testing-and-evaluation)
  - [5.1 Testing Methods Used](#51-testing-methods-used)
  - [5.2 Test Cases and Results](#52-test-cases-and-results)
  - [5.3 Evaluation Against Requirements](#53-evaluation-against-requirements)
  - [5.4 Improvements and Future Development](#54-improvements-and-future-development)
  - [5.5 Evaluation of Social, Ethical and Communication Issues](#55-evaluation-of-social-ethical-and-communication-issues)

- [6. Feedback, Security and Reflection](#6-feedback-security-and-reflection)
  - [6.1 Summary of Client or Peer Feedback](#61-summary-of-client-or-peer-feedback)
  - [6.2 Secure Software Design and Data Handling](#62-secure-software-design-and-data-handling)
  - [6.3 Personal Reflection](#63-personal-reflection)

- [7. Appendices](#7-appendices)


***

## 1. Identifying & Defining

### 1.1 Problem Statement

With CAD and 3D printing becoming a growing industry, more people are using a wider range of software and design tools tailored to their unique workflows. However, there is a distinct lack of tools that allow for the combination of tracking and maintaining changes across these software mediums, as well as managing the consumables and hardware used throughout the design process.

This can lead to projects and designs taking significantly longer to complete, as important features and design decisions can be lost across older iterations, and critical printing parameters or tips specific to a design can be forgotten between sessions. Currently, a user must manually navigate between their CAD software, slicer, file browser, and printer interface, each operating independently with no shared context or history.

This means there is a clear gap in the market for a simple, effective, and fully local management tool that unifies files, projects, hardware, and consumables under a single interface throughout the entire design and fabrication cycle. By keeping all data and interactions on the local network, the system avoids the privacy, latency, and reliability concerns associated with cloud-dependent workflows, while remaining fast and accessible within a home or workshop environment.

---

### 1.2 Project Purpose and Boundaries

This project is designed to provide a unified local management environment for the 3D design and printing workflow. The system will operate entirely on the user's local machine and local area network, with no dependency on external internet services. The scope of the system includes:

- Viewing and interacting with 3D printer APIs such as Mainsail and Fluidd, accessed over the local network
- Management of 3D printers, including maintenance logs, activity usage history, and hardware upgrade records
- Tracking of filament spools, including last measured humidity readings and estimated usage consumed through specific designs
- Storage and organisation of design iterations and slicer configuration files within a structured, human-readable file tree accessible through standard file browsers
- Built-in integration with OrcaSlicer for direct project creation and launching of design files into the slicer from within the application

The system is explicitly bounded to local network operation. It will not interface with any external cloud services, remote APIs, or internet-dependent functionality. All data will be stored on the user's local machine in open formats, ensuring the project remains accessible without requiring the application itself to be running.

---

### 1.3 Stakeholder Requirements

The end user requires a reliable, stable system that integrates seamlessly into their existing workflow without disrupting the applications they already depend on. Above all else, reliability was the most critical point raised through both user feedback and the system design process, a tool that crashes, loses data, or behaves unpredictably under load is worse than no tool at all. This means how the system handles itself is just as important as what it does, particularly given it will be running alongside resource-intensive applications such as CAD software and slicers. Managing system load, handling edge cases gracefully, and maintaining stability under real working conditions are therefore the central requirements the system must satisfy.

---

### 1.4 Functional Requirements

The system shall provide the following capabilities:

**Project and File Management**
- Allow the user to create a new project, which generates a structured directory containing subfolders for design files, slicer configurations, and exports
- Allow the user to open and navigate existing projects through the application interface
- Store named iterations of design files, including common 3D formats such as .stl, .step, .f3d, and .3mf, with each iteration retaining the associated file and any user-defined notes
- Display a chronological history of iterations per project, allowing the user to compare or reopen earlier versions

**Printer Management**
- Allow the user to use and control a collection of 3D printers by providing a name and local network API address
- Fetch and display live status data from registered printers via their Mainsail or Fluidd API, including current print state, temperatures, and active job progress
- Allow the user to log maintenance events against a printer, including the type of maintenance performed, date, and any relevant notes
- Allow the user to log hardware upgrades against a printer with a description and date

**Filament Management**
- Allow the user to register filament spools with details including material type and starting weight
- Allow the user to record the most recently measured humidity reading for a spool
- Track estimated filament usage against individual design iterations, updating the remaining weight for the associated spool based off of slicer estimates

**Slicer Integration**
- Allow the user to open a selected design file directly in OrcaSlicer via its command line interface from within the application

**File Handling**
- Validate all files imported into the system against a defined list of accepted file types, rejecting unsupported formats with a clear error message, to secure user privacy
- Store all project data in formats that are accessible through standard operating system file browsers, without requiring the application to be open

---

### 1.5 Non-Functional Requirements

#### 1.5.1 Performance
For the program to be effective, it needs to streamline elements of the design workflow, such as opening applications and importing files, at a speed comparable to or faster than performing these actions manually. Beyond this, the application itself must have a minimal resource footprint, as it will frequently be running alongside resource-intensive applications such as CAD software and slicers. The system should not introduce noticeable latency into the user's existing workflow.

#### 1.5.2 Usability
The program needs to be immediately usable, with core functionality accessible from the home screen without requiring the user to navigate through multiple menus. Elements such as recent projects, new project creation, and registered printer status should be visible at launch. The interface should support drag and drop for importing design files, and all data exported by the system should be readable through standard applications such as file browsers and text editors, without requiring the application itself.

#### 1.5.3 Security
Because the system integrates with local network APIs and handles unique design files, security is a key consideration. All communication with printer APIs will occur exclusively over the local area network, with no data transmitted to external servers, a vital criteria for professional workflows, who may deal with client private designs and specifications. The system will enforce a defined list of accepted file types on import to limit the risk of malformed or malicious files being introduced into the project structure. Advanced users will have the option to adjust accepted file type parameters to suit their workflow, within reasonable bounds.

#### 1.5.4 Reliability

This program is intended to integrate seamlessly into a user's workflow, which means unreliable behaviour would directly disrupt their ability to work. A critical consideration here is that the system will be running concurrently with some of the most resource-intensive desktop applications in common use, CAD software and slicers routinely push CPU and RAM to high levels, leaving limited headroom for other processes. The application must therefore maintain a minimal resource footprint so it does not compete with these tools or risk being terminated by the operating system under memory pressure.

Beyond its own resource usage, the system will also be interfacing with inherently unstable external processes. A slicer may be mid-computation, a printer may drop off the network mid-job, and a CAD file may be partially written to disk when the application attempts to read it. The system must handle these edge cases gracefully rather than crashing or silently failing. Scenarios such as a printer being offline or unreachable on the network, a design file being missing or corrupted, or OrcaSlicer not being installed at the expected path should each surface a clear, actionable message to the user. The system's own stability must not be contingent on the stability of the external tools it integrates with.

---

### 1.6 Constraints

#### 1.6.1 Time
The timeframe for this project is limited, which requires careful prioritisation of features. To work within this constraint, the system will be designed around Object Oriented and Declarative programming paradigms, allowing individual components, such as printer management, filament tracking, and file handling, to be developed and validated in isolation before being connected through the main interface. This means a working, testable subset of the system can be produced early, and additional features added incrementally without destabilising existing functionality and infustructure.

#### 1.6.2 Technical Knowledge

This project involves integration across a range of systems and interfaces that require significant research time, including local network API communication, OrcaSlicer's CLI interface, and desktop application packaging. As a result, a meaningful portion of development time will be spent on research and prototyping rather than building final features. To mitigate this, the system will rely on well-established external tools and libraries where possible, such as using OrcaSlicer's existing CLI rather than building slicer functionality from scratch, preserving development time for the project's unique management features.

An advantage that partially offsets this constraint is prior hands-on experience interfacing with Klipper-based printers through their local REST APIs. This has already been explored and validated outside of this project, meaning the communication architecture for printer integration is a known quantity rather than an unknown one. This reduces the research overhead for one of the more technically complex areas of the system and provides a foundation of working knowledge to build from.

#### 1.6.3 Hardware and Software Access
A key part of this system's functionality is integration with physical 3D printer hardware over a local network. Development and testing of printer API features will require access to a Klipper-based printer running Mainsail or Fluidd, which is available at home. To ensure this does not become a bottleneck late in the project, printer API integration will be targeted in an earlier development iteration, while hardware is accessible and can be tested against directly.

This hardware dependency also extends to the end user, though not as a hard requirement. The majority of the system's functionality, project management, iteration storage, filament tracking, and slicer integration, is available regardless of whether the user has a printer connected. However, a user with a printer on their local network will unlock the full capability of the system, with live status data, maintenance logging, and usage tracking all becoming active. The system is designed so that these features degrade gracefully when a printer is absent or unreachable, rather than compromising the rest of the application.

---

### 1.7 Requirements Analysis and Prioritisation
Requirements have been prioritised to reflect the time and hardware constraints outlined in Section 1.6, with the core value of this system centred on project organisation and management. The planned features, are the structured iterative design library, allowing users to save, name, and navigate between historical versions of a design file; printer registration with maintenance and upgrade logging; filament spool tracking including humidity readings and per-design usage; file type validation on import; and a web view panel for directly accessing the Mainsail or Fluidd printer UI without leaving the application. Alongside these, OrcaSlicer CLI integration for opening files directly from within a project, drag and drop file import, and export of all project data in standard human-readable formats are all considered planned inclusions, as they are straightforward to implement and central to the system delivering a seamless workflow.

Features that may be considered depending on how development progresses include automatically linking filament usage to print job data reported by the printer API, and per-project or per-printer usage visualisations. These are valuable additions but carry enough implementation complexity that they will only be added if earlier iterations are completed ahead of schedule and sufficient time remains. They will not be treated as requirements for the system to be considered complete.

---

## 2. Research & Planning

### 2.1 Development Methodology

This project will follow an Agile methodology, with development broken into short cycles each targeting a defined functional area. Given the solo nature of the project and the range of distinct technical integrations involved, an iterative approach allows each component to be built, tested, and validated before being connected through the main interface. This is preferable to a linear waterfall approach, where a late-stage integration failure could jeopardise the entire project within the available timeframe.

Each iteration will follow a plan, build, test cycle, producing a working and testable state of the system at its conclusion. This aligns well with the Object Oriented design approach described in Section 1.6.1, as individual classes and modules can be developed and tested in isolation. It also accommodates the hardware constraint in Section 1.6.3, as printer API features can be assigned to a dedicated iteration timed around hardware availability rather than blocking earlier development.

---

### 2.2 Tools and Technologies

| Tool / Technology | Purpose | Justification |
|---|---|---|
| Python | Core back-end language | Strong standard library for file management, subprocess handling, and HTTP requests; well-suited to the range of integrations this project requires |
| pywebview | Desktop UI wrapper | Renders an HTML/CSS/JS front-end in a native desktop window without requiring a browser or internet connection, keeping the application fully local |
| HTML / CSS / JavaScript | Front-end interface | Flexible and well-documented; allows use of the JS Canvas API for any data visualisation elements without additional dependencies |
| OrcaSlicer CLI | Slicer integration | OrcaSlicer exposes a CLI interface that allows files to be opened programmatically, enabling direct launch from within the application |
| Mainsail / Fluidd REST API | Printer status and interaction | Standard HTTP APIs exposed by Klipper-based printer firmware over the local network, accessed without internet connectivity |
| JSON | Data storage format | Human-readable, widely supported, and accessible through standard text editors and file browsers without requiring the application |
| GitHub | Version control | Provides commit history, branching for feature development, and a recoverable backup of the codebase throughout the project |
| Apache JMeter | Stress testing | Will be used to simulate concurrent requests to the local API communication layer to validate performance and reliability under load |
| VS Code | Development environment | Lightweight and cross-platform with strong support for both Python and web development workflows |

---

### 2.3 Gantt Chart / Timeline

![Context Diagram](./assets/Gantt_Chart.png)

Time across this project has been managed with a heavy focus on the integration and full testing of systems, ensuring reliability and stability at a minimal overall system load. The core development runs from Week 2 of the holidays through to Week 3 of Term 2, giving a solid block of time to progressively build and connect each component of the system. Following this, a week and a half has been dedicated to thorough testing, covering resilience, low performance hardware, high load stress, and corrupted file handling, to confirm the system is stable and performs reliably under real conditions. After testing, a further half week has been planned to implement fixes, patches, and optimisation tweaks identified during that process, as well as incorporating any remaining user feedback, ensuring the final submitted build is a tested, corrected, and refined version of the system.

---

### 2.4 Communication Plan
The requirements and design of this system have been informed by a deliberate process of consulting both end users and people with relevant professional experience, as well as drawing on direct personal experience with the problem this project addresses.

Consultation with other 3D printing enthusiasts and makers provided insight into the practical pain points of the current workflow, specifically the difficulty of keeping track of what changed between design iterations, which filament was used for a given print, and the state of a printer's maintenance history. A recurring theme across these conversations was that existing tools either did too little, requiring everything to be tracked manually, or were overly complex and cloud-dependent, introducing friction rather than removing it.

Input was also sought from people with experience in software development and fabrication workflows, which helped sharpen the scope of the project and identify which integrations were most valuable to prioritise within the shorter timeframe.

A significant part of the motivation for this project also comes from direct personal experience. During the iterative development of a functional part, a set of critical dimensions were lost when an earlier version of a design file was overwritten without a saved history. Because there was no structured record of previous iterations, recovering those dimensions required remeasuring physical prototypes rather than simply retrieving an earlier file. This was a concrete, costly demonstration of exactly the gap this system is intended to address, and it directly shaped the decision to make design iteration storage a Must Have requirement.

These inputs collectively informed the requirements in Section 1.4 and the prioritisation in Section 1.7. Going forward, informal feedback will continue to be sought from secondary users once a functional interface is available, with findings documented and used to refine usability in following iterations.

---

### 2.5 Resource Allocation Justification
The feature set for this project has been deliberately scoped to be straightforward and achievable within the available timeframe. Rather than attempting to build an exhaustive tool, the requirements have been prioritised so that each implemented feature delivers clear, direct value to the user's workflow without unnecessary complexity. This means avoiding over-engineered solutions where simpler ones are sufficient, for example, using flat JSON files for data storage rather than a database, and invoking OrcaSlicer through its existing CLI rather than building any slicer functionality independently. This approach keeps individual components small and focused, which both reduces development time and makes each part easier to test and validate in isolation.

The Agile iterative methodology outlined in Section 2.1 was specifically chosen to accommodate the hardware and software access constraints described in Section 1.6.3. Because printer API integration is dependent on physical hardware at home, structuring development into discrete iterations means this feature can be assigned to a specific cycle timed around that access, rather than blocking progress across the entire project. Similarly, if a particular tool or integration proves more complex than anticipated during a given iteration, the scope of that cycle can be adjusted without derailing the broader development timeline. This flexibility is a core reason Agile is better suited to this project than a linear waterfall approach.

Finally, as each iteration is completed, the resulting work will be reviewed and critiqued against the requirements outlined in Section 1.4 and the priorities established in Section 1.7. Feedback gathered from secondary users after each functional milestone will be assessed and, where appropriate, used to adjust the direction of subsequent iterations. This means the system is not built rigidly toward a fixed specification, but is instead refined continuously as each stage surfaces new information about what is working, what needs adjustment, and where development effort is best directed next.
***

## 3. System Design

### 3.1 Context Diagram
![Context Diagram](./assets/Context_Diagram.png)

### 3.2 Data Flow Diagram
![Context Diagram](./assets/Level_1_Data_Flow_Diagram.png)

### 3.3 Structure Chart
![Context Diagram](./assets/Structure_Chart.png)

### 3.4 IPO Chart

| Process | Input | Processing | Output |
|---|---|---|---|
| Create Project | Project name, directory path | Generate folder structure (designs/, slices/, exports/), initialise project.json | New project directory, project record |
| Save Iteration | Design file, iteration name, notes | Validate file type, copy to designs/ subfolder, append iteration record | Stored iteration file, updated iteration log |
| Fetch Printer Status | Printer IP address | HTTP GET to Mainsail/Fluidd API endpoint, parse JSON response | Printer state, temperatures, active job progress |
| Log Maintenance | Printer ID, maintenance type, date, notes | Append record to printer's maintenance log | Updated maintenance history |
| Record Filament Usage | Spool ID, estimated grams used | Subtract usage from remaining weight, update spool record | Updated filament record |
| Update Filament Humidity | Spool ID, humidity reading | Overwrite last recorded humidity value on spool record | Updated spool humidity record |
| Launch Slicer | Selected design file path | Build OrcaSlicer CLI command with file path argument, invoke subprocess | OrcaSlicer opens with the specified file |
| Validate File Import | Incoming file path | Check file extension against allowed types list, accept or reject | Validated file copied to project tree, or rejection message |
| Export Project Data | Project ID | Serialise all project records to JSON, write to project directory | Human-readable JSON files in project folder |

---

### 3.5 Data Dictionary

| Variable | Data Type | Format for Display | Size for Display | Description | Example | Validation |
|---|---|---|---|---|---|---|
| project_id | String | XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX | 36 | Unique identifier for a project | a3f1c2d4-... | Auto-generated UUID, read only |
| project_name | String | XX..XX | 64 | Human-readable project name | Gripper Arm v2 | Max 64 characters, cannot be empty |
| created_date | String | DD/MM/YYYY | 10 | Date the project was created | 12/06/2025 | Valid date, set on creation, read only |
| directory_path | String | XX..XX | 260 | Path to the project root folder on the local file system | C:/Projects/GripperArm | Must be a valid existing path |
| iteration_id | String | XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX | 36 | Unique identifier for a design iteration | b7e2a1f9-... | Auto-generated UUID, read only |
| iteration_name | String | XX..XX | 64 | User-defined label for the iteration | Initial Draft | Cannot be empty |
| iteration_notes | String | XX..XX | 500 | User-defined notes for the iteration | Increased wall thickness by 2mm | Max 500 characters |
| file_path | String | XX..XX | 260 | Path to the design file for an iteration | C:/Projects/GripperArm/designs/v1.stl | Must point to a file with a valid accepted extension |
| file_type | String | XX..XX | 5 | File format of the design file | .stl | Must be one of: .stl, .step, .f3d, .3mf |
| printer_id | String | XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX | 36 | Unique identifier for a registered printer | c9d4b3e1-... | Auto-generated UUID, read only |
| printer_name | String | XX..XX | 64 | User-defined label for a printer | Ender 5 Plus | Cannot be empty |
| api_url | String | XX..XX | 100 | Base URL for the printer Mainsail or Fluidd API | http://192.168.1.50 | Must be a valid HTTP URL on the local subnet |
| maintenance_type | String | XX..XX | 20 | Category of maintenance event | nozzle_change | Must be one of: lubrication, belt_tension, nozzle_change, other |
| maintenance_date | String | DD/MM/YYYY | 10 | Date the maintenance event was performed | 03/07/2025 | Valid date, not in the future |
| maintenance_notes | String | XX..XX | 500 | Additional detail for a maintenance event | Replaced 0.4mm brass nozzle | Max 500 characters |
| spool_id | String | XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX | 36 | Unique identifier for a filament spool | d2c8f7a0-... | Auto-generated UUID, read only |
| material | String | XX..XX | 32 | Filament material type | PETG | Cannot be empty, max 32 characters |
| remaining_weight_g | Float | NNN.NN | 6 | Estimated remaining filament in grams | 743.50 | Must be ≥ 0.0 |
| last_humidity_pct | Float | NN.NN | 5 | Most recently recorded humidity reading for the spool | 14.30 | Must be between 0.0 and 100.0 |


### 3.6 UML Class Diagram (OOP)
![Context Diagram](./assets/ULM_Class_Diagram.png)

### 3.7 Storyboards
![Context Diagram](./assets/Home_UI.png)
***
## Development Decisions
Page Switching will be handled by rotating an iframe, as that will ahev better intergration with Printer Web API URLS for a more seamless experience

## 4. Producing and Implementing

### 4.1 Development Process

### 4.2 Key Features Developed

### 4.2.1 Back-End Engineering Contribution

### 4.3 Screenshots of Interface

### 4.4 Version Control Summary (Optional)

***

## 5. Testing and Evaluation

### 5.1 Testing Methods Used

### 5.2 Test Cases and Results

### 5.3 Evaluation Against Requirements

### 5.4 Improvements and Future Development

### 5.5 Evaluation of Social, Ethical and Communication Issues

***

## 6. Feedback, Security and Reflection

### 6.1 Summary of Client or Peer Feedback

### 6.2 Secure Software Design and Data Handling

### 6.3 Personal Reflection

***

## 7. Appendices
