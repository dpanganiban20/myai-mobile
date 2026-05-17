#!/usr/bin/env python3

import os
import sys
import json
import re
import base64
import subprocess
import click
from datetime import datetime
from pathlib import Path
from groq import Groq
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.prompt import Prompt
from rich.spinner import Spinner
from rich.live import Live
from rich.table import Table

console = Console()
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}

BASE_SYSTEM_PROMPT = """You are myai — a free, local AI coding assistant like Claude Code.

You help with:
- Coding questions, explanations, new code, bug fixes
- Reading and writing files directly
- Running shell commands and interpreting output
- Analyzing images: screenshots, UI, errors, diagrams
- GitHub: repos, issues, PRs, code review, merging
- Jira: tickets, transitions, comments, sprints
- Figma: designs, components, assets, comments
- MCP: any connected MCP server tools

RESPONSE FORMATS — the tool auto-detects and applies these:
  ===WRITE_FILE: path/to/file.py===
  <full file content>
  ===END_FILE===

  ===RUN_CMD===
  shell command
  ===END_CMD===

Use all provided context (project, git, deps, integrations, memory) for accurate answers.
Format responses in Markdown with proper code blocks."""


# ═══════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════

def get_config_path():
    d = Path.home() / ".myai"
    d.mkdir(parents=True, exist_ok=True)
    return d / "config.json"

def load_config():
    defaults = {
        "model": "llama3-70b-8192",
        "vision_model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "max_tokens": 2048,
        "web_search": False,
        "auto_index": True,
        "auto_run_commands": False,
        "tone": "concise",
        "integrations_in_context": True
    }
    p = get_config_path()
    if p.exists():
        with open(p) as f:
            defaults.update(json.load(f))
    return defaults

def save_config(cfg):
    with open(get_config_path(), "w") as f:
        json.dump(cfg, f, indent=2)


# ═══════════════════════════════════════════════════════════
# MEMORY
# ═══════════════════════════════════════════════════════════

def get_memory_dir():
    d = Path.home() / ".myai" / "memory"
    d.mkdir(parents=True, exist_ok=True)
    return d

def get_project_id():
    cwd = str(Path.cwd().resolve())
    return cwd.replace("/", "_").replace("\\", "_").strip("_")

def get_memory_path():
    return get_memory_dir() / f"{get_project_id()}.json"

def load_memory():
    p = get_memory_path()
    if p.exists():
        with open(p) as f:
            return json.load(f)
    return {"project": str(Path.cwd().resolve()), "created": datetime.now().isoformat(), "history": []}

def save_memory(mem):
    with open(get_memory_path(), "w") as f:
        json.dump(mem, f, indent=2)

def add_to_memory(mem, role, content):
    if isinstance(content, list):
        text_parts = [c["text"] for c in content if c.get("type") == "text"]
        content = " ".join(text_parts) + " [image attached]"
    mem["history"].append({"role": role, "content": content, "timestamp": datetime.now().isoformat()})
    if len(mem["history"]) > 100:
        mem["history"] = mem["history"][-100:]
    save_memory(mem)


# ═══════════════════════════════════════════════════════════
# IMAGE HANDLING
# ═══════════════════════════════════════════════════════════

def is_image_file(path):
    return Path(path).suffix.lower() in IMAGE_EXTENSIONS

def encode_image(path):
    with open(path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("utf-8")

def get_media_type(path):
    return {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp"
            }.get(Path(path).suffix.lower(), "image/png")

def get_clipboard_image():
    import platform
    system = platform.system()
    try:
        if system == "Darwin":
            tmp = Path("/tmp/myai_clip.png")
            script = (f'set theFile to open for access POSIX file "{tmp}" with write permission\n'
                      f'write (the clipboard as «class PNGf») to theFile\nclose access theFile')
            subprocess.run(["osascript", "-e", script], capture_output=True)
            if tmp.exists() and tmp.stat().st_size > 0:
                data = encode_image(str(tmp)); tmp.unlink(); return data, "image/png"
        elif system == "Linux":
            for tool in [["xclip", "-selection", "clipboard", "-t", "image/png", "-o"],
                         ["wl-paste", "--type", "image/png"]]:
                try:
                    r = subprocess.run(tool, capture_output=True)
                    if r.returncode == 0 and r.stdout:
                        return base64.standard_b64encode(r.stdout).decode("utf-8"), "image/png"
                except FileNotFoundError:
                    continue
        elif system == "Windows":
            tmp = Path(os.environ.get("TEMP", "/tmp")) / "myai_clip.png"
            ps = f'Add-Type -AssemblyName System.Windows.Forms;$img=[System.Windows.Forms.Clipboard]::GetImage();if($img){{$img.Save("{tmp}")}}'
            subprocess.run(["powershell", "-Command", ps], capture_output=True)
            if tmp.exists() and tmp.stat().st_size > 0:
                data = encode_image(str(tmp)); tmp.unlink(); return data, "image/png"
    except Exception:
        pass
    return None, None

def build_image_content(question, image_sources):
    content = []
    for b64, mtype in image_sources:
        content.append({"type": "image_url", "image_url": {"url": f"data:{mtype};base64,{b64}"}})
    content.append({"type": "text", "text": question})
    return content


# ═══════════════════════════════════════════════════════════
# PROJECT CONTEXT
# ═══════════════════════════════════════════════════════════

def get_project_structure(max_files=60):
    ignore = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", ".next", ".myai"}
    lines = []
    cwd = Path.cwd()
    for p in sorted(cwd.rglob("*")):
        if any(part in ignore for part in p.parts) or p.suffix in {".pyc", ".pyo", ".lock"}:
            continue
        rel = p.relative_to(cwd)
        indent = "  " * (len(rel.parts) - 1)
        lines.append(f"{indent}{'📁' if p.is_dir() else '📄'} {p.name}")
        if len(lines) >= max_files:
            lines.append("  ... (truncated)"); break
    return "\n".join(lines)

def get_git_context():
    def run(cmd):
        try:
            return subprocess.check_output(cmd, stderr=subprocess.DEVNULL, text=True, cwd=str(Path.cwd())).strip()
        except Exception:
            return None
    branch = run(["git", "branch", "--show-current"])
    if not branch:
        return None
    status = run(["git", "status", "--short"]) or "clean"
    log = run(["git", "log", "--oneline", "-5"]) or ""
    diff = run(["git", "diff", "--stat", "HEAD"]) or ""
    return f"Branch: {branch}\nStatus:\n{status}\nRecent commits:\n{log}\nDiff stat:\n{diff}"

def get_dependencies():
    cwd = Path.cwd()
    found = []
    for fname in ["requirements.txt", "package.json", "pyproject.toml", "Pipfile", "go.mod", "Cargo.toml"]:
        p = cwd / fname
        if p.exists():
            try:
                found.append(f"### {fname}\n{p.read_text()[:1500]}")
            except Exception:
                pass
    return "\n\n".join(found) if found else None

def build_system_prompt(memory, cfg):
    parts = [BASE_SYSTEM_PROMPT]
    parts.append("Be thorough and explain your reasoning." if cfg.get("tone") == "verbose" else "Be concise but complete.")
    if cfg.get("auto_index"):
        s = get_project_structure()
        if s:
            parts.append(f"\n--- Project Structure ---\n{s}")
    git = get_git_context()
    if git:
        parts.append(f"\n--- Git Context ---\n{git}")
    deps = get_dependencies()
    if deps:
        parts.append(f"\n--- Dependencies ---\n{deps}")
    # Integrations context
    if cfg.get("integrations_in_context"):
        try:
            from integrations import build_integrations_context
            int_ctx = build_integrations_context(cfg)
            if int_ctx.strip():
                parts.append(int_ctx)
        except Exception:
            pass
    if memory.get("history"):
        parts.append(f"\n--- Project Memory ---\nProject: {memory.get('project')}\nUse the conversation history as context.")
    return "\n\n".join(parts)

def build_messages(memory, cfg, new_message):
    system = build_system_prompt(memory, cfg)
    messages = [{"role": "system", "content": system}]
    for e in memory.get("history", []):
        messages.append({"role": e["role"], "content": e["content"]})
    messages.append({"role": "user", "content": new_message})
    return messages


# ═══════════════════════════════════════════════════════════
# GROQ
# ═══════════════════════════════════════════════════════════

def get_client():
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        console.print("[bold red]Error:[/bold red] GROQ_API_KEY not set.")
        console.print("Get your free key at [link=https://console.groq.com]console.groq.com[/link]")
        console.print("Then run: [bold]export GROQ_API_KEY=your_key_here[/bold]")
        sys.exit(1)
    return Groq(api_key=key)

def ask_groq(client, messages, cfg, has_image=False):
    model = cfg.get("vision_model") if has_image else cfg.get("model", "llama3-70b-8192")
    with Live(Spinner("dots", text="[cyan]Thinking...[/cyan]"), console=console, transient=True):
        r = client.chat.completions.create(model=model, messages=messages, max_tokens=cfg.get("max_tokens", 2048))
    return r.choices[0].message.content


# ═══════════════════════════════════════════════════════════
# FILE EDITING & COMMANDS
# ═══════════════════════════════════════════════════════════

def apply_file_writes(response):
    for filepath, content in re.findall(r"===WRITE_FILE: (.+?)===\n(.*?)===END_FILE===", response, re.DOTALL):
        path = Path(filepath.strip())
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content.strip() + "\n")
        console.print(f"  [bold green]✓ Wrote:[/bold green] {filepath.strip()}")

def apply_run_commands(response, cfg):
    for cmd in re.findall(r"===RUN_CMD===\n(.*?)===END_CMD===", response, re.DOTALL):
        cmd = cmd.strip()
        console.print(f"\n[bold yellow]⚡ Suggested:[/bold yellow] {cmd}")
        if cfg.get("auto_run_commands") or Prompt.ask("  Run? [y/n]", default="n").lower() == "y":
            run_command(cmd)

def run_command(cmd):
    console.print(f"[dim]$ {cmd}[/dim]")
    try:
        r = subprocess.run(cmd, shell=True, text=True, capture_output=True, cwd=str(Path.cwd()))
        if r.stdout:
            console.print(Panel(r.stdout.strip(), title="[green]stdout[/green]", border_style="green"))
        if r.stderr:
            console.print(Panel(r.stderr.strip(), title="[red]stderr[/red]", border_style="red"))
        return r.stdout + r.stderr
    except Exception as e:
        console.print(f"[red]Error:[/red] {e}"); return str(e)

def read_files(filepaths):
    parts = []
    for path in filepaths:
        try:
            parts.append(f"### File: {path}\n```\n{open(path).read()}\n```")
        except FileNotFoundError:
            console.print(f"[red]File not found:[/red] {path}"); sys.exit(1)
    return "\n\n".join(parts)


# ═══════════════════════════════════════════════════════════
# DISPLAY
# ═══════════════════════════════════════════════════════════

def display_response(response):
    console.print()
    console.print(Panel(Markdown(response), title="[bold cyan]myai[/bold cyan]", border_style="cyan"))
    console.print()

def show_banner(memory, cfg):
    project = memory.get("project", str(Path.cwd()))
    exchanges = len(memory.get("history", [])) // 2
    git = get_git_context()
    branch = ""
    if git:
        for line in git.splitlines():
            if line.startswith("Branch:"):
                branch = f" · 🌿 {line.split(':', 1)[1].strip()}"
    mem_info = f" · 💾 {exchanges} exchanges" if exchanges else " · 🆕 new"

    # Show connected integrations
    try:
        from integrations import load_integrations_config
        icfg = load_integrations_config()
        icons = []
        if "github" in icfg: icons.append("🐙 GitHub")
        if "jira" in icfg: icons.append("📋 Jira")
        if "figma" in icfg: icons.append("🎨 Figma")
        mcp = icfg.get("mcp_servers", [])
        if mcp: icons.append(f"🔌 MCP({len(mcp)})")
        int_info = " · " + " ".join(icons) if icons else ""
    except Exception:
        int_info = ""

    console.print(f"[dim]📁 {project}{branch}{mem_info}{int_info}[/dim]")


# ═══════════════════════════════════════════════════════════
# ERROR CATCHING
# ═══════════════════════════════════════════════════════════

def handle_error(error_text):
    file_pattern = r'(?:File "([^"]+)")|(?:at ([^\s:]+\.(?:py|js|ts|go|rb|java)):)'
    found = list({m[0] or m[1] for m in re.findall(file_pattern, error_text) if (m[0] or m[1]) and Path(m[0] or m[1]).exists()})
    msg = f"I got this error:\n```\n{error_text}\n```\nIdentify the bug and fix it."
    if found:
        msg += f"\n\nRelevant files:\n{read_files(found)}"
        console.print(f"[dim]  Auto-detected: {', '.join(found)}[/dim]")
    return msg


# ═══════════════════════════════════════════════════════════
# WEB SEARCH
# ═══════════════════════════════════════════════════════════

def web_search(query, n=3):
    try:
        from duckduckgo_search import DDGS
        with DDGS() as d:
            return "\n\n".join(f"**{r['title']}**\n{r['href']}\n{r['body']}" for r in d.text(query, max_results=n))
    except ImportError:
        return "[Web search unavailable — pip install duckduckgo-search]"
    except Exception as e:
        return f"[Search failed: {e}]"


# ═══════════════════════════════════════════════════════════
# HISTORY
# ═══════════════════════════════════════════════════════════

def get_history_path():
    d = Path.home() / ".myai" / "history"
    d.mkdir(parents=True, exist_ok=True)
    return d / "log.jsonl"

def save_history(question, response):
    if isinstance(question, list):
        question = " ".join(c.get("text","") for c in question if c.get("type")=="text") + " [image]"
    with open(get_history_path(), "a") as f:
        f.write(json.dumps({"timestamp": datetime.now().isoformat(), "project": str(Path.cwd()),
                             "question": str(question)[:300], "response": response[:500]}) + "\n")

def search_history_log(query):
    p = get_history_path()
    if not p.exists(): return []
    results = []
    for line in open(p):
        try:
            e = json.loads(line)
            if query.lower() in e.get("question","").lower():
                results.append(e)
        except Exception: pass
    return results[-20:]


# ═══════════════════════════════════════════════════════════
# CORE ASK
# ═══════════════════════════════════════════════════════════

def do_ask(question, files, memory, cfg, client, is_error=False, image_sources=None):
    show_banner(memory, cfg)
    image_sources = image_sources or []

    if is_error:
        user_message = handle_error(question)
    else:
        code_files = [f for f in files if not is_image_file(f)]
        img_files = [(encode_image(f), get_media_type(f)) for f in files if is_image_file(f)]
        image_sources = image_sources + img_files
        user_message = question
        if code_files:
            user_message = f"{question}\n\n{read_files(code_files)}"

    if cfg.get("web_search"):
        console.print("[dim]🌐 Searching...[/dim]")
        user_message = f"{user_message}\n\n--- Web Results ---\n{web_search(str(question))}"

    console.print(f"\n[bold green]>[/bold green] {question}")
    if files: console.print(f"[dim]  Files: {', '.join(files)}[/dim]")
    if image_sources: console.print(f"[dim]  🖼️  {len(image_sources)} image(s)[/dim]")

    content = build_image_content(user_message if isinstance(user_message, str) else str(question), image_sources) \
              if image_sources else user_message

    messages = build_messages(memory, cfg, content)
    response = ask_groq(client, messages, cfg, has_image=bool(image_sources))
    display_response(response)
    apply_file_writes(response)
    apply_run_commands(response, cfg)
    add_to_memory(memory, "user", content)
    add_to_memory(memory, "assistant", response)
    save_history(question, response)
    return response


# ═══════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════

