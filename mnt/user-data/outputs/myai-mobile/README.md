# myai Mobile — Android App

A full-featured AI coding assistant for Android, built with Expo/React Native.

## Features

- 💬 **AI Chat** — Streaming responses, image support, code highlighting
- 📁 **Projects** — Per-project context, skills, and memory
- 🐙 **GitHub** — Browse repos, issues, and PRs
- 🧠 **Memory** — Per-project conversation history, permanent rules
- ⚙️ **Settings** — API keys (stored securely), skills, rules

## Setup

### 1. Install dependencies

```bash
cd myai-mobile
npm install
```

### 2. Install Expo CLI and EAS CLI

```bash
npm install -g expo-cli eas-cli
```

### 3. Get your free Groq API key

Go to [console.groq.com](https://console.groq.com) — it's free, no credit card needed.

You'll enter this in the app Settings tab.

---

## Run on your phone (development)

### Option A — Expo Go (easiest, no build needed)

```bash
npx expo start
```

Scan the QR code with the **Expo Go** app on your Android phone.

> Note: Some native modules (SecureStore, ImagePicker) require a development build.

### Option B — Development build (recommended)

```bash
# Install on connected Android device
npx expo run:android
```

---

## Build APK (install on any Android)

### 1. Create an Expo account

```bash
eas login
```

### 2. Configure EAS

```bash
eas build:configure
```

### 3. Build preview APK (direct install, no Play Store)

```bash
eas build --platform android --profile preview
```

This builds a `.apk` file you can install directly on any Android device.

### 4. Build production AAB (for Play Store)

```bash
eas build --platform android --profile production
```

---

## EAS Build profiles (eas.json)

Create `eas.json` in the project root:

```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "android": { "buildType": "apk" },
      "distribution": "internal"
    },
    "production": {
      "android": { "buildType": "app-bundle" }
    }
  }
}
```

---

## Install APK on Android

After the EAS build completes:

1. Download the `.apk` from the EAS dashboard link
2. On your Android phone: Settings → Security → Allow unknown sources
3. Open the downloaded APK and install

---

## Run on Termux (Android terminal)

If you want to run the Python myai CLI on your phone instead:

```bash
# In Termux:
pkg install python git
pip install groq rich click requests
export GROQ_API_KEY=your_key
python myai.py "hello"
```

---

## Project Structure

```
myai-mobile/
  app/
    _layout.tsx          # Tab navigation root
    index.tsx            # Chat screen (home)
    projects.tsx         # Projects screen
    github.tsx           # GitHub screen
    memory.tsx           # Memory & tokens screen
    settings.tsx         # Settings screen
  src/
    screens/
      ChatScreen.tsx     # Main AI chat interface
      ProjectsScreen.tsx # Project management
      GitHubScreen.tsx   # GitHub repos/issues/PRs
      MemoryScreen.tsx   # Memory + token tracker
      SettingsScreen.tsx # API keys + rules + skills
    components/
      UI.tsx             # Shared UI components
    services/
      api.ts             # Groq + GitHub + Jira API
    store/
      index.ts           # Zustand global state
    theme.ts             # Design tokens
  package.json
  app.json
  tsconfig.json
  babel.config.js
```

---

## Security

- All API keys stored with **Expo SecureStore** (Android Keystore / iOS Keychain)
- Keys never leave your device except to call the API you configured
- No telemetry, no analytics, no third-party tracking

---

## Supported Models (auto-routed)

| Query type | Model |
|---|---|
| Quick questions | llama3-8b-8192 |
| Code + general | llama3-70b-8192 |
| Complex reasoning | mixtral-8x7b-32768 |
| Images | llama-4-scout |

All free on Groq.
