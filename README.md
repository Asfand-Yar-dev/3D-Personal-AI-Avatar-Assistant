# Aiden — 3D Personal AI Avatar Assistant

An interactive, voice-first 3D AI Assistant built with **React 19**, **Three.js**, **Web Audio API**, and **Node.js**. Features a real-time procedural 3D avatar with audio-driven lipsync, browser voice recognition, client-side document retrieval (RAG), and intelligent AI Model conversation.

---

## ✨ Features

- **🎭 Real-Time 3D Avatar (Three.js):** Lightweight procedural 3D model that loads instantly (< 5 KB asset size) and runs at a smooth 60 FPS on any device without heavy asset downloads.
- **🗣️ Audio-Reactive Lip-Sync:** Uses the browser Web Audio API (`AudioContext` & `AnalyserNode`) to analyze audio frequencies (FFT) in real time, synchronizing the 3D mouth movements with spoken responses.
- **🎙️ Voice Input (Speech-to-Text):** Native browser speech recognition with support for English and Urdu, featuring hands-free automatic message dispatch.
- **📁 Private In-Browser Document RAG:** Upload PDFs, TXTs, or Markdown documents. Files are parsed and chunked locally in the browser memory using `pdfjs-dist`—your private notes never leave your device.
- **🧠 Advanced AI Model Integration:** Connects seamlessly with OpenAI-compatible AI endpoints for conversational intelligence, RAG grounding, and neural text-to-speech.
- **📷 Vision Sensor / Camera Preview:** Private, on-device local camera preview via WebRTC.
- **🛡️ Security & Privacy Focused:** API keys are strictly kept on the local server in `.env` and never exposed to the client.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend UI** | React 19, Vite 8, Vanilla CSS3 (Custom Design System, Glassmorphism) |
| **3D Graphics** | Three.js (WebGL, Procedural Geometries, Dynamic Lighting & Shadows) |
| **Audio & Speech** | Web Audio API (FFT Frequency Analysis), Web Speech API (STT & Offline TTS) |
| **AI Engine** | OpenAI-compatible AI Chat Model & Neural Speech (TTS) |
| **Document Retrieval** | PDF.js (`pdfjs-dist`), Client-Side Sliding-Window Chunking & Scoring |
| **Backend / Proxy** | Node.js (Native HTTP Server, Secure Key Proxy, Static Bundler) |

---

## 🚀 Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) 18 or newer installed.

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/<your-username>/<your-repo-name>.git
cd <your-repo-name>
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Open `.env` and add your AI Model API key:
```env
API_KEY=your_api_key_here
```
*(Note: Without an API key, Aiden runs in local demo mode with grounded document search and browser speech synthesis).*

### 4. Build & Run
Build the optimized production bundle and start the local server:
```bash
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) in Chrome or Edge, and allow microphone/camera permissions when prompted.

---

## 🔒 Privacy & Data Protection

- **Local Session Only:** Uploaded knowledge documents are parsed and retrieved strictly inside your browser memory for the current session.
- **Local Camera Feed:** The camera preview runs entirely on-device; video frames are never transmitted to external servers.
- **Protected Secrets:** The AI API key remains securely stored in the server `.env` file and is never exposed to browser client code.
