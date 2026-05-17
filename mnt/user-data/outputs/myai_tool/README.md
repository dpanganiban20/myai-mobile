# myai — Your Free AI Coding Assistant

> Like Claude Code, but free. Runs locally. Learns your style. Works with every language and framework.

**9,785 lines across 12 modules. Zero subscription fees.**

---

## Table of Contents

- [Install](#install)
- [Setup](#setup)
- [Core Commands](#core-commands)
- [Chat & Ask](#chat--ask)
- [Memory](#memory)
- [Learning](#learning)
- [Integrations](#integrations)
- [GitHub](#github)
- [Jira](#jira)
- [Figma](#figma)
- [MCP Servers](#mcp-servers)
- [AI & Intelligence](#ai--intelligence)
- [Agent Mode](#agent-mode)
- [Code Review](#code-review)
- [Testing](#testing)
- [Communication](#communication)
- [Multi-file Editing](#multi-file-editing)
- [Docs & Data](#docs--data)
- [Diagrams](#diagrams)
- [Database](#database)
- [Data Analysis](#data-analysis)
- [Privacy & Control](#privacy--control)
- [Skills](#skills)
- [MYAI.md](#myaimd)
- [Plugins](#plugins)
- [Web UI](#web-ui)
- [Config](#config)
- [Global Install](#global-install)
- [All Files](#all-files)

---

## Install

```bash
pip install groq rich click requests duckduckgo-search openpyxl
```

Get a **free** Groq API key at [console.groq.com](https://console.groq.com)

```bash
export GROQ_API_KEY=your_key_here
```

Put all 12 `.py` files in the same folder:

```
~/myai/
  myai.py
  integrations.py
  intelligence.py
  learner.py
  privacy.py
  skills.py
  datadocs.py
  testing.py
  comms.py
  plugins.py
  multiedit.py
  webui.py
```

---

## Setup

### Mac / Linux

```bash
chmod +x ~/myai/myai.py
echo 'alias myai="python3 ~/myai/myai.py"' >> ~/.zshrc
source ~/.zshrc

# Or as a real global command:
sudo ln -s ~/myai/myai.py /usr/local/bin/myai
```

### Windows

```cmd
mkdir C:\myai
copy *.py C:\myai\
echo @python C:\myai\myai.py %* > C:\myai\myai.bat
# Add C:\myai to PATH in System Environment Variables
```

---

## Core Commands

```bash
myai --help                          # show all commands
myai "your question"                 # ask anything
myai "question" file.py              # ask about a file
myai "question" file1.py file2.py    # ask about multiple files
myai "question" image.png            # ask about an image
myai --clip "question"               # use image from clipboard
myai fix "error text"                # auto-fix an error (detects files)
myai run "npm test"                  # run command + AI explains output
```

---

## Chat & Ask

```bash
myai chat                            # start interactive session

# Inside chat mode:
# exit                → quit
# run:npm test        → run command, AI explains
# search:term         → web search
# clip:               → attach clipboard image
# image.png           → attach image file
# github:owner/repo   → load GitHub repo context
# jira:KEY-123        → load Jira issue context
# figma:FILEKEY       → load Figma file context
```

---

## Memory

Per-project memory — each folder remembers your past conversations.

```bash
myai memory                          # view this project's memory
myai memory --clear                  # clear this project's memory
myai memory --list                   # list all projects with memory
myai search "flask"                  # search past history across projects
myai compress                        # compress long conversation history
```

---

## Learning

myai learns your coding style, indexes your codebase, and never repeats your corrections.

```bash
# Index a project (do once per project)
myai learn project .                 # learn from current folder
myai learn project ~/projects/myapp  # learn from any path
myai learn all                       # re-learn all known projects

# Permanent corrections (never forgotten)
myai learn correction "Always use async/await, never callbacks"
myai learn correction "Use snake_case for all variables" --category style
myai learn correction "Never store secrets in code" --category security
myai learn correction "All API routes need error handling" --category architecture

# Categories: general, style, architecture, security, testing

# View corrections
myai learn corrections               # list all your rules
myai learn corrections --clear       # clear all

# Semantic search your codebase
myai learn search "authentication"   # find relevant files
myai learn search "database query" --top 10

# View what myai knows about you
myai learn stats                     # indexed files, style, feedback count
myai learn style                     # your detected coding style
myai learn watch                     # watch files, auto-detect bugs on save
```

---

## Integrations

```bash
myai connect github                  # connect GitHub
myai connect jira                    # connect Jira
myai connect figma                   # connect Figma
myai connect mcp                     # add an MCP server

myai integrations                    # show all connections + status
```

---

## GitHub

```bash
myai github repos                         # list your repos
myai github issues owner/repo             # list open issues
myai github issues owner/repo --state closed
myai github prs owner/repo                # list open pull requests
myai github prs owner/repo --state all
myai github diff owner/repo 42            # view PR diff + AI review
myai github create-issue owner/repo "Fix login bug"
myai github create-issue owner/repo "Add dark mode" --body "details here"

# Inside chat mode:
# github:owner/repo   → load repo context into conversation
```

---

## Jira

```bash
myai jira mine                            # my open tickets
myai jira issue PROJECT-123               # get issue details
myai jira move PROJECT-123 "In Progress"  # transition status
myai jira move PROJECT-123 "Done"
myai jira comment PROJECT-123 "Fixed in PR #42"
myai jira create PROJECT "Add dark mode" --type Task --priority High
myai jira create PROJECT "Fix crash" --type Bug --priority Critical

# Inside chat mode:
# jira:PROJECT-123    → load issue into conversation
```

---

## Figma

```bash
myai figma file FILE_KEY              # inspect file + AI help
myai figma export FILE_KEY NODE_ID    # export node as PNG
myai figma export FILE_KEY NODE_ID --format svg
myai figma export FILE_KEY NODE_ID --format pdf
myai figma comment FILE_KEY "Looks great!"

# Inside chat mode:
# figma:FILEKEY       → load Figma file into conversation
```

---

## MCP Servers

```bash
myai mcp tools myserver               # list tools on a server
myai mcp call myserver tool_name      # call a tool
myai mcp call myserver tool_name '{"arg": "value"}'

# Example MCP server commands (when connecting):
# npx -y @modelcontextprotocol/server-filesystem .
# npx -y @modelcontextprotocol/server-github
```

---

## AI & Intelligence

```bash
# See which model would be used for a query
myai models "write a function"        # shows routing + available models
myai models "fix this bug"

# Offline mode (Ollama)
myai offline                          # switch to local Ollama models
myai offline llama3:8b                # use specific model
myai offline --off                    # go back online (Groq)

# Compress conversation
myai compress                         # manually compress long history
```

**Model routing (automatic):**

| Query type | Model used |
|---|---|
| Quick questions | llama3-8b (fast) |
| Code generation | llama3-70b |
| Complex reasoning | mixtral-8x7b-32768 |
| Images | llama-4-scout |
| Long context | mixtral-8x7b-32768 |
| Summarization | llama3-8b (fast) |

---

## Agent Mode

Give myai a goal and it executes autonomously — plans steps, writes files, runs commands, fixes errors.

```bash
myai agent run "Create a Flask REST API with user auth"
myai agent run "Write unit tests for all functions in utils.py"
myai agent run "Set up a React project with Tailwind CSS"
myai agent run "Migrate this project from JavaScript to TypeScript"
myai agent run "Add Docker support to this project"

myai agent log                        # see what the last agent run did
```

---

## Code Review

```bash
myai review staged                    # review staged changes before committing
myai review last                      # review the last commit
myai review pr                        # review entire branch vs main
myai review pr --base develop         # review vs a different base branch

# Install as git pre-commit hook (auto-reviews before every commit):
myai review install-hook
myai review uninstall-hook
```

---

## Testing

```bash
# Generate tests
myai test generate utils.py           # generate tests for a file
myai test generate utils.py --save    # save test file automatically
myai test generate api.py -f create_user        # test one function
myai test generate api.py -f create_user --save

# Run tests
myai test run                         # run all tests in current project
myai test run tests/test_utils.py     # run a specific test file

# Auto-fix loop (runs tests → fixes code → repeats until passing)
myai test fix utils.py                # fix source until tests pass
myai test fix utils.py test_utils.py  # specify test file explicitly

# Coverage
myai test coverage                    # run coverage report
myai test coverage utils.py           # AI analysis of coverage gaps
```

**Supported test frameworks (auto-detected):**
`pytest` · `jest` · `vitest` · `go test` · `cargo test` · `rspec`

---

## Communication

```bash
# Commit messages (conventional commits format)
myai comms commit                     # generate from staged changes
myai comms commit --apply             # generate + actually commit

# Pull request descriptions
myai comms pr                         # generate PR description
myai comms pr --base develop          # diff against different base
myai comms pr --save                  # save to PR_DESCRIPTION.md

# Release notes
myai comms release                    # from last tag to HEAD
myai comms release --from-tag v1.2.0  # from specific tag
myai comms release --save             # save to RELEASE_NOTES.md

# Daily standup
myai comms standup                    # generate from recent git activity

# Change summary
myai comms summarize                  # explain recent changes in plain English
myai comms summarize --base HEAD~5    # summarize last 5 commits
```

---

## Multi-file Editing

Edit multiple files at once. Shows diff preview before writing. Supports undo.

```bash
# Edit multiple files
myai edit "add error handling to all endpoints" api.py utils.py models.py
myai edit "add TypeScript types" src/components/Button.jsx src/utils/api.js
myai edit "refactor to use async/await" handlers.py services.py

# Edit entire directory
myai edit "migrate to TypeScript" src/
myai edit "add dark mode support" components/
myai edit "add JSDoc comments to all functions" lib/

# Undo
myai undo                             # restore last edit
myai undo 20250516_143000             # restore specific backup
myai backups                          # list all available backups
```

---

## Docs & Data

### Documentation

```bash
# README
myai docs readme                      # generate README.md (preview)
myai docs readme --save               # save to README.md
myai docs readme --path ~/projects/myapp --save

# API documentation
myai docs api utils.py                # generate API docs (preview)
myai docs api utils.py --save         # save to utils.docs.md
myai docs api src/api.ts --save

# Docstrings (Python only)
myai docs docstrings utils.py         # preview missing docstrings
myai docs docstrings utils.py --write # add directly to file

# Changelog
myai docs changelog                   # generate from git history (preview)
myai docs changelog --save            # save to CHANGELOG.md
```

---

## Diagrams

Generate Mermaid diagrams from your code. View on GitHub or [mermaid.live](https://mermaid.live).

```bash
# Single diagram
myai diagram generate architecture .          # whole project
myai diagram generate architecture . --save   # save to docs/
myai diagram generate class models.py --save
myai diagram generate flow utils.py
myai diagram generate er database/schema.sql --save
myai diagram generate sequence src/api/ --save
myai diagram generate dependency .

# Generate all diagrams at once
myai diagram all .                    # architecture + class + dependency

# Diagram types:
# architecture  → system components and connections
# class         → classes, inheritance, relationships
# flow          → function call flow and logic
# er            → database entity relationships
# sequence      → API request/response flows
# dependency    → module import graph
```

---

## Database

Natural language queries — no SQL knowledge needed.

```bash
# Connect
myai db connect sqlite ./myapp.db
myai db connect postgres "postgresql://user:pass@localhost/mydb"
myai db connect mysql "host=localhost user=root password=pass database=mydb"
myai db connect mongodb "mongodb://localhost:27017" mydb

# Query in plain English
myai db ask "how many users signed up last week"
myai db ask "top 5 products by revenue"
myai db ask "show all failed orders from yesterday"
myai db ask "which users have never made a purchase"

# Schema and optimization
myai db schema                        # show tables and columns
myai db indexes                       # AI suggestions for better indexes

# Auto-connect to SQLite in current dir
myai db ask "how many rows" --db-path ./data.db
```

**Supported:** SQLite (built-in) · PostgreSQL (`pip install psycopg2-binary`) · MySQL (`pip install mysql-connector-python`) · MongoDB (`pip install pymongo`)

---

## Data Analysis

```bash
# Analyze CSV or Excel files
myai data analyze sales.csv
myai data analyze report.xlsx
myai data analyze sales.csv -q "which region has highest revenue"
myai data analyze report.xlsx -q "any anomalies in the data"

# Ask specific questions
myai data ask sales.csv "what month had the most orders"
myai data ask users.csv "how many users are from California"
myai data ask revenue.xlsx "year over year growth rate"

# Generate chart code
myai data chart sales.csv                       # auto-detect best chart
myai data chart sales.csv --type bar            # specific chart type
myai data chart sales.csv --type line --save    # save to chart.py
# Types: auto, bar, line, scatter, pie, histogram

# Clean data
myai data clean messy.csv                       # strip nulls, normalize
myai data clean messy.csv --output clean.csv    # specify output file
```

---

## Privacy & Control

```bash
# Overview
myai privacy status                   # all settings + data stored

# Offline mode
myai privacy offline on               # block all cloud, use Ollama only
myai privacy offline off              # go back online
myai privacy offline status

# Encryption (AES-256)
myai privacy encrypt on               # encrypt all data with password
myai privacy encrypt off              # decrypt (needs password)
myai privacy encrypt status

# Access controls
myai privacy access show              # view current rules
myai privacy access deny read "*.env"           # block reading .env files
myai privacy access deny write "database/"      # block writing to folder
myai privacy access deny run "curl"             # block a command
myai privacy access lock              # lock project: read-only, no commands
myai privacy access unlock            # restore normal access

# Audit log
myai privacy audit show               # full audit log
myai privacy audit show --limit 50
myai privacy audit show --action FILE_WRITE     # filter by action type
myai privacy audit show --action CMD_RUN
myai privacy audit show --project               # only current project
myai privacy audit verify             # check for tampering
myai privacy audit export audit.log   # export a copy
myai privacy audit clear              # clear the log

# Data wipe (3-pass secure delete)
myai privacy wipe show                # see what's stored first
myai privacy wipe category memory     # wipe one category
myai privacy wipe category history
myai privacy wipe category integrations
myai privacy wipe category index
myai privacy wipe category feedback
myai privacy wipe category audit
myai privacy wipe project             # wipe current project only
myai privacy wipe all                 # wipe everything forever

# Paranoid mode (all protections at once)
myai privacy paranoid on              # offline + encrypted + locked + audited
myai privacy paranoid off             # restore normal mode
```

---

## Skills

Built-in skills auto-applied based on your project and query.

```bash
# View skills
myai skill list                       # all available skills
myai skill show python                # see what a skill does
myai skill show nextjs
myai skill active                     # which skills are active now
myai skill active "write auth code"   # which would activate for a query

# Force-apply a skill
myai skill apply security "review this code" auth.py
myai skill apply testing "write tests for" utils.py
myai skill apply nextjs "convert to server component" page.tsx
myai skill apply tailwind "style this component" card.tsx

# Create / manage custom skills
myai skill create my-rules            # create a new skill interactively
myai skill edit python                # edit a skill in your editor
myai skill delete my-rules            # delete a user-defined skill
```

**Built-in skills (auto-detected):**

| Skill | Detected from |
|---|---|
| `nextjs` | `"next"` in package.json |
| `react` | `"react"` in package.json or `.tsx` files |
| `vue` | `"vue"` / `"nuxt"` in package.json |
| `svelte` | `"svelte"` in package.json |
| `solidjs` | `"solid-js"` in package.json |
| `astro` | `"astro"` in package.json |
| `tailwind` | `"tailwindcss"` in package.json |
| `typescript` | `"typescript"` or `@types/*` in package.json |
| `fastapi` | `fastapi` in requirements.txt |
| `django` | `django` in requirements.txt |
| `flask` | `flask` in requirements.txt |
| `express` | `"express"` in package.json |
| `golang` | `go.mod` exists |
| `rust` | `Cargo.toml` exists |
| `rails` | `Gemfile` with rails |
| `laravel` | `composer.json` with laravel |
| `springboot` | `pom.xml` / `build.gradle` with spring |
| `kotlin` | `AndroidManifest.xml` or `.kt` files |
| `swift` | `Package.swift` or `.xcodeproj` |
| `dotnet` | `*.csproj` or `*.sln` |
| `flutter` | `pubspec.yaml` |
| `prisma` | `"@prisma/client"` in package.json |
| `trpc` | `"@trpc/server"` in package.json |
| `graphql` | `"graphql"` in package.json |
| `drizzle` | `"drizzle-orm"` in package.json |
| `supabase` | `"@supabase/supabase-js"` in package.json |
| `terraform` | `.tf` files |
| `docker` | `Dockerfile` or `docker-compose.yml` |
| `elixir` | `.ex` / `.exs` files |
| `security` | Always active |
| `git` | Always active |
| `testing` | Query contains test-related keywords |
| `api` | Query contains API-related keywords |
| `database` | Query contains database-related keywords |
| `code-review` | Query contains review-related keywords |

---

## MYAI.md

Drop a `MYAI.md` file in your project root — myai reads it automatically on every command.

```bash
myai myaimd init                      # create a template
myai myaimd init --stack "Python, FastAPI, PostgreSQL"
myai myaimd generate                  # AI generates it from your code (preview)
myai myaimd generate --save           # save to MYAI.md
myai myaimd show                      # show active MYAI.md
myai myaimd edit                      # open in editor
```

**MYAI.md format:**

```markdown
# MYAI.md

## Project
Flask REST API for e-commerce platform

## Stack
Python, FastAPI, PostgreSQL, Redis, Docker

## Architecture
Describe your project structure and key decisions here.

## Rules
- Always use async/await for I/O operations
- Never use print() — use the logger
- All endpoints must have error handling

## Avoid
- Never use relative imports
- No hardcoded secrets

## Commands
run: uvicorn main:app --reload
test: pytest tests/ -v
lint: ruff check .

## Skills
- python
- fastapi
- testing
- security
- docker

## Notes
Any extra context myai should know.
```

myai also reads `CLAUDE.md` and `.cursorrules` automatically.

---

## Plugins

Extend myai without touching core files.

```bash
myai plugin list                      # list installed plugins
myai plugin create my-rules           # scaffold a new plugin
myai plugin create company-standards -d "Our internal standards"
myai plugin install https://github.com/someone/myai-plugin-name
myai plugin uninstall my-rules
```

**Plugin file structure** (`~/.myai/plugins/my-rules/plugin.py`):

```python
__version__ = "1.0.0"
__description__ = "My custom rules"
__author__ = "you"

# Register a custom skill
register_skill(
    name="my-rules",
    description="Company coding standards",
    triggers=["company", "internal", "standard"],
    prompt="""Company coding standards:
- Always use our internal logger
- All errors go to Sentry
- Use our design system components"""
)

# Register a hook
@register_hook("before_ask")
def before_ask(question, **kwargs):
    print(f"Question: {question}")

@register_hook("after_ask")
def after_ask(response, **kwargs):
    # Post-process every response
    pass
```

---

## Web UI

```bash
myai ui                               # open browser at localhost:4321
myai ui --port 8080                   # custom port
myai ui --no-browser                  # start server without opening browser
```

**Dashboard tabs:**
- 💬 **Chat** — talk to myai in the browser
- 🧠 **Memory** — view all project memories
- 🎯 **Skills** — browse all active skills
- 📋 **Audit Log** — see everything myai did
- 🔌 **Plugins** — view installed plugins

---

## Config

```bash
myai config                           # view all settings
myai config --set model mixtral-8x7b-32768
myai config --set vision_model meta-llama/llama-4-scout-17b-16e-instruct
myai config --set max_tokens 4096
myai config --set web_search true     # search web before answering
myai config --set auto_index true     # auto-read project file tree
myai config --set auto_run_commands true   # skip confirmation on commands
myai config --set tone verbose        # more detailed answers
myai config --set tone concise        # shorter answers (default)
myai config --set show_routing true   # show which model is used
myai config --set integrations_in_context true
myai config --reset                   # reset to defaults
```

**Available models (all free on Groq):**

| Model string | Best for |
|---|---|
| `llama3-8b-8192` | Fast simple questions |
| `llama3-70b-8192` | Default — code + general |
| `mixtral-8x7b-32768` | Long context, reasoning |
| `meta-llama/llama-4-scout-17b-16e-instruct` | Images |

---

## Global Install

### Mac / Linux

```bash
# Option 1 — alias
echo 'alias myai="python3 ~/myai/myai.py"' >> ~/.zshrc && source ~/.zshrc

# Option 2 — symlink (use from anywhere, no alias needed)
chmod +x ~/myai/myai.py
sudo ln -s ~/myai/myai.py /usr/local/bin/myai
```

### Windows

```powershell
# Create myai.bat
echo @python C:\myai\myai.py %* > C:\myai\myai.bat
# Add C:\myai to PATH via System → Environment Variables
```

### Optional dependencies

```bash
pip install psycopg2-binary          # PostgreSQL support
pip install mysql-connector-python   # MySQL support
pip install pymongo                  # MongoDB support
pip install openpyxl                 # Excel file support
pip install matplotlib               # Chart rendering
pip install duckduckgo-search        # Web search
```

---

## All Files

| File | Purpose |
|---|---|
| `myai.py` | Main CLI — all commands wired here |
| `integrations.py` | GitHub, Jira, Figma, MCP clients |
| `intelligence.py` | Model router, Ollama fallback, agent, code review, summarizer |
| `learner.py` | Style profiler, codebase index, feedback memory, watcher |
| `privacy.py` | Offline enforcer, encryption, access control, audit log, data wipe |
| `skills.py` | 30+ built-in skills + MYAI.md reader + auto-detector |
| `datadocs.py` | Doc generator, database client, data analyzer, diagram builder |
| `testing.py` | Test generator, runner, fix loop, coverage analyzer |
| `comms.py` | Commit messages, PR descriptions, release notes, standup |
| `plugins.py` | Plugin loader, registry, hooks system |
| `multiedit.py` | Multi-file editor with diff preview and undo |
| `webui.py` | Local browser dashboard |

**myai data stored at `~/.myai/`:**

| Path | Contents |
|---|---|
| `~/.myai/config.json` | Settings |
| `~/.myai/privacy.json` | Privacy settings |
| `~/.myai/integrations.json` | API keys (local only) |
| `~/.myai/memory/` | Per-project conversation memory |
| `~/.myai/history/log.jsonl` | Searchable question history |
| `~/.myai/feedback.jsonl` | Permanent corrections |
| `~/.myai/style_profile.json` | Your coding style profile |
| `~/.myai/codebase_index.json` | Semantic search index |
| `~/.myai/skills/` | Your custom skills |
| `~/.myai/plugins/` | Installed plugins |
| `~/.myai/backups/` | File edit backups (for undo) |
| `~/.myai/audit.log` | Tamper-evident audit log |
| `~/.myai/.key` | Encryption key (never sent anywhere) |

---

## Shell Completion

Install once — Tab-complete every command, subcommand, skill name, and file forever.

```bash
myai completion install              # auto-detect your shell
myai completion install --shell zsh
myai completion install --shell bash
myai completion install --shell fish
myai completion show --shell zsh     # print script without installing
myai completion uninstall            # remove completion
```

After installing, restart your terminal. Then Tab works on everything:
```bash
myai <Tab>                           # all commands
myai skill <Tab>                     # all subcommands
myai skill show <Tab>                # all skill names
myai diagram generate <Tab>          # architecture, class, flow, er...
myai db connect <Tab>                # sqlite, postgres, mysql, mongodb
```

---

## Token Usage Tracker

Tracks every AI call — tokens used, cost reference vs paid APIs, per-model and per-command breakdown.

```bash
# View usage
myai tokens show                     # all-time stats
myai tokens show --period day        # today only
myai tokens show --period week
myai tokens show --period month
myai tokens show --period day --project   # current project only

# Set limits (warns when approaching)
myai tokens limit --daily 100000     # warn at 80% of 100k/day
myai tokens limit --monthly 2000000
myai tokens limit --warn 90          # warn at 90% instead of 80%
myai tokens limit --daily 0          # remove daily limit

# Reset counters
myai tokens reset                    # clear all
myai tokens reset --period week      # clear last week only
```

Shows per-model breakdown, per-command breakdown, and how much you would have paid on GPT-4o or Claude for the same tokens. Groq is free — the savings add up fast.

---

## Real Vector Embeddings

Much more accurate code search than TF-IDF. Uses Ollama locally — free and private.

```bash
# One-time setup (requires Ollama: https://ollama.com)
myai embed setup                     # pulls nomic-embed-text model

# Index your project
myai embed index .                   # current folder
myai embed index ~/projects/myapp
myai embed index . --model mxbai-embed-large    # higher quality, slower
myai embed index . --model all-minilm           # tiny, very fast

# Search semantically
myai embed search "authentication logic"
myai embed search "database connection pooling" --top 10

# Stats
myai embed stats                     # files indexed, model, languages
```

**Models available via Ollama:**

| Model | Quality | Speed | Best for |
|---|---|---|---|
| `nomic-embed-text` | Good | Fast | Default — recommended |
| `mxbai-embed-large` | Best | Slower | When accuracy matters most |
| `all-minilm` | OK | Very fast | Large codebases |

Automatically used instead of TF-IDF when Ollama is running. Falls back silently if not. No config needed — it just gets better when Ollama is available.

---

## Encryption (Fixed — AES-256-GCM)

Encryption now uses the battle-tested `cryptography` library instead of a custom implementation.

```bash
pip install cryptography             # one-time install for best security
```

**What changed:**
- Upgraded from custom XOR-stream to proper **AES-256-GCM**
- GCM mode provides authenticated encryption — detects tampering automatically
- The `cryptography` library is audited by the Python security community
- Backwards compatible — still reads files encrypted with the old method
- Falls back to pure-Python if `cryptography` not installed

Encryption commands are unchanged:
```bash
myai privacy encrypt on              # encrypt all data with password
myai privacy encrypt off             # decrypt
myai privacy encrypt status          # check status
```

---

## All Files (Updated)

| File | Purpose |
|---|---|
| `myai.py` | Main CLI — all commands wired here |
| `integrations.py` | GitHub, Jira, Figma, MCP clients |
| `intelligence.py` | Model router, Ollama fallback, agent, code review, summarizer |
| `learner.py` | Style profiler, codebase index (TF-IDF), feedback memory, watcher |
| `privacy.py` | Offline enforcer, AES-256-GCM encryption, access control, audit log, data wipe |
| `skills.py` | 40+ built-in skills + MYAI.md reader + auto-detector |
| `datadocs.py` | Doc generator, database client, data analyzer, diagram builder |
| `testing.py` | Test generator, runner, fix loop, coverage analyzer |
| `comms.py` | Commit messages, PR descriptions, release notes, standup |
| `plugins.py` | Plugin loader, registry, hooks system |
| `multiedit.py` | Multi-file editor with diff preview and undo |
| `webui.py` | Local browser dashboard |
| `completion.py` | Shell tab completion (zsh, bash, fish) |
| `tokens.py` | Token usage tracker and cost estimator |
| `embeddings.py` | Real vector embeddings via Ollama for semantic search |

**Install everything:**

```bash
# Required
pip install groq rich click requests

# Recommended
pip install cryptography             # AES-256-GCM encryption
pip install duckduckgo-search        # web search

# Optional by feature
pip install openpyxl                 # Excel file support
pip install psycopg2-binary          # PostgreSQL
pip install mysql-connector-python   # MySQL
pip install pymongo                  # MongoDB
pip install matplotlib               # chart rendering

# For real embeddings (install Ollama first: https://ollama.com)
# then: ollama pull nomic-embed-text
```

**myai data stored at `~/.myai/`:**

| Path | Contents |
|---|---|
| `~/.myai/config.json` | Settings |
| `~/.myai/privacy.json` | Privacy settings |
| `~/.myai/integrations.json` | API keys (local only, never sent anywhere) |
| `~/.myai/memory/` | Per-project conversation memory |
| `~/.myai/history/log.jsonl` | Searchable question history |
| `~/.myai/feedback.jsonl` | Permanent corrections |
| `~/.myai/style_profile.json` | Your coding style profile |
| `~/.myai/codebase_index.json` | TF-IDF search index |
| `~/.myai/embeddings_index.json` | Real vector embeddings index |
| `~/.myai/token_usage.jsonl` | Token usage log |
| `~/.myai/token_limits.json` | Usage limits config |
| `~/.myai/skills/` | Your custom skills |
| `~/.myai/plugins/` | Installed plugins |
| `~/.myai/backups/` | File edit backups (for undo) |
| `~/.myai/audit.log` | Tamper-evident audit log |
| `~/.myai/.key` | Encryption key (never sent anywhere) |
| `~/.myai/completion.zsh` | Zsh completion script |
| `~/.myai/completion.bash` | Bash completion script |

---

## Setup Wizard

Get all your API keys configured in one command — guided step by step, tested automatically.

```bash
myai setup                   # full interactive wizard (all services)
myai setup groq              # Groq only (free AI — required)
myai setup github            # GitHub — OAuth Device Flow (auto!) or manual token
myai setup jira              # Jira — guided, opens browser
myai setup figma             # Figma — guided, opens browser
myai setup anthropic         # Claude Sonnet/Opus/Haiku (paid)
myai setup gemini            # Google Gemini (free!)
myai setup deepseek          # DeepSeek Chat + R1 reasoner (ultra cheap)
myai setup status            # show all configured keys + masked values
myai setup test              # test every key against its API right now
myai setup remove GROQ_API_KEY   # remove a specific key
```

**GitHub is special — fully automatic OAuth Device Flow:**
```
myai setup github

  Your authorization code:
    ABCD-1234

  1. Browser opened automatically
  2. Enter the code above on GitHub
  3. Click Authorize
  4. Token saves automatically ✓
```
No copy-pasting tokens for GitHub — it generates one for you.

**Keys stored at `~/.myai/.env`** with `chmod 600` (owner read-only).
Loaded automatically on every `myai` run — no `export` needed.

---

## AI Providers

myai supports 5 AI providers. Switch anytime — all commands work the same regardless of which provider is active.

```bash
myai provider status                    # see all providers, keys, current selection

myai provider groq                      # Groq — free, fast (default)
myai provider gemini                    # Google Gemini Flash — free
myai provider gemini pro                # Google Gemini 2.5 Pro — free, 1M token context
myai provider deepseek                  # DeepSeek Chat — ultra cheap
myai provider deepseek reasoner         # DeepSeek R1 — near-Opus reasoning, cheap
myai provider anthropic sonnet          # Claude Sonnet 4.6 — smart + fast (paid)
myai provider anthropic opus            # Claude Opus 4.6 — most powerful (paid)
myai provider anthropic haiku           # Claude Haiku 4.5 — fastest Claude (paid)
myai provider auto                      # smart routing — best model per task type
```

**Provider comparison:**

| Provider | Model | Quality | Cost |
|---|---|---|---|
| Groq | Llama3-70b | ⭐⭐⭐ | Free 🎉 |
| Groq | Mixtral-8x7b | ⭐⭐⭐ | Free 🎉 |
| Gemini | Flash 2.0 | ⭐⭐⭐ | Free 🎉 |
| Gemini | 2.5 Pro | ⭐⭐⭐⭐ | Free 🎉 (1M context) |
| DeepSeek | Chat | ⭐⭐⭐ | $0.07/$1.10 per 1M |
| DeepSeek | R1 Reasoner | ⭐⭐⭐⭐½ | $0.14/$2.19 per 1M |
| Anthropic | Haiku 4.5 | ⭐⭐⭐ | $0.80/$4 per 1M |
| Anthropic | Sonnet 4.6 | ⭐⭐⭐⭐ | $3/$15 per 1M |
| Anthropic | Opus 4.6 | ⭐⭐⭐⭐⭐ | $15/$75 per 1M |
| Ollama | Any local | ⭐⭐⭐ | Free + offline |

**Auto mode smart routing:**

| Task type | Model chosen |
|---|---|
| Quick questions | Groq Llama3-8b (free, instant) |
| Code generation | Groq Llama3-70b (free) |
| Long file / whole codebase | Gemini 2.5 Pro (free, 1M tokens) |
| Complex reasoning | DeepSeek R1 (cheap) |
| Agent tasks | DeepSeek R1 or Claude Opus |
| Images | Gemini Flash or Claude Sonnet |
| No Groq key | Falls back to available provider |

---

## Claude Models (Anthropic)

```bash
# Setup (one time)
myai setup anthropic

# Switch Claude models
myai claude sonnet           # Claude Sonnet 4.6 — recommended for daily use
myai claude opus             # Claude Opus 4.6 — most powerful, best reasoning
myai claude haiku            # Claude Haiku 4.5 — fastest, cheapest
myai claude auto             # Claude for hard tasks, Groq for fast ones
myai claude groq             # switch back to Groq (free)
myai claude                  # show current provider + model

# Or use the unified provider command
myai provider anthropic sonnet
myai provider anthropic opus
```

**Claude pricing reference:**

| Model | Input | Output | Best for |
|---|---|---|---|
| Haiku 4.5 | $0.80/1M | $4/1M | Fast, cheap tasks |
| Sonnet 4.6 | $3/1M | $15/1M | Daily coding — best value |
| Opus 4.6 | $15/1M | $75/1M | Complex reasoning, architecture |

---

## Google Gemini (Free)

```bash
# Setup (one time — free, no credit card)
myai setup gemini            # opens aistudio.google.com

# Switch to Gemini
myai provider gemini         # Gemini 2.0 Flash (fast, free)
myai provider gemini pro     # Gemini 2.5 Pro (powerful, free, 1M tokens)
```

**Why Gemini 2.5 Pro is special:**
- **1 million token context** — can read your entire codebase at once
- Free on Google AI Studio (generous daily limits)
- Great for large refactors, whole-project questions
- Auto-selected in `auto` mode for long-context tasks

---

## DeepSeek (Ultra Cheap)

```bash
# Setup (one time — needs small credit, ~$5 lasts months)
myai setup deepseek          # opens platform.deepseek.com

# Switch to DeepSeek
myai provider deepseek           # DeepSeek Chat — fast, cheap
myai provider deepseek reasoner  # DeepSeek R1 — chain-of-thought, near Opus quality
```

**DeepSeek R1 is special:**
- Shows its reasoning chain before answering (like o1)
- Near Claude Opus quality on reasoning and math tasks
- ~100x cheaper than Opus ($0.14 vs $15 per 1M input tokens)
- Auto-selected in `auto` mode for reasoning/agent tasks

---

## All Files (Final)

| File | Lines | Purpose |
|---|---|---|
| `myai.py` | ~3,400 | Main CLI — all commands wired here |
| `skills.py` | ~1,700 | 40+ built-in skills + MYAI.md + auto-detector |
| `intelligence.py` | ~1,100 | Model router, Groq, Ollama, Anthropic, Gemini, DeepSeek |
| `learner.py` | ~726 | Style profiler, TF-IDF index, feedback memory, watcher |
| `datadocs.py` | ~892 | Docs, database, data analysis, diagrams |
| `privacy.py` | ~821 | AES-256-GCM encryption, audit log, access control |
| `setup.py` | ~700 | API key wizard — Groq, GitHub OAuth, Jira, Figma, Gemini, DeepSeek |
| `integrations.py` | ~515 | GitHub, Jira, Figma, MCP clients |
| `completion.py` | ~400 | Shell tab completion (zsh, bash, fish) |
| `webui.py` | ~374 | Local browser dashboard |
| `embeddings.py` | ~350 | Real vector embeddings via Ollama |
| `multiedit.py` | ~340 | Multi-file editor with diff preview + undo |
| `testing.py` | ~329 | Test generator, runner, fix loop, coverage |
| `tokens.py` | ~300 | Token usage tracker + cost estimator |
| `comms.py` | ~230 | Commit messages, PR descriptions, standup |
| `plugins.py` | ~259 | Plugin loader, registry, hooks |
| `README.md` | — | This file |

**Total: ~13,000+ lines of code across 16 files**

---

## Quick Reference — All Providers

```bash
# Free options (recommended starting point)
myai setup groq              # free, fast — get key at console.groq.com
myai setup gemini            # free, 1M context — get key at aistudio.google.com
myai provider gemini pro     # activate Gemini 2.5 Pro

# Cheap options (near Opus quality)
myai setup deepseek          # ~$5 credit lasts months — platform.deepseek.com
myai provider deepseek reasoner   # activate DeepSeek R1

# Paid options (most powerful)
myai setup anthropic         # console.anthropic.com
myai provider anthropic opus # activate Claude Opus

# Offline (no internet)
myai offline                 # use Ollama local models
myai embed setup             # pull embedding model for semantic search

# Smart (auto-pick best)
myai provider auto           # myai picks the right model per task

# Check everything
myai setup status            # all keys + status
myai provider status         # all providers + current selection
myai tokens show             # usage stats + cost reference
```
