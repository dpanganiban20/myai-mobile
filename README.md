# myai — Your AI Coding Assistant

A mobile AI assistant app built with **Expo / React Native**. Supports multiple AI providers, chat history, project context, image input, and more.

---

## Features

- **Multi-provider AI** — Groq (free), Gemini (free), DeepSeek, Anthropic (Claude)
- **Auto model routing** — picks the best model based on your question
- **Chat sessions** — recent chats saved automatically with auto-generated titles
- **Project context** — attach a project with skills/notes to guide the AI
- **Image input** — attach images to your questions (vision models)
- **Memory & corrections** — permanently teach the AI your preferences
- **GitHub integration** — browse repos, issues, and PRs
- **Figma integration** — design context in your chats
- **Dark theme** — built for late-night coding sessions

---

## Tech Stack

| Layer | Library |
|---|---|
| Framework | Expo SDK 54 / React Native 0.81 |
| Navigation | expo-router v6 (tabs) |
| State | Zustand |
| Storage | AsyncStorage + expo-secure-store |
| AI Providers | Groq, Gemini, DeepSeek, Anthropic |
| Lists | @shopify/flash-list |
| Markdown | react-native-markdown-display |

---

## Getting Started

### Prerequisites
- Node.js >= 20
- Expo CLI

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start dev server
npm start
```

Scan the QR code with **Expo Go** on your phone.

---

## API Keys

Go to **Settings** in the app to add your API keys. All keys are stored securely using `expo-secure-store`.

| Provider | Free tier | Get key |
|---|---|---|
| Groq | Yes (fast Llama models) | https://console.groq.com |
| Gemini | Yes (Flash + Pro) | https://aistudio.google.com |
| DeepSeek | No | https://platform.deepseek.com |
| Anthropic | No | https://console.anthropic.com |

---

## Supported Models

| Model | Provider | Free | Context |
|---|---|---|---|
| Llama 3.1 8B | Groq | Yes | 128K |
| Llama 3.3 70B | Groq | Yes | 128K |
| Llama 4 Scout | Groq | Yes | 128K |
| Gemini Flash 2.0 | Gemini | Yes | 128K |
| Gemini 2.5 Pro | Gemini | Yes | 1M |
| DeepSeek Chat | DeepSeek | No | 64K |
| DeepSeek R1 | DeepSeek | No | 64K |
| Claude Haiku | Anthropic | No | 200K |
| Claude Sonnet | Anthropic | No | 200K |
| Claude Opus | Anthropic | No | 200K |

---

## Building

### Android APK

```bash
npm run build:apk
```

Requires an [Expo](https://expo.dev) account. Download the APK from the EAS dashboard and install directly on your Android device.

### iOS (Simulator)

```bash
eas build --platform ios --profile ios-simulator --non-interactive
```

Produces a `.tar.gz` containing a `.app` file. Drag it onto the Xcode iOS Simulator.

### iOS (Real Device — Free Apple ID)

```bash
eas build --platform ios --profile preview
```

Runs interactively and asks for your Apple ID. Produces a signed `.ipa` for sideloading via [AltStore](https://altstore.io). App expires every 7 days.

### iOS (App Store / TestFlight)

Requires an [Apple Developer account](https://developer.apple.com/programs/) ($99/year).

```bash
eas build --platform ios --profile production
```

---

## Project Structure

```
app/                  # expo-router tab screens
src/
  screens/            # screen components
    ChatScreen.tsx    # main chat UI with side drawer
    ProviderScreen.tsx
    SettingsScreen.tsx
    AgentScreen.tsx
    ...
  services/
    api.ts            # Groq client + system prompt builder
    providers.ts      # multi-provider client (Groq/Gemini/DeepSeek/Anthropic)
  store/
    index.ts          # Zustand global state (chat sessions, projects, corrections)
  theme.ts            # colors, spacing, radius
assets/               # icon, splash screen
```

---

## EAS Project

- **Owner:** dolan1212
- **Project:** myai-mobile
- **Dashboard:** https://expo.dev/accounts/dolan1212/projects/myai-mobile
- **GitHub:** https://github.com/dpanganiban20/myai-mobile
