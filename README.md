# myai — Your Personal AI Coding Assistant

A free CLI coding assistant powered by Groq + Llama 3.

---

## 1. Get your free Groq API key
Go to https://console.groq.com and sign up (free, no credit card needed).

---

## 2. Install dependencies

```bash
pip install groq rich click
```

---

## 3. Set your API key

**Mac/Linux:**
```bash
export GROQ_API_KEY=your_key_here
```

To make it permanent, add that line to your `~/.bashrc` or `~/.zshrc`.

**Windows (Command Prompt):**
```cmd
set GROQ_API_KEY=your_key_here
```

**Windows (PowerShell):**
```powershell
$env:GROQ_API_KEY="your_key_here"
```

---

## 4. Make it runnable

**Mac/Linux:**
```bash
chmod +x myai.py
```

Optional — use it as `myai` from anywhere:
```bash
sudo mv myai.py /usr/local/bin/myai
```

**Windows:**
Just run it with `python myai.py` instead of `myai`.

---

## 5. Usage

```bash
# Ask a coding question
myai "how do I reverse a list in Python"

# Ask about a file
myai "explain this code" main.py

# Fix a bug in a file
myai "fix the bug" utils.py

# Ask about multiple files
myai "how do these work together" main.py utils.py

# Start an interactive chat session
myai chat
```

---

## Switching models (optional)

In `myai.py`, find this line:
```python
model="llama3-70b-8192",
```

You can change it to:
- `"llama3-8b-8192"` — faster, lighter
- `"mixtral-8x7b-32768"` — longer context
- `"gemma-7b-it"` — Google's model

All free on Groq!