@click.group(invoke_without_command=True)
@click.argument("question", required=False)
@click.argument("files", nargs=-1, type=click.Path())
@click.option("--clip", is_flag=True, help="Attach image from clipboard.")
@click.pass_context
def cli(ctx, question, files, clip):
    """
    myai — Free AI coding assistant with GitHub, Jira, Figma & MCP\n
    \b
    USAGE:
      myai "question"                  Ask anything
      myai "question" file.py          Ask about a file
      myai "question" shot.png         Ask about an image
      myai --clip "question"           Use clipboard image
      myai fix "error"                 Auto-fix an error
      myai run "cmd"                   Run command with AI
      myai chat                        Interactive session
    \b
    INTEGRATIONS:
      myai connect github              Connect GitHub
      myai connect jira                Connect Jira
      myai connect figma               Connect Figma
      myai connect mcp                 Add MCP server
      myai integrations                Show all connections
    \b
    GITHUB:
      myai github repos                List your repos
      myai github issues owner/repo    List issues
      myai github prs owner/repo       List pull requests
      myai github diff owner/repo 42   Show PR diff
    \b
    JIRA:
      myai jira mine                   My open tickets
      myai jira issue PROJECT-123      Get issue details
      myai jira move PROJECT-123 "In Progress"
    \b
    FIGMA:
      myai figma file FILE_KEY         Inspect a Figma file
      myai figma export FILE_KEY NODE  Export a node as PNG
    \b
    OTHER:
      myai memory                      Project memory
      myai search "query"              Search history
      myai config                      Settings
    """
    if ctx.invoked_subcommand is not None:
        return
    if not question:
        click.echo(ctx.get_help()); return
    client = get_client()
    cfg = load_config()
    memory = load_memory()
    imgs = []
    if clip:
        console.print("[dim]📋 Reading clipboard...[/dim]")
        b64, mt = get_clipboard_image()
        if b64: imgs.append((b64, mt)); console.print("[dim]  ✓ Loaded[/dim]")
        else: console.print("[yellow]⚠ No image in clipboard.[/yellow]")
    do_ask(question, list(files), memory, cfg, client, image_sources=imgs)


# ── Fix ───────────────────────────────────────────────────

@cli.command()
@click.argument("error_text")
def fix(error_text):
    """Auto-fix an error. Detects relevant files automatically."""
    do_ask(error_text, [], load_memory(), load_config(), get_client(), is_error=True)


# ── Run ───────────────────────────────────────────────────

@cli.command()
@click.argument("command")
def run(command):
    """Run a shell command and get AI explanation/fix."""
    output = run_command(command)
    if output.strip():
        do_ask(f"I ran `{command}` and got:\n```\n{output}\n```\nExplain and fix if needed.",
               [], load_memory(), load_config(), get_client())


# ── Chat ──────────────────────────────────────────────────

@cli.command()
def chat():
    """Interactive chat with memory, integrations, and image support."""
    client = get_client(); cfg = load_config(); memory = load_memory()
    show_banner(memory, cfg)
    console.print(Panel(
        "[bold cyan]myai chat[/bold cyan]\n"
        "[dim]exit · run:cmd · search:term · clip: · img.png · github:owner/repo · jira:KEY-123 · figma:FILEKEY[/dim]",
        border_style="cyan"))
    console.print()

    while True:
        try:
            user_input = Prompt.ask("[bold green]You[/bold green]")
        except (KeyboardInterrupt, EOFError):
            console.print("\n[dim]Goodbye![/dim]"); break
        stripped = user_input.strip()
        if not stripped: continue
        if stripped.lower() in ("exit", "quit", "q"):
            console.print("[dim]Goodbye![/dim]"); break

        image_sources = []

        # clip:
        if stripped.lower().startswith("clip:"):
            q = stripped[5:].strip() or "What is in this image?"
            b64, mt = get_clipboard_image()
            if b64: image_sources.append((b64, mt)); console.print("[dim]  ✓ Clipboard image[/dim]")
            else: console.print("[yellow]⚠ No image in clipboard.[/yellow]"); continue
            do_ask(q, [], memory, cfg, client, image_sources=image_sources); continue

        # run:
        if stripped.lower().startswith("run:"):
            out = run_command(stripped[4:].strip())
            if out.strip(): user_input = f"I ran `{stripped[4:].strip()}` and got:\n```\n{out}\n```\nExplain or fix."
            else: continue

        # search:
        if stripped.lower().startswith("search:"):
            q = stripped[7:].strip()
            console.print("[dim]🌐 Searching...[/dim]")
            user_input = f"Search results for '{q}':\n{web_search(q)}\n\nSummarize and help me."

        # github: inline
        if stripped.lower().startswith("github:"):
            repo = stripped[7:].strip()
            try:
                from integrations import GitHub
                gh = GitHub()
                owner, rname = repo.split("/")
                summary = gh.summarize_for_ai(owner, rname)
                user_input = f"Here is the GitHub context for {repo}:\n{summary}\n\nHelp me understand or work with this repo."
            except Exception as e:
                user_input = f"GitHub context for {repo} failed: {e}"

        # jira: inline
        if stripped.lower().startswith("jira:"):
            key = stripped[5:].strip()
            try:
                from integrations import Jira
                jira = Jira()
                issue = jira.get_issue(key)
                fields = issue["fields"]
                user_input = (f"Jira issue {key}: {fields.get('summary')}\n"
                              f"Status: {fields.get('status',{}).get('name')}\n"
                              f"Priority: {fields.get('priority',{}).get('name')}\n"
                              f"Description: {fields.get('description','')}\n\nHelp me understand or work on this.")
            except Exception as e:
                user_input = f"Jira issue {key} failed: {e}"

        # figma: inline
        if stripped.lower().startswith("figma:"):
            fkey = stripped[6:].strip()
            try:
                from integrations import Figma
                figma = Figma()
                user_input = f"Figma file context:\n{figma.summarize_for_ai(fkey)}\n\nHelp me understand this design."
            except Exception as e:
                user_input = f"Figma file {fkey} failed: {e}"

        # inline image file
        words = stripped.split()
        text_parts, img_files = [], []
        for w in words:
            if Path(w).exists() and is_image_file(w):
                img_files.append((encode_image(w), get_media_type(w)))
                console.print(f"[dim]  🖼️  Image: {w}[/dim]")
            else:
                text_parts.append(w)
        if img_files:
            image_sources += img_files
            user_input = " ".join(text_parts) or "What is in this image?"

        if image_sources:
            do_ask(user_input, [], memory, cfg, client, image_sources=image_sources)
        else:
            messages = build_messages(memory, cfg, user_input)
            response = ask_groq(client, messages, cfg)
            display_response(response)
            apply_file_writes(response)
            apply_run_commands(response, cfg)
            add_to_memory(memory, "user", user_input)
            add_to_memory(memory, "assistant", response)
            save_history(user_input, response)


# ── Connect ───────────────────────────────────────────────

@cli.command()
@click.argument("service", type=click.Choice(["github", "jira", "figma", "mcp"]))
def connect(service):
    """Connect an integration: github, jira, figma, or mcp."""
    from integrations import load_integrations_config, save_integrations_config
    cfg = load_integrations_config()

    if service == "github":
        console.print("\n[bold]Connect GitHub[/bold]")
        console.print("Get a token at: https://github.com/settings/tokens")
        console.print("Scopes needed: repo, issues, pull_requests\n")
        token = Prompt.ask("GitHub Personal Access Token", password=True)
        default_repo = Prompt.ask("Default repo (owner/repo) [optional]", default="")
        cfg["github"] = {"token": token, "default_repo": default_repo}
        save_integrations_config(cfg)
        # Test
        try:
            from integrations import GitHub
            gh = GitHub()
            r = gh._get("/user")
            console.print(f"[bold green]✓ Connected as:[/bold green] {r.get('login')}")
        except Exception as e:
            console.print(f"[red]Connection failed:[/red] {e}")

    elif service == "jira":
        console.print("\n[bold]Connect Jira[/bold]")
        console.print("Get a token at: https://id.atlassian.com/manage-profile/security/api-tokens\n")
        url = Prompt.ask("Jira URL (e.g. https://yourorg.atlassian.net)")
        email = Prompt.ask("Your Jira email")
        token = Prompt.ask("API Token", password=True)
        cfg["jira"] = {"url": url, "email": email, "token": token}
        save_integrations_config(cfg)
        try:
            from integrations import Jira
            j = Jira()
            me = j._get("/myself")
            console.print(f"[bold green]✓ Connected as:[/bold green] {me.get('displayName')}")
        except Exception as e:
            console.print(f"[red]Connection failed:[/red] {e}")

    elif service == "figma":
        console.print("\n[bold]Connect Figma[/bold]")
        console.print("Get a token at: https://www.figma.com/settings → Personal access tokens\n")
        token = Prompt.ask("Figma Personal Access Token", password=True)
        default_file = Prompt.ask("Default file key [optional]", default="")
        cfg["figma"] = {"token": token, "default_file": default_file}
        save_integrations_config(cfg)
        try:
            from integrations import Figma
            f = Figma()
            me = f._get("/me")
            console.print(f"[bold green]✓ Connected as:[/bold green] {me.get('email')}")
        except Exception as e:
            console.print(f"[red]Connection failed:[/red] {e}")

    elif service == "mcp":
        console.print("\n[bold]Add MCP Server[/bold]")
        console.print("Examples:")
        console.print("  npx -y @modelcontextprotocol/server-filesystem .")
        console.print("  npx -y @modelcontextprotocol/server-github\n")
        name = Prompt.ask("Server name (e.g. filesystem, github)")
        command_str = Prompt.ask("Command to start server (e.g. npx -y @mcp/server-filesystem .)")
        command = command_str.split()
        env_str = Prompt.ask("Extra env vars as JSON [optional]", default="{}")
        try:
            env = json.loads(env_str)
        except Exception:
            env = {}
        servers = cfg.get("mcp_servers", [])
        servers = [s for s in servers if s["name"] != name]  # replace if exists
        servers.append({"name": name, "command": command, "env": env})
        cfg["mcp_servers"] = servers
        save_integrations_config(cfg)
        # Test connection
        try:
            from integrations import MCPClient
            mcp = MCPClient(name)
            mcp.start()
            tools = mcp.list_tools()
            mcp.stop()
            console.print(f"[bold green]✓ Connected.[/bold green] {len(tools)} tools available:")
            for t in tools[:5]:
                console.print(f"  🔧 {t['name']}: {t.get('description','')[:60]}")
        except Exception as e:
            console.print(f"[yellow]⚠ Saved but test failed:[/yellow] {e}")


# ── Integrations status ───────────────────────────────────

@cli.command()
def integrations():
    """Show all connected integrations and their status."""
    from integrations import load_integrations_config
    cfg = load_integrations_config()

    table = Table(title="Connected Integrations", border_style="cyan")
    table.add_column("Service", style="cyan")
    table.add_column("Status", style="green")
    table.add_column("Details", style="dim")

    # GitHub
    gh = cfg.get("github", {})
    if gh.get("token"):
        table.add_row("🐙 GitHub", "✓ Connected", f"Default repo: {gh.get('default_repo','none')}")
    else:
        table.add_row("🐙 GitHub", "✗ Not connected", "myai connect github")

    # Jira
    j = cfg.get("jira", {})
    if j.get("token"):
        table.add_row("📋 Jira", "✓ Connected", j.get("url",""))
    else:
        table.add_row("📋 Jira", "✗ Not connected", "myai connect jira")

    # Figma
    fig = cfg.get("figma", {})
    if fig.get("token"):
        table.add_row("🎨 Figma", "✓ Connected", f"Default file: {fig.get('default_file','none')}")
    else:
        table.add_row("🎨 Figma", "✗ Not connected", "myai connect figma")

    # MCP
    for s in cfg.get("mcp_servers", []):
        table.add_row(f"🔌 MCP: {s['name']}", "✓ Configured", " ".join(s["command"])[:50])

    console.print(table)


# ── GitHub commands ───────────────────────────────────────

@cli.group()
def github():
    """GitHub commands."""
    pass

@github.command("repos")
def github_repos():
    """List your GitHub repos."""
    from integrations import GitHub
    gh = GitHub()
    repos = gh.list_repos()
    table = Table(title="Your GitHub Repos", border_style="cyan")
    table.add_column("Repo", style="green")
    table.add_column("Language", style="dim")
    table.add_column("Stars", justify="right")
    table.add_column("Updated", style="dim")
    for r in repos:
        table.add_row(r["full_name"], r.get("language") or "", str(r.get("stargazers_count",0)), r.get("updated_at","")[:10])
    console.print(table)

@github.command("issues")
@click.argument("repo")
@click.option("--state", default="open")
def github_issues(repo, state):
    """List issues for owner/repo."""
    from integrations import GitHub
    owner, rname = repo.split("/")
    gh = GitHub()
    issues = gh.list_issues(owner, rname, state)
    table = Table(title=f"Issues: {repo}", border_style="cyan")
    table.add_column("#", style="dim")
    table.add_column("Title", style="green")
    table.add_column("Labels", style="yellow")
    table.add_column("Updated", style="dim")
    for i in issues:
        labels = ", ".join(l["name"] for l in i.get("labels",[]))
        table.add_row(str(i["number"]), i["title"][:60], labels, i.get("updated_at","")[:10])
    console.print(table)

@github.command("prs")
@click.argument("repo")
@click.option("--state", default="open")
def github_prs(repo, state):
    """List pull requests for owner/repo."""
    from integrations import GitHub
    owner, rname = repo.split("/")
    gh = GitHub()
    prs = gh.list_prs(owner, rname, state)
    table = Table(title=f"PRs: {repo}", border_style="cyan")
    table.add_column("#", style="dim")
    table.add_column("Title", style="green")
    table.add_column("Author", style="yellow")
    table.add_column("Base", style="dim")
    for p in prs:
        table.add_row(str(p["number"]), p["title"][:55], p["user"]["login"], p["base"]["ref"])
    console.print(table)

@github.command("diff")
@click.argument("repo")
@click.argument("pr_number", type=int)
def github_diff(repo, pr_number):
    """Show PR diff and ask AI to review it."""
    from integrations import GitHub
    owner, rname = repo.split("/")
    gh = GitHub()
    diff = gh.get_pr_diff(owner, rname, pr_number)
    pr = gh.get_pr(owner, rname, pr_number)
    console.print(Panel(diff[:3000], title=f"PR #{pr_number}: {pr['title']}", border_style="cyan"))
    if Prompt.ask("\nAI review? [y/n]", default="y").lower() == "y":
        question = f"Review this PR diff and give feedback:\n\nPR: {pr['title']}\n```diff\n{diff[:3000]}\n```"
        do_ask(question, [], load_memory(), load_config(), get_client())

@github.command("create-issue")
@click.argument("repo")
@click.argument("title")
@click.option("--body", default="")
def github_create_issue(repo, title, body):
    """Create a GitHub issue."""
    from integrations import GitHub
    owner, rname = repo.split("/")
    gh = GitHub()
    issue = gh.create_issue(owner, rname, title, body)
    console.print(f"[bold green]✓ Created:[/bold green] {issue.get('html_url')}")


# ── Jira commands ─────────────────────────────────────────

@cli.group()
def jira():
    """Jira commands."""
    pass

@jira.command("mine")
def jira_mine():
    """Show my open Jira tickets."""
    from integrations import Jira
    j = Jira()
    data = j.my_issues()
    issues = data.get("issues", [])
    table = Table(title="My Jira Issues", border_style="cyan")
    table.add_column("Key", style="cyan")
    table.add_column("Summary", style="green")
    table.add_column("Status", style="yellow")
    table.add_column("Priority", style="dim")
    for i in issues:
        f = i["fields"]
        table.add_row(i["key"], f.get("summary","")[:55],
                      f.get("status",{}).get("name",""), f.get("priority",{}).get("name",""))
    console.print(table)

@jira.command("issue")
@click.argument("key")
def jira_issue(key):
    """Get Jira issue details."""
    from integrations import Jira
    j = Jira()
    issue = j.get_issue(key)
    f = issue["fields"]
    console.print(Panel(
        f"[bold]{key}:[/bold] {f.get('summary')}\n"
        f"Status: {f.get('status',{}).get('name')}  |  Priority: {f.get('priority',{}).get('name')}\n"
        f"Assignee: {f.get('assignee',{}).get('displayName','Unassigned') if f.get('assignee') else 'Unassigned'}\n\n"
        f"Description:\n{str(f.get('description',''))[:500]}",
        title=key, border_style="cyan"))

