import { useMemo, useRef, useState, useEffect } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import AvatarScene from './AvatarScene';
import './layout.css';

GlobalWorkerOptions.workerSrc = pdfWorker;

const words = text => text.toLowerCase().match(/[a-z0-9]{3,}/g) || [];

const splitIntoChunks = text => {
  const clean = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  for (let start = 0; start < clean.length; start += 950) {
    const chunk = clean.slice(start, start + 1150).trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
};

const retrieve = (question, chunks) => {
  const needle = new Set(words(question));
  return chunks
    .map(chunk => ({
      ...chunk,
      score: words(chunk.text).reduce((total, word) => total + Number(needle.has(word)), 0)
    }))
    .filter(chunk => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
};

async function readPdf(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const loadingTask = getDocument({
      data,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true
    });
    const document = await loadingTask.promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 50); pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map(item => (item && typeof item.str === 'string' ? item.str : ''))
        .join(' ');
      if (pageText.trim()) pages.push(pageText);
    }
    const fullText = pages.join('\n');
    if (fullText.trim()) return fullText;
  } catch (err) {
    console.warn('PDF.js worker issue, attempting direct text extraction fallback:', err);
  }

  // Fallback extraction
  const rawText = await file.text();
  const extracted = rawText.match(/\(([^\(\)\\]*(?:\\.[^\(\)\\]*)*)\)\s*Tj/g) || rawText.match(/\[([^\[\]]*)\]\s*TJ/g);
  if (extracted && extracted.length > 0) {
    return extracted.map(s => s.replace(/^[\[\(]/, '').replace(/[\]\)]\s*T[jJ]$/, '')).join(' ');
  }
  const cleanFallback = rawText.replace(/[^\x20-\x7E\t\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleanFallback.length > 60) {
    return cleanFallback;
  }
  throw new Error('Could not extract readable text from this PDF.');
}

/**
 * Parses inline formatting (**bold**, *italic*, `code`) into React elements
 */