@jira.command("move")
@click.argument("key")
@click.argument("status")
def jira_move(key, status):
    """Transition a Jira issue to a new status."""
    from integrations import Jira
    j = Jira()
    result = j.transition_issue(key, status)
    if result is not None:
        console.print(f"[bold green]✓[/bold green] {key} moved to '{status}'")

@jira.command("comment")
@click.argument("key")
@click.argument("body")
def jira_comment(key, body):
    """Add a comment to a Jira issue."""
    from integrations import Jira
    j = Jira()
    j.add_comment(key, body)
    console.print(f"[bold green]✓ Comment added to[/bold green] {key}")

@jira.command("create")
@click.argument("project")
@click.argument("summary")
@click.option("--type", "issue_type", default="Task")
@click.option("--priority", default="Medium")
def jira_create(project, summary, issue_type, priority):
    """Create a new Jira issue."""
    from integrations import Jira
    body = Prompt.ask("Description [optional]", default="")
    j = Jira()
    issue = j.create_issue(project, summary, body, issue_type, priority)
    console.print(f"[bold green]✓ Created:[/bold green] {issue.get('key')} — {issue.get('self')}")


# ── Figma commands ────────────────────────────────────────

@cli.group()
def figma():
    """Figma commands."""
    pass

@figma.command("file")
@click.argument("file_key")
def figma_file(file_key):
    """Inspect a Figma file and ask AI about it."""
    from integrations import Figma
    f = Figma()
    summary = f.summarize_for_ai(file_key)
    console.print(Panel(summary, title="Figma File", border_style="cyan"))
    if Prompt.ask("\nAsk AI about this design? [y/n]", default="y").lower() == "y":
        q = Prompt.ask("Question")
        do_ask(f"Figma file context:\n{summary}\n\n{q}", [], load_memory(), load_config(), get_client())

@figma.command("export")
@click.argument("file_key")
@click.argument("node_id")
@click.option("--format", "fmt", default="png", type=click.Choice(["png", "svg", "jpg", "pdf"]))
def figma_export(file_key, node_id, fmt):
    """Export a Figma node as an image."""
    from integrations import Figma
    f = Figma()
    images = f.export_image(file_key, [node_id], fmt=fmt)
    for nid, url in images.items():
        console.print(f"[bold green]✓ Export URL:[/bold green] {url}")

@figma.command("comment")
@click.argument("file_key")
@click.argument("message")
def figma_comment(file_key, message):
    """Post a comment on a Figma file."""
    from integrations import Figma
    f = Figma()
    f.post_comment(file_key, message)
    console.print(f"[bold green]✓ Comment posted[/bold green]")


# ── MCP commands ──────────────────────────────────────────

@cli.group()
def mcp():
    """MCP server commands."""
    pass

@mcp.command("tools")
@click.argument("server_name")
def mcp_tools(server_name):
    """List tools available on an MCP server."""
    from integrations import MCPClient
    m = MCPClient(server_name)
    m.start()
    tools = m.list_tools()
    m.stop()
    table = Table(title=f"MCP Tools: {server_name}", border_style="cyan")
    table.add_column("Tool", style="cyan")
    table.add_column("Description", style="green")
    for t in tools:
        table.add_row(t["name"], t.get("description","")[:70])
    console.print(table)

@mcp.command("call")
@click.argument("server_name")
@click.argument("tool_name")
@click.argument("args_json", required=False, default="{}")
def mcp_call(server_name, tool_name, args_json):
    """Call a tool on an MCP server."""
    from integrations import MCPClient
    try:
        args = json.loads(args_json)
    except Exception:
        console.print("[red]Invalid JSON arguments[/red]"); return
    m = MCPClient(server_name)
    m.start()
    result = m.call_tool(tool_name, args)
    m.stop()
    console.print(Panel(result or "[no output]", title=f"{server_name} → {tool_name}", border_style="cyan"))


# ── Memory ────────────────────────────────────────────────