function formatInline(text) {
  if (!text) return text;
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={match.index} className="message-bold">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={match.index} className="message-italic">{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(<code key={match.index} className="inline-code">{token.slice(1, -1)}</code>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

/**
 * Formats Markdown blocks: code blocks, headings, bullet lists, numbered lists, paragraphs
 */
function MessageContent({ content }) {
  if (!content) return null;

  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  const blocks = [];
  let lastIdx = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIdx) {
      blocks.push({ type: 'text', content: content.substring(lastIdx, match.index) });
    }
    blocks.push({ type: 'code', lang: match[1], code: match[2].trim() });
    lastIdx = codeBlockRegex.lastIdx;
  }
  if (lastIdx < content.length) {
    blocks.push({ type: 'text', content: content.substring(lastIdx) });
  }

  return (
    <div className="message-body">
      {blocks.map((block, bIdx) => {
        if (block.type === 'code') {
          return (
            <pre key={bIdx} className="message-code-block">
              {block.lang && <div className="code-lang">{block.lang}</div>}
              <code>{block.code}</code>
            </pre>
          );
        }

        const lines = block.content.split('\n');
        const elements = [];
        let listItems = [];
        let listType = null;

        const flushList = () => {
          if (listItems.length > 0) {
            const Tag = listType === 'ol' ? 'ol' : 'ul';
            elements.push(
              <Tag key={`list-${elements.length}`} className="message-list">
                {listItems.map((item, i) => (
                  <li key={i}>{formatInline(item)}</li>
                ))}
              </Tag>
            );
            listItems = [];
            listType = null;
          }
        };

        lines.forEach((line, lineIdx) => {
          const trimmed = line.trim();
          if (!trimmed) {
            flushList();
            return;
          }

          if (trimmed.startsWith('### ')) {
            flushList();
            elements.push(<h4 key={lineIdx} className="msg-heading">{formatInline(trimmed.slice(4))}</h4>);
          } else if (trimmed.startsWith('## ')) {
            flushList();
            elements.push(<h3 key={lineIdx} className="msg-heading">{formatInline(trimmed.slice(3))}</h3>);
          } else if (trimmed.startsWith('# ')) {
            flushList();
            elements.push(<h2 key={lineIdx} className="msg-heading">{formatInline(trimmed.slice(2))}</h2>);
          } else if (/^[-*]\s+/.test(trimmed)) {
            if (listType !== 'ul') flushList();
            listType = 'ul';
            listItems.push(trimmed.replace(/^[-*]\s+/, ''));
          } else if (/^\d+\.\s+/.test(trimmed)) {
            if (listType !== 'ol') flushList();
            listType = 'ol';
            listItems.push(trimmed.replace(/^\d+\.\s+/, ''));
          } else {
            flushList();
            elements.push(<p key={lineIdx} className="message-paragraph">{formatInline(line)}</p>);
          }
        });

        flushList();
        return <div key={bIdx}>{elements}</div>;
      })}
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'I am ready. Add a document if you want answers grounded in your own material.' }
  ]);
  const [documents, setDocuments] = useState([]);
  const [chunks, setChunks] = useState([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('Ready');
  const [speaking, setSpeaking] = useState(false);
  const [mouthShape, setMouthShape] = useState(0);
  const [cameraOn, setCameraOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [voiceLang, setVoiceLang] = useState('en-US'); // 'en-US' | 'ur-PK'

  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const animationRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const sourceLabel = useMemo(
    () => (documents.length ? `${documents.length} document${documents.length === 1 ? '' : 's'} ready` : 'No knowledge source selected'),
    [documents]
  );

  const stopVoice = () => {
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    cancelAnimationFrame(animationRef.current);
    setSpeaking(false);
    setMouthShape(0);
  };

  const browserSpeech = reply => {
    const voice = new SpeechSynthesisUtterance(reply);
    voice.rate = 0.97;
    voice.onstart = () => {
      setSpeaking(true);
      setStatus('Speaking');
    };
    voice.onboundary = event =>
      setMouthShape(/[aeiou]/.test(reply.slice(event.charIndex, event.charIndex + 5).toLowerCase()) ? 0.75 : 0.3);
    voice.onend = () => {
      setSpeaking(false);
      setMouthShape(0);
      setStatus('Ready');
    };
    speechSynthesis.speak(voice);
  };

  const speak = async reply => {
    stopVoice();
    try {
      const response = await fetch('/api/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reply })
      });
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
      const bytes = new Uint8Array(analyser.frequencyBinCount);
      const animate = () => {
        analyser.getByteFrequencyData(bytes);
        setMouthShape(Math.min(1, bytes.reduce((sum, value) => sum + value, 0) / bytes.length / 62));
        animationRef.current = requestAnimationFrame(animate);
      };
      audio.onplay = () => {
        setSpeaking(true);
        setStatus('Speaking');
        animate();
      };
      audio.onended = () => {
        cancelAnimationFrame(animationRef.current);
        setSpeaking(false);
        setMouthShape(0);
        setStatus('Ready');
        URL.revokeObjectURL(url);
        context.close();
      };
      await audio.play();
    } catch {
      browserSpeech(reply);
    }
  };

  const send = async prompt => {
    const question = (prompt || text).trim();
    if (!question) return;
    if (listening) stopListening();
    const user = { role: 'user', content: question };
    const previous = messages;
    setMessages(list => [...list, user]);
    setText('');
    setIsTyping(true);
    setStatus('Searching documents');
    const selected = retrieve(question, chunks);
    try {
      setStatus('Aiden is thinking...');
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, history: previous.slice(-8), context: selected })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      const reply = payload.reply.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      setIsTyping(false);
      setMessages(list => [...list, { role: 'assistant', content: reply }]);
      setStatus(selected.length ? `Using ${[...new Set(selected.map(source => source.title))].join(', ')}` : 'Ready');
      speak(reply);
    } catch (error) {
      setIsTyping(false);
      const reply = selected.length
        ? `I found relevant sections in ${[...new Set(selected.map(source => source.title))].join(', ')}. Add your MiniMax key to .env to receive an AI-generated answer.`
        : 'Add a PDF, TXT, or Markdown document, then add your MiniMax key to .env for AI-powered answers.';
      setMessages(list => [...list, { role: 'assistant', content: reply }]);
      setStatus(error.message || 'Local retrieval only');
      speak(reply);
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const toggleListening = () => {
    if (listening) return stopListening();
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return setStatus('Use Chrome or Edge for microphone input.');
    const recognition = new Recognition();
    recognition.lang = voiceLang;
    recognition.interimResults = true;
    recognition.onstart = () => {
      setListening(true);
      setStatus('Listening');
    };
    recognition.onresult = event => {
      const result = Array.from(event.results).map(item => item[0].transcript).join('');
      setText(result);
      if (event.results[event.results.length - 1].isFinal) send(result);
    };
    recognition.onerror = () => {
      setListening(false);
      setStatus('Microphone permission was not granted.');
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const toggleCamera = async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraOn(false);
      setStatus('Camera paused');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      setStatus('Camera preview active');
    } catch {
      setStatus('Camera permission was not granted.');
    }
  };

  const handleProcessFile = async file => {
    if (!file) return;
    if (file.size > 20_000_000) {
      setStatus('Please use a document smaller than 20 MB.');
      return;
    }
    setStatus(`Reading ${file.name}...`);
    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf');
      let sourceText = '';
      if (isPdf) {
        sourceText = await readPdf(file);
      } else {
        sourceText = await file.text();
      }
      const pieces = splitIntoChunks(sourceText);
      if (!pieces.length || pieces.join('').trim().length < 5) {
        throw new Error('No readable text was found in this document.');
      }
      const title = file.name.replace(/\.[^.]+$/, '');
      const typeLabel = isPdf ? 'PDF' : file.name.split('.').pop()?.toUpperCase() || 'Text';
      setDocuments(list => [...list, { title, pages: typeLabel }]);
      setChunks(list => [
        ...list,
        ...pieces.map((piece, index) => ({ title, text: piece, id: `${file.name}-${index}` }))
      ]);
      setStatus(`Loaded: ${file.name}`);
    } catch (error) {
      console.error('File load error:', error);
      setStatus(error.message || 'This document could not be read.');
    }
  };

  const removeDocument = (titleToRemove, e) => {
    e?.stopPropagation();
    setDocuments(docs => docs.filter(d => d.title !== titleToRemove));
    setChunks(chs => chs.filter(c => c.title !== titleToRemove));
    setStatus(`Removed: ${titleToRemove}`);
  };

  const addDocument = async event => {
    const file = event.target.files?.[0];
    if (file) {
      await handleProcessFile(file);
    }
    if (event.target) event.target.value = '';
  };

  const handleDragOver = e => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = e => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async e => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleProcessFile(file);
    }
  };

  const openFilePicker = () => {
    if (fileRef.current) {
      fileRef.current.click();
    }
  };

  return (
    <div className="app-wrapper">
      {/* Hidden Global File Input */}
      <input
        ref={fileRef}
        onChange={addDocument}
        type="file"
        accept=".pdf,.txt,.md,.json,.csv,.text,.log,application/pdf,text/plain,text/markdown"
        style={{ display: 'none' }}
      />

      <header className="app-header">
        <div className="brand-group">
          <div className="brand-logo">
            <span className="brand-name">AIDEN</span>
          </div>
          <span className="header-badge">3D AVATAR ASSISTANT</span>
        </div>

        <div className="header-actions">
          <div className={`status-pill ${speaking ? 'speaking' : listening ? 'listening' : isTyping ? 'thinking' : 'ready'}`}>
            <span className="status-text">{status}</span>
          </div>
        </div>
      </header>

      <main className="app-main">
        {/* Left Column: Avatar Stage + Responsive Utilities */}
        <div className="left-column">
          <section className="stage" id="top">
            <div className={`stage-badge ${speaking ? 'speaking' : listening ? 'listening' : 'idle'}`}>
              <span>{speaking ? 'Aiden is speaking' : listening ? 'Aiden is listening' : 'Aiden is ready'}</span>
            </div>
            <AvatarScene speaking={speaking} mouthShape={mouthShape} />
            <div className="avatar-card">
              <div className="avatar-info">
                <strong>Aiden</strong>
                <span>Personal AI Assistant</span>
              </div>
              <div className="avatar-status-tag">Online</div>
            </div>
          </section>

          {/* Split View Utility Grid */}
          <section className="utility-grid">
            {/* Knowledge Card */}
            <div className="utility-card">
              <div className="utility-header">
                <div className="utility-title-group">
                  <span className="utility-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                  </span>
                  <div>
                    <span className="utility-tag">KNOWLEDGE BASE</span>
                    <h3>Document RAG</h3>
                  </div>
                </div>
                <button type="button" className="icon-action-btn" onClick={openFilePicker} title="Upload PDF, TXT, MD, JSON">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  Upload File
                </button>
              </div>



              {documents.length > 0 && (
                <div className="document-list">
                  {documents.map((document, index) => (
                    <div className="doc-item" key={`${document.title}-${index}`}>
                      <span className="doc-name" title={document.title}>{document.title}</span>
                      <div className="doc-meta">
                        <span className="doc-tag">{document.pages}</span>
                        <button
                          type="button"
                          className="doc-remove-btn"
                          onClick={e => removeDocument(document.title, e)}
                          title="Remove document"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Vision / Camera Card */}
            <div className="utility-card">
              <div className="utility-header">
                <div className="utility-title-group">
                  <span className="utility-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                      <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                  </span>
                  <div>
                    <span className="utility-tag">VISION SENSOR</span>
                    <h3>Camera Preview</h3>
                  </div>
                </div>
                <button className={`icon-action-btn ${cameraOn ? 'active' : ''}`} onClick={toggleCamera}>
                  {cameraOn ? 'Turn Off' : 'Turn On'}
                </button>
              </div>

              <div className="camera-box">
                <video ref={videoRef} className={cameraOn ? 'camera-video visible' : 'camera-video'} autoPlay playsInline muted />
                {!cameraOn && (
                  <div className="camera-placeholder">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                      <circle cx="12" cy="13" r="4"></circle>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                    <span>Camera is inactive</span>
                  </div>
                )}
              </div>
              <p className="camera-note">Processed locally on device</p>
            </div>
          </section>
        </div>

        {/* Right Column: Chat Conversation with Markdown Rendering */}
        <div className="right-column">
          <section className="conversation">
            <div className="conversation-title">
              <div>
                <p className="conversation-category">INTERACTION</p>
                <h2>How can I help you?</h2>
              </div>
              <span className="model-tag">Aiden Voice &amp; Chat</span>
            </div>

            <div className="messages">
              {messages.map((message, index) => (
                <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                  <div className="message-header">
                    <span className="message-sender">
                      {message.role === 'assistant' ? 'Aiden' : 'You'}
                    </span>
                  </div>
                  <div className="message-text">
                    <MessageContent content={message.content} />
                  </div>
                </article>
              ))}

              {/* Typing indicator when LLM is processing */}
              {isTyping && (
                <article className="message assistant typing-message">
                  <div className="message-header">
                    <span className="message-sender">Aiden</span>
                    <span className="typing-status">thinking...</span>
                  </div>
                  <div className="message-text typing-bubble">
                    <span className="typing-bounce"></span>
                    <span className="typing-bounce"></span>
                    <span className="typing-bounce"></span>
                  </div>
                </article>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="composer">
              <input
                className="composer-input"
                value={text}
                onChange={event => setText(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && send()}
                placeholder="Ask Aiden anything..."
              />

              <button
                type="button"
                className={`composer-listen-btn ${listening ? 'listening' : ''}`}
                onClick={toggleListening}
                title={listening ? 'Stop listening' : `Start voice input (${voiceLang === 'en-US' ? 'English' : 'Urdu'})`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
                <span className="listen-label">{listening ? 'Listening...' : 'Voice'}</span>
              </button>

              <button
                type="button"
                className="lang-toggle-btn"
                onClick={() => setVoiceLang(l => (l === 'en-US' ? 'ur-PK' : 'en-US'))}
                title={`Microphone language: ${voiceLang === 'en-US' ? 'English (click to switch to Urdu)' : 'Urdu (click to switch to English)'}`}
              >
                {voiceLang === 'en-US' ? 'EN' : 'UR'}
              </button>

              <button
                type="button"
                className="composer-send-btn"
                onClick={() => send()}
                title="Send message"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
                <span>Send</span>
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