@cli.command()
@click.option("--clear", is_flag=True)
@click.option("--list", "list_all", is_flag=True)
def memory(clear, list_all):
    """View or manage per-project memory."""
    if list_all:
        files = list(get_memory_dir().glob("*.json"))
        if not files: console.print("[dim]No memories.[/dim]"); return
        t = Table(title="Project Memories", border_style="cyan")
        t.add_column("Project", style="green"); t.add_column("Exchanges", justify="right"); t.add_column("Created", style="dim")
        for f in files:
            d = json.load(open(f))
            t.add_row(d.get("project", f.stem), str(len(d.get("history",[])) // 2), d.get("created","")[:10])
        console.print(t); return
    mem = load_memory()
    if clear:
        p = get_memory_path()
        if p.exists(): p.unlink(); console.print(f"[green]✓ Cleared:[/green] {mem.get('project')}")
        else: console.print("[dim]No memory found.[/dim]"); return
    hist = mem.get("history", [])
    console.print(Panel(f"[bold]Project:[/bold] {mem.get('project')}\n[bold]Exchanges:[/bold] {len(hist)//2}\n[bold]File:[/bold] {get_memory_path()}",
                        title="Project Memory", border_style="cyan"))
    for e in hist[-6:]:
        role = "You" if e["role"] == "user" else "myai"
        color = "green" if e["role"] == "user" else "cyan"
        short = str(e["content"])[:120].replace("\n"," ")
        console.print(f"  [bold {color}]{role}:[/bold {color}] {short}{'...' if len(str(e['content']))>120 else ''}")


# ── Search ────────────────────────────────────────────────

@cli.command()
@click.argument("query", required=False)
def search(query):
    """Search past question history."""
    if not query: query = Prompt.ask("Search")
    results = search_history_log(query)
    if not results: console.print("[dim]No results.[/dim]"); return
    console.print(f"\n[bold]{len(results)} result(s):[/bold]\n")
    for r in results:
        console.print(f"[dim]{r.get('timestamp','')[:16].replace('T',' ')} · {Path(r.get('project','')).name}[/dim]")
        console.print(f"  [green]Q:[/green] {r['question']}")
        console.print(f"  [cyan]A:[/cyan] {r['response'][:150]}...\n")


# ── Config ────────────────────────────────────────────────

@cli.command()
@click.option("--set", "set_key", nargs=2, metavar="KEY VALUE")
@click.option("--reset", is_flag=True)
def config(set_key, reset):
    """View or edit settings."""
    cfg = load_config()
    if reset: save_config({}); console.print("[green]✓ Reset to defaults.[/green]"); return
    if set_key:
        k, v = set_key
        v = True if v.lower()=="true" else False if v.lower()=="false" else int(v) if v.isdigit() else v
        cfg[k] = v; save_config(cfg); console.print(f"[green]✓[/green] {k} = {v}"); return
    t = Table(title="myai Config", border_style="cyan")
    t.add_column("Key", style="cyan"); t.add_column("Value", style="green")
    for k, v in cfg.items(): t.add_row(k, str(v))
    console.print(t)
    console.print(f"\n[dim]{get_config_path()}[/dim]")


if __name__ == "__main__":
    cli()


# ═══════════════════════════════════════════════════════════
# LEARN COMMANDS (appended)
# ═══════════════════════════════════════════════════════════

def get_learning_engine():
    try:
        from learner import LearningEngine
        return LearningEngine()
    except ImportError as e:
        console.print(f"[red]learner.py not found:[/red] {e}")
        sys.exit(1)


def enrich_system_prompt_with_learning(base_prompt, query=""):
    """Inject learning context into system prompt."""
    try:
        from learner import LearningEngine
        engine = LearningEngine()
        ctx = engine.build_rich_context(query)
        if ctx:
            return base_prompt + "\n\n" + ctx
    except Exception:
        pass
    return base_prompt


# Monkey-patch build_system_prompt to inject learning context
_orig_build_system_prompt = build_system_prompt

def build_system_prompt(memory, cfg, query=""):
    base = _orig_build_system_prompt(memory, cfg)
    return enrich_system_prompt_with_learning(base, query)


# Monkey-patch build_messages to pass query
_orig_build_messages = build_messages

def build_messages(memory, cfg, new_message):
    query = new_message if isinstance(new_message, str) else str(new_message)[:200]
    system = build_system_prompt(memory, cfg, query)
    messages = [{"role": "system", "content": system}]
    for e in memory.get("history", []):
        messages.append({"role": e["role"], "content": e["content"]})
    messages.append({"role": "user", "content": new_message})
    return messages


@cli.group()
def learn():
    """Learning & self-improvement commands."""
    pass


@learn.command("project")
@click.argument("path", default=".", type=click.Path())
def learn_project(path):
    """Learn from a project directory (index + style analysis)."""
    engine = get_learning_engine()
    engine.learn_project(path)


@learn.command("all")
def learn_all():
    """Re-learn from all previously indexed projects."""
    engine = get_learning_engine()
    projects = engine.known_projects()
    if not projects:
        console.print("[dim]No known projects. Run: myai learn project /path/to/project[/dim]")
        return
    console.print(f"[bold]Re-learning {len(projects)} project(s)...[/bold]")
    for p in projects:
        if Path(p).exists():
            engine.learn_project(p)
        else:
            console.print(f"[dim]Skipping (not found): {p}[/dim]")


@learn.command("correction")
@click.argument("correction")
@click.option("--category", default="general",
              type=click.Choice(["general", "style", "architecture", "security", "testing"]))
def learn_correction(correction, category):
    """
    Tell myai something to always remember.\n
    Examples:\n
      myai learn correction "Always use async/await, never callbacks"\n
      myai learn correction "Use snake_case for all variables" --category style\n
      myai learn correction "Never store secrets in code" --category security
    """
    engine = get_learning_engine()
    engine.record_feedback(correction, category=category)


@learn.command("corrections")
@click.option("--clear", is_flag=True, help="Clear all corrections.")
def learn_corrections(clear):
    """List or clear all remembered corrections."""
    engine = get_learning_engine()
    if clear:
        engine.feedback.clear()
        console.print("[green]✓ All corrections cleared.[/green]")
        return
    entries = engine.feedback.list_all()
    if not entries:
        console.print("[dim]No corrections yet. Use: myai learn correction \"...\""  "[/dim]")
        return
    from rich.table import Table
    t = Table(title="Remembered Corrections", border_style="cyan")
    t.add_column("Correction", style="green")
    t.add_column("Category", style="cyan")
    t.add_column("Date", style="dim")
    for e in entries[-30:]:
        t.add_row(e["correction"][:70], e.get("category",""), e.get("timestamp","")[:10])
    console.print(t)


@learn.command("search")
@click.argument("query")
@click.option("--top", default=5, type=int)
def learn_search(query, top):
    """Semantically search your indexed codebase."""
    engine = get_learning_engine()
    results = engine.search_codebase(query, top_k=top)
    if not results:
        console.print("[dim]No results. Run: myai learn project . to index your project.[/dim]")
        return
    console.print(f"\n[bold]Top {len(results)} results for:[/bold] {query}\n")
    for doc_id, doc, score in results:
        console.print(f"[bold cyan]{doc['path']}[/bold cyan] [dim](score: {score:.3f})[/dim]")
        console.print(f"[dim]{doc['preview'][:200]}[/dim]\n")


@learn.command("stats")
def learn_stats():
    """Show learning stats: what myai knows about you."""
    engine = get_learning_engine()
    s = engine.stats()
    from rich.table import Table
    t = Table(title="🧠 myai Learning Stats", border_style="cyan")
    t.add_column("Category", style="cyan")
    t.add_column("Value", style="green")
    t.add_row("Indexed files", str(s["indexed_files"]))
    t.add_row("Indexed projects", str(s["indexed_projects"]))
    t.add_row("Vocabulary size", str(s["vocabulary_size"]))
    t.add_row("Style files analyzed", str(s["style_files_analyzed"]))
    t.add_row("Dominant naming", s["dominant_naming"])
    t.add_row("Top libraries", ", ".join(s["top_libraries"]))
    t.add_row("Feedback entries", str(s["feedback_entries"]))
    console.print(t)
    if s["known_projects"]:
        console.print("\n[bold]Known projects:[/bold]")
        for p in s["known_projects"]:
            exists = "✓" if Path(p).exists() else "✗"
            console.print(f"  [{('green' if exists=='✓' else 'red')}]{exists}[/] {p}")


@learn.command("watch")
def learn_watch():
    """Watch current project for changes and proactively spot bugs."""
    from learner import ProactiveWatcher
    client = get_client()
    cfg = load_config()
    watcher = ProactiveWatcher()
    watcher.start_background(client, cfg)
    console.print(Panel(
        f"[bold cyan]👁️  Watching:[/bold cyan] {Path.cwd()}\n"
        "[dim]myai will analyze every file you save and warn you about bugs.\n"
        "Press Ctrl+C to stop.[/dim]",
        border_style="cyan"
    ))
    try:
        while True:
            time.sleep(3)
            watcher.show_suggestions()
    except KeyboardInterrupt:
        watcher.stop()
        console.print("\n[dim]Watcher stopped.[/dim]")


@learn.command("style")
def learn_style():
    """Show your detected coding style profile."""
    engine = get_learning_engine()
    style = engine.style.get_dominant_style()
    if not style.get("files_analyzed"):
        console.print("[dim]No style data yet. Run: myai learn project .[/dim]")
        return
    console.print(Panel(
        f"[bold]Files analyzed:[/bold] {style.get('files_analyzed', 0)}\n"
        f"[bold]Naming convention:[/bold] {style.get('naming', 'unknown')}\n"
        f"[bold]Indentation:[/bold] {style.get('indentation', 'unknown')}\n"
        f"[bold]Top languages:[/bold] {', '.join(style.get('top_languages', []))}\n"
        f"[bold]Preferred libraries:[/bold] {', '.join(style.get('top_libraries', [])[:8])}",
        title="[bold cyan]Your Coding Style[/bold cyan]",
        border_style="cyan"
    ))
    examples = style.get("function_examples", [])
    if examples:
        console.print("\n[bold]Function style examples:[/bold]")
        for ex in examples[:2]:
            console.print(Panel(ex, border_style="dim"))



# ═══════════════════════════════════════════════════════════
# AI & INTELLIGENCE COMMANDS
# ═══════════════════════════════════════════════════════════

def get_intelligence():
    try:
        from intelligence import ModelRouter, ConversationSummarizer, Agent, CodeReviewer, OllamaClient
        return ModelRouter, ConversationSummarizer, Agent, CodeReviewer, OllamaClient
    except ImportError as e:
        console.print(f"[red]intelligence.py not found:[/red] {e}")
        sys.exit(1)


# ── Agent ─────────────────────────────────────────────────

@cli.group()
def agent():
    """Agent mode — autonomous multi-step task execution."""
    pass

@agent.command("run")
@click.argument("goal")
def agent_run(goal):
    """Give myai a goal and let it execute autonomously.\n
    \b
    Examples:
      myai agent run "Create a Flask REST API with user auth"
      myai agent run "Write unit tests for all functions in utils.py"
      myai agent run "Set up a React project with Tailwind CSS"
    """
    _, _, AgentClass, _, _ = get_intelligence()
    cfg = load_config()
    client = get_client()

    # Build context from learning engine
    context = ""
    try:
        from learner import LearningEngine
        engine = LearningEngine()
        context = engine.build_rich_context(goal)
    except Exception:
        pass

    a = AgentClass(cfg, groq_client=client)
    a.run(goal, system_context=context)

@agent.command("log")
def agent_log():
    """Show the last agent execution log."""
    log_path = Path.home() / ".myai" / "agent_log.json"
    if not log_path.exists():
        console.print("[dim]No agent log found.[/dim]")
        return
    with open(log_path) as f:
        log = json.load(f)
    t = Table(title="Last Agent Run", border_style="cyan")
    t.add_column("Step", style="dim")
    t.add_column("Type", style="cyan")
    t.add_column("Description", style="green")
    t.add_column("Status", justify="center")
    for i, step in enumerate(log, 1):
        status = "[green]✓[/green]" if step.get("success") else "[red]✗[/red]"
        t.add_row(str(i), step.get("type",""), step.get("description","")[:50], status)
    console.print(t)


# ── Review ────────────────────────────────────────────────

@cli.group()
def review():
    """Code review commands."""
    pass

@review.command("staged")
def review_staged():
    """Review staged git changes before committing."""
    _, _, _, CodeReviewer, _ = get_intelligence()
    cfg = load_config()
    reviewer = CodeReviewer(cfg, groq_client=get_client())
    result = reviewer.review_staged()
    if result:
        console.print(Panel(Markdown(result), title="[bold cyan]Code Review[/bold cyan]", border_style="cyan"))

@review.command("last")
def review_last():
    """Review the last git commit."""
    _, _, _, CodeReviewer, _ = get_intelligence()
    cfg = load_config()
    reviewer = CodeReviewer(cfg, groq_client=get_client())
    result = reviewer.review_last_commit()
    if result:
        console.print(Panel(Markdown(result), title="[bold cyan]Code Review — Last Commit[/bold cyan]", border_style="cyan"))

@review.command("pr")
@click.option("--base", default="main", help="Base branch to diff against.")
def review_pr(base):
    """Review all changes in this branch vs base branch."""
    _, _, _, CodeReviewer, _ = get_intelligence()
    cfg = load_config()
    reviewer = CodeReviewer(cfg, groq_client=get_client())
    result = reviewer.review_pr(base)
    if result:
        console.print(Panel(Markdown(result), title=f"[bold cyan]PR Review vs {base}[/bold cyan]", border_style="cyan"))

@review.command("install-hook")
def review_install_hook():
    """Install git pre-commit hook — auto-reviews before every commit."""
    _, _, _, CodeReviewer, _ = get_intelligence()
    reviewer = CodeReviewer(load_config(), groq_client=get_client())
    reviewer.install_git_hook()

@review.command("uninstall-hook")
def review_uninstall_hook():
    """Remove the git pre-commit hook."""
    _, _, _, CodeReviewer, _ = get_intelligence()
    reviewer = CodeReviewer(load_config())
    reviewer.uninstall_git_hook()


# ── Models ────────────────────────────────────────────────

@cli.command()
@click.argument("query", required=False, default="write a function")
def models(query):
    """Show which model would be used for a given query + available models."""
    ModelRouter, _, _, _, OllamaClient = get_intelligence()
    cfg = load_config()
    router = ModelRouter(cfg)
    route = router.route(query)

    # Groq models table
    from intelligence import GROQ_MODELS, OLLAMA_MODELS, detect_task_type
    task = detect_task_type(query)

    t = Table(title="Available Models", border_style="cyan")
    t.add_column("Task", style="cyan")
    t.add_column("Groq Model", style="green")
    t.add_column("Ollama Fallback", style="yellow")
    t.add_column("Selected", justify="center")
    from intelligence import GROQ_MODELS, OLLAMA_MODELS
    for tname, gmodel in GROQ_MODELS.items():
        selected = "👆" if tname == task else ""
        t.add_row(tname, gmodel, OLLAMA_MODELS.get(tname, ""), selected)
    console.print(t)

    console.print(f"\n[bold]For query:[/bold] '{query}'")
    console.print(f"  Task type: [cyan]{route['task']}[/cyan]")
    console.print(f"  Provider:  [cyan]{route['provider']}[/cyan]")
    console.print(f"  Model:     [cyan]{route['model']}[/cyan]")

    # Ollama status
    from intelligence import is_ollama_available, get_ollama_models
    if is_ollama_available():
        installed = get_ollama_models()
        console.print(f"\n[green]✓ Ollama available[/green] — {len(installed)} model(s): {', '.join(installed[:5])}")
    else:
        console.print("\n[dim]Ollama not running (optional offline fallback)[/dim]")
        console.print("[dim]Install: https://ollama.com  then: ollama pull llama3[/dim]")


# ── Offline mode ──────────────────────────────────────────

@cli.command()
@click.argument("model", required=False)
def offline(model):
    """Switch to offline mode using Ollama.\n
    \b
    Examples:
      myai offline              # enable offline mode (auto-pick model)
      myai offline llama3:8b    # use specific model
      myai offline --off        # go back online
    """
    from intelligence import is_ollama_available, get_ollama_models
    cfg = load_config()

    if model == "--off":
        cfg.pop("force_offline", None)
        save_config(cfg)
        console.print("[green]✓ Back online (using Groq).[/green]")
        return

    if not is_ollama_available():
        console.print("[red]Ollama is not running.[/red]")
        console.print("Install: [link=https://ollama.com]ollama.com[/link]")
        console.print("Then run: [bold]ollama pull llama3[/bold]")
        return

    available = get_ollama_models()
    if not available:
        console.print("[yellow]Ollama is running but no models installed.[/yellow]")
        console.print("Run: [bold]ollama pull llama3[/bold] or [bold]ollama pull qwen2.5-coder[/bold]")
        return

    chosen = model or available[0]
    cfg["force_offline"] = True
    cfg["model"] = chosen
    save_config(cfg)
    console.print(f"[bold green]✓ Offline mode:[/bold green] using [cyan]{chosen}[/cyan]")
    console.print(f"  Available: {', '.join(available)}")
    console.print("[dim]Run `myai offline --off` to go back online.[/dim]")


# ── Summarize conversation ────────────────────────────────

@cli.command()
def compress():
    """Manually compress current project's conversation history."""
    _, SummarizerClass, _, _, _ = get_intelligence()
    cfg = load_config()
    memory = load_memory()
    hist_len = len(memory.get("history", []))
    if hist_len < 4:
        console.print("[dim]Not enough history to compress yet.[/dim]")
        return
    summarizer = SummarizerClass(cfg, groq_client=get_client())
    memory = summarizer.compress_memory(memory)
    save_memory(memory)
    new_len = len(memory.get("history", []))
    console.print(f"[green]✓ Compressed[/green] {hist_len} → {new_len} messages")



# ═══════════════════════════════════════════════════════════
# PRIVACY & CONTROL COMMANDS
# ═══════════════════════════════════════════════════════════

def _get_privacy():
    try:
        from privacy import (OfflineEnforcer, Encryption, AccessControl,
                             AuditLog, DataWipe, apply_privacy_settings,
                             enable_paranoid_mode, disable_paranoid_mode,
                             load_privacy_cfg, save_privacy_cfg)
        return (OfflineEnforcer, Encryption, AccessControl,
                AuditLog, DataWipe, apply_privacy_settings,
                enable_paranoid_mode, disable_paranoid_mode,
                load_privacy_cfg, save_privacy_cfg)
    except ImportError as e:
        console.print(f"[red]privacy.py not found:[/red] {e}")
        sys.exit(1)


# Apply privacy settings on every startup
try:
    from privacy import apply_privacy_settings
    apply_privacy_settings()
except ImportError:
    pass


@cli.group()
def privacy():
    """Privacy & control commands."""
    pass


# ── Status ────────────────────────────────────────────────

@privacy.command("status")
def privacy_status():
    """Show current privacy settings and data summary."""
    (OfflineEnforcer, Encryption, AccessControl,
     AuditLog, DataWipe, _, _, _, load_privacy_cfg, _) = _get_privacy()

    cfg = load_privacy_cfg()

    # Settings panel
    from privacy import ENCRYPTION_KEY
    enc_status = "✓ ON" if cfg.get("encryption_enabled") else "✗ OFF"
    off_status = "✓ ON" if cfg.get("offline_mode") else "✗ OFF"
    aud_status = "✓ ON" if cfg.get("audit_enabled", True) else "✗ OFF"
    par_status = "✓ ON" if cfg.get("paranoid_mode") else "✗ OFF"
    key_status = "✓ Key exists" if ENCRYPTION_KEY.exists() else "✗ No key"

    console.print(Panel(
        f"[bold]Offline mode:[/bold]    {off_status}\n"
        f"[bold]Encryption:[/bold]      {enc_status}  ({key_status})\n"
        f"[bold]Audit log:[/bold]       {aud_status}\n"
        f"[bold]Paranoid mode:[/bold]   {par_status}",
        title="[bold cyan]🔒 Privacy Status[/bold cyan]",
        border_style="cyan"
    ))

    # Data summary
    summary = DataWipe.show_data_summary()
    t = Table(title="Stored Data", border_style="dim")
    t.add_column("Category", style="cyan")
    t.add_column("Files", justify="right")
    t.add_column("Size", justify="right", style="dim")
    for cat, info in summary.items():
        if info["files"] > 0:
            t.add_row(cat, str(info["files"]), f"{info['size_kb']} KB")
    console.print(t)

    # Ollama
    from privacy import OfflineEnforcer
    if OfflineEnforcer.verify_ollama():
        console.print("[dim]✓ Ollama running (offline fallback available)[/dim]")
    else:
        console.print("[dim]✗ Ollama not running[/dim]")


# ── Offline ───────────────────────────────────────────────

@privacy.command("offline")
@click.argument("action", type=click.Choice(["on", "off", "status"]))
def privacy_offline(action):
    """Control offline mode — blocks all cloud AI calls.\n
    \b
      myai privacy offline on      block all internet, use Ollama only
      myai privacy offline off     go back online (Groq)
      myai privacy offline status  check current status
    """
    (OfflineEnforcer, _, _, AuditLog, _, _, _, _, load_privacy_cfg, save_privacy_cfg) = _get_privacy()
    cfg = load_privacy_cfg()

    if action == "on":
        if not OfflineEnforcer.verify_ollama():
            console.print("[yellow]⚠ Ollama not running. Install:[/yellow] https://ollama.com")
            console.print("  Then: [bold]ollama pull llama3[/bold]")
            if Prompt.ask("Enable offline mode anyway? [y/n]", default="n").lower() != "y":
                return
        cfg["offline_mode"] = True
        save_privacy_cfg(cfg)
        OfflineEnforcer.enable()
        console.print("[bold green]✓ Offline mode ON[/bold green] — no data leaves your machine")
        console.print("  Using Ollama for all AI calls.")

    elif action == "off":
        cfg["offline_mode"] = False
        save_privacy_cfg(cfg)
        OfflineEnforcer.disable()
        console.print("[bold green]✓ Online mode restored[/bold green] — using Groq")

    elif action == "status":
        status = OfflineEnforcer.status()
        active = "[green]ON[/green]" if status["active"] else "[dim]OFF[/dim]"
        ollama = "[green]running[/green]" if status["ollama_running"] else "[red]not running[/red]"
        console.print(f"Offline mode: {active}  |  Ollama: {ollama}")


# ── Encryption ────────────────────────────────────────────

@privacy.command("encrypt")
@click.argument("action", type=click.Choice(["on", "off", "status"]))
def privacy_encrypt(action):
    """Encrypt all myai data with a password (AES-256).\n
    \b
      myai privacy encrypt on      encrypt everything with a password
      myai privacy encrypt off     decrypt everything
      myai privacy encrypt status  show encryption status
    """
    (_, Encryption, _, AuditLog, _, _, _, _, load_privacy_cfg, save_privacy_cfg) = _get_privacy()
    from privacy import ENCRYPTION_KEY
    cfg = load_privacy_cfg()

    if action == "on":
        if cfg.get("encryption_enabled"):
            console.print("[dim]Encryption already enabled.[/dim]")
            return
        console.print("[bold]Set encryption password[/bold]")
        console.print("[dim]This encrypts all memory, history, and integration keys.[/dim]")
        password = Prompt.ask("Password", password=True)
        confirm = Prompt.ask("Confirm password", password=True)
        if password != confirm:
            console.print("[red]Passwords don't match.[/red]")
            return
        with console.status("[cyan]Encrypting...[/cyan]"):
            result = Encryption.encrypt_all(password)
        cfg["encryption_enabled"] = True
        save_privacy_cfg(cfg)
        console.print(f"[bold green]✓ Encrypted {result['files']} files[/bold green]")
        console.print("[dim]⚠ Remember your password — there is no recovery.[/dim]")

    elif action == "off":
        if not cfg.get("encryption_enabled"):
            console.print("[dim]Encryption not enabled.[/dim]")
            return
        password = Prompt.ask("Password to decrypt", password=True)
        with console.status("[cyan]Decrypting...[/cyan]"):
            result = Encryption.decrypt_all(password)
        if not result.get("success"):
            console.print(f"[red]Failed:[/red] {result.get('error')}")
            return
        cfg["encryption_enabled"] = False
        save_privacy_cfg(cfg)
        console.print(f"[bold green]✓ Decrypted {result['files']} files[/bold green]")

    elif action == "status":
        enabled = cfg.get("encryption_enabled")
        key_exists = ENCRYPTION_KEY.exists()
        if enabled and key_exists:
            import json as _json
            key_data = _json.loads(ENCRYPTION_KEY.read_text())
            console.print(f"[green]✓ Encryption ON[/green] — key created {key_data.get('created','?')[:10]}")
        elif enabled and not key_exists:
            console.print("[red]✗ Encryption ON but key missing![/red]")
        else:
            console.print("[dim]Encryption OFF[/dim]")


# ── Access Control ────────────────────────────────────────

@privacy.group("access")
def privacy_access():
    """Per-project access control rules."""
    pass

@privacy_access.command("show")
def access_show():
    """Show access rules for current project."""
    (_, _, AccessControl, _, _, _, _, _, _, _) = _get_privacy()
    ac = AccessControl()
    ac.show_rules()

@privacy_access.command("deny")
@click.argument("category", type=click.Choice(["read", "write", "run"]))
@click.argument("pattern")
@click.option("--project", is_flag=True, help="Apply to this project only (not global).")
def access_deny(category, pattern, project):
    """Block myai from reading/writing a file or running a command.\n
    \b
    Examples:
      myai privacy access deny read "*.env"
      myai privacy access deny write "database/*"
      myai privacy access deny run "curl"
    """
    (_, _, AccessControl, AuditLog, _, _, _, _, _, _) = _get_privacy()
    scope = "project" if project else "global"
    ac = AccessControl()
    ac.add_deny(category, pattern, scope)
    AuditLog.record("ACCESS_RULE_ADDED", f"deny_{category}: {pattern} ({scope})")
    console.print(f"[bold green]✓ Blocked[/bold green] [{category}] {pattern} ({scope})")

@privacy_access.command("lock")
def access_lock():
    """Lock current project — read-only, no commands, no writes."""
    (_, _, AccessControl, _, _, _, _, _, _, _) = _get_privacy()
    AccessControl().lock_project()

@privacy_access.command("unlock")
def access_unlock():
    """Unlock current project — restore normal access."""
    (_, _, AccessControl, _, _, _, _, _, _, _) = _get_privacy()
    AccessControl().unlock_project()


# ── Audit Log ─────────────────────────────────────────────

@privacy.group("audit")
def privacy_audit():
    """Audit log — see exactly what myai did."""
    pass

@privacy_audit.command("show")
@click.option("--limit", default=30, type=int)
@click.option("--action", default=None, help="Filter by action type.")
@click.option("--project", is_flag=True, help="Only show current project.")
def audit_show(limit, action, project):
    """Show the audit log.\n
    \b
    Examples:
      myai privacy audit show
      myai privacy audit show --action FILE_WRITE
      myai privacy audit show --action CMD_RUN --limit 10
    """
    (_, _, _, AuditLog, _, _, _, _, _, _) = _get_privacy()
    proj = str(Path.cwd().resolve()) if project else None
    entries = AuditLog.read(limit=limit, action_filter=action, project_filter=proj)
    if not entries:
        console.print("[dim]No audit entries found.[/dim]")
        return
    t = Table(title=f"Audit Log ({len(entries)} entries)", border_style="cyan")
    t.add_column("Time", style="dim")
    t.add_column("Action", style="cyan")
    t.add_column("Detail", style="green")
    t.add_column("Project", style="dim")
    for e in entries:
        ts = e.get("ts","")[:16].replace("T"," ")
        proj_name = Path(e.get("project","")).name
        t.add_row(ts, e.get("action",""), e.get("detail","")[:60], proj_name)
    console.print(t)

@privacy_audit.command("verify")
def audit_verify():
    """Check if the audit log has been tampered with."""
    (_, _, _, AuditLog, _, _, _, _, _, _) = _get_privacy()
    result = AuditLog.verify_integrity()
    if result["ok"]:
        console.print(f"[bold green]✓ Audit log intact[/bold green] — {result['entries']} entries")
    else:
        console.print(f"[bold red]✗ Audit log issues:[/bold red]")
        for issue in result["issues"]:
            console.print(f"  {issue}")

@privacy_audit.command("export")
@click.argument("output")
def audit_export(output):
    """Export audit log to a file."""
    (_, _, _, AuditLog, _, _, _, _, _, _) = _get_privacy()
    AuditLog.export(output)

@privacy_audit.command("clear")
def audit_clear():
    """Clear the audit log (irreversible)."""
    (_, _, _, AuditLog, _, _, _, _, _, _) = _get_privacy()
    if Prompt.ask("[red]Clear audit log?[/red] [y/n]", default="n").lower() == "y":
        AuditLog.clear()
        console.print("[green]✓ Audit log cleared.[/green]")


# ── Data Wipe ─────────────────────────────────────────────

@privacy.group("wipe")
def privacy_wipe():
    """Securely delete myai data (3-pass overwrite)."""
    pass

@privacy_wipe.command("show")
def wipe_show():
    """Show what data myai has stored before wiping."""
    (_, _, _, _, DataWipe, _, _, _, _, _) = _get_privacy()
    summary = DataWipe.show_data_summary()
    t = Table(title="Stored Data (what would be wiped)", border_style="cyan")
    t.add_column("Category", style="cyan")
    t.add_column("Files", justify="right")
    t.add_column("Size", justify="right", style="dim")
    total_files = 0
    total_kb = 0.0
    for cat, info in summary.items():
        if info["files"] > 0:
            t.add_row(cat, str(info["files"]), f"{info['size_kb']} KB")
            total_files += info["files"]
            total_kb += info["size_kb"]
    t.add_section()
    t.add_row("[bold]TOTAL[/bold]", str(total_files), f"{round(total_kb,1)} KB")
    console.print(t)

@privacy_wipe.command("category")
@click.argument("category", type=click.Choice(
    ["memory", "history", "feedback", "style", "index", "integrations", "config", "keys", "audit", "agent"]
))
def wipe_category(category):
    """Wipe a specific category of data."""
    (_, _, _, AuditLog, DataWipe, _, _, _, _, _) = _get_privacy()
    confirm = Prompt.ask(f"[red]Wipe {category}?[/red] This is irreversible. [y/n]", default="n")
    if confirm.lower() != "y":
        return
    n = DataWipe.wipe_category(category)
    console.print(f"[bold green]✓ Wiped {n} file(s) from {category}[/bold green]")

@privacy_wipe.command("project")
def wipe_project():
    """Wipe all data for the current project only."""
    (_, _, _, _, DataWipe, _, _, _, _, _) = _get_privacy()
    project = str(Path.cwd().resolve())
    confirm = Prompt.ask(f"[red]Wipe all myai data for {Path(project).name}?[/red] [y/n]", default="n")
    if confirm.lower() != "y":
        return
    n = DataWipe.wipe_project_data(project)
    console.print(f"[bold green]✓ Wiped {n} item(s) for {Path(project).name}[/bold green]")

@privacy_wipe.command("all")
def wipe_all():
    """⚠ Wipe ALL myai data everywhere. Irreversible."""
    (_, _, _, _, DataWipe, _, _, _, _, _) = _get_privacy()
    console.print(Panel(
        "[bold red]⚠ WARNING[/bold red]\n"
        "This will securely delete ALL myai data:\n"
        "memory, history, style profiles, codebase index,\n"
        "integration keys, encryption keys, audit logs — everything.\n\n"
        "This cannot be undone.",
        border_style="red"
    ))
    phrase = Prompt.ask('Type [bold]"wipe everything"[/bold] to confirm')
    result = DataWipe.wipe_all(phrase)
    if not result.get("success"):
        console.print(f"[red]{result.get('error')}[/red]")
        return
    console.print(f"[bold green]✓ Wiped {result['total_files']} files.[/bold green]")
    console.print("[dim]myai has no memory of you.[/dim]")


# ── Paranoid Mode ─────────────────────────────────────────

@privacy.command("paranoid")
@click.argument("action", type=click.Choice(["on", "off"]))
def privacy_paranoid(action):
    """Maximum privacy: offline + encrypted + locked + audited.\n
    \b
      myai privacy paranoid on    enable everything at once
      myai privacy paranoid off   restore normal mode
    """
    (_, _, _, _, _, _, enable_paranoid, disable_paranoid, _, _) = _get_privacy()

    if action == "on":
        console.print(Panel(
            "[bold red]Paranoid Mode[/bold red]\n"
            "Enables ALL privacy protections at once:\n"
            "• 100% offline (Ollama only)\n"
            "• AES-256 encryption on all data\n"
            "• All projects locked (read-only)\n"
            "• Full audit logging\n"
            "• No cloud integrations",
            border_style="red"
        ))
        password = Prompt.ask("Set encryption password", password=True)
        confirm = Prompt.ask("Confirm", password=True)
        if password != confirm:
            console.print("[red]Passwords don't match.[/red]"); return
        with console.status("[cyan]Enabling paranoid mode...[/cyan]"):
            result = enable_paranoid(password)
        console.print(f"[bold green]✓ Paranoid mode ON[/bold green] — {result.get('files',0)} files encrypted")

    elif action == "off":
        password = Prompt.ask("Encryption password", password=True)
        with console.status("[cyan]Disabling paranoid mode...[/cyan]"):
            result = disable_paranoid(password)
        if not result.get("success"):
            console.print(f"[red]Failed:[/red] {result.get('error')}"); return
        console.print("[bold green]✓ Paranoid mode OFF[/bold green] — back to normal")



# ═══════════════════════════════════════════════════════════
# DATA & DOCS COMMANDS
# ═══════════════════════════════════════════════════════════

def _get_datadocs():
    try:
        from datadocs import DocGenerator, DatabaseClient, DataAnalyzer, DiagramBuilder
        return DocGenerator, DatabaseClient, DataAnalyzer, DiagramBuilder
    except ImportError as e:
        console.print(f"[red]datadocs.py not found:[/red] {e}")
        sys.exit(1)

# ── Docs ──────────────────────────────────────────────────

@cli.group()
def docs():
    """Auto-generate documentation from your code."""
    pass

@docs.command("readme")
@click.option("--path", default=".", type=click.Path())
@click.option("--save", is_flag=True, help="Save to README.md")
def docs_readme(path, save):
    """Generate a README.md for a project.\n
    \b
    Examples:
      myai docs readme
      myai docs readme --save
      myai docs readme --path ~/projects/myapp --save
    """
    DocGenerator, _, _, _ = _get_datadocs()
    root = Path(path).resolve()
    cfg = load_config()
    gen = DocGenerator(cfg, groq_client=get_client())
    with console.status("[cyan]Generating README...[/cyan]"):
        readme = gen.generate_readme(root)
    if save:
        out = root / "README.md"
        out.write_text(readme)
        console.print(f"[bold green]✓ Saved:[/bold green] {out}")
    else:
        console.print(Panel(Markdown(readme), title="README.md", border_style="cyan"))

@docs.command("api")
@click.argument("file", type=click.Path(exists=True))
@click.option("--save", is_flag=True, help="Save to <file>.docs.md")
def docs_api(file, save):
    """Generate API documentation for a file.\n
    \b
    Examples:
      myai docs api utils.py
      myai docs api src/api.ts --save
    """
    DocGenerator, _, _, _ = _get_datadocs()
    path = Path(file).resolve()
    cfg = load_config()
    gen = DocGenerator(cfg, groq_client=get_client())
    with console.status("[cyan]Generating API docs...[/cyan]"):
        api_docs = gen.generate_api_docs(path)
    if save:
        out = path.parent / f"{path.stem}.docs.md"
        out.write_text(api_docs)
        console.print(f"[bold green]✓ Saved:[/bold green] {out}")
    else:
        console.print(Panel(Markdown(api_docs), title=f"API Docs: {path.name}", border_style="cyan"))

@docs.command("docstrings")
@click.argument("file", type=click.Path(exists=True))
@click.option("--write", is_flag=True, help="Write docstrings directly into the file.")
def docs_docstrings(file, write):
    """Add missing docstrings to a Python file.\n
    \b
    Examples:
      myai docs docstrings utils.py           # preview changes
      myai docs docstrings utils.py --write   # apply changes to file
    """
    DocGenerator, _, _, _ = _get_datadocs()
    path = Path(file).resolve()
    cfg = load_config()
    gen = DocGenerator(cfg, groq_client=get_client())
    with console.status("[cyan]Adding docstrings...[/cyan]"):
        updated = gen.generate_docstrings(path)
    if write:
        path.write_text(updated)
        console.print(f"[bold green]✓ Docstrings added to:[/bold green] {path}")
    else:
        console.print(Panel(Markdown(f"```python\n{updated[:3000]}\n```"),
                            title=f"Preview: {path.name}", border_style="cyan"))
        console.print("[dim]Run with --write to apply.[/dim]")

@docs.command("changelog")
@click.option("--path", default=".", type=click.Path())
@click.option("--save", is_flag=True, help="Save to CHANGELOG.md")
def docs_changelog(path, save):
    """Generate CHANGELOG.md from git history."""
    DocGenerator, _, _, _ = _get_datadocs()
    root = Path(path).resolve()
    cfg = load_config()
    gen = DocGenerator(cfg, groq_client=get_client())
    with console.status("[cyan]Generating CHANGELOG...[/cyan]"):
        changelog = gen.generate_changelog(root)
    if save:
        out = root / "CHANGELOG.md"
        out.write_text(changelog)
        console.print(f"[bold green]✓ Saved:[/bold green] {out}")
    else:
        console.print(Panel(Markdown(changelog), title="CHANGELOG.md", border_style="cyan"))


# ── Database ──────────────────────────────────────────────

# Store active db connection across commands
_db_client = None

@cli.group()
def db():
    """Query databases with natural language."""
    pass

@db.command("connect")
@click.argument("db_type", type=click.Choice(["sqlite", "postgres", "mysql", "mongodb"]))
@click.argument("connection_string")
def db_connect(db_type, connection_string):
    """Connect to a database.\n
    \b
    Examples:
      myai db connect sqlite ./myapp.db
      myai db connect postgres "postgresql://user:pass@localhost/mydb"
      myai db connect mysql "host=localhost user=root password=pass database=mydb"
      myai db connect mongodb "mongodb://localhost:27017" mydb
    """
    global _db_client
    _, DatabaseClient, _, _ = _get_datadocs()
    cfg = load_config()
    _db_client = DatabaseClient(cfg, groq_client=get_client())

    if db_type == "sqlite":
        _db_client.connect_sqlite(connection_string)
    elif db_type == "postgres":
        _db_client.connect_postgres(connection_string)
    elif db_type == "mysql":
        parts = dict(p.split("=") for p in connection_string.split() if "=" in p)
        _db_client.connect_mysql(
            parts.get("host","localhost"), parts.get("user","root"),
            parts.get("password",""), parts.get("database","")
        )
    elif db_type == "mongodb":
        parts = connection_string.split()
        uri = parts[0]
        dbname = parts[1] if len(parts) > 1 else "test"
        _db_client.connect_mongodb(uri, dbname)

    # Save connection info for session
    schema = _db_client.get_schema()
    console.print(Panel(schema, title="[cyan]Schema[/cyan]", border_style="dim"))

@db.command("ask")
@click.argument("question")
@click.option("--db-path", default=None, help="SQLite path (auto-connect if not already connected).")
def db_ask(question, db_path):
    """Ask a question about your database in plain English.\n
    \b
    Examples:
      myai db ask "how many users signed up last week"
      myai db ask "what are the top 5 products by revenue"
      myai db ask "show me all failed orders"
    """
    global _db_client
    _, DatabaseClient, _, _ = _get_datadocs()
    cfg = load_config()

    if _db_client is None:
        if db_path:
            _db_client = DatabaseClient(cfg, groq_client=get_client())
            _db_client.connect_sqlite(db_path)
        else:
            # Try to auto-find SQLite db in current dir
            dbs = list(Path.cwd().glob("*.db")) + list(Path.cwd().glob("*.sqlite"))
            if dbs:
                _db_client = DatabaseClient(cfg, groq_client=get_client())
                _db_client.connect_sqlite(str(dbs[0]))
                console.print(f"[dim]Auto-connected to: {dbs[0].name}[/dim]")
            else:
                console.print("[red]No database connected.[/red] Run: myai db connect sqlite mydb.db")
                return

    sql, cols, rows, error = _db_client.natural_language_query(question)

    if error:
        console.print(f"[red]Query error:[/red] {error}")
        return

    if rows:
        t = Table(title=f"Results ({len(rows)} rows)", border_style="cyan")
        for col in cols:
            t.add_column(str(col), style="green")
        for row in rows[:20]:
            t.add_row(*[str(v) if v is not None else "" for v in row])
        console.print(t)
        if len(rows) > 20:
            console.print(f"[dim]... {len(rows) - 20} more rows[/dim]")

        # AI explanation
        explanation = _db_client.explain_results(question, sql, cols, rows)
        console.print(Panel(Markdown(explanation), title="[cyan]Insights[/cyan]", border_style="dim"))
    else:
        console.print("[green]✓ Query executed successfully (no rows returned)[/green]")

@db.command("schema")
@click.option("--db-path", default=None)
def db_schema(db_path):
    """Show database schema."""
    global _db_client
    _, DatabaseClient, _, _ = _get_datadocs()
    if _db_client is None and db_path:
        _db_client = DatabaseClient(load_config(), groq_client=get_client())
        _db_client.connect_sqlite(db_path)
    if _db_client is None:
        console.print("[red]No database connected.[/red]"); return
    schema = _db_client.get_schema()
    console.print(Panel(schema, title="Database Schema", border_style="cyan"))

@db.command("indexes")
def db_indexes():
    """Get AI suggestions for database indexes."""
    global _db_client
    if _db_client is None:
        console.print("[red]No database connected.[/red]"); return
    with console.status("[cyan]Analyzing...[/cyan]"):
        suggestions = _db_client.suggest_indexes()
    console.print(Panel(Markdown(suggestions), title="Index Suggestions", border_style="cyan"))


# ── Data ──────────────────────────────────────────────────

@cli.group()
def data():
    """Analyze CSV and Excel files with AI."""
    pass

@data.command("analyze")
@click.argument("file", type=click.Path(exists=True))
@click.option("--question", "-q", default="", help="Specific question about the data.")
def data_analyze(file, question):
    """Load and analyze a CSV or Excel file.\n
    \b
    Examples:
      myai data analyze sales.csv
      myai data analyze report.xlsx -q "which region has the highest revenue"
    """
    _, _, DataAnalyzer, _ = _get_datadocs()
    cfg = load_config()
    analyzer = DataAnalyzer(cfg, groq_client=get_client())
    path = Path(file)

    if path.suffix.lower() == ".csv":
        if not analyzer.load_csv(str(path)):
            return
    elif path.suffix.lower() in {".xlsx", ".xls"}:
        if not analyzer.load_excel(str(path)):
            return
    else:
        console.print("[red]Unsupported format. Use .csv or .xlsx[/red]")
        return

    # Show preview
    console.print(Panel(analyzer.preview(), title="Preview", border_style="dim"))

    # Show stats
    stats = analyzer.statistics()
    t = Table(title="Column Statistics", border_style="cyan")
    t.add_column("Column", style="cyan")
    t.add_column("Type", style="dim")
    t.add_column("Nulls", justify="right")
    t.add_column("Unique", justify="right")
    t.add_column("Min / Max", style="green")
    for col, s in stats.items():
        minmax = f"{s.get('min','')} / {s.get('max','')}" if s.get("type") == "numeric" else ""
        t.add_row(col[:30], s["type"], str(s["nulls"]), str(s["unique"]), minmax)
    console.print(t)

    # AI insights
    with console.status("[cyan]Analyzing...[/cyan]"):
        insights = analyzer.ai_insights(question)
    console.print(Panel(Markdown(insights), title="[bold cyan]AI Insights[/bold cyan]", border_style="cyan"))

@data.command("ask")
@click.argument("file", type=click.Path(exists=True))
@click.argument("question")
def data_ask(file, question):
    """Ask a question about a data file.\n
    \b
    Examples:
      myai data ask sales.csv "what month had the highest sales"
      myai data ask users.csv "how many users are from California"
    """
    _, _, DataAnalyzer, _ = _get_datadocs()
    cfg = load_config()
    analyzer = DataAnalyzer(cfg, groq_client=get_client())
    path = Path(file)
    if path.suffix.lower() == ".csv":
        analyzer.load_csv(str(path))
    else:
        analyzer.load_excel(str(path))
    with console.status("[cyan]Thinking...[/cyan]"):
        answer = analyzer.query(question)
    console.print(Panel(Markdown(answer), title="Answer", border_style="cyan"))

@data.command("chart")
@click.argument("file", type=click.Path(exists=True))
@click.option("--type", "chart_type", default="auto",
              type=click.Choice(["auto","bar","line","scatter","pie","histogram"]))
@click.option("--save", is_flag=True, help="Save chart code to chart.py")
def data_chart(file, chart_type, save):
    """Generate chart code for a data file."""
    _, _, DataAnalyzer, _ = _get_datadocs()
    cfg = load_config()
    analyzer = DataAnalyzer(cfg, groq_client=get_client())
    path = Path(file)
    if path.suffix.lower() == ".csv":
        analyzer.load_csv(str(path))
    else:
        analyzer.load_excel(str(path))
    with console.status("[cyan]Generating chart code...[/cyan]"):
        code = analyzer.generate_chart_code(chart_type)
    code = code.replace("```python","").replace("```","").strip()
    if save:
        Path("chart.py").write_text(code)
        console.print("[bold green]✓ Saved chart.py[/bold green] — run: python chart.py")
    else:
        console.print(Panel(Markdown(f"```python\n{code}\n```"),
                            title="Chart Code", border_style="cyan"))

@data.command("clean")
@click.argument("file", type=click.Path(exists=True))
@click.option("--output", default=None, help="Output file (default: cleaned_<file>)")
def data_clean(file, output):
    """Clean a CSV file (strip nulls, normalize whitespace)."""
    _, _, DataAnalyzer, _ = _get_datadocs()
    analyzer = DataAnalyzer(load_config(), groq_client=get_client())
    path = Path(file)
    analyzer.load_csv(str(path))
    out = output or f"cleaned_{path.name}"
    analyzer.export_clean(out)


# ── Diagrams ──────────────────────────────────────────────

@cli.group()
def diagram():
    """Generate architecture and code diagrams (Mermaid)."""
    pass

@diagram.command("generate")
@click.argument("diagram_type",
                type=click.Choice(["architecture","class","flow","er","sequence","dependency"]))
@click.argument("path", default=".", type=click.Path())
@click.option("--save", is_flag=True, help="Save to docs/<type>_diagram.md")
@click.option("--extra", default="", help="Extra context for the AI.")
def diagram_generate(diagram_type, path, save, extra):
    """Generate a diagram from your code.\n
    \b
    Examples:
      myai diagram generate architecture .
      myai diagram generate class src/models.py --save
      myai diagram generate er database/schema.sql --save
      myai diagram generate sequence src/api/ --save
      myai diagram generate flow utils.py
    """
    _, _, _, DiagramBuilder = _get_datadocs()
    cfg = load_config()
    builder = DiagramBuilder(cfg, groq_client=get_client())
    target = Path(path).resolve()

    with console.status(f"[cyan]Generating {diagram_type} diagram...[/cyan]"):
        mermaid = builder.generate(diagram_type, target, extra)

    if save:
        out = target / f"docs/{diagram_type}_diagram.md"
        out.parent.mkdir(exist_ok=True)
        saved = builder.save_diagram(mermaid, out, diagram_type)
        console.print(f"[bold green]✓ Saved:[/bold green] {saved}")
        console.print("[dim]View on GitHub or at mermaid.live[/dim]")
    else:
        console.print(Panel(
            f"```mermaid\n{mermaid}\n```",
            title=f"[bold cyan]{diagram_type.title()} Diagram[/bold cyan]",
            border_style="cyan"
        ))
        console.print("[dim]Paste this into mermaid.live to view · Use --save to save[/dim]")

@diagram.command("all")
@click.argument("path", default=".", type=click.Path())
def diagram_all(path):
    """Generate architecture + class + dependency diagrams at once."""
    _, _, _, DiagramBuilder = _get_datadocs()
    cfg = load_config()
    builder = DiagramBuilder(cfg, groq_client=get_client())
    root = Path(path).resolve()
    console.print(f"[bold]Generating all diagrams for:[/bold] {root.name}")
    results = builder.generate_all(root)
    for dtype, result in results.items():
        console.print(f"  [green]✓[/green] {dtype}: {result}")



# ═══════════════════════════════════════════════════════════
# MYAI.md + SKILLS — auto-injected into every prompt
# ═══════════════════════════════════════════════════════════

def _get_skills():
    try:
        from skills import MyAIMd, SkillsManager, build_myai_context, get_banner_info
        return MyAIMd, SkillsManager, build_myai_context, get_banner_info
    except ImportError as e:
        console.print(f"[red]skills.py not found:[/red] {e}")
        sys.exit(1)


# Patch build_system_prompt to inject MYAI.md + skills
_prev_build_system_prompt = build_system_prompt

def build_system_prompt(memory, cfg, query=""):
    base = _prev_build_system_prompt(memory, cfg, query)
    try:
        from skills import build_myai_context
        ctx = build_myai_context(query)
        if ctx:
            base = base + "\n\n" + ctx
    except Exception:
        pass
    return base


# Patch show_banner to include MYAI.md + skills info
_prev_show_banner = show_banner

def show_banner(memory, cfg):
    _prev_show_banner(memory, cfg)
    try:
        from skills import get_banner_info
        info = get_banner_info()
        if info:
            console.print(f"[dim]{info.strip()}[/dim]")
    except Exception:
        pass


# ── MYAI.md commands ──────────────────────────────────────

@cli.group("myaimd")
def myaimd():
    """MYAI.md project context file commands."""
    pass

@myaimd.command("init")
@click.option("--stack", default="", help="Your tech stack (e.g. 'Python, FastAPI, PostgreSQL')")
@click.option("--path", default=".", type=click.Path())
def myaimd_init(stack, path):
    """Create a MYAI.md template in your project.\n
    \b
    Examples:
      myai myaimd init
      myai myaimd init --stack "Python, FastAPI, PostgreSQL"
      myai myaimd init --path ~/projects/myapp
    """
    MyAIMd, _, _, _ = _get_skills()
    MyAIMd.create_template(Path(path).resolve(), stack)

@myaimd.command("show")
@click.option("--path", default=".", type=click.Path())
def myaimd_show(path):
    """Show the active MYAI.md for current or given project."""
    MyAIMd, _, _, _ = _get_skills()
    md = MyAIMd(Path(path).resolve())
    if not md.exists():
        console.print("[dim]No MYAI.md found in this project.[/dim]")
        console.print("Create one with: [bold]myai myaimd init[/bold]")
        return
    console.print(Panel(
        Markdown(md.content),
        title=f"[bold cyan]{md.path}[/bold cyan]",
        border_style="cyan"
    ))

@myaimd.command("edit")
@click.option("--path", default=".", type=click.Path())
def myaimd_edit(path):
    """Open MYAI.md in your editor."""
    MyAIMd, _, _, _ = _get_skills()
    import os, subprocess
    root = Path(path).resolve()
    md = MyAIMd(root)
    if not md.exists():
        console.print("[dim]No MYAI.md found. Creating one...[/dim]")
        MyAIMd.create_template(root)
        md = MyAIMd(root)
    editor = os.environ.get("EDITOR", "nano")
    try:
        subprocess.run([editor, str(md.path)])
    except Exception:
        console.print(f"Edit manually: {md.path}")

@myaimd.command("generate")
@click.option("--path", default=".", type=click.Path())
@click.option("--save", is_flag=True, help="Save directly to MYAI.md")
def myaimd_generate(path, save):
    """Auto-generate MYAI.md content by analyzing your project with AI."""
    MyAIMd, _, _, _ = _get_skills()
    root = Path(path).resolve()
    cfg = load_config()
    client = get_client()

    # Gather project info
    files = []
    for p in root.rglob("*"):
        if p.is_file() and p.suffix in {".py",".js",".ts",".go",".rs",".java",".md"}:
            if not any(part in {".git","node_modules","__pycache__",".venv"} for part in p.parts):
                files.append(str(p.relative_to(root)))
        if len(files) >= 40:
            break

    deps = ""
    for fname in ["package.json","requirements.txt","pyproject.toml","go.mod","Cargo.toml"]:
        p = root / fname
        if p.exists():
            deps = p.read_text()[:800]
            break

    prompt = f"""Generate a MYAI.md file for this project.

Project: {root.name}
Files:
{chr(10).join(files[:30])}

Dependencies:
{deps}

Generate a complete MYAI.md with these sections:
# MYAI.md
## Project
## Stack
## Architecture
## Rules
## Avoid
## Commands
## Skills
## Notes

Be specific — infer everything from the file names and dependencies.
For Skills, only list from: python, typescript, testing, security, git, api, database, code-review"""

    with console.status("[cyan]Generating MYAI.md...[/cyan]"):
        content = do_ask(prompt, [], load_memory(), cfg, client)
        # Extract just the markdown content
        content = re.sub(r"^```markdown\n|^```\n|\n```$", "", content.strip())

    if save:
        out = root / "MYAI.md"
        out.write_text(content)
        console.print(f"[bold green]✓ Saved:[/bold green] {out}")
    else:
        console.print(Panel(Markdown(content), title="Generated MYAI.md", border_style="cyan"))
        console.print("[dim]Run with --save to write to MYAI.md[/dim]")


# ── Skills commands ───────────────────────────────────────

@cli.group()
def skill():
    """Manage reusable instruction skills."""
    pass

@skill.command("list")
def skill_list():
    """List all available skills (builtin + user + project)."""
    _, SkillsManager, _, _ = _get_skills()
    manager = SkillsManager()
    skills = manager.list_all()
    t = Table(title="Available Skills", border_style="cyan")
    t.add_column("Name", style="cyan")
    t.add_column("Description", style="green")
    t.add_column("Triggers", style="dim")
    t.add_column("Source", style="dim")
    for s in skills:
        t.add_row(
            s["name"],
            s.get("description","")[:50],
            ", ".join(s.get("triggers",[])[:4]),
            s.get("source","builtin")
        )
    console.print(t)
    console.print(f"\n[dim]Skills dir: {SKILLS_DIR}[/dim]")

@skill.command("show")
@click.argument("name")
def skill_show(name):
    """Show details of a skill."""
    _, SkillsManager, _, _ = _get_skills()
    SkillsManager().show_skill(name)

@skill.command("create")
@click.argument("name")
def skill_create(name):
    """Create a new custom skill interactively."""
    _, SkillsManager, _, _ = _get_skills()
    manager = SkillsManager()
    console.print(f"\n[bold]Create skill:[/bold] {name}\n")
    description = Prompt.ask("Description (what this skill does)")
    triggers = Prompt.ask("Trigger keywords (comma-separated, e.g. 'react, component, jsx')")
    trigger_list = [t.strip() for t in triggers.split(",") if t.strip()]
    console.print("\n[bold]Skill instructions[/bold] (the rules myai will follow):")
    console.print("[dim]Type your instructions. Press Enter twice when done.[/dim]\n")
    lines = []
    try:
        while True:
            line = input()
            lines.append(line)
            if len(lines) >= 2 and lines[-1] == "" and lines[-2] == "":
                break
    except EOFError:
        pass
    prompt_text = "\n".join(lines).strip()
    if not prompt_text:
        console.print("[red]No instructions provided.[/red]")
        return
    out = manager.create_skill(name, description, prompt_text, trigger_list)
    console.print(f"\n[bold green]✓ Skill created:[/bold green] {out}")
    console.print(f"[dim]Add '{name}' to your MYAI.md ## Skills section to always use it.[/dim]")

@skill.command("edit")
@click.argument("name")
def skill_edit(name):
    """Edit a skill in your editor."""
    _, SkillsManager, _, _ = _get_skills()
    SkillsManager().edit_skill(name)

@skill.command("delete")
@click.argument("name")
def skill_delete(name):
    """Delete a user-defined skill."""
    _, SkillsManager, _, _ = _get_skills()
    manager = SkillsManager()
    if Prompt.ask(f"Delete skill '{name}'? [y/n]", default="n").lower() == "y":
        if manager.delete_skill(name):
            console.print(f"[green]✓ Deleted:[/green] {name}")
        else:
            console.print(f"[red]Skill not found or is built-in:[/red] {name}")

@skill.command("active")
@click.argument("query", required=False, default="")
def skill_active(query):
    """Show which skills would activate for a given query."""
    _, SkillsManager, _, _ = _get_skills()
    from skills import MyAIMd
    md = MyAIMd()
    manager = SkillsManager()
    skills = manager.detect_skills(query, md)
    if not skills:
        console.print("[dim]No skills would activate.[/dim]")
        return
    console.print(f"\n[bold]Active skills for:[/bold] '{query}'\n")
    for s in skills:
        console.print(f"  [cyan]●[/cyan] [bold]{s['name']}[/bold] — {s.get('description','')}")
    console.print()

@skill.command("apply")
@click.argument("name")
@click.argument("question")
@click.argument("files", nargs=-1, type=click.Path())
def skill_apply(name, question, files):
    """Force-apply a specific skill to a question.\n
    \b
    Examples:
      myai skill apply security "review this auth code" auth.py
      myai skill apply testing "write tests for" utils.py
      myai skill apply api "design an endpoint for user registration"
    """
    _, SkillsManager, _, _ = _get_skills()
    manager = SkillsManager()
    skill = manager.get_skill(name)
    if not skill:
        console.print(f"[red]Skill not found:[/red] {name}")
        console.print("Run [bold]myai skill list[/bold] to see available skills.")
        return
    cfg = load_config()
    memory = load_memory()
    client = get_client()
    # Inject skill into question
    full_question = f"[Apply skill: {name}]\n{skill['prompt']}\n\n---\n\n{question}"
    do_ask(full_question, list(files), memory, cfg, client)



# ═══════════════════════════════════════════════════════════
# TESTING COMMANDS
# ═══════════════════════════════════════════════════════════

@cli.group()
def test():
    """Testing — generate, run, and auto-fix tests."""
    pass

@test.command("generate")
@click.argument("file", type=click.Path(exists=True))
@click.option("--function", "-f", default="", help="Only test this function/class.")
@click.option("--save", is_flag=True, help="Save test file automatically.")
def test_generate(file, function, save):
    """Generate tests for a file.\n
    \b
      myai test generate utils.py
      myai test generate api.py --function create_user --save
    """
    from testing import TestGenerator
    gen = TestGenerator(load_config(), get_client())
    source = Path(file).resolve()
    with console.status("[cyan]Generating tests...[/cyan]"):
        tests = gen.generate(source, function)
    test_path = gen.get_test_path(source)
    if save:
        test_path.write_text(tests)
        console.print(f"[bold green]✓ Saved:[/bold green] {test_path}")
    else:
        console.print(Panel(Markdown(f"```\n{tests[:3000]}\n```"),
                            title=f"Tests for {source.name}", border_style="cyan"))
        console.print(f"[dim]Save with --save (→ {test_path})[/dim]")

@test.command("run")
@click.argument("path", default=".", type=click.Path())
def test_run(path):
    """Run tests for a project or file."""
    from testing import TestRunner
    runner = TestRunner(load_config())
    result = runner.run(Path(path).resolve())
    runner.show_results(result)

@test.command("fix")
@click.argument("source", type=click.Path(exists=True))
@click.argument("tests", required=False, type=click.Path())
def test_fix(source, tests):
    """Auto-fix failing tests in a loop until they pass.\n
    \b
      myai test fix utils.py
      myai test fix utils.py test_utils.py
    """
    from testing import TestGenerator, TestFixLoop
    src = Path(source).resolve()
    if tests:
        test_path = Path(tests).resolve()
    else:
        gen = TestGenerator(load_config(), get_client())
        test_path = gen.get_test_path(src)
    if not test_path.exists():
        console.print(f"[red]Test file not found:[/red] {test_path}")
        console.print(f"Generate with: [bold]myai test generate {source} --save[/bold]")
        return
    loop = TestFixLoop(load_config(), get_client())
    loop.fix_until_passing(src, test_path)

@test.command("coverage")
@click.argument("file", required=False, type=click.Path())
def test_coverage(file):
    """Run coverage and get AI suggestions for missing tests."""
    from testing import CoverageAnalyzer
    analyzer = CoverageAnalyzer(load_config(), get_client())
    result = analyzer.run_coverage()
    console.print(Panel(result.get("output","")[-2000:],
                        title="Coverage Report", border_style="cyan"))
    if file and result.get("output"):
        with console.status("[cyan]Analyzing gaps...[/cyan]"):
            gaps = analyzer.analyze_gaps(Path(file), result["output"])
        console.print(Panel(Markdown(gaps), title="Missing Tests", border_style="yellow"))


# ═══════════════════════════════════════════════════════════
# COMMUNICATION COMMANDS
# ═══════════════════════════════════════════════════════════

@cli.group()
def comms():
    """Communication — commit messages, PR descriptions, release notes."""
    pass

@comms.command("commit")
@click.option("--apply", is_flag=True, help="Actually commit with the generated message.")
def comms_commit(apply):
    """Generate a commit message from staged changes.\n
    \b
      myai comms commit
      myai comms commit --apply
    """
    from comms import CommsEngine
    engine = CommsEngine(load_config(), get_client())
    with console.status("[cyan]Generating commit message...[/cyan]"):
        msg = engine.generate_commit_message()
    console.print(Panel(msg, title="[bold cyan]Commit Message[/bold cyan]", border_style="cyan"))
    if apply:
        if Prompt.ask("Use this message? [y/n]", default="y").lower() == "y":
            if engine.apply_commit_message(msg):
                console.print("[bold green]✓ Committed![/bold green]")

@comms.command("pr")
@click.option("--base", default="main")
@click.option("--save", is_flag=True, help="Save to PR_DESCRIPTION.md")
def comms_pr(base, save):
    """Generate a PR description from branch diff.\n
    \b
      myai comms pr
      myai comms pr --base develop --save
    """
    from comms import CommsEngine
    engine = CommsEngine(load_config(), get_client())
    with console.status("[cyan]Generating PR description...[/cyan]"):
        desc = engine.generate_pr_description(base)
    if save:
        Path("PR_DESCRIPTION.md").write_text(desc)
        console.print("[bold green]✓ Saved: PR_DESCRIPTION.md[/bold green]")
    else:
        console.print(Panel(Markdown(desc), title="PR Description", border_style="cyan"))

@comms.command("release")
@click.option("--from-tag", default=None)
@click.option("--save", is_flag=True, help="Save to RELEASE_NOTES.md")
def comms_release(from_tag, save):
    """Generate release notes from git history."""
    from comms import CommsEngine
    engine = CommsEngine(load_config(), get_client())
    with console.status("[cyan]Generating release notes...[/cyan]"):
        notes = engine.generate_release_notes(from_tag)
    if save:
        Path("RELEASE_NOTES.md").write_text(notes)
        console.print("[bold green]✓ Saved: RELEASE_NOTES.md[/bold green]")
    else:
        console.print(Panel(Markdown(notes), title="Release Notes", border_style="cyan"))

@comms.command("standup")
def comms_standup():
    """Generate a daily standup update from recent git activity."""
    from comms import CommsEngine
    engine = CommsEngine(load_config(), get_client())
    with console.status("[cyan]Generating standup...[/cyan]"):
        standup = engine.generate_standup()
    console.print(Panel(Markdown(standup), title="Daily Standup", border_style="cyan"))

@comms.command("summarize")
@click.option("--base", default="HEAD~1")
def comms_summarize(base):
    """Summarize recent code changes in plain English."""
    from comms import CommsEngine
    engine = CommsEngine(load_config(), get_client())
    with console.status("[cyan]Summarizing changes...[/cyan]"):
        summary = engine.summarize_changes(base)
    console.print(Panel(Markdown(summary), title="Change Summary", border_style="cyan"))


# ═══════════════════════════════════════════════════════════
# MULTI-FILE EDIT COMMANDS
# ═══════════════════════════════════════════════════════════

@cli.command("edit")
@click.argument("task")
@click.argument("files", nargs=-1, type=click.Path())
def edit_cmd(task, files):
    """Edit multiple files at once with diff preview + undo.\n
    \b
      myai edit "add error handling" api.py utils.py models.py
      myai edit "migrate to TypeScript" src/
      myai edit "add dark mode support" components/
    """
    from multiedit import MultiFileEditor
    editor = MultiFileEditor(load_config(), get_client())
    paths = list(files)
    if not paths:
        console.print("[red]Specify files or a directory.[/red]")
        return
    # If single directory given, expand it
    if len(paths) == 1 and Path(paths[0]).is_dir():
        files_dict = editor.read_directory(Path(paths[0]))
        paths = list(files_dict.keys())
    editor.run(task, paths)

@cli.command("undo")
@click.argument("backup_id", required=False)
def undo_cmd(backup_id):
    """Undo the last file edit (or a specific backup).\n
    \b
      myai undo              undo last edit
      myai undo 20250101_120000
    """
    from multiedit import MultiFileEditor
    editor = MultiFileEditor()
    if backup_id is None:
        editor.list_backups()
        backup_id = Prompt.ask("Restore which backup? [ID or Enter for latest]", default="")
        if not backup_id:
            backup_id = None
    editor.undo(backup_id or None)

@cli.command("backups")
def backups_cmd():
    """List all available backups for undo."""
    from multiedit import MultiFileEditor
    MultiFileEditor().list_backups()


# ═══════════════════════════════════════════════════════════
# PLUGIN COMMANDS
# ═══════════════════════════════════════════════════════════

@cli.group()
def plugin():
    """Plugin system — extend myai without touching core files."""
    pass

@plugin.command("list")
def plugin_list():
    """List installed plugins."""
    from plugins import get_plugin_manager
    get_plugin_manager().list_plugins()

@plugin.command("create")
@click.argument("name")
@click.option("--description", "-d", default="")
def plugin_create(name, description):
    """Create a new plugin scaffold.\n
    \b
      myai plugin create my-rules
      myai plugin create company-standards -d "Our internal coding standards"
    """
    from plugins import get_plugin_manager
    pm = get_plugin_manager()
    plugin_dir = pm.create_plugin(name, description)
    console.print(f"[bold green]✓ Plugin created:[/bold green] {plugin_dir}")
    console.print(f"[dim]Edit: {plugin_dir}/plugin.py[/dim]")
    console.print("[dim]Reload: restart myai[/dim]")

@plugin.command("install")
@click.argument("url")
def plugin_install(url):
    """Install a plugin from a git URL.\n
    \b
      myai plugin install https://github.com/someone/myai-plugin-name
    """
    from plugins import get_plugin_manager
    get_plugin_manager().install_from_url(url)

@plugin.command("uninstall")
@click.argument("name")
def plugin_uninstall(name):
    """Uninstall a plugin."""
    from plugins import get_plugin_manager
    if Prompt.ask(f"Uninstall plugin '{name}'? [y/n]", default="n").lower() == "y":
        get_plugin_manager().uninstall(name)


# ═══════════════════════════════════════════════════════════
# WEB UI COMMAND
# ═══════════════════════════════════════════════════════════

@cli.command("ui")
@click.option("--port", default=4321, type=int)
@click.option("--no-browser", is_flag=True, help="Don't open browser automatically.")
def ui_cmd(port, no_browser):
    """Open the myai web dashboard in your browser.\n
    \b
      myai ui
      myai ui --port 8080
      myai ui --no-browser
    """
    from webui import start_webui
    import time
    server, url = start_webui(port, open_browser=not no_browser)
    console.print(Panel(
        f"[bold cyan]myai Web UI[/bold cyan]\n"
        f"URL: [link={url}]{url}[/link]\n"
        f"[dim]Press Ctrl+C to stop[/dim]",
        border_style="cyan"
    ))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
        console.print("\n[dim]Web UI stopped.[/dim]")



# ═══════════════════════════════════════════════════════════
# SHELL COMPLETION COMMANDS
# ═══════════════════════════════════════════════════════════

@cli.group()
def completion():
    """Shell tab completion — install once, Tab-complete forever."""
    pass

@completion.command("install")
@click.option("--shell", default=None,
              type=click.Choice(["zsh","bash","fish"]),
              help="Shell type (auto-detected if not specified).")
def completion_install(shell):
    """Install tab completion for your shell.\n
    \b
      myai completion install           # auto-detect shell
      myai completion install --shell zsh
      myai completion install --shell bash
      myai completion install --shell fish
    """
    from completion import install_completion, detect_shell
    s = shell or detect_shell()
    console.print(f"[dim]Detected shell: {s}[/dim]")
    install_completion(s)

@completion.command("show")
@click.option("--shell", default=None,
              type=click.Choice(["zsh","bash","fish"]))
def completion_show(shell):
    """Print completion script without installing."""
    from completion import get_script, detect_shell
    s = shell or detect_shell()
    script = get_script(s)
    console.print(script)

@completion.command("uninstall")
@click.option("--shell", default=None,
              type=click.Choice(["zsh","bash","fish"]))
def completion_uninstall(shell):
    """Remove completion script."""
    from completion import uninstall_completion, detect_shell
    uninstall_completion(shell or detect_shell())


# ═══════════════════════════════════════════════════════════
# TOKEN TRACKER COMMANDS
# ═══════════════════════════════════════════════════════════

@cli.group()
def tokens():
    """Token usage tracker — see how much you use and save vs paid APIs."""
    pass

@tokens.command("show")
@click.option("--period", default="all",
              type=click.Choice(["day","week","month","all"]))
@click.option("--project", is_flag=True, help="Only current project.")
def tokens_show(period, project):
    """Show token usage stats.\n
    \b
      myai tokens show
      myai tokens show --period week
      myai tokens show --period day --project
    """
    from tokens import get_tracker
    tracker = get_tracker()
    proj = str(Path.cwd()) if project else None
    tracker.show(period)

@tokens.command("reset")
@click.option("--period", default="all",
              type=click.Choice(["day","week","month","all"]))
def tokens_reset(period):
    """Reset token usage counters."""
    from tokens import get_tracker
    if Prompt.ask(f"Reset {period} token usage? [y/n]", default="n").lower() == "y":
        get_tracker().reset(period)

@tokens.command("limit")
@click.option("--daily", default=None, type=int,
              help="Max tokens per day (0 = no limit).")
@click.option("--monthly", default=None, type=int,
              help="Max tokens per month (0 = no limit).")
@click.option("--warn", default=None, type=int,
              help="Warn at this % of limit (default: 80).")
def tokens_limit(daily, monthly, warn):
    """Set token usage limits.\n
    \b
      myai tokens limit --daily 100000
      myai tokens limit --monthly 2000000
      myai tokens limit --warn 90
      myai tokens limit --daily 0    # remove daily limit
    """
    from tokens import get_tracker
    tracker = get_tracker()
    updates = {}
    if daily is not None:
        updates["daily_tokens"] = daily or 0
    if monthly is not None:
        updates["monthly_tokens"] = monthly or 0
    if warn is not None:
        updates["warn_at_percent"] = warn
    if updates:
        tracker.save_limits(updates)
        console.print("[green]✓ Limits updated.[/green]")
        for k, v in updates.items():
            console.print(f"  {k}: {v:,}" if v else f"  {k}: no limit")
    else:
        console.print("[dim]No limits specified. Use --daily, --monthly, or --warn.[/dim]")


# ═══════════════════════════════════════════════════════════
# EMBEDDINGS COMMANDS
# ═══════════════════════════════════════════════════════════

@cli.group()
def embed():
    """Real vector embeddings for better code search (requires Ollama)."""
    pass

@embed.command("index")
@click.argument("path", default=".", type=click.Path())
@click.option("--model", default="nomic-embed-text",
              type=click.Choice(["nomic-embed-text","mxbai-embed-large","all-minilm"]))
def embed_index(path, model):
    """Index a project with real vector embeddings.\n
    \b
      myai embed index .
      myai embed index ~/projects/myapp
      myai embed index . --model mxbai-embed-large
    \b
    Requires Ollama: https://ollama.com
    Then run: ollama pull nomic-embed-text
    """
    from embeddings import EmbeddingIndex, is_ollama_available
    if not is_ollama_available():
        console.print("[red]Ollama not running.[/red]")
        console.print("Install: [link=https://ollama.com]ollama.com[/link]")
        console.print("Then: [bold]ollama pull nomic-embed-text[/bold]")
        return
    root = Path(path).resolve()
    idx  = EmbeddingIndex(model=model)
    console.print(f"[bold]Indexing with real embeddings:[/bold] {root}")
    result = idx.index_project(root)
    if "error" in result:
        console.print(f"[red]{result['error']}[/red]")
        return
    console.print(
        f"[bold green]✓ Done:[/bold green] "
        f"{result['files']} new, {result['skipped']} unchanged"
    )

@embed.command("search")
@click.argument("query")
@click.option("--top", default=5, type=int)
def embed_search(query, top):
    """Semantic search your codebase using real embeddings.\n
    \b
      myai embed search "authentication logic"
      myai embed search "database connection" --top 10
    """
    from embeddings import smart_search
    results = smart_search(query, top_k=top)
    if not results:
        console.print("[dim]No results. Run: myai embed index .[/dim]")
        return
    console.print(f"\n[bold]Top {len(results)} for:[/bold] {query}\n")
    for doc_id, doc, score in results:
        bar = "█" * int(score * 10)
        console.print(
            f"[bold cyan]{doc['path']}[/bold cyan] "
            f"[dim]{bar} {score:.3f}[/dim]"
        )
        console.print(f"[dim]{doc.get('preview','')[:150]}[/dim]\n")

@embed.command("stats")
def embed_stats():
    """Show embedding index stats."""
    from embeddings import EmbeddingIndex, is_ollama_available
    idx   = EmbeddingIndex()
    stats = idx.stats()
    ollama_status = "[green]running[/green]" if stats["ollama_ok"] else "[red]not running[/red]"
    console.print(Panel(
        f"[bold]Files indexed:[/bold]   {stats['files']:,}\n"
        f"[bold]Projects:[/bold]        {stats['projects']}\n"
        f"[bold]Model:[/bold]           {stats['model']}\n"
        f"[bold]Ollama:[/bold]          {ollama_status}\n"
        f"[bold]Languages:[/bold]       "
        + ", ".join(f"{k}({v})" for k, v in
                    sorted(stats['languages'].items(),
                           key=lambda x: x[1], reverse=True)[:8]),
        title="[bold cyan]Embedding Index[/bold cyan]",
        border_style="cyan"
    ))

@embed.command("setup")
def embed_setup():
    """Install Ollama embedding model (one-time setup)."""
    from embeddings import ensure_model, is_ollama_available
    if not is_ollama_available():
        console.print("[red]Ollama not running.[/red]")
        console.print("1. Install Ollama: [link=https://ollama.com]ollama.com[/link]")
        console.print("2. Start it:  [bold]ollama serve[/bold]")
        console.print("3. Run again: [bold]myai embed setup[/bold]")
        return
    console.print("[dim]Pulling nomic-embed-text (fast, good quality)...[/dim]")
    import subprocess
    subprocess.run(["ollama", "pull", "nomic-embed-text"])
    console.print("[bold green]✓ Ready! Now run: myai embed index .[/bold green]")


# ═══════════════════════════════════════════════════════════
# PATCH: inject token tracking into do_ask
# ═══════════════════════════════════════════════════════════

_orig_ask_groq = ask_groq

def ask_groq(client, messages, cfg, has_image=False):
    response = _orig_ask_groq(client, messages, cfg, has_image)
    try:
        from tokens import get_tracker
        model = cfg.get("vision_model" if has_image else "model", "llama3-70b-8192")
        prompt_text = " ".join(
            str(m.get("content","")) for m in messages
        )
        get_tracker().record(model, prompt_text, response)
    except Exception:
        pass
    return response


# ═══════════════════════════════════════════════════════════
# PATCH: use real embeddings in learner context
# ═══════════════════════════════════════════════════════════

def enrich_system_prompt_with_learning(base_prompt, query=""):
    try:
        from skills import build_myai_context
        ctx = build_myai_context(query)
        if ctx:
            base_prompt = base_prompt + "\n\n" + ctx
    except Exception:
        pass
    try:
        from embeddings import context_for_query
        embed_ctx = context_for_query(query, top_k=3)
        if embed_ctx:
            base_prompt = base_prompt + "\n\n" + embed_ctx
            return base_prompt
    except Exception:
        pass
    try:
        from learner import LearningEngine
        ctx = LearningEngine().build_rich_context(query)
        if ctx:
            base_prompt = base_prompt + "\n\n" + ctx
    except Exception:
        pass
    return base_prompt



# ═══════════════════════════════════════════════════════════
# SETUP WIZARD COMMANDS
# ═══════════════════════════════════════════════════════════

@cli.group(invoke_without_command=True)
@click.pass_context
def setup(ctx):
    """API key setup wizard — get your keys configured fast.\n
    \b
      myai setup              interactive wizard for all keys
      myai setup groq         set up Groq (free AI)
      myai setup github       set up GitHub (OAuth auto-flow)
      myai setup jira         set up Jira
      myai setup figma        set up Figma
      myai setup status       show which keys are configured
      myai setup test         test all configured keys
      myai setup remove KEY   remove a stored key
    """
    if ctx.invoked_subcommand is None:
        from setup import run_wizard
        run_wizard()

@setup.command("groq")
def setup_groq_cmd():
    """Set up Groq API key (free — powers all AI responses)."""
    from setup import setup_groq
    setup_groq()

@setup.command("github")
def setup_github_cmd():
    """Set up GitHub — OAuth Device Flow or manual token."""
    from setup import setup_github
    setup_github()

@setup.command("jira")
def setup_jira_cmd():
    """Set up Jira API credentials."""
    from setup import setup_jira
    setup_jira()

@setup.command("figma")
def setup_figma_cmd():
    """Set up Figma personal access token."""
    from setup import setup_figma
    setup_figma()

@setup.command("status")
def setup_status_cmd():
    """Show all configured keys and their status."""
    from setup import show_status
    show_status()

@setup.command("test")
def setup_test_cmd():
    """Test all configured API keys against their services."""
    from setup import test_all_keys
    test_all_keys()

@setup.command("remove")
@click.argument("key_name")
def setup_remove_cmd(key_name):
    """Remove a stored API key.\n
    \b
      myai setup remove GROQ_API_KEY
      myai setup remove GITHUB_TOKEN
      myai setup remove JIRA_TOKEN
      myai setup remove FIGMA_TOKEN
    """
    from setup import remove_key
    key_name = key_name.upper()
    if remove_key(key_name):
        console.print(f"[bold green]✓ Removed:[/bold green] {key_name}")
    else:
        console.print(f"[red]Key not found:[/red] {key_name}")


# ═══════════════════════════════════════════════════════════
# PATCH: load keys from ~/.myai/.env on startup
# ═══════════════════════════════════════════════════════════

def _load_myai_env():
    """Load API keys from ~/.myai/.env into environment variables."""
    env_file = Path.home() / ".myai" / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip()
            if k and v and k not in os.environ:
                os.environ[k] = v

# Load keys on import
_load_myai_env()



# ═══════════════════════════════════════════════════════════
# ANTHROPIC / CLAUDE COMMANDS
# ═══════════════════════════════════════════════════════════

@setup.command("anthropic")
def setup_anthropic_cmd():
    """Set up Anthropic API key to use Claude Sonnet, Opus, or Haiku."""
    from setup import setup_anthropic
    setup_anthropic()


@cli.command("claude")
@click.argument("model", required=False,
                type=click.Choice([
                    "sonnet", "opus", "haiku",
                    "claude-sonnet-4-6",
                    "claude-opus-4-6",
                    "claude-haiku-4-5-20251001",
                    "auto", "groq", "off"
                ]))
def claude_cmd(model):
    """Switch to Claude models (Sonnet, Opus, Haiku) or back to Groq.\n
    \b
      myai claude sonnet    use Claude Sonnet 4.6 (smart + fast)
      myai claude opus      use Claude Opus 4.6 (most powerful)
      myai claude haiku     use Claude Haiku 4.5 (fastest)
      myai claude auto      auto-route: Claude for hard tasks, Groq for fast ones
      myai claude groq      switch back to Groq (free)
      myai claude off       same as groq — disable Claude
      myai claude           show current provider status
    """
    import os
    cfg = load_config()

    # No argument — show status
    if model is None:
        provider = cfg.get("provider", "auto")
        anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
        groq_key      = os.environ.get("GROQ_API_KEY", "")
        claude_model  = os.environ.get("MYAI_CLAUDE_MODEL", "claude-sonnet-4-6")

        console.print(Panel(
            f"[bold]Provider:[/bold]      {provider}\n"
            f"[bold]Claude model:[/bold]  {claude_model}\n"
            f"[bold]Anthropic key:[/bold] {'✓ set' if anthropic_key else '✗ not set'}\n"
            f"[bold]Groq key:[/bold]      {'✓ set' if groq_key else '✗ not set'}\n\n"
            + (
                "[dim]Run [bold]myai setup anthropic[/bold] to add your Anthropic key.[/dim]"
                if not anthropic_key else
                "[dim]Run [bold]myai claude sonnet/opus/haiku[/bold] to switch models.[/dim]"
            ),
            title="[bold cyan]AI Provider Status[/bold cyan]",
            border_style="cyan"
        ))
        return

    # Map short names to full model IDs
    model_map = {
        "sonnet": "claude-sonnet-4-6",
        "opus":   "claude-opus-4-6",
        "haiku":  "claude-haiku-4-5-20251001",
    }
    full_model = model_map.get(model, model)

    if model in ("groq", "off"):
        cfg["provider"] = "groq"
        save_config(cfg)
        console.print("[bold green]✓ Switched to Groq[/bold green] (free, fast)")
        return

    if model == "auto":
        cfg["provider"] = "auto"
        save_config(cfg)
        console.print(
            "[bold green]✓ Auto mode[/bold green] — "
            "Claude for complex tasks, Groq for fast ones"
        )
        return

    # Claude model selected
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not anthropic_key:
        console.print(
            "[red]Anthropic API key not set.[/red]\n"
            "Run: [bold]myai setup anthropic[/bold]"
        )
        return

    cfg["provider"] = "anthropic"
    save_config(cfg)

    from setup import save_key as setup_save_key
    setup_save_key("MYAI_CLAUDE_MODEL", full_model, {"source": "config"})
    os.environ["MYAI_CLAUDE_MODEL"] = full_model

    cost_info = {
        "claude-haiku-4-5-20251001": "$0.80/$4.00 per 1M tokens",
        "claude-sonnet-4-6":         "$3/$15 per 1M tokens",
        "claude-opus-4-6":           "$15/$75 per 1M tokens",
    }
    console.print(
        f"[bold green]✓ Switched to {full_model}[/bold green]\n"
        f"[dim]{cost_info.get(full_model, '')}[/dim]"
    )


# ═══════════════════════════════════════════════════════════
# GEMINI + DEEPSEEK SETUP COMMANDS
# ═══════════════════════════════════════════════════════════

@setup.command("gemini")
def setup_gemini_cmd():
    """Set up Google Gemini (free — 1M token context!)."""
    from setup import setup_gemini
    setup_gemini()

@setup.command("deepseek")
def setup_deepseek_cmd():
    """Set up DeepSeek (ultra-cheap — R1 reasoner near Opus quality)."""
    from setup import setup_deepseek
    setup_deepseek()


# ═══════════════════════════════════════════════════════════
# UNIFIED PROVIDER SWITCHER
# ═══════════════════════════════════════════════════════════

@cli.command("provider")
@click.argument("name", required=False,
                type=click.Choice([
                    "groq", "anthropic", "gemini", "deepseek",
                    "claude", "auto", "status"
                ]))
@click.argument("model", required=False)
def provider_cmd(name, model):
    """Switch AI provider or show current status.\n
    \b
    PROVIDERS (all work with existing myai commands):
      groq        Groq — free, fast (default)
                  Models: llama3-8b, llama3-70b, mixtral
      gemini      Google Gemini — free, 1M context
                  Models: flash, pro
      deepseek    DeepSeek — ultra cheap, R1 reasoning
                  Models: chat, reasoner
      anthropic   Anthropic Claude — most powerful (paid)
                  Models: haiku, sonnet, opus
      auto        Smart routing — best model per task
      status      Show current provider + all keys
    \b
    EXAMPLES:
      myai provider groq              use Groq (free default)
      myai provider gemini            use Gemini Flash (free)
      myai provider gemini pro        use Gemini 2.5 Pro (free, 1M ctx)
      myai provider deepseek          use DeepSeek Chat (cheap)
      myai provider deepseek reasoner use DeepSeek R1 (near Opus)
      myai provider anthropic sonnet  use Claude Sonnet
      myai provider anthropic opus    use Claude Opus (most powerful)
      myai provider auto              smart routing across all providers
      myai provider status            show everything
    """
    import os
    cfg = load_config()

    if name is None or name == "status":
        _show_provider_status(cfg)
        return

    # Map short model names
    model_maps = {
        "groq": {
            "fast":     "llama3-8b-8192",
            "balanced": "llama3-70b-8192",
            "large":    "mixtral-8x7b-32768",
            "llama3":   "llama3-70b-8192",
            "mixtral":  "mixtral-8x7b-32768",
        },
        "gemini": {
            "flash": "gemini-2.0-flash",
            "pro":   "gemini-2.5-pro-preview-05-06",
        },
        "deepseek": {
            "chat":     "deepseek-chat",
            "reasoner": "deepseek-reasoner",
            "r1":       "deepseek-reasoner",
        },
        "anthropic": {
            "haiku":  "claude-haiku-4-5-20251001",
            "sonnet": "claude-sonnet-4-6",
            "opus":   "claude-opus-4-6",
        },
    }

    # Handle 'claude' alias
    if name == "claude":
        name = "anthropic"

    if name == "auto":
        cfg["provider"] = "auto"
        save_config(cfg)
        console.print(Panel(
            "[bold green]✓ Auto mode enabled[/bold green]\n\n"
            "myai will pick the best available model per task:\n"
            "• Long context  → Gemini 2.5 Pro (1M tokens, free)\n"
            "• Reasoning     → DeepSeek R1 or Claude Opus\n"
            "• Code + chat   → Groq Llama3-70b (free, fast)\n"
            "• Quick tasks   → Groq Llama3-8b (fastest)",
            border_style="green"
        ))
        return

    # Validate key is set
    key_names = {
        "groq":      "GROQ_API_KEY",
        "gemini":    "GEMINI_API_KEY",
        "deepseek":  "DEEPSEEK_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
    }
    key_name = key_names.get(name)
    if key_name and not os.environ.get(key_name):
        console.print(
            f"[red]{name.title()} API key not set.[/red]\n"
            f"Run: [bold]myai setup {name}[/bold]"
        )
        return

    # Set provider
    cfg["provider"] = name
    save_config(cfg)

    # Set specific model if given
    if model:
        resolved = model_maps.get(name, {}).get(model, model)
        env_keys = {
            "gemini":    "MYAI_GEMINI_MODEL",
            "deepseek":  "MYAI_DEEPSEEK_MODEL",
            "anthropic": "MYAI_CLAUDE_MODEL",
            "groq":      "MYAI_GROQ_MODEL",
        }
        env_key = env_keys.get(name)
        if env_key:
            from setup import save_key as sk
            sk(env_key, resolved, {"source": "config"})
            os.environ[env_key] = resolved
        model_label = resolved
    else:
        defaults = {
            "groq":      "llama3-70b-8192 (balanced)",
            "gemini":    "gemini-2.0-flash (fast, free)",
            "deepseek":  "deepseek-chat (cheap)",
            "anthropic": "claude-sonnet-4-6",
        }
        model_label = defaults.get(name, "default")

    # Cost info
    cost_info = {
        "groq":      "Free 🎉",
        "gemini":    "Free 🎉 (generous daily limits)",
        "deepseek":  "$0.07/$1.10 per 1M tokens (ultra cheap)",
        "anthropic": "See model pricing at anthropic.com",
    }

    console.print(Panel(
        f"[bold green]✓ Switched to {name.title()}[/bold green]\n"
        f"Model:  {model_label}\n"
        f"Cost:   {cost_info.get(name, '?')}",
        border_style="green"
    ))


def _show_provider_status(cfg: dict):
    """Show all providers, keys, and current selection."""
    import os

    providers = [
        ("groq",      "🚀 Groq",      "GROQ_API_KEY",      "Free — Llama3, Mixtral"),
        ("gemini",    "✨ Gemini",    "GEMINI_API_KEY",     "Free — 1M token context"),
        ("deepseek",  "🧠 DeepSeek",  "DEEPSEEK_API_KEY",   "Cheap — R1 reasoning"),
        ("anthropic", "🤖 Anthropic", "ANTHROPIC_API_KEY",  "Paid — Claude Sonnet/Opus"),
        ("ollama",    "💻 Ollama",    None,                 "Free — fully offline"),
    ]

    current = cfg.get("provider", "auto")

    t = Table(title="AI Providers", border_style="cyan", show_lines=True)
    t.add_column("Provider", style="cyan", width=14)
    t.add_column("Status",   width=14)
    t.add_column("Active",   width=8, justify="center")
    t.add_column("Description", style="dim")

    for pid, label, key_name, desc in providers:
        if key_name:
            has_key = bool(os.environ.get(key_name))
            status  = "[green]✓ Key set[/green]" if has_key else "[dim]✗ No key[/dim]"
        else:
            try:
                from intelligence import is_ollama_available
                has_key = is_ollama_available()
                status  = "[green]✓ Running[/green]" if has_key else "[dim]✗ Not running[/dim]"
            except Exception:
                status = "[dim]—[/dim]"

        is_active  = current == pid or (current == "auto" and pid == "groq")
        active_str = "[bold green]●[/bold green]" if is_active else ""

        t.add_row(label, status, active_str, desc)

    console.print(t)

    console.print(f"\n[bold]Current mode:[/bold] [cyan]{current}[/cyan]")
    if current == "auto":
        console.print("[dim]Auto mode picks the best available model per task type.[/dim]")

    console.print("\n[bold]Quick switch:[/bold]")
    console.print("  myai provider groq          # free, fast")
    console.print("  myai provider gemini pro    # free, 1M context")
    console.print("  myai provider deepseek reasoner  # near-Opus reasoning")
    console.print("  myai provider anthropic opus     # most powerful (paid)")
    console.print("  myai provider auto          # smart routing")

