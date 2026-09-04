/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUp, CornerDownLeft, Sparkles, RefreshCw, Plus, X, FileText, Paperclip, ChevronDown, ChevronUp, Menu, User, MessageSquare, Sliders, LogOut, Info, LogIn, Copy, ThumbsUp, ThumbsDown, Check, Pencil, Settings, Mic, Volume2, VolumeX, Trash2, Brain, MoreVertical, MoreHorizontal, Pin, Square, Share2, SquarePen, PanelLeft, Search, Bookmark, Lock, Ghost, Code2, Monitor, Tablet, Smartphone, ExternalLink, RotateCw, Globe, Layout, Play, Download, Wand2, Image as ImageIcon, Film, AlertCircle } from "lucide-react";
import { GenexLogo } from "./components/GenexLogo";
import { AuthModal } from "./components/AuthModal";
import { PricingModal } from "./components/PricingModal";
import { CodeBlock } from "./components/CodeBlock";
import { CosmicBackground } from "./components/CosmicBackground";
import { MediaDisplayBlock } from "./components/MediaDisplayBlock";
import { auth, signOut, onAuthStateChanged } from "./lib/firebase";

const PlusSparkleIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C12 7.2 16.8 12 22 12C16.8 12 12 16.8 12 22C12 16.8 7.2 12 2 12C7.2 12 12 7.2 12 2Z" />
  </svg>
);

interface InlineData {
  mimeType: string;
  data: string; // base64 representation
}

interface MessagePart {
  text?: string;
  inlineData?: InlineData;
}

export interface WebSource {
  title: string;
  url: string;
}

interface Message {
  role: "user" | "model";
  parts: MessagePart[];
  thinkingDuration?: number;
  thoughtProcess?: string;
  searchSources?: WebSource[];
  buildDuration?: number;
  modeTag?: "webdev" | "bugfix" | "chat" | "create";
  mediaType?: "image" | "video";
  mediaUrl?: string;
  mediaPrompt?: string;
  mediaError?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

interface AttachedFile {
  id: string;
  name: string;
  mimeType: string;
  base64: string;
  size: number;
}

export interface GNXModelOption {
  id: "mini" | "thinking" | "pro";
  name: string;
  displayName?: string;
  shortName: string;
  badge: string;
  badgeColor: string;
  description: string;
  bestFor: string;
}

export const GNX_MODELS: GNXModelOption[] = [
  {
    id: "mini",
    name: "GNX Rout Mini",
    displayName: "GNX Rout Mini",
    shortName: "GNX Rout Mini",
    badge: "Fast & Light",
    badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
    description: "Fast answers — low resource usage, for everyday tasks.",
    bestFor: "Quick Q&As, fast summaries, basic writing",
  },
  {
    id: "thinking",
    name: "GNX Rout Thinking",
    displayName: "GNX Rout Thinking",
    shortName: "GNX Rout Thinking",
    badge: "Deep Reasoning",
    badgeColor: "bg-indigo-100 text-indigo-800 border-indigo-200",
    description: "Deep reasoning, balanced, good for maths, coding, and complex text.",
    bestFor: "Maths, algorithms, coding, detailed text",
  },
  {
    id: "pro",
    name: "GNX Rout 1 Pro",
    displayName: "GNX Rout 1 Pro",
    shortName: "GNX Rout 1 Pro",
    badge: "Pro & Vision",
    badgeColor: "bg-purple-100 text-purple-800 border-purple-200",
    description: "Heavy tasks, multimodal, design, vision, files, and deep analysis.",
    bestFor: "Vision, design, multimodal analysis, heavy reasoning",
  },
];

const GEMINI_VOICES = [
  { id: "Aoede", name: "Aoede", gender: "Female", desc: "Warm, natural & lifelike studio female voice" },
  { id: "Puck", name: "Puck", gender: "Male", desc: "Energetic, clear & expressive studio male voice" },
  { id: "Zephyr", name: "Zephyr", gender: "Male", desc: "Calm, smooth & deep studio male voice" },
  { id: "Kore", name: "Kore", gender: "Female", desc: "Soft, gentle & articulate natural female voice" },
  { id: "Fenrir", name: "Fenrir", gender: "Male", desc: "Authoritative & rich studio male voice" },
];

function AudioWaveformIcon({ className = "w-5 h-5 text-white" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect className="voice-bar-1" x="3.5" y="8.5" width="2.5" height="7" rx="1.25" fill="currentColor" />
      <rect className="voice-bar-2" x="8.5" y="4" width="2.5" height="16" rx="1.25" fill="currentColor" />
      <rect className="voice-bar-3" x="13.5" y="6" width="2.5" height="12" rx="1.25" fill="currentColor" />
      <rect className="voice-bar-4" x="18.5" y="9" width="2.5" height="6" rx="1.25" fill="currentColor" />
    </svg>
  );
}

/** Synthesize a smooth 3-second WebM animated camera motion video clip from a canvas/image */
export async function generateVideoWebM(prompt: string, imageUrl?: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(imageUrl || "");
        return;
      }

      let stream: MediaStream | null = null;
      try {
        stream = canvas.captureStream(30);
      } catch (e) {
        resolve(imageUrl || "");
        return;
      }

      const mimeType = (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm;codecs=vp9"))
        ? "video/webm;codecs=vp9"
        : (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm"))
        ? "video/webm"
        : "video/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const videoUrl = URL.createObjectURL(blob);
        resolve(videoUrl);
      };

      recorder.start();

      const startTime = performance.now();
      const duration = 3000; // 3 second clip

      let img: HTMLImageElement | null = null;
      if (imageUrl) {
        img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageUrl;
      }

      function renderFrame(now: number) {
        if (!ctx) return;
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        ctx.fillStyle = "#141413";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (img && img.complete && img.naturalWidth > 0) {
          const scale = 1 + Math.sin(progress * Math.PI) * 0.08;
          const dx = Math.sin(progress * Math.PI * 2) * 12;
          const dy = Math.cos(progress * Math.PI * 2) * 8;

          ctx.save();
          ctx.translate(canvas.width / 2 + dx, canvas.height / 2 + dy);
          ctx.scale(scale, scale);
          ctx.drawImage(img, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
          ctx.restore();
        } else {
          const grad = ctx.createRadialGradient(
            canvas.width / 2 + Math.sin(progress * 4) * 40,
            canvas.height / 2 + Math.cos(progress * 4) * 40,
            20,
            canvas.width / 2,
            canvas.height / 2,
            380
          );
          grad.addColorStop(0, "#8b5cf6");
          grad.addColorStop(0.5, "#ec4899");
          grad.addColorStop(1, "#141413");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Particle light trails
        for (let i = 0; i < 35; i++) {
          const pAngle = (i / 35) * Math.PI * 2 + progress * Math.PI * 2;
          const radius = 120 + Math.sin(progress * Math.PI * 4 + i) * 70;
          const px = canvas.width / 2 + Math.cos(pAngle) * radius;
          const py = canvas.height / 2 + Math.sin(pAngle) * radius;

          ctx.beginPath();
          ctx.arc(px, py, 3 + Math.sin(progress * Math.PI + i) * 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.35 + Math.sin(progress * Math.PI + i) * 0.4})`;
          ctx.fill();
        }

        // Branding
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.font = "bold 16px sans-serif";
        ctx.fillText("Zen Video Engine", 20, canvas.height - 20);

        if (elapsed < duration) {
          requestAnimationFrame(renderFrame);
        } else {
          recorder.stop();
        }
      }

      requestAnimationFrame(renderFrame);
    } catch (err) {
      resolve(imageUrl || "");
    }
  });
}

/** Detect intent for Image or Video creation */
function detectMediaIntent(query: string, isCreateMode: boolean): { isMedia: boolean; mediaType: "image" | "video"; prompt: string } {
  if (isCreateMode) {
    const isVid = /\b(video|clip|mp4|webm|animate|animation|movie)\b/i.test(query);
    return { isMedia: true, mediaType: isVid ? "video" : "image", prompt: query };
  }

  const isVid = /\b(make|generate|render|create|produce|draw|animate)\b.*\b(video|clip|mp4|webm|animation|movie)\b|\b(video|animation) of\b/i.test(query);
  const isImg = /\b(generate|create|draw|make|paint|render)\b.*\b(image|picture|photo|illustration|artwork|graphic|portrait|banner|avatar|drawing)\b|\b(image|picture|photo|artwork) of\b|\bdraw a\b/i.test(query);

  if (isVid) {
    return { isMedia: true, mediaType: "video", prompt: query };
  }
  if (isImg) {
    return { isMedia: true, mediaType: "image", prompt: query };
  }

  return { isMedia: false, mediaType: "image", prompt: query };
}

export default function App() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Message[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showThinkingProcess, setShowThinkingProcess] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [showLoginNotice, setShowLoginNotice] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [subscription, setSubscription] = useState<{ plan: string; status: string; renewDate: string }>({ plan: "free", status: "active", renewDate: "" });
  const [isTextInputListening, setIsTextInputListening] = useState(false);
  const [isVoiceModeListening, setIsVoiceModeListening] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<"mini" | "thinking" | "pro">(() => {
    const saved = localStorage.getItem("zen_selected_model_id");
    if (saved === "mini" || saved === "thinking" || saved === "pro") return saved;
    return "thinking";
  });
  const [selectedVoice, setSelectedVoice] = useState<"Aoede" | "Puck" | "Zephyr" | "Kore" | "Fenrir">(() => {
    const saved = localStorage.getItem("zen_selected_voice");
    if (saved === "Aoede" || saved === "Puck" || saved === "Zephyr" || saved === "Kore" || saved === "Fenrir") return saved;
    return "Aoede";
  });
  const [isVoiceDropdownOpen, setIsVoiceDropdownOpen] = useState(false);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [activeResponseMode, setActiveResponseMode] = useState<"auto" | "fast" | "thinking">("auto");
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
  const [isVoiceModeActive, setIsVoiceModeActive] = useState(false);
  const [isVoiceChatMinimized, setIsVoiceChatMinimized] = useState(false);
  const [voiceInputText, setVoiceInputText] = useState("");

  const isVoiceModeActiveRef = useRef(false);
  const voiceInputTextRef = useRef("");
  const isVoiceModeListeningRef = useRef(false);
  const isSpeakingRef = useRef(false);

  const textInputRecognitionRef = useRef<any>(null);
  const voiceCallRecognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const voiceMessagesEndRef = useRef<HTMLDivElement>(null);

  // Short synthesized UI chime when entering Voice Mode
  const playVoiceStartChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";

      // Pleasant ascending chime chord: C5 (523Hz) -> G5 (784Hz)
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.12);

      osc2.frequency.setValueAtTime(659.25, now + 0.04);
      osc2.frequency.exponentialRampToValueAtTime(1046.5, now + 0.16);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.04);
      osc1.stop(now + 0.32);
      osc2.stop(now + 0.32);
    } catch (e) {
      console.warn("Chime playback notice:", e);
    }
  };

  // Short synthesized UI chime when exiting Voice Mode
  const playVoiceEndChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";

      // Gentle descending chime chord: G5 (784Hz) -> C5 (523Hz)
      osc1.frequency.setValueAtTime(783.99, now);
      osc1.frequency.exponentialRampToValueAtTime(523.25, now + 0.14);

      osc2.frequency.setValueAtTime(659.25, now + 0.03);
      osc2.frequency.exponentialRampToValueAtTime(392.0, now + 0.18);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.03);
      osc1.stop(now + 0.3);
      osc2.stop(now + 0.3);
    } catch (e) {
      console.warn("Chime playback notice:", e);
    }
  };

  // Auto-scroll voice message history when minimized
  useEffect(() => {
    if (isVoiceModeActive && isVoiceChatMinimized) {
      voiceMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isVoiceModeActive, isVoiceChatMinimized, history]);

  useEffect(() => {
    isVoiceModeActiveRef.current = isVoiceModeActive;
  }, [isVoiceModeActive]);

  useEffect(() => {
    voiceInputTextRef.current = voiceInputText;
  }, [voiceInputText]);

  useEffect(() => {
    isVoiceModeListeningRef.current = isVoiceModeListening;
  }, [isVoiceModeListening]);

  useEffect(() => {
    isSpeakingRef.current = speakingIndex !== null;
  }, [speakingIndex]);



  const voiceDropdownRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const sidebarSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (voiceDropdownRef.current && !voiceDropdownRef.current.contains(e.target as Node)) {
        setIsVoiceDropdownOpen(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setIsAttachMenuOpen(false);
      }
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setIsModeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Pre-warm SpeechSynthesis voices
  useEffect(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      const onVoices = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.onvoiceschanged = onVoices;
      return () => {
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
  }, []);

  const recognitionRef = useRef<any>(null);
  const speechTextRef = useRef<string>("");
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const currentAudioCtxRef = useRef<AudioContext | null>(null);

  const stopActiveSpeech = () => {
    isSpeakingRef.current = false;
    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop();
        currentAudioSourceRef.current.disconnect();
      } catch (e) {
        // ignored
      }
      currentAudioSourceRef.current = null;
    }
    if (currentAudioCtxRef.current && currentAudioCtxRef.current.state !== "closed") {
      try {
        currentAudioCtxRef.current.close();
      } catch (e) {
        // ignored
      }
      currentAudioCtxRef.current = null;
    }
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      } catch (e) {
        // ignored
      }
      currentAudioRef.current = null;
    }
    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        // ignored
      }
    }
  };

  // Handle document visibility and unload events cleanly
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopActiveSpeech();
      }
    };
    const handleUnload = () => {
      stopActiveSpeech();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handleUnload);
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handleUnload);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);

  const handleSpeak = async (index: number, text: string) => {
    console.log("[GNX Voice] handleSpeak requested for index:", index, "Text snippet:", text.slice(0, 60));

    // If clicking on currently playing message, stop it
    if (speakingIndex === index) {
      console.log("[GNX Voice] Stopping active speech.");
      stopActiveSpeech();
      setSpeakingIndex(null);
      return;
    }

    // Stop any current audio & immediately pause/stop microphone recognition
    stopActiveSpeech();
    isSpeakingRef.current = true;
    setSpeakingIndex(index);

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setVoiceInputText("");
    voiceInputTextRef.current = "";

    if (voiceCallRecognitionRef.current) {
      try {
        voiceCallRecognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
    }
    setIsVoiceModeListening(false);

    const cleanText = text
      .replace(/```[\s\S]*?```/g, " Code block omitted. ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/[*_#~]/g, "")
      .replace(/\n+/g, " ")
      .trim();

    if (!cleanText) {
      isSpeakingRef.current = false;
      setSpeakingIndex(null);
      return;
    }

    const speakFallback = () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const voices = window.speechSynthesis.getVoices();
        console.log("[GNX Voice] Browser speechSynthesis voices available:", voices.length);
        
        // Priority ranking for realistic female voices
        const preferredFemaleNames = [
          "google us english female",
          "google uk english female",
          "samantha",
          "victoria",
          "karen",
          "zira",
          "ava",
          "siri",
          "serena",
          "female"
        ];

        let bestVoice: SpeechSynthesisVoice | null = null;
        for (const name of preferredFemaleNames) {
          const match = voices.find(v => v.lang.startsWith("en") && v.name.toLowerCase().includes(name));
          if (match) {
            bestVoice = match;
            break;
          }
        }

        if (!bestVoice) {
          bestVoice = voices.find(v => v.lang.startsWith("en") && (v.name.toLowerCase().includes("female") || v.name.toLowerCase().includes("woman"))) || null;
        }

        if (!bestVoice) {
          bestVoice = voices.find(v => v.lang.startsWith("en-US")) || voices.find(v => v.lang.startsWith("en")) || voices[0] || null;
        }

        console.log("[GNX Voice] Web Speech API fallback using voice:", bestVoice?.name || "default browser voice");

        const utterance = new SpeechSynthesisUtterance(cleanText);
        if (bestVoice) utterance.voice = bestVoice;
        utterance.rate = 0.95; // Natural speaking pace
        utterance.pitch = 1.0;
        utterance.onend = () => {
          console.log("[GNX Voice] Web Speech API fallback playback ended.");
          setTimeout(() => {
            isSpeakingRef.current = false;
            setSpeakingIndex(null);
          }, 350);
        };
        utterance.onerror = (err) => {
          console.warn("[GNX Voice] Web Speech API fallback error:", err);
          isSpeakingRef.current = false;
          setSpeakingIndex(null);
        };
        window.speechSynthesis.speak(utterance);
      } else {
        isSpeakingRef.current = false;
        setSpeakingIndex(null);
      }
    };

    try {
      console.log(`[GNX Voice] Requesting neural TTS audio from /api/tts using voice: ${selectedVoice}...`);
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cleanText,
          voice: selectedVoice,
        }),
      });

      if (!response.ok) {
        console.warn(`[GNX Voice] /api/tts request failed with status ${response.status}, using browser fallback.`);
        speakFallback();
        return;
      }

      const data = await response.json();
      if (data.fallback || !data.audio) {
        console.warn("[GNX Voice] /api/tts indicated fallback, using browser fallback.");
        speakFallback();
        return;
      }

      console.log("[GNX Voice] Received neural TTS audio payload from Gemini. Preparing audio decoding...");

      const binaryString = atob(data.audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Try playing via Web Audio API first for optimal smooth playback
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        currentAudioCtxRef.current = audioCtx;

        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }

        const copyBuffer = new ArrayBuffer(bytes.length);
        new Uint8Array(copyBuffer).set(bytes);
        const decodedBuffer = await audioCtx.decodeAudioData(copyBuffer);

        const source = audioCtx.createBufferSource();
        source.buffer = decodedBuffer;
        source.connect(audioCtx.destination);
        currentAudioSourceRef.current = source;

        source.onended = () => {
          console.log("[GNX Voice] Neural TTS playback completed (Web Audio API).");
          currentAudioSourceRef.current = null;
          setTimeout(() => {
            isSpeakingRef.current = false;
            setSpeakingIndex(null);
          }, 350);
        };

        source.start(0);
        console.log("[GNX Voice] Neural TTS playing via Web Audio API successfully.");
        return;
      } catch (audioCtxErr) {
        console.warn("[GNX Voice] Web Audio API decode/play failed, trying HTML5 Audio element:", audioCtxErr);
      }

      // Fallback to Blob HTML5 Audio
      const mimeType = data.mimeType || "audio/wav";
      const blob = new Blob([bytes], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);

      const audio = new Audio(blobUrl);
      currentAudioRef.current = audio;

      audio.onended = () => {
        console.log("[GNX Voice] Neural TTS playback completed (HTML5 Audio).");
        currentAudioRef.current = null;
        URL.revokeObjectURL(blobUrl);
        setTimeout(() => {
          isSpeakingRef.current = false;
          setSpeakingIndex(null);
        }, 350);
      };

      audio.onerror = (e) => {
        console.warn("[GNX Voice] Audio element playback error, falling back to Web Speech API:", e);
        URL.revokeObjectURL(blobUrl);
        currentAudioRef.current = null;
        speakFallback();
      };

      await audio.play();
      console.log("[GNX Voice] Neural TTS playing via HTML5 Audio element successfully.");
    } catch (err) {
      console.error("[GNX Voice] TTS generation/playback error:", err);
      speakFallback();
    }
  };

  // Simple speech-to-text for the main input bar (Mic button)
  const toggleTextInputMic = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isTextInputListening) {
      if (textInputRecognitionRef.current) {
        try {
          textInputRecognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
      setIsTextInputListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      const baseText = input.trim();

      recognition.onresult = (event: any) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          const combined = baseText ? `${baseText} ${transcript}` : transcript;
          setInput(combined);
          if (inputRef.current) {
            inputRef.current.style.height = "auto";
            inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 250)}px`;
          }
        }
      };

      recognition.onerror = (err: any) => {
        const errorType = err?.error || err;
        if (errorType !== "no-speech" && errorType !== "aborted") {
          console.warn("Text input speech recognition notice:", errorType);
        }
        setIsTextInputListening(false);
      };

      recognition.onend = () => {
        setIsTextInputListening(false);
      };

      recognition.start();
      textInputRecognitionRef.current = recognition;
      setIsTextInputListening(true);
    } catch (e) {
      console.error(e);
      setIsTextInputListening(false);
    }
  };

  // Full-Screen Voice Call Mode handlers
  const startVoiceCallMode = () => {
    playVoiceStartChime();
    setIsVoiceChatMinimized(false);
    setIsVoiceModeActive(true);
    isVoiceModeActiveRef.current = true;
    stopActiveSpeech();
    setVoiceInputText("");
    voiceInputTextRef.current = "";
    startVoiceCallRecognition();
  };

  const stopVoiceCallMode = () => {
    playVoiceEndChime();
    setIsVoiceModeActive(false);
    isVoiceModeActiveRef.current = false;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (voiceCallRecognitionRef.current) {
      try {
        voiceCallRecognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
    }
    setIsVoiceModeListening(false);
    stopActiveSpeech();
  };

  const startVoiceCallRecognition = () => {
    if (
      !isVoiceModeActiveRef.current ||
      isSpeakingRef.current ||
      speakingIndex !== null ||
      isLoading ||
      ("speechSynthesis" in window && window.speechSynthesis.speaking)
    ) {
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (voiceCallRecognitionRef.current) {
      try {
        voiceCallRecognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        // STRICT GUARD: Discard mic input while Zen is speaking or responding
        if (
          isSpeakingRef.current ||
          speakingIndex !== null ||
          isLoading ||
          ("speechSynthesis" in window && window.speechSynthesis.speaking)
        ) {
          console.log("[GNX Voice] Discarding mic transcript while Zen is speaking or responding.");
          setVoiceInputText("");
          voiceInputTextRef.current = "";
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          return;
        }

        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setVoiceInputText(transcript);
          voiceInputTextRef.current = transcript;

          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
          // Balanced silence detection (850ms) to allow natural mid-sentence pauses without cutting off user speech
          silenceTimerRef.current = setTimeout(() => {
            if (isVoiceModeActiveRef.current && voiceCallRecognitionRef.current) {
              try {
                voiceCallRecognitionRef.current.stop();
              } catch (e) {
                // ignore
              }
            }
          }, 850);
        }
      };

      recognition.onerror = (err: any) => {
        const errorType = err?.error || err;
        if (errorType !== "no-speech" && errorType !== "aborted") {
          console.warn("Voice call recognition notice:", errorType);
        }
        setIsVoiceModeListening(false);
      };

      recognition.onend = () => {
        setIsVoiceModeListening(false);
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }

        // STRICT GUARD: Do NOT submit transcript if Zen is speaking or generating
        if (
          isSpeakingRef.current ||
          speakingIndex !== null ||
          isLoading ||
          ("speechSynthesis" in window && window.speechSynthesis.speaking)
        ) {
          console.log("[GNX Voice] Speech recognition ended while Zen was speaking or generating. Discarding transcript.");
          setVoiceInputText("");
          voiceInputTextRef.current = "";
          return;
        }

        // Auto submit user's spoken input
        if (isVoiceModeActiveRef.current && voiceInputTextRef.current.trim()) {
          const textToSend = voiceInputTextRef.current.trim();
          setVoiceInputText("");
          voiceInputTextRef.current = "";
          handleSubmit(undefined, textToSend);
        }
      };

      recognition.start();
      voiceCallRecognitionRef.current = recognition;
      setIsVoiceModeListening(true);
    } catch (e) {
      console.error(e);
      setIsVoiceModeListening(false);
    }
  };

  const toggleVoiceCallMute = () => {
    if (isVoiceModeListening) {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (voiceCallRecognitionRef.current) {
        try {
          voiceCallRecognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
      setIsVoiceModeListening(false);
    } else {
      startVoiceCallRecognition();
    }
  };

  // Auto resume listening in Voice Call Mode after AI finishes speaking
  useEffect(() => {
    if (
      isVoiceModeActive &&
      !isLoading &&
      speakingIndex === null &&
      !isVoiceModeListening &&
      !isSpeakingRef.current &&
      !("speechSynthesis" in window && window.speechSynthesis.speaking)
    ) {
      const timer = setTimeout(() => {
        if (
          isVoiceModeActiveRef.current &&
          !isVoiceModeListeningRef.current &&
          speakingIndex === null &&
          !isSpeakingRef.current &&
          !("speechSynthesis" in window && window.speechSynthesis.speaking)
        ) {
          startVoiceCallRecognition();
        }
      }, 400); // 400ms echo clearance buffer
      return () => clearTimeout(timer);
    }
  }, [isVoiceModeActive, isLoading, speakingIndex, isVoiceModeListening]);

  // AbortController ref to allow stopping generated responses
  const abortControllerRef = useRef<AbortController | null>(null);
  const typewriterIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Live thinking timer state & expanded thoughts toggle state
  const [thinkingSeconds, setThinkingSeconds] = useState<number>(0);
  const thinkingStartTimeRef = useRef<number | null>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<{ [key: number]: boolean }>({});

  // Live AI planning / status indicator states
  const [livePhase, setLivePhase] = useState<"thinking" | "searching" | "working">("thinking");
  const [liveThoughtTime, setLiveThoughtTime] = useState<number>(0);
  const [liveThoughtDone, setLiveThoughtDone] = useState<boolean>(false);

  const [liveIsSearching, setLiveIsSearching] = useState<boolean>(false);
  const [liveSearchDone, setLiveSearchDone] = useState<boolean>(false);
  const [liveSearchSources, setLiveSearchSources] = useState<WebSource[]>([]);

  const [liveWorkingText, setLiveWorkingText] = useState<string>("Working...");
  const [liveModeTag, setLiveModeTag] = useState<"chat" | "webdev" | "bugfix">("chat");

  const [expandedSources, setExpandedSources] = useState<{ [key: number]: boolean }>({});

  const toggleThought = (index: number) => {
    setExpandedThoughts((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const toggleSources = (index: number) => {
    setExpandedSources((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const renderMessageStatusHeader = (msg: Message, index: number, isCompact: boolean = false) => {
    if (msg.role !== "model") return null;

    const hasThought = Boolean(msg.thoughtProcess || msg.thinkingDuration);
    const hasSources = Boolean(msg.searchSources && msg.searchSources.length > 0);
    const hasMode = Boolean(msg.modeTag && (msg.modeTag === "webdev" || msg.modeTag === "bugfix" || msg.modeTag === "create"));

    if (!hasThought && !hasSources && !hasMode) return null;

    return (
      <div className="w-full mb-2 flex flex-col items-start">
        <div className="flex flex-wrap items-center gap-2">
          {/* Thought Process Badge */}
          {hasThought && (
            <button
              type="button"
              onClick={() => toggleThought(index)}
              className={`inline-flex items-center space-x-1.5 bg-zinc-100/90 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700/80 border border-zinc-200/80 dark:border-zinc-700/80 px-2.5 py-1 rounded-full ${
                isCompact ? "text-[11px]" : "text-xs sm:text-sm"
              } font-semibold text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer select-none`}
            >
              <Brain className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span>
                Thought for {msg.thinkingDuration ?? 3} {msg.thinkingDuration === 1 ? "second" : "seconds"}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                  expandedThoughts[index] ? "rotate-180" : ""
                }`}
              />
            </button>
          )}

          {/* Search Sources Badge */}
          {hasSources && (
            <button
              type="button"
              onClick={() => toggleSources(index)}
              className={`inline-flex items-center space-x-1.5 bg-zinc-100/90 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700/80 border border-zinc-200/80 dark:border-zinc-700/80 px-2.5 py-1 rounded-full ${
                isCompact ? "text-[11px]" : "text-xs sm:text-sm"
              } font-semibold text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer select-none`}
            >
              <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>
                Searched {msg.searchSources!.length} {msg.searchSources!.length === 1 ? "site" : "sites"}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                  expandedSources[index] ? "rotate-180" : ""
                }`}
              />
            </button>
          )}

          {/* Mode Completed Badge */}
          {msg.modeTag === "webdev" && (
            <div className={`inline-flex items-center space-x-1.5 bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 rounded-full ${
              isCompact ? "text-[11px]" : "text-xs sm:text-sm"
            } font-semibold text-emerald-700 dark:text-emerald-300`}>
              <Code2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Built in {msg.buildDuration ?? msg.thinkingDuration ?? 10}s</span>
            </div>
          )}

          {msg.modeTag === "bugfix" && (
            <div className={`inline-flex items-center space-x-1.5 bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 px-2.5 py-1 rounded-full ${
              isCompact ? "text-[11px]" : "text-xs sm:text-sm"
            } font-semibold text-blue-700 dark:text-blue-300`}>
              <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>Fixed in {msg.buildDuration ?? msg.thinkingDuration ?? 6}s</span>
            </div>
          )}

          {msg.modeTag === "create" && (
            <div className={`inline-flex items-center space-x-1.5 bg-purple-50/90 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 px-2.5 py-1 rounded-full ${
              isCompact ? "text-[11px]" : "text-xs sm:text-sm"
            } font-semibold text-purple-700 dark:text-purple-300`}>
              <Wand2 className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <span>Created in {msg.buildDuration ?? 4}s</span>
            </div>
          )}
        </div>

        {/* Expandable Thought Panel */}
        <AnimatePresence>
          {expandedThoughts[index] && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full overflow-hidden mt-2"
            >
              <div className="ml-0.5 pl-3 border-l-2 border-indigo-500/40 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 font-sans leading-relaxed whitespace-pre-wrap select-text">
                {msg.thoughtProcess || "Analyzed request and context."}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expandable Sources Panel */}
        <AnimatePresence>
          {expandedSources[index] && msg.searchSources && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full overflow-hidden mt-2"
            >
              <div className="ml-0.5 pl-3 border-l-2 border-emerald-500/40 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 space-y-1.5">
                <p className="font-semibold text-zinc-700 dark:text-zinc-300">Sources consulted:</p>
                <div className="flex flex-col space-y-1">
                  {msg.searchSources.map((src, sIdx) => (
                    <a
                      key={sIdx}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-2 text-emerald-600 dark:text-emerald-400 hover:underline truncate max-w-lg"
                    >
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{src.title || src.url}</span>
                      <ExternalLink className="w-3 h-3 opacity-70 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderLiveStatusIndicator = (isCompact: boolean = false) => {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex flex-wrap items-center gap-2 my-2 ${
          isCompact ? "text-xs" : "text-sm sm:text-base"
        } font-medium select-none`}
      >
        {/* Completed Thinking Phase Badge */}
        {liveThoughtDone && (
          <div className="inline-flex items-center space-x-1.5 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/80 px-2.5 py-1 rounded-full text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            <Brain className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>Thought for {liveThoughtTime || 3}s</span>
          </div>
        )}

        {/* Completed Search Phase Badge */}
        {liveSearchDone && (
          <div className="inline-flex items-center space-x-1.5 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/80 px-2.5 py-1 rounded-full text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>
              {liveSearchSources.length > 0
                ? `Searched ${liveSearchSources.length} ${liveSearchSources.length === 1 ? "site" : "sites"}`
                : "Searched the web"}
            </span>
          </div>
        )}

        {/* Active Shimmer Status for Current Phase */}
        <div className="inline-flex items-center space-x-2">
          <span className="text-zinc-600 dark:text-zinc-300 font-semibold animate-pulse tracking-tight">
            {livePhase === "thinking" && `Thinking... (${thinkingSeconds}s)`}
            {livePhase === "searching" && "Searching the web..."}
            {livePhase === "working" && liveWorkingText}
          </span>
        </div>
      </motion.div>
    );
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isLoading) {
      if (!thinkingStartTimeRef.current) {
        thinkingStartTimeRef.current = Date.now();
      }
      setThinkingSeconds(1);
      interval = setInterval(() => {
        if (thinkingStartTimeRef.current) {
          const elapsed = Math.max(1, Math.floor((Date.now() - thinkingStartTimeRef.current) / 1000));
          setThinkingSeconds(elapsed);
        }
      }, 1000);
    } else {
      setThinkingSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading]);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }
    setIsLoading(false);
  };
  // System Theme Listener (Light/Dark based on user's device settings)
  const [systemTheme, setSystemTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };

    setSystemTheme(mediaQuery.matches ? "dark" : "light");

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    } else {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  useEffect(() => {
    if (systemTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [systemTheme]);

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem("zen_is_logged_in") === "true";
  });
  const [userName, setUserName] = useState<string>(() => {
    return localStorage.getItem("zen_user_name") || "";
  });
  const [userEmail, setUserEmail] = useState<string>(() => {
    return localStorage.getItem("zen_user_email") || "";
  });

  // Fetch the server-owned subscription record and handle a Lemon Squeezy return.
  useEffect(() => {
    let cancelled = false;

    const refreshSubscription = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const userId = userEmail || "zen_user_1";
        const response = await fetch(`/api/user-subscription?userId=${encodeURIComponent(userId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && data?.plan) setSubscription(data);
      } catch (err) {
        console.warn("Failed to fetch subscription:", err);
      }
    };

    const params = new URLSearchParams(window.location.search);
    const returnedFromCheckout = params.get("lemon_success") === "1";
    if (returnedFromCheckout) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    void refreshSubscription();

    return () => {
      cancelled = true;
    };
  }, [userEmail]);

  // Saved Chat Sessions for logged-in users
  const [savedChats, setSavedChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [currentChatTitle, setCurrentChatTitle] = useState<string>("");
  const [isHeaderTitleEditing, setIsHeaderTitleEditing] = useState<boolean>(false);
  const [headerEditingTitle, setHeaderEditingTitle] = useState<string>("");
  const [isPrivateChat, setIsPrivateChat] = useState<boolean>(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [bannerType, setBannerType] = useState<"glitch" | "info">("glitch");
  const glitchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const bannerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");
  const [activeMenuChatId, setActiveMenuChatId] = useState<string | null>(null);
  const [isShareCopied, setIsShareCopied] = useState<boolean>(false);

  // Web Dev Mode States
  const [isWebDevMode, setIsWebDevMode] = useState<boolean>(false);
  const [isCreateMediaMode, setIsCreateMediaMode] = useState<boolean>(false);
  const [viewportMode, setViewportMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewIframeKey, setPreviewIframeKey] = useState<number>(0);

  // Extract HTML code block from message history for Web Dev Live Preview
  const extractHtmlFromMessageHistory = (messages: Message[]): { html: string; isStreaming: boolean } | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "model") {
        const fullText = msg.parts.map((p) => p.text || "").join("");
        if (!fullText || !fullText.trim()) continue;

        let rawCode: string | null = null;
        let isClosed = false;

        // 1. Explicit ```html or ```htm or ```xml code blocks
        const fenceMatch = fullText.match(/```(?:html|htm|xml)\s*([\s\S]*?)(?:```|$)/i);
        if (fenceMatch && fenceMatch[1].trim()) {
          rawCode = fenceMatch[1].trim();
          isClosed = /```\s*$/m.test(fullText) || fullText.indexOf("```", fullText.indexOf(fenceMatch[0]) + 3) !== -1;
        } else {
          // 2. Generic ``` code block containing HTML tags
          const genericFence = fullText.match(/```\s*([\s\S]*?)(?:```|$)/i);
          if (genericFence && genericFence[1].trim()) {
            const content = genericFence[1].trim();
            if (/<(!DOCTYPE|html|head|body|div|main|section|script|style)/i.test(content)) {
              rawCode = content;
              isClosed = /```\s*$/m.test(fullText);
            }
          }
        }

        // 3. Fallback: Raw HTML directly without triple backticks
        if (!rawCode) {
          const doctypeMatch = fullText.match(/(<!DOCTYPE\s+html[\s\S]*?(?:<\/html>|$))/i);
          const htmlTagMatch = fullText.match(/(<html[\s\S]*?(?:<\/html>|$))/i);
          if (doctypeMatch && doctypeMatch[1].trim()) {
            rawCode = doctypeMatch[1].trim();
            isClosed = /<\/html>/i.test(rawCode);
          } else if (htmlTagMatch && htmlTagMatch[1].trim()) {
            rawCode = htmlTagMatch[1].trim();
            isClosed = /<\/html>/i.test(rawCode);
          }
        }

        if (rawCode) {
          let code = rawCode;

          // Wrap inside valid document if html/doctype structure is missing
          if (!code.toLowerCase().includes("<html") && !code.toLowerCase().includes("<!doctype")) {
            code = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <title>Zen Live Preview</title>
</head>
<body class="bg-zinc-50 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 min-h-screen font-sans">
${code}
</body>
</html>`;
          } else if (!code.includes("tailwindcss.com")) {
            if (code.includes("</head>")) {
              code = code.replace("</head>", `<script src="https://cdn.tailwindcss.com"></script>\n<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">\n</head>`);
            } else if (code.includes("<head>")) {
              code = code.replace("<head>", `<head>\n<script src="https://cdn.tailwindcss.com"></script>\n<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">`);
            }
          }

          // Inject Sandbox Isolation Guard Script
          const isolationScript = `
<script>
  (function() {
    // Prevent relative or broken links from navigating the iframe away from srcdoc
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      if (link) {
        const href = link.getAttribute('href');
        if (!href || href === '#' || href === '' || href.startsWith('javascript:')) {
          e.preventDefault();
        } else if (href.startsWith('#')) {
          e.preventDefault();
          try {
            const targetEl = document.querySelector(href);
            if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth' });
          } catch(err) {}
        } else if (href.startsWith('http://') || href.startsWith('https://')) {
          e.preventDefault();
          window.open(href, '_blank', 'noopener,noreferrer');
        } else {
          // Relative URLs (/feed, /home, etc.) -> prevent default navigation to parent origin
          e.preventDefault();
        }
      }
    }, true);

    // Prevent form submissions from reloading or posting to parent origin
    document.addEventListener('submit', function(e) {
      e.preventDefault();
    }, true);
  })();
</script>
`;

          if (code.includes("</head>")) {
            code = code.replace("</head>", `${isolationScript}\n</head>`);
          } else if (code.includes("<head>")) {
            code = code.replace("<head>", `<head>\n${isolationScript}`);
          } else {
            code = `${isolationScript}\n${code}`;
          }

          return { html: code, isStreaming: !isClosed };
        }
      }
    }
    return null;
  };

  // Helper to determine storage key for saved chats
  const getStorageKey = (email?: string | null) => {
    if (email && email.trim()) {
      return `zen_chats_${email.toLowerCase().trim()}`;
    }
    return `zen_chats_guest`;
  };

  // Build long-term memory context across all past chats and user context
  const buildUserMemoryContext = (): string => {
    const parts: string[] = [];

    const key = getStorageKey(userEmail);
    let allChats: ChatSession[] = savedChats;
    if (allChats.length === 0) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) allChats = parsed;
        }
      } catch (e) {
        console.warn(e);
      }
    }

    if (isLoggedIn && userEmail) {
      parts.push(`User Profile Information:\n- Account Email: ${userEmail}\n- Display Name: ${userName || "User"}`);
    }

    const pastSessions = allChats.filter((c) => c.messages && c.messages.length > 0 && c.id !== activeChatId);
    if (pastSessions.length > 0) {
      const formatted = pastSessions.slice(0, 10).map((chat, idx) => {
        const msgSummary = chat.messages
          .map((m) => {
            const textParts = m.parts.map((p) => p.text || "").join(" ").trim();
            const snippet = textParts.length > 600 ? textParts.slice(0, 600) + "..." : textParts;
            return `  [${m.role === "user" ? "User" : "GNX"}]: ${snippet}`;
          })
          .join("\n");
        return `--- Past Session #${idx + 1}: "${chat.title}" (Date: ${new Date(chat.updatedAt).toLocaleString()}) ---\n${msgSummary}`;
      });
      parts.push(`PAST CONVERSATIONS & CHAT HISTORY MEMORY (${pastSessions.length} previous chat session${pastSessions.length > 1 ? "s" : ""}):\n${formatted.join("\n\n")}`);
    }

    return parts.join("\n\n");
  };

  // Load saved chats whenever user state or email changes
  useEffect(() => {
    const key = getStorageKey(userEmail);
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setSavedChats(parsed);
          return;
        }
      } catch (e) {
        console.warn("Failed to parse saved chats from localStorage:", e);
      }
    }
    setSavedChats([]);
  }, [isLoggedIn, userEmail]);



  // Background title generation for new chats
  const generateTitleInBackground = async (firstQuery: string, chatId: string) => {
    try {
      const res = await fetch("/api/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: firstQuery }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.title && typeof data.title === "string" && data.title.trim()) {
          const cleanTitle = data.title.trim();
          setCurrentChatTitle(cleanTitle);
          setSavedChats((prev) => {
            const updated = prev.map((c) => (c.id === chatId ? { ...c, title: cleanTitle } : c));
            const key = getStorageKey(userEmail);
            try {
              localStorage.setItem(key, JSON.stringify(updated));
            } catch (e) {
              console.warn("Failed to persist generated title:", e);
            }
            return updated;
          });
        }
      }
    } catch (err) {
      console.warn("Background title generation failed:", err);
    }
  };

  // Sync current conversation history into saved chats
  useEffect(() => {
    if (history.length === 0 || isPrivateChat || isLoading) return;

    const key = getStorageKey(userEmail);
    const firstUserMsg = history.find((m) => m.role === "user");
    const firstTextPart = firstUserMsg?.parts.find((p) => p.text !== undefined)?.text || "New Chat";
    const snippet = firstTextPart.trim().slice(0, 32) + (firstTextPart.trim().length > 32 ? "..." : "");

    let currentId = activeChatId;
    if (!currentId) {
      currentId = "chat_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      setActiveChatId(currentId);
    }

    setSavedChats((prev) => {
      const existingIndex = prev.findIndex((c) => c.id === currentId);
      let updated: ChatSession[];

      if (existingIndex !== -1) {
        const existing = prev[existingIndex];
        if (existing.messages === history && existing.title !== "New Chat") {
          return prev;
        }
        const updatedChat: ChatSession = {
          ...existing,
          title: currentChatTitle || (existing.title === "New Chat" ? snippet : existing.title),
          messages: history,
          updatedAt: Date.now(),
        };
        updated = [updatedChat, ...prev.filter((_, idx) => idx !== existingIndex)];
      } else {
        const newChat: ChatSession = {
          id: currentId,
          title: currentChatTitle || snippet || "New Chat",
          messages: history,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        updated = [newChat, ...prev];
      }

      try {
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (err) {
        console.warn("Error persisting chats to localStorage:", err);
      }

      return updated;
    });
  }, [history, userEmail, isPrivateChat, activeChatId, isLoading, currentChatTitle]);

  const createNewChat = () => {
    setIsPrivateChat(false);
    setActiveChatId(null);
    setCurrentChatTitle("");
    setIsHeaderTitleEditing(false);
    clearChat();
  };

  const saveHeaderRename = () => {
    const newTitle = headerEditingTitle.trim() || currentChatTitle || "Untitled Chat";
    setCurrentChatTitle(newTitle);
    setIsHeaderTitleEditing(false);
    if (activeChatId) {
      const key = getStorageKey(userEmail);
      const next = savedChats.map((c) => (c.id === activeChatId ? { ...c, title: newTitle } : c));
      setSavedChats(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch (err) {
        console.warn(err);
      }
    }
  };

  const togglePrivateMode = () => {
    if (glitchIntervalRef.current) {
      clearInterval(glitchIntervalRef.current);
      glitchIntervalRef.current = null;
    }
    if (bannerTimeoutRef.current) {
      clearTimeout(bannerTimeoutRef.current);
      bannerTimeoutRef.current = null;
    }

    if (!isPrivateChat) {
      setActiveChatId(null);
      clearChat();
      setIsPrivateChat(true);
      setBannerType("glitch");

      const targetText = "Private chat";
      const glitchChars = "!@#$%^&*()_+-=[]{}|;:,.<>?/0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

      let frame = 0;
      const totalFrames = 14; // ~490ms glitch animation

      glitchIntervalRef.current = setInterval(() => {
        frame++;
        const progress = frame / totalFrames;
        const revealedCount = Math.floor(targetText.length * progress);

        let scrambled = "";
        for (let i = 0; i < targetText.length; i++) {
          const char = targetText[i];
          if (char === " ") {
            scrambled += " ";
          } else if (i < revealedCount) {
            scrambled += char;
          } else {
            scrambled += glitchChars[Math.floor(Math.random() * glitchChars.length)];
          }
        }

        setBannerMessage(scrambled);

        if (frame >= totalFrames) {
          if (glitchIntervalRef.current) {
            clearInterval(glitchIntervalRef.current);
            glitchIntervalRef.current = null;
          }
          setBannerMessage(targetText);
          // Persistent while private mode is active (no auto-clear timeout)
        }
      }, 35);
    } else {
      setIsPrivateChat(false);
      setActiveChatId(null);
      clearChat();
      setBannerType("info");
      setBannerMessage("Private chat ended");

      bannerTimeoutRef.current = setTimeout(() => {
        setBannerMessage(null);
      }, 2500);
    }
  };

  const handleSelectChat = (session: ChatSession) => {
    setIsPrivateChat(false);
    setActiveChatId(session.id);
    setCurrentChatTitle(session.title || "Conversation");
    setIsHeaderTitleEditing(false);
    setHistory(session.messages);
    setAttachedFiles([]);
    setError(null);
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    setIsMenuOpen(false);
  };

  const handleDeleteChat = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = getStorageKey(userEmail);
    const next = savedChats.filter((c) => c.id !== chatId);
    setSavedChats(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch (err) {
      console.warn(err);
    }
    if (activeChatId === chatId) {
      createNewChat();
    }
  };

  const startRenamingChat = (chat: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditingTitle(chat.title);
  };

  const saveRenameChat = (chatId: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const key = getStorageKey(userEmail);
    const newTitle = editingTitle.trim() || "Untitled Chat";
    if (chatId === activeChatId) {
      setCurrentChatTitle(newTitle);
    }
    const next = savedChats.map((c) => (c.id === chatId ? { ...c, title: newTitle } : c));
    setSavedChats(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch (err) {
      console.warn(err);
    }
    setEditingChatId(null);
  };

  const handleTogglePinChat = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = getStorageKey(userEmail);
    const next = savedChats.map((c) => (c.id === chatId ? { ...c, pinned: !c.pinned } : c));
    setSavedChats(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch (err) {
      console.warn(err);
    }
    setActiveMenuChatId(null);
  };

  const renderChatItem = (chat: ChatSession) => {
    const isActive = chat.id === activeChatId;
    const isEditing = chat.id === editingChatId;
    const isChatItemMenuOpen = activeMenuChatId === chat.id;

    return (
      <div
        key={chat.id}
        onClick={() => handleSelectChat(chat)}
        className={`w-full group relative p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between text-xs border ${
          isActive
            ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 font-semibold shadow-2xs"
            : "bg-transparent hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 border-transparent"
        }`}
      >
        <div className="flex items-center space-x-2.5 min-w-0 flex-1 pr-1">
          {chat.pinned ? (
            <Pin className="w-3.5 h-3.5 shrink-0 text-amber-500 fill-amber-500" title="Pinned chat" />
          ) : (
            <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-400"}`} />
          )}

          {isEditing ? (
            <form
              onSubmit={(e) => saveRenameChat(chat.id, e)}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 flex items-center space-x-1"
            >
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                autoFocus
                className="w-full bg-white dark:bg-zinc-900 px-2 py-0.5 text-xs text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 rounded outline-none font-normal"
              />
              <button
                type="submit"
                className="p-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer"
                title="Save title"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <span className={`truncate flex-1 font-medium ${isActive ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"}`}>{chat.title}</span>
          )}
        </div>

        {!isEditing && (
          <div className="relative shrink-0 flex items-center">
            {/* 3-dot button (...) - ChatGPT Style */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenuChatId(isChatItemMenuOpen ? null : chat.id);
              }}
              className={`p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/80 dark:hover:bg-zinc-700 cursor-pointer transition-all ${
                isChatItemMenuOpen
                  ? "opacity-100 bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white"
                  : "opacity-80 md:opacity-0 md:group-hover:opacity-100"
              }`}
              title="Chat Options"
            >
              <MoreHorizontal className="w-4 h-4 stroke-[2]" />
            </button>

            {isChatItemMenuOpen && (
              <>
                {/* Backdrop to close menu */}
                <div
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenuChatId(null);
                  }}
                />

                {/* Dropdown Menu - ChatGPT Style */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-8 z-50 w-44 bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 p-1.5 text-xs text-zinc-800 dark:text-zinc-200 font-normal animate-in fade-in zoom-in-95 duration-100"
                >
                  <button
                    onClick={(e) => {
                      setActiveMenuChatId(null);
                      startRenamingChat(chat, e);
                    }}
                    className="w-full px-3 py-2 text-left rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center space-x-2.5 font-medium cursor-pointer text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                    <span>Rename</span>
                  </button>

                  <button
                    onClick={(e) => handleTogglePinChat(chat.id, e)}
                    className="w-full px-3 py-2 text-left rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center space-x-2.5 font-medium cursor-pointer text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
                  >
                    <Pin className={`w-3.5 h-3.5 ${chat.pinned ? "text-amber-500 fill-amber-500" : "text-zinc-500 dark:text-zinc-400"}`} />
                    <span>{chat.pinned ? "Unpin" : "Pin to Top"}</span>
                  </button>

                  <div className="my-1 border-t border-zinc-100 dark:border-zinc-700" />

                  <button
                    onClick={(e) => {
                      setActiveMenuChatId(null);
                      handleDeleteChat(chat.id, e);
                    }}
                    className="w-full px-3 py-2 text-left rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center space-x-2.5 font-medium cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // Firebase Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const name = user.displayName || user.email?.split("@")[0] || "Google User";
        const email = user.email || "";
        setUserName(name);
        setUserEmail(email);
        setIsLoggedIn(true);
        setShowLoginNotice(false);
        localStorage.setItem("zen_is_logged_in", "true");
        localStorage.setItem("zen_user_name", name);
        localStorage.setItem("zen_user_email", email);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (name: string, email: string) => {
    setUserName(name);
    setUserEmail(email);
    setIsLoggedIn(true);
    setShowLoginNotice(false);
    localStorage.setItem("zen_is_logged_in", "true");
    localStorage.setItem("zen_user_name", name);
    localStorage.setItem("zen_user_email", email);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn("Signout error:", e);
    }
    setIsLoggedIn(false);
    setUserName("");
    setUserEmail("");
    setSavedChats([]);
    setActiveChatId(null);
    clearChat();
    localStorage.removeItem("zen_is_logged_in");
    localStorage.removeItem("zen_user_name");
    localStorage.removeItem("zen_user_email");
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: AttachedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Limit file size to 10MB to avoid oversized requests
      if (file.size > 10 * 1024 * 1024) {
        alert(`File "${file.name}" is too large. Max size is 10MB.`);
        continue;
      }

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(",")[1];
          resolve(base64Data);
        };
      });

      reader.readAsDataURL(file);
      const base64 = await base64Promise;

      newFiles.push({
        id: Math.random().toString(36).substring(7),
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        base64: base64,
        size: file.size,
      });
    }

    setAttachedFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Auto scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, isLoading]);

  // Handle textarea height adjustment based on content
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 250)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleGenerateMediaRequest = async (
    prompt: string,
    mediaType: "image" | "video",
    signal: AbortSignal,
    existingImageUrl?: string,
    isRegeneration?: boolean
  ) => {
    setLiveModeTag("create" as any);
    setLivePhase("working");
    setLiveThoughtDone(true);
    setLiveThoughtTime(1);
    setLiveWorkingText(mediaType === "video" ? "Rendering your video..." : "Creating your image...");

    const startTime = Date.now();

    // Create or update model placeholder message
    if (!isRegeneration) {
      setHistory((prev) => [
        ...prev,
        {
          role: "model",
          parts: [{ text: "" }],
          modeTag: "create",
          mediaType,
          mediaPrompt: prompt,
          buildDuration: 0,
        },
      ]);
    } else {
      setHistory((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === "model") {
          updated[lastIdx] = {
            ...updated[lastIdx],
            parts: [{ text: "" }],
            modeTag: "create",
            mediaType,
            mediaPrompt: prompt,
            mediaUrl: undefined,
            mediaError: undefined,
            buildDuration: 0,
          };
        }
        return updated;
      });
    }

    try {
      const response = await fetch("/api/generate-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mediaType }),
        signal,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to generate media.");
      }

      const data = await response.json();
      let finalMediaUrl = data.url;

      if (mediaType === "video") {
        setLiveWorkingText("Synthesizing motion video clip...");
        finalMediaUrl = await generateVideoWebM(prompt, existingImageUrl || data.url);
      }

      const durationSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));

      setHistory((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === "model") {
          updated[lastIdx] = {
            ...updated[lastIdx],
            parts: [{ text: data.caption || `Generated ${mediaType} for "${prompt}"` }],
            modeTag: "create",
            mediaType,
            mediaUrl: finalMediaUrl,
            mediaPrompt: prompt,
            mediaError: false,
            buildDuration: durationSeconds,
          };
        }
        return updated;
      });
    } catch (err: any) {
      if (err?.name === "AbortError" || err?.message?.includes("aborted")) {
        return;
      }
      console.error("Media generation error:", err);
      setHistory((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === "model") {
          updated[lastIdx] = {
            ...updated[lastIdx],
            parts: [{ text: `Failed to generate ${mediaType}: ${err?.message || "Unknown error"}. Please check your connection or prompt and try again.` }],
            modeTag: "create",
            mediaError: true,
            mediaType,
            mediaPrompt: prompt,
          };
        }
        return updated;
      });
    }
  };

  const handleRegenerateMedia = (prompt: string, mediaType: "image" | "video") => {
    if (isLoading) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    handleGenerateMediaRequest(prompt, mediaType, controller.signal, undefined, true).finally(() => {
      setIsLoading(false);
      abortControllerRef.current = null;
    });
  };

  const handleAnimateImageToVideo = (prompt: string, imageUrl: string) => {
    if (isLoading) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    handleGenerateMediaRequest(prompt, "video", controller.signal, imageUrl).finally(() => {
      setIsLoading(false);
      abortControllerRef.current = null;
    });
  };

  const handleRefinePrompt = (refinedPrompt: string, targetType: "image" | "video") => {
    handleSubmit(undefined, refinedPrompt);
  };

  const handleSubmit = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const query = (customText !== undefined ? customText : input).trim();
    if (!query && attachedFiles.length === 0) return;
    if (isLoading) return;

    // Reset input height, value, and attachments
    setInput("");
    const currentAttachedFiles = [...attachedFiles];
    setAttachedFiles([]);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    // Build user message parts
    const currentParts: MessagePart[] = [];
    if (query) {
      currentParts.push({ text: query });
    }

    currentAttachedFiles.forEach((file) => {
      currentParts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: file.base64,
        },
      });
    });

    const userMessage: Message = {
      role: "user",
      parts: currentParts,
    };

    // Notify user to login if not signed in when sending first message
    if (!isLoggedIn && history.length === 0) {
      setShowLoginNotice(true);
    }

    // Auto-generate title for new conversation
    if (history.length === 0) {
      let thisChatId = activeChatId;
      if (!thisChatId) {
        thisChatId = "chat_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
        setActiveChatId(thisChatId);
      }
      const rawPrompt = (query || "").trim();
      const lower = rawPrompt.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      const greetings = ["hi", "hello", "hey", "sup", "yo", "good morning", "good afternoon", "good evening", "howdy", "hiya", "whats up", "what is up", "how are you", "greetings", "hey there", "hi there"];
      let initialTitle = "New Conversation";
      if (greetings.includes(lower)) {
        initialTitle = "Casual Greeting";
      } else if (rawPrompt) {
        const words = rawPrompt.split(/\s+/).slice(0, 5).join(" ");
        initialTitle = words.length > 32 ? words.slice(0, 32) + "..." : words;
      }
      setCurrentChatTitle(initialTitle);

      if (query) {
        void generateTitleInBackground(query, thisChatId);
      }
    }

    setHistory((prev) => [...prev, userMessage]);
    thinkingStartTimeRef.current = Date.now();
    setIsLoading(true);
    setError(null);

    // Check for image/video creation intent
    const mediaIntent = detectMediaIntent(query, isCreateMediaMode);
    if (mediaIntent.isMedia) {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        await handleGenerateMediaRequest(mediaIntent.prompt, mediaIntent.mediaType, controller.signal);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("Media generation error:", err);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
      return;
    }

    const isBugFix = /fix|bug|error|issue|debug|repair|broken|syntax|crash/i.test(query);
    const currentModeTag: "chat" | "webdev" | "bugfix" = isWebDevMode ? "webdev" : isBugFix ? "bugfix" : "chat";

    setLiveModeTag(currentModeTag);
    setLivePhase("thinking");
    setLiveThoughtDone(false);
    setLiveThoughtTime(0);
    setLiveIsSearching(false);
    setLiveSearchDone(false);
    setLiveSearchSources([]);

    if (currentModeTag === "webdev") {
      setLiveWorkingText("Writing the layout...");
    } else if (currentModeTag === "bugfix") {
      setLiveWorkingText("Reading your code...");
    } else {
      setLiveWorkingText("Working...");
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const modelMsgIndex = history.length + 1;
      await executeChatStreamRequest(query, currentParts, history, modelMsgIndex, controller.signal, currentModeTag);
    } catch (err: any) {
      if (err?.name === "AbortError" || err?.message?.includes("aborted")) {
        console.log("Response generation cancelled by user.");
        return;
      }
      console.error("Chat generation error:", err);
      setError(err?.message || "Something went wrong during generation. Please click Retry Request below.");
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const executeChatStreamRequest = async (
    queryText: string,
    partsPayload: any[],
    historyPayload: Message[],
    modelMsgIndex: number,
    signal: AbortSignal,
    currentModeTag: "chat" | "webdev" | "bugfix" = "chat"
  ) => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify({
        message: queryText,
        parts: partsPayload,
        history: historyPayload,
        modelId: selectedModelId,
        userMemoryContext: buildUserMemoryContext(),
        isPrivate: isPrivateChat,
        noTraining: isPrivateChat,
        isWebDevMode: isWebDevMode,
        isVoiceCall: isVoiceModeActiveRef.current,
      }),
    });

    if (!response.ok) {
      let errorMsg = `Server error (${response.status})`;
      try {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } else {
          const text = await response.text();
          if (text && text.length < 150 && !text.includes("<html")) {
            errorMsg = text;
          } else if (response.status === 404) {
            errorMsg = "API route /api/chat not found (404).";
          }
        }
      } catch {
        // fallback
      }
      throw new Error(errorMsg);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response stream reader is not available.");
    }

    const decoder = new TextDecoder("utf-8");
    let lastChunkTime = Date.now();
    let accumulatedText = "";
    let isDone = false;
    let receivedAnyChunk = false;

    // Initially add empty model placeholder message
    const placeholderMsg: Message = {
      role: "model",
      parts: [{ text: "" }],
      thinkingDuration: 1,
      thoughtProcess: "Generating response...",
    };
    setHistory((prev) => [...prev, placeholderMsg]);

    // 18-second stall detector: if no new tokens arrive for 18 seconds
    const stallChecker = setInterval(() => {
      if (!isDone && Date.now() - lastChunkTime > 18000) {
        console.warn("Generation stream stalled: No new tokens for 18s.");
        clearInterval(stallChecker);
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        setIsLoading(false);
        setError("Generation stalled (no response for 18s). Please click Retry Request below.");
      }
    }, 2000);

    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lastChunkTime = Date.now();
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          let parsed: any = null;
          try {
            parsed = JSON.parse(trimmed.slice(6));
          } catch {
            continue;
          }

          if (parsed.type === "ping") {
            lastChunkTime = Date.now();
            continue;
          }

          if (parsed.type === "reset") {
            accumulatedText = "";
            setHistory((prev) => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              if (lastIdx >= 0 && updated[lastIdx].role === "model") {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  parts: [{ text: "" }],
                };
              }
              return updated;
            });
            continue;
          }

          if (parsed.type === "search_start") {
            setLiveThoughtTime((prev) => prev || Math.max(1, Math.round((Date.now() - (thinkingStartTimeRef.current || Date.now())) / 1000)));
            setLiveThoughtDone(true);
            setLivePhase("searching");
            setLiveIsSearching(true);
            continue;
          }

          if (parsed.type === "search_results") {
            if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
              setLiveSearchSources(parsed.sources);
              setLiveSearchDone(true);
            }
            continue;
          }

          if (parsed.type === "chunk" && parsed.text) {
            receivedAnyChunk = true;
            accumulatedText += parsed.text;
            const currentText = accumulatedText;

            const hasThink = /<think>/i.test(accumulatedText);
            const hasClosedThink = /<\/think>/i.test(accumulatedText);

            if (hasClosedThink || (!hasThink && accumulatedText.trim().length > 0)) {
              setLiveThoughtTime((prev) => prev || Math.max(1, Math.round((Date.now() - (thinkingStartTimeRef.current || Date.now())) / 1000)));
              setLiveThoughtDone(true);

              if (liveIsSearching) {
                setLiveSearchDone(true);
              }

              setLivePhase("working");
            }

            // Dynamic working phase label rotation
            if (currentModeTag === "webdev") {
              if (/```html|<!DOCTYPE|<html/i.test(accumulatedText)) {
                if (/<script|onclick|addEventListener|useState|function/i.test(accumulatedText)) {
                  setLiveWorkingText("Adding functionality...");
                } else if (/class=|tailwind|flex|grid|bg-/i.test(accumulatedText)) {
                  setLiveWorkingText("Styling components...");
                } else {
                  setLiveWorkingText("Writing the layout...");
                }
              }
              if (accumulatedText.length > 1500 || /<\/html>/i.test(accumulatedText)) {
                setLiveWorkingText("Polishing interface...");
              }
            } else if (currentModeTag === "bugfix") {
              if (accumulatedText.length < 250) {
                setLiveWorkingText("Reading your code...");
              } else if (accumulatedText.length < 650) {
                setLiveWorkingText("Pinpointing the issue...");
              } else {
                setLiveWorkingText("Applying the fix...");
              }
            } else {
              setLiveWorkingText("Writing response...");
            }

            setHistory((prev) => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              if (lastIdx >= 0 && updated[lastIdx].role === "model") {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  parts: [{ text: currentText }],
                };
              }
              return updated;
            });
          }

          if (parsed.type === "done") {
            isDone = true;
            const fullText = parsed.cleanText || parsed.fullText || accumulatedText;
            const durationSeconds = thinkingStartTimeRef.current
              ? Math.max(1, Math.round((Date.now() - thinkingStartTimeRef.current) / 1000))
              : 3;

            let thoughtProcess = parsed.thoughtProcess || "";
            if (!thoughtProcess) {
              const closedThinkMatch = fullText.match(/<(think|thought)>([\s\S]*?)<\/\1>/i);
              if (closedThinkMatch) {
                thoughtProcess = closedThinkMatch[2].trim();
              } else {
                const openThinkMatch = fullText.match(/<(think|thought)>([\s\S]*)/i);
                if (openThinkMatch) {
                  thoughtProcess = openThinkMatch[2].trim();
                } else {
                  thoughtProcess = "Analyzed prompt and structured complete response.";
                }
              }
            }

            const cleanText = fullText.replace(/<\/?(think|thought)>([\s\S]*?)<\/\1>/gi, "").replace(/<\/?(think|thought)>/gi, "").trim();

            const finalSources = (parsed.searchSources && parsed.searchSources.length > 0) ? parsed.searchSources : liveSearchSources;

            setHistory((prev) => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              if (lastIdx >= 0 && updated[lastIdx].role === "model") {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  parts: [{ text: cleanText || fullText }],
                  thinkingDuration: liveThoughtTime || durationSeconds,
                  thoughtProcess: thoughtProcess,
                  searchSources: finalSources.length > 0 ? finalSources : undefined,
                  buildDuration: durationSeconds,
                  modeTag: currentModeTag,
                };
              }
              return updated;
            });

            if (isVoiceModeActiveRef.current && cleanText.trim()) {
              handleSpeak(modelMsgIndex, cleanText);
            }

            // Auto-refresh live preview iframe when generation completes
            setPreviewIframeKey((k) => k + 1);
          }

          if (parsed.type === "error") {
            throw new Error(parsed.error || "Generation error occurred.");
          }
        }
      }

      if (!isDone && !receivedAnyChunk) {
        throw new Error("Generation stream closed unexpectedly before receiving tokens. Please click Retry.");
      }
    } finally {
      clearInterval(stallChecker);
    }
  };

  const clearChat = () => {
    setHistory([]);
    setAttachedFiles([]);
    setError(null);
    setInput("");
    setThinkingSeconds(0);
    setExpandedThoughts({});
    thinkingStartTimeRef.current = null;
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const handleShare = async () => {
    if (history.length === 0) return;
    const formatted = history
      .map((m) => {
        const textParts = m.parts.map((p) => p.text || "").join("\n");
        return `${m.role === "user" ? "User" : "Zen"}:\n${textParts}`;
      })
      .join("\n\n");

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(formatted);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = formatted;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setIsShareCopied(true);
      setTimeout(() => setIsShareCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy conversation to clipboard", e);
    }
  };

  const handleRetryLastRequest = () => {
    const lastUserMsg = [...history].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      const textPart = lastUserMsg.parts.find((p) => p.text !== undefined)?.text || "";
      setHistory((prev) => {
        const lastIndex = prev.lastIndexOf(lastUserMsg);
        if (lastIndex !== -1) {
          return [...prev.slice(0, lastIndex), ...prev.slice(lastIndex + 1)];
        }
        return prev;
      });
      setError(null);
      handleSubmit(undefined, textPart);
    } else {
      setError(null);
    }
  };

  const handleRetry = async (modelIndex: number) => {
    if (isLoading) return;

    let userIndex = -1;
    for (let i = modelIndex - 1; i >= 0; i--) {
      if (history[i].role === "user") {
        userIndex = i;
        break;
      }
    }
    if (userIndex === -1) return;

    const userMsg = history[userIndex];
    const query = userMsg.parts.find((p) => p.text !== undefined)?.text || "";
    const currentParts = userMsg.parts;
    const historyBeforeUser = history.slice(0, userIndex);

    setHistory([...historyBeforeUser, userMsg]);

    thinkingStartTimeRef.current = Date.now();
    setIsLoading(true);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const modelMsgIndex = historyBeforeUser.length + 1;
      await executeChatStreamRequest(query, currentParts, historyBeforeUser, modelMsgIndex, controller.signal);
    } catch (err: any) {
      if (err?.name === "AbortError" || err?.message?.includes("aborted")) {
        console.log("Response generation cancelled by user.");
        return;
      }
      console.error(err);
      setError(err?.message || "Something went wrong during generation. Please click Retry Request below.");
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [feedbackState, setFeedbackState] = useState<{ [key: number]: "like" | "dislike" | null }>({});

  // Helper to parse markdown bold, lists, inline code, and VS Code styled code blocks
  const parseMessageText = (text: string, isUser = false) => {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith("```")) {
        const match = part.match(/```(\w*)\n?([\s\S]*?)```/);
        const language = match ? match[1] : "";
        const code = match ? match[2] : part.slice(3, -3);
        return <CodeBlock key={index} code={code} language={language} />;
      } else {
        const lines = part.split("\n");
        return lines.map((line, lineIdx) => {
          // Process inline code blocks `code`
          const processInlineFormatting = (content: string): React.ReactNode => {
            if (content.includes("`")) {
              const codeParts = content.split(/(`[^`]+`)/g);
              return codeParts.map((cp, cpIdx) => {
                if (cp.startsWith("`") && cp.endsWith("`") && cp.length > 2) {
                  return (
                    <code
                      key={cpIdx}
                      className={
                        isUser
                          ? "bg-zinc-800 text-amber-300 font-mono text-[0.88em] px-1.5 py-0.5 rounded border border-zinc-700/80 font-normal"
                          : "bg-[#1b1b1a] text-[#ce9178] font-mono text-[0.88em] px-1.5 py-0.5 rounded border border-zinc-700/60 font-normal"
                      }
                    >
                      {cp.slice(1, -1)}
                    </code>
                  );
                }
                return cp;
              });
            }
            return content;
          };

          let renderedLine: React.ReactNode = line;

          if (line.includes("**")) {
            const boldParts = line.split(/(\*\*.*?\*\*)/g);
            renderedLine = boldParts.map((bp, bpIdx) => {
              if (bp.startsWith("**") && bp.endsWith("**")) {
                return (
                  <strong key={bpIdx} className={isUser ? "font-semibold text-white" : "font-bold text-zinc-900 dark:text-zinc-100"}>
                    {processInlineFormatting(bp.slice(2, -2))}
                  </strong>
                );
              }
              return processInlineFormatting(bp);
            });
          } else {
            renderedLine = processInlineFormatting(line);
          }

          if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
            return (
              <li key={lineIdx} className={`ml-4 list-disc my-1 ${isUser ? "text-base sm:text-lg md:text-[1.125rem] text-white font-medium" : "text-base sm:text-lg md:text-[1.125rem] text-zinc-900 dark:text-zinc-100 font-medium"} leading-relaxed`}>
                {renderedLine}
              </li>
            );
          }

          return (
            <p key={lineIdx} className={`my-1 ${isUser ? "text-base sm:text-lg md:text-[1.125rem] text-white font-medium" : "text-base sm:text-lg md:text-[1.125rem] text-zinc-900 dark:text-zinc-100 font-medium"} leading-relaxed`}>
              {renderedLine}
            </p>
          );
        });
      }
    });
  };

  const renderMediaBlock = (msg: Message) => {
    // Only render media block if this message has a media URL, media error, or is in create mode
    if (!msg.mediaUrl && !msg.mediaError && msg.modeTag !== "create" && !msg.mediaType) {
      return null;
    }

    return (
      <MediaDisplayBlock
        mediaType={msg.mediaType || "image"}
        mediaUrl={msg.mediaUrl}
        mediaPrompt={msg.mediaPrompt}
        mediaError={msg.mediaError}
        isLoading={isLoading}
        onRegenerate={handleRegenerateMedia}
        onAnimateToVideo={handleAnimateImageToVideo}
        onRefinePrompt={handleRefinePrompt}
      />
    );
  };

  const renderMessageContent = (msg: Message) => {
    const isUser = msg.role === "user";
    return (
      <div className="w-full">
        {msg.parts.map((part, partIdx) => {
          if (part.inlineData) {
            const isImage = part.inlineData.mimeType.startsWith("image/");
            if (isImage) {
              return (
                <div key={partIdx} className="mb-2 last:mb-0 max-w-full">
                  <img
                    src={`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`}
                    alt="Attachment"
                    className="max-h-60 rounded-xl object-contain border border-zinc-700/60 bg-black/40"
                    referrerPolicy="no-referrer"
                  />
                </div>
              );
            } else {
              return (
                <div key={partIdx} className={`mb-2 last:mb-0 flex items-center ${isUser ? "bg-zinc-900 border-zinc-800 text-white" : "bg-zinc-50 border-zinc-200 text-zinc-800"} border rounded-xl p-2.5 max-w-[240px]`}>
                  <FileText className={`w-5 h-5 ${isUser ? "text-zinc-400" : "text-zinc-500"} mr-2 shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs ${isUser ? "text-white" : "text-zinc-800"} font-medium truncate`}>
                      Attachment
                    </p>
                    <p className={`text-[10px] ${isUser ? "text-zinc-400" : "text-zinc-500"} font-mono`}>
                      {part.inlineData.mimeType}
                    </p>
                  </div>
                </div>
              );
            }
          }

          if (part.text) {
            return <div key={partIdx}>{parseMessageText(part.text, isUser)}</div>;
          }

          return null;
        })}

        {renderMediaBlock(msg)}
      </div>
    );
  };

  const hasChatStarted = history.length > 0;
  const displayHeaderTitle =
    currentChatTitle ||
    (activeChatId ? savedChats.find((c) => c.id === activeChatId)?.title : "") ||
    (history.find((m) => m.role === "user")?.parts.find((p) => p.text)?.text?.slice(0, 32) + "...") ||
    "Conversation";

  return (
    <main className={`h-screen w-full bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col overflow-hidden font-sans relative selection:bg-zinc-200 dark:selection:bg-zinc-800 selection:text-zinc-900 dark:selection:text-zinc-100 transition-all duration-200 ease-out ${isMenuOpen ? "md:pl-[280px]" : "md:pl-16"}`}>
      {/* Pure crisp background without blur or transparency overlays */}

      {/* Mobile Backdrop Overlay Only */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            key="mobile-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsMenuOpen(false)}
            className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-xs z-40 cursor-pointer pointer-events-auto"
          />
        )}
      </AnimatePresence>

      {/* Auth Modal Component */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        initialName={userName}
        initialEmail={userEmail}
      />

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            key="settings-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSettingsOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          >
            <motion.div
              key="settings-content"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 text-zinc-900 dark:text-zinc-100 relative"
            >
              <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center space-x-2">
                  <Settings className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Settings</h3>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1 rounded-lg text-zinc-400 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="py-4 space-y-5">
                {/* Account Profile info */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Account Profile</label>
                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold select-none uppercase">
                      {userName ? userName.trim().charAt(0).toUpperCase() : "U"}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{userName || "User"}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{userEmail || "No email"}</span>
                    </div>
                  </div>
                </div>

                {/* Subscription & Plan */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Subscription Plan</label>
                  <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                    <div className="flex flex-col">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 capitalize">{subscription.plan} Plan</span>
                        <span className="px-2 py-0.5 rounded-full bg-[#48A04C]/10 text-[#48A04C] text-[10px] font-bold uppercase tracking-wider">Active</span>
                      </div>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {subscription.plan === "free" ? "Upgrade to unlock advanced models & media" : `Renews: ${new Date(subscription.renewDate || Date.now()).toLocaleDateString()}`}
                      </span>
                    </div>
                    {subscription.plan !== "free" && (
                      <button
                        onClick={() => {
                          setIsSettingsOpen(false);
                          setIsPricingOpen(true);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-[#48A04C] hover:bg-[#3d8640] text-white text-xs font-semibold transition-colors shadow-sm cursor-pointer"
                      >
                        Manage
                      </button>
                    )}
                  </div>
                </div>

                {/* Preferences */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Preferences</label>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Show thinking process</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">Display AI reasoning steps in responses</span>
                    </div>
                    <button
                      onClick={() => setShowThinkingProcess(!showThinkingProcess)}
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${showThinkingProcess ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
                    >
                      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${showThinkingProcess ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>
                </div>

                {/* Data Actions */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Data & History</label>
                  <button
                    onClick={() => {
                      clearChat();
                      setIsSettingsOpen(false);
                    }}
                    className="w-full py-2.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Clear chat history</span>
                    <RefreshCw className="w-4 h-4 text-zinc-400 dark:text-zinc-400" />
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>



      {/* Unified Push Sidebar (Desktop + Mobile) */}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-40 bg-white dark:bg-zinc-950 border-r border-zinc-200/80 dark:border-zinc-800/80 flex flex-col justify-between transition-all duration-200 ease-out select-none overflow-hidden ${
          isMenuOpen
            ? "w-[280px] translate-x-0 shadow-2xl md:shadow-none"
            : "w-0 -translate-x-full md:translate-x-0 md:w-16"
        }`}
      >
        {!isMenuOpen ? (
          /* Slim Vertical Rail (When sidebar is closed on desktop) */
          <div className="hidden md:flex flex-col items-center justify-between h-full py-3.5 w-16 shrink-0">
            <div className="flex flex-col items-center space-y-3.5 w-full">
              <button
                type="button"
                onClick={() => setIsMenuOpen(true)}
                className="p-2.5 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer flex items-center justify-center"
                title="Toggle sidebar"
                aria-label="Toggle sidebar"
              >
                <PanelLeft className="w-5 h-5 stroke-[1.8]" />
              </button>

              {hasChatStarted && (
                <button
                  type="button"
                  onClick={createNewChat}
                  className="p-2.5 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer flex items-center justify-center"
                  title="New chat"
                  aria-label="New chat"
                >
                  <Plus className="w-5.5 h-5.5 stroke-[2]" />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(true);
                  setTimeout(() => sidebarSearchInputRef.current?.focus(), 100);
                }}
                className="p-2.5 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer flex items-center justify-center"
                title="Search conversations"
                aria-label="Search conversations"
              >
                <Search className="w-5 h-5 stroke-[1.8]" />
              </button>

              <button
                type="button"
                onClick={() => setIsMenuOpen(true)}
                className="p-2.5 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer flex items-center justify-center"
                title="Saved chats"
                aria-label="Saved chats"
              >
                <Bookmark className="w-5 h-5 stroke-[1.8]" />
              </button>

              {hasChatStarted && (
                <button
                  type="button"
                  onClick={handleShare}
                  className="p-2.5 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer flex items-center justify-center"
                  title={isShareCopied ? "Copied to clipboard!" : "Share conversation"}
                  aria-label="Share conversation"
                >
                  {isShareCopied ? (
                    <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 stroke-[2]" />
                  ) : (
                    <Share2 className="w-5 h-5 stroke-[1.8]" />
                  )}
                </button>
              )}
            </div>

            <div className="flex flex-col items-center space-y-3 w-full">
              <div
                className="p-1 cursor-pointer transition-opacity hover:opacity-80 flex items-center justify-center"
                onClick={createNewChat}
                title="Zen AI"
              >
                <GenexLogo className="w-5.5 h-5.5" />
              </div>
            </div>
          </div>
        ) : (
          /* Expanded Panel Content (When sidebar is open) */
          <div className="flex flex-col h-full w-[280px] shrink-0 text-zinc-900 dark:text-zinc-100">
            {/* 1. Top Header: Logo on Left, Toggle + Search on Right */}
            <div className="p-3.5 pb-2.5 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/60 shrink-0">
              <div className="flex items-center space-x-2 cursor-pointer" onClick={createNewChat} title="Zen AI">
                <GenexLogo className="w-5.5 h-5.5" />
                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Zen</span>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => sidebarSearchInputRef.current?.focus()}
                  className="p-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Search conversations"
                >
                  <Search className="w-5 h-5 stroke-[1.8]" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(false)}
                  className="p-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Collapse sidebar"
                >
                  <PanelLeft className="w-5 h-5 stroke-[1.8]" />
                </button>
              </div>
            </div>

            {/* 2. New Chat Button */}
            <div className="p-3 pb-1.5 shrink-0">
              <button
                onClick={() => {
                  createNewChat();
                  if (window.innerWidth < 768) setIsMenuOpen(false);
                }}
                className="w-full py-2.5 px-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-900 dark:border-zinc-700 text-white dark:text-zinc-100 font-semibold text-xs transition-all cursor-pointer flex items-center space-x-2 shadow-xs"
              >
                <Plus className="w-4 h-4 text-zinc-300 dark:text-zinc-300 stroke-[2.2]" />
                <span>New Chat</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="px-3 py-1 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 pointer-events-none" />
                <input
                  ref={sidebarSearchInputRef}
                  type="text"
                  placeholder="Search chats..."
                  value={sidebarSearchQuery}
                  onChange={(e) => setSidebarSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/80 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                />
                {sidebarSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setSidebarSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* 3, 4, 5. Scrollable Area: Pinned & Recent Chats */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4 scrollbar-thin min-h-0">
              {savedChats.length === 0 ? (
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-dashed border-zinc-200 dark:border-zinc-700 text-center space-y-1 my-1">
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 font-medium">No saved chats yet.</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Start a new conversation to save your history!</p>
                </div>
              ) : (
                <>
                  {/* 3. Pinned Section */}
                  {savedChats.some((c) => c.pinned) && (
                    <div className="space-y-1">
                      <div className="px-1 py-1 flex items-center space-x-1.5">
                        <Pin className="w-3 h-3 text-zinc-400 dark:text-zinc-400 fill-zinc-400 dark:fill-zinc-400" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                          Pinned
                        </span>
                      </div>
                      {savedChats
                        .filter((c) => c.pinned && c.title.toLowerCase().includes(sidebarSearchQuery.toLowerCase()))
                        .sort((a, b) => b.updatedAt - a.updatedAt)
                        .map((chat) => renderChatItem(chat))}
                    </div>
                  )}

                  {/* 4. Recent Section */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between px-1 py-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        {savedChats.some((c) => c.pinned) ? "Recent" : "Saved Chats"}
                      </span>
                      <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-full font-medium border border-zinc-200 dark:border-zinc-700">
                        {savedChats.length}
                      </span>
                    </div>
                    {savedChats
                      .filter((c) => !c.pinned && c.title.toLowerCase().includes(sidebarSearchQuery.toLowerCase()))
                      .sort((a, b) => b.updatedAt - a.updatedAt)
                      .map((chat) => renderChatItem(chat))}
                  </div>
                </>
              )}
            </div>

            {/* Bottom Fixed Section: User Account Row */}
            <div className="p-3 border-t border-zinc-200/80 dark:border-zinc-800/80 space-y-2.5 bg-white dark:bg-zinc-950 shrink-0 mt-auto">
              {/* User Account Row */}
              {isLoggedIn ? (
                showLogoutConfirm ? (
                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 flex flex-col space-y-2">
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Do you want to logout?</span>
                    <div className="flex items-center space-x-4 pt-0.5">
                      <button
                        onClick={() => {
                          handleSignOut();
                          setShowLogoutConfirm(false);
                          setIsMenuOpen(false);
                        }}
                        className="text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors cursor-pointer"
                      >
                        Logout
                      </button>
                      <button
                        onClick={() => setShowLogoutConfirm(false)}
                        className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/80 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-8.5 h-8.5 rounded-full bg-indigo-600 border border-indigo-500 flex items-center justify-center text-white font-semibold text-xs shadow-inner select-none uppercase shrink-0">
                        {userName ? userName.trim().charAt(0).toUpperCase() : "U"}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">{userName || "User"}</span>
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium truncate">
                          {userEmail || "Free Account"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-0.5 shrink-0">
                      <button
                        onClick={() => {
                          setIsSettingsOpen(true);
                          if (window.innerWidth < 768) setIsMenuOpen(false);
                        }}
                        className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                        title="Settings"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowLogoutConfirm(true)}
                        className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                        title="Sign Out"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsAuthOpen(true);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-900 dark:border-zinc-700 text-white dark:text-zinc-100 font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center space-x-2 shadow-xs"
                >
                  <LogIn className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-300" />
                  <span>Sign In / Register</span>
                </button>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Desktop Top Left Header Area (Static Model Name - slides with sidebar, hidden after chat starts) */}
      {!hasChatStarted && (
        <div className={`hidden md:flex fixed top-3.5 z-30 items-center transition-all duration-200 ease-out ${isMenuOpen ? "left-[296px]" : "left-20"}`}>
          {/* Static Model Label */}
          <span className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 select-none">
            GNX Rout
          </span>
        </div>
      )}

      {/* Desktop Top Header Title (Auto-generated chat title with click to rename) */}
      {hasChatStarted && (
        <div className={`hidden md:flex fixed top-3.5 z-30 items-center justify-center transition-all duration-200 ease-out left-1/2 -translate-x-1/2 max-w-[520px]`}>
          {isHeaderTitleEditing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveHeaderRename();
              }}
              className="flex items-center"
            >
              <input
                type="text"
                value={headerEditingTitle}
                onChange={(e) => setHeaderEditingTitle(e.target.value)}
                onBlur={saveHeaderRename}
                autoFocus
                maxLength={60}
                className="px-3 py-1 text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-[#48A04C] shadow-xs w-full max-w-[360px]"
              />
            </form>
          ) : (
            <div
              onClick={() => {
                setHeaderEditingTitle(displayHeaderTitle);
                setIsHeaderTitleEditing(true);
              }}
              className="group flex items-center space-x-2 px-3 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/70 transition-colors cursor-pointer select-none"
              title="Click to rename chat"
            >
              <span className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight truncate max-w-[380px] font-sans">
                {displayHeaderTitle}
              </span>
              <Pencil className="w-4 h-4 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </div>
          )}
        </div>
      )}

      {/* Desktop Top Right Header Area (Upgrade + Private Chat) */}
      <div className="hidden md:flex fixed top-3.5 right-4 z-30 items-center gap-3">
        <button
          type="button"
          onClick={() => setIsPricingOpen(true)}
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-[#48A04C] hover:bg-[#48A04C]/10 transition-colors cursor-pointer"
          aria-label={subscription.plan === "free" ? "Upgrade plan" : "Manage subscription"}
        >
          <PlusSparkleIcon className="w-4 h-4" />
          <span>{subscription.plan === "free" ? "Upgrade" : "Manage"}</span>
        </button>
        {isLoggedIn && !hasChatStarted && (
          <button
            type="button"
            onClick={togglePrivateMode}
            className={`p-2 rounded-full cursor-pointer transition-all flex items-center justify-center ${
              isPrivateChat
                ? "text-[#48A04C] dark:text-[#48A04C] bg-[#48A04C]/10 border border-[#48A04C]/40 shadow-[0_0_10px_rgba(72,160,76,0.25)] ring-1 ring-[#48A04C]/30"
                : "text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
            title={isPrivateChat ? "Private Chat (Active)" : "Private Chat"}
            aria-label="Toggle Private Chat"
          >
            <Ghost className={`w-5 h-5 ${isPrivateChat ? "stroke-[2.2] text-[#48A04C]" : "stroke-[1.8]"}`} />
          </button>
        )}
      </div>

      {/* Top Header Bar - Mobile only */}
      <header className={`md:hidden relative w-full px-4 pt-3.5 pb-2.5 sm:px-6 flex items-center justify-between z-30 shrink-0 transition-all duration-200 ${
        hasChatStarted
          ? "border-b border-zinc-200/60 dark:border-zinc-800/60 bg-white/85 dark:bg-[#141413]/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}>
        {/* Left: Menu button */}
        <div className="flex items-center">
          <motion.button
            onClick={() => setIsMenuOpen(true)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
            className="w-10 h-10 -ml-1 text-zinc-900 dark:text-zinc-100 hover:opacity-70 transition-opacity cursor-pointer flex items-center justify-center"
            aria-label="Open Menu"
          >
            <div className="flex flex-col items-center justify-center space-y-[4px] w-5">
              <span className="block h-[2px] w-5 bg-current rounded-full" />
              <span className="block h-[2px] w-5 bg-current rounded-full" />
              <span className="block h-[2px] w-5 bg-current rounded-full" />
            </div>
          </motion.button>
        </div>

        {/* Center branding or Auto-generated Chat Title - Large, bold branding like Lovable */}
        {!hasChatStarted ? (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center space-x-2.5 select-none pointer-events-none">
            <GenexLogo className="w-8 h-8 pointer-events-auto shrink-0 drop-shadow-sm" />
            <span className="text-zinc-950 dark:text-white font-extrabold text-[24px] sm:text-[26px] tracking-tight pointer-events-auto font-sans leading-none">
              Zen
            </span>
          </div>
        ) : (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center max-w-[55%] xs:max-w-[62%] sm:max-w-[68%] select-none z-10">
            {isHeaderTitleEditing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveHeaderRename();
                }}
                className="flex items-center"
              >
                <input
                  type="text"
                  value={headerEditingTitle}
                  onChange={(e) => setHeaderEditingTitle(e.target.value)}
                  onBlur={saveHeaderRename}
                  autoFocus
                  maxLength={60}
                  className="px-3 py-1.5 text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-[#48A04C] w-full max-w-[210px] xs:max-w-[260px]"
                />
              </form>
            ) : (
              <div
                onClick={() => {
                  setHeaderEditingTitle(displayHeaderTitle);
                  setIsHeaderTitleEditing(true);
                }}
                className="group flex items-center space-x-2 px-2.5 py-1.5 rounded-xl hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
                title="Click to rename chat"
              >
                <span className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight truncate max-w-[170px] xs:max-w-[220px] sm:max-w-[290px] font-sans">
                  {displayHeaderTitle}
                </span>
                <Pencil className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
            )}
          </div>
        )}

        {/* Right action / New chat & Share / Avatar / Login */}
        <div className="flex items-center gap-2">
          {isLoggedIn && !hasChatStarted && (
            <button
              type="button"
              onClick={togglePrivateMode}
              className={`w-10 h-10 rounded-full cursor-pointer transition-all flex items-center justify-center ${
                isPrivateChat
                  ? "text-[#48A04C] dark:text-[#48A04C] bg-[#48A04C]/15 border border-[#48A04C]/50 shadow-[0_0_12px_rgba(72,160,76,0.3)] ring-1 ring-[#48A04C]/40"
                  : "text-zinc-800 dark:text-zinc-200 bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] border border-black/[0.08] dark:border-white/[0.1]"
              }`}
              title={isPrivateChat ? "Private Chat (Active)" : "Private Chat"}
              aria-label="Toggle Private Chat"
            >
              <Ghost className={`w-5 h-5 ${isPrivateChat ? "stroke-[2.2] text-[#48A04C]" : "stroke-[1.8]"}`} />
            </button>
          )}
          {hasChatStarted && (
            <>
              <button
                type="button"
                onClick={createNewChat}
                className="w-10 h-10 rounded-full bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] border border-black/[0.08] dark:border-white/[0.1] text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer flex items-center justify-center"
                title="New chat"
              >
                <SquarePen className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={handleShare}
                className="w-10 h-10 rounded-full bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] border border-black/[0.08] dark:border-white/[0.1] text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer flex items-center justify-center"
                title={isShareCopied ? "Copied to clipboard!" : "Share conversation"}
              >
                {isShareCopied ? (
                  <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Share2 className="w-5 h-5" />
                )}
              </button>
            </>
          )}

          {!hasChatStarted && (
            isLoggedIn ? (
              <motion.button
                onClick={() => setIsMenuOpen(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-10 h-10 rounded-full bg-indigo-600 border border-indigo-500 flex items-center justify-center text-white font-bold text-sm shadow-xs cursor-pointer select-none uppercase ml-1"
                title="Account Menu"
              >
                {userName ? userName.trim().charAt(0).toUpperCase() : "U"}
              </motion.button>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                className="h-10 px-4 rounded-full bg-zinc-900 hover:bg-zinc-800 dark:bg-[#f3efe8] dark:hover:bg-white text-white dark:text-zinc-950 font-bold text-sm tracking-wide transition-colors cursor-pointer shadow-xs ml-1 flex items-center justify-center border border-zinc-900 dark:border-transparent"
              >
                Login
              </button>
            )
          )}
        </div>
      </header>

      {/* Private Chat Glitch & Status Banner */}
      <AnimatePresence>
        {bannerMessage && !hasChatStarted && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="fixed top-18 sm:top-20 md:top-20 left-1/2 -translate-x-1/2 z-10 pointer-events-none text-center px-4 w-full max-w-md"
          >
            <div className={`flex items-center justify-center space-x-2 sm:space-x-2.5 md:space-x-3 font-mono text-xl sm:text-2xl md:text-3xl font-black tracking-tight select-none ${
              bannerType === "glitch"
                ? "text-[#48A04C]"
                : "text-zinc-600 dark:text-zinc-400"
            }`}>
              {bannerType === "glitch" && (
                <Ghost className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-[#48A04C] shrink-0 stroke-[2.2]" />
              )}
              <span>{bannerMessage}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Login notification banner for first message when not signed in */}
      <AnimatePresence>
        {showLoginNotice && !isLoggedIn && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-2xl p-3.5 flex items-center justify-between space-x-3 text-zinc-900 dark:text-zinc-100"
          >
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-8.5 h-8.5 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-900 dark:text-zinc-100">
                <LogIn className="w-4 h-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  Login to save your conversations with Zen
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  Sign in to keep your chat history safe
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-1.5 shrink-0">
              <button
                onClick={() => {
                  setIsAuthOpen(true);
                  setShowLoginNotice(false);
                }}
                className="px-3.5 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-xs font-semibold transition-colors cursor-pointer shadow-sm"
              >
                Login
              </button>
              <button
                onClick={() => setShowLoginNotice(false)}
                className="p-1 rounded-lg text-zinc-400 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                aria-label="Close notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Conversation Content Area OR Web Dev Mode Split View */}
      {isWebDevMode && (hasChatStarted || history.length > 0) ? (
        <div className="flex-1 flex flex-col md:flex-row w-full h-[calc(100vh-3.5rem)] overflow-hidden">
          {/* LEFT PANEL: Chat Interface */}
          <div className="w-full md:w-[45%] lg:w-[42%] flex flex-col h-full border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0 min-w-0">
            {/* Top Indicator */}
            <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-emerald-50/90 dark:bg-emerald-950/40 flex items-center justify-between text-xs font-medium shrink-0">
              <div className="flex items-center space-x-2 text-emerald-800 dark:text-emerald-300">
                <Code2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-bold">Web Dev Mode</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-semibold">
                  Live Preview
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsWebDevMode(false)}
                className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white text-xs flex items-center space-x-1 cursor-pointer transition-colors"
                title="Exit Web Dev Mode"
              >
                <span>Close Preview</span>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Message list container */}
            <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-none space-y-5">
              {history.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 select-none">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-3 shadow-xs">
                    <Code2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-zinc-900 dark:text-zinc-100 font-extrabold text-base sm:text-lg">Web Dev Assistant</h3>
                  <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1.5 max-w-xs leading-relaxed">
                    Describe the website or web app you want to build. Zen will generate complete HTML, CSS, and JS with live updates in the right preview panel!
                  </p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {history.map((msg, index) => (
                    <motion.div key={index} className="flex flex-col w-full">
                      {msg.role === "model" && renderMessageStatusHeader(msg, index, true)}

                      <div className={`p-3 rounded-2xl text-xs sm:text-sm ${
                        msg.role === "user"
                          ? "bg-zinc-800 text-white self-end max-w-[88%]"
                          : "bg-transparent text-zinc-900 dark:text-zinc-100 self-start w-full"
                      }`}>
                        {renderMessageContent(msg)}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}

              {isLoading && renderLiveStatusIndicator(true)}
              {error && (
                <div className="p-3 bg-amber-50 text-amber-900 text-xs rounded-xl border border-amber-200">
                  {error}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar in Left Panel */}
            <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
              <form onSubmit={handleSubmit} className="w-full relative">
                <div className="relative w-full rounded-2xl bg-[#f4f4f5] dark:bg-[#212120] border border-zinc-200 dark:border-zinc-700/70 p-2.5 flex flex-col">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe what to build or modify..."
                    rows={1}
                    className="w-full bg-transparent text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 resize-none outline-none px-2 py-1 max-h-28"
                  />
                  <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-zinc-200/60 dark:border-zinc-700/50">
                    <div className="flex items-center space-x-1">
                      <div className="relative group/tooltip flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-7 h-7 rounded-full text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 transition-all duration-150 cursor-pointer flex items-center justify-center"
                          aria-label="Attach files"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-medium rounded-md opacity-0 pointer-events-none group-hover/tooltip:opacity-100 transition-opacity duration-150 delay-150 whitespace-nowrap shadow-xs z-30">
                          Attach
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                        Web Dev Active
                      </span>
                    </div>
                    <button
                      type="submit"
                      disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
                      className="w-7 h-7 rounded-full bg-[#48A04C] hover:bg-[#3E8A42] text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
                    >
                      <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* RIGHT PANEL: Live Web Preview */}
          {(() => {
            const activeWebData = extractHtmlFromMessageHistory(history);
            return (
              <div className="w-full md:w-[55%] lg:w-[58%] flex flex-col h-full bg-zinc-100 dark:bg-zinc-950 shrink-0 border-t md:border-t-0 border-zinc-200 dark:border-zinc-800 min-w-0">
                {/* Toolbar */}
                <div className="h-11 px-3 sm:px-4 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 select-none">
                  <div className="flex items-center space-x-2 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-lg border border-zinc-200/80 dark:border-zinc-700/80 text-xs text-zinc-600 dark:text-zinc-300">
                    <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="font-mono text-[11px] font-medium truncate max-w-[130px] sm:max-w-[200px]">
                      https://zen-preview.local
                    </span>
                    {activeWebData?.isStreaming && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                    )}
                  </div>

                  {/* Viewport controls */}
                  <div className="flex items-center space-x-1 bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-lg border border-zinc-200 dark:border-zinc-700/70">
                    <button
                      type="button"
                      onClick={() => setViewportMode("desktop")}
                      className={`p-1 rounded transition-colors cursor-pointer ${
                        viewportMode === "desktop"
                          ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                      title="Desktop view"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewportMode("tablet")}
                      className={`p-1 rounded transition-colors cursor-pointer ${
                        viewportMode === "tablet"
                          ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                      title="Tablet view"
                    >
                      <Tablet className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewportMode("mobile")}
                      className={`p-1 rounded transition-colors cursor-pointer ${
                        viewportMode === "mobile"
                          ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                      title="Mobile view"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setPreviewIframeKey((k) => k + 1)}
                      className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                      title="Refresh preview"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    {activeWebData?.html && (
                      <button
                        type="button"
                        onClick={() => {
                          if (activeWebData?.html) {
                            const blob = new Blob([activeWebData.html], { type: "text/html;charset=utf-8" });
                            const blobUrl = URL.createObjectURL(blob);
                            window.open(blobUrl, "_blank");
                          }
                        }}
                        className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="Open in new tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsWebDevMode(false)}
                      className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                      title="Close Split View"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Preview Body */}
                <div className="flex-1 w-full h-full relative p-3 sm:p-4 overflow-auto flex items-center justify-center bg-zinc-200/60 dark:bg-zinc-950">
                  {activeWebData?.html ? (
                    <div
                      className={`transition-all duration-300 h-full ${
                        viewportMode === "desktop"
                          ? "w-full h-full rounded-lg shadow-sm overflow-hidden"
                          : viewportMode === "tablet"
                          ? "w-[768px] max-w-full h-[92%] rounded-xl shadow-2xl border border-zinc-300 dark:border-zinc-700 overflow-hidden"
                          : "w-[375px] max-w-full h-[667px] rounded-[32px] shadow-2xl border-4 border-zinc-800 dark:border-zinc-700 overflow-hidden"
                      }`}
                    >
                      <iframe
                        key={previewIframeKey}
                        srcDoc={activeWebData.html}
                        className="w-full h-full bg-white border-none"
                        title="Live Web Preview"
                        sandbox="allow-scripts allow-modals allow-forms"
                      />
                    </div>
                  ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center max-w-md bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/90 dark:border-zinc-800 shadow-xl">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4 shadow-xs">
                    <Code2 className="w-7 h-7" />
                  </div>
                  <h3 className="text-zinc-900 dark:text-zinc-100 font-extrabold text-xl tracking-tight">
                    {isLoading ? "Generating Live Web App..." : "Live Web Preview"}
                  </h3>
                  <p className="text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm mt-2 leading-relaxed">
                    {isLoading
                      ? "Zen is writing clean HTML, CSS, and JavaScript. Your live website will render here instantly as the code streams!"
                      : "Type a prompt like 'Build a modern SaaS landing page for an AI productivity app' or 'Create a dashboard for crypto portfolio tracking'."}
                  </p>
                  {isLoading && (
                    <div className="mt-5 flex items-center space-x-2 text-emerald-600 dark:text-emerald-400 font-mono text-xs bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      <span>Building live preview...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
        </div>
      ) : (
        <>
          {/* Chat Conversation Content Area - ONLY when chat started */}
          {hasChatStarted ? (
        <div className="flex-1 overflow-y-auto w-full max-w-3xl mx-auto px-4 py-6 scrollbar-none flex flex-col space-y-6">
          <AnimatePresence initial={false}>
            {history.map((msg, index) => (
              <motion.div
                key={index}
                className="flex flex-col w-full"
              >
                {/* Dynamic status header for Model responses */}
                {msg.role === "model" && renderMessageStatusHeader(msg, index, false)}

                <div
                  style={
                    msg.role === "user"
                      ? { backgroundColor: systemTheme === "dark" ? "#262624" : "#27272a", color: "#ffffff", opacity: 1 }
                      : { backgroundColor: "transparent" }
                  }
                  className={
                    msg.role === "user"
                      ? "max-w-[85%] sm:max-w-[75%] rounded-[24px] px-5 py-2.5 self-end font-medium text-base sm:text-lg md:text-[1.125rem] leading-relaxed break-words border-0 shadow-none bg-zinc-800 text-white opacity-100"
                      : "w-full max-w-none bg-transparent px-0 py-2 text-zinc-900 dark:text-zinc-100 font-medium text-base sm:text-lg md:text-[1.125rem] leading-relaxed self-start"
                  }
                >
                  {renderMessageContent(msg)}
                </div>

                {/* ChatGPT style action toolbar for User messages */}
                {msg.role === "user" && (
                  <div className="flex items-center space-x-1 text-zinc-500 dark:text-zinc-400 mt-1 pr-0.5 self-end select-none">
                    <button
                      type="button"
                      onClick={() => {
                        const fullText = msg.parts.map((p) => p.text || "").join("");
                        navigator.clipboard.writeText(fullText);
                        setCopiedIndex(index);
                        setTimeout(() => setCopiedIndex(null), 2000);
                      }}
                      className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                      title="Copy prompt"
                    >
                      {copiedIndex === index ? (
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const textPart = msg.parts.find((p) => p.text !== undefined)?.text || "";
                        setInput(textPart);
                        if (inputRef.current) {
                          inputRef.current.focus();
                        }
                      }}
                      className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                      title="Edit prompt"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* ChatGPT style action toolbar for Model responses */}
                {msg.role === "model" && (
                  <div className="flex items-center space-x-1 text-zinc-500 dark:text-zinc-400 mt-1 pl-0.5 select-none">
                    <button
                      type="button"
                      onClick={() => {
                        const fullText = msg.parts.map((p) => p.text || "").join("");
                        navigator.clipboard.writeText(fullText);
                        setCopiedIndex(index);
                        setTimeout(() => setCopiedIndex(null), 2000);
                      }}
                      className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                      title="Copy response"
                    >
                      {copiedIndex === index ? (
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleRetry(index)}
                      className={`p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer ${
                        isLoading ? "opacity-40 cursor-not-allowed" : ""
                      }`}
                      title="Retry / Regenerate response"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const fullText = msg.parts.map((p) => p.text || "").join("");
                        handleSpeak(index, fullText);
                      }}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        speakingIndex === index
                          ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                      title={speakingIndex === index ? "Stop voice output" : "Read response aloud"}
                    >
                      {speakingIndex === index ? (
                        <VolumeX className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFeedbackState((prev) => ({
                          ...prev,
                          [index]: prev[index] === "like" ? null : "like",
                        }))
                      }
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        feedbackState[index] === "like"
                          ? "text-zinc-900 dark:text-zinc-100 bg-zinc-200 dark:bg-zinc-700"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                      title="Good response"
                    >
                      <ThumbsUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFeedbackState((prev) => ({
                          ...prev,
                          [index]: prev[index] === "dislike" ? null : "dislike",
                        }))
                      }
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        feedbackState[index] === "dislike"
                          ? "text-zinc-900 dark:text-zinc-100 bg-zinc-200 dark:bg-zinc-700"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                      title="Bad response"
                    >
                      <ThumbsDown className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </motion.div>
            ))}

            {isLoading && renderLiveStatusIndicator(false)}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-start w-full my-2"
              >
                <div className="bg-amber-50/90 border border-amber-200/90 text-amber-950 text-xs sm:text-sm rounded-2xl p-4 w-full shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start space-x-3">
                    <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-950 text-xs sm:text-sm">
                        {error.includes("limit") || error.includes("Quota") || error.includes("429")
                          ? "API Quota Limit / High Demand"
                          : "Unable to Complete Request"}
                      </p>
                      <p className="text-amber-800 text-xs mt-0.5 leading-relaxed">{error}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={handleRetryLastRequest}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-900 hover:bg-amber-950 text-white font-semibold text-xs flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Request</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setError(null)}
                      className="p-1.5 rounded-lg text-amber-700 hover:text-amber-950 hover:bg-amber-100/60 transition-colors cursor-pointer"
                      title="Dismiss error"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>
      ) : null}

      {/* Input / Centerpiece Section */}
      <div className={`w-full max-w-3xl mx-auto px-4 ${hasChatStarted ? "pb-6 pt-2 shrink-0" : "m-auto flex flex-col justify-center"}`}>
        {/* Centerpiece title - ONLY before chat starts */}
        {!hasChatStarted && (
          <div className="text-center mb-8 sm:mb-10 select-none animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-10">
            <h2 className="text-zinc-900 dark:text-zinc-100 text-3xl sm:text-[42px] font-extrabold tracking-tight">
              How can I help you{isLoggedIn && userName ? `, ${userName}` : ""}?
            </h2>
          </div>
        )}

        {/* Dynamic Input Bar - DeepSeek style theme responsive */}
        <form
          onSubmit={handleSubmit}
          className="w-full relative group shrink-0"
        >
          <div className={`relative w-full rounded-[28px] shadow-xl dark:shadow-2xl/40 transition-all duration-300 flex flex-col ${
            isPrivateChat
              ? "bg-[#f2f9f3] dark:bg-[#142318] border border-[#48A04C]/60 focus-within:border-[#48A04C] shadow-[0_0_20px_rgba(72,160,76,0.18)] dark:shadow-[0_0_25px_rgba(72,160,76,0.25)] ring-1 ring-[#48A04C]/30"
              : "bg-[#f4f4f5] dark:bg-[#212120] border border-zinc-200/90 dark:border-zinc-700/70 focus-within:border-zinc-300 dark:focus-within:border-zinc-600"
          }`}>
            {/* Attached Files Preview Grid */}
            <AnimatePresence>
              {attachedFiles.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`px-5 pt-4 pb-2 flex flex-wrap gap-2.5 border-b rounded-t-[28px] ${
                    isPrivateChat
                      ? "border-[#48A04C]/30 bg-[#f2f9f3] dark:bg-[#142318]"
                      : "border-zinc-200 dark:border-zinc-700/60 bg-[#f4f4f5] dark:bg-[#212120]"
                  }`}
                >
                  {attachedFiles.map((file) => {
                    const isImage = file.mimeType.startsWith("image/");
                    return (
                      <motion.div
                        key={file.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="relative group/file flex items-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-2 pr-8 max-w-[180px] shrink-0 animate-in fade-in zoom-in-95 duration-200 shadow-xs"
                      >
                        {isImage ? (
                          <img
                            src={`data:${file.mimeType};base64,${file.base64}`}
                            alt={file.name}
                            className="w-9 h-9 object-cover rounded-lg mr-2 border border-zinc-200 dark:border-zinc-700"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-9 h-9 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg flex items-center justify-center mr-2 text-zinc-800 dark:text-zinc-100">
                            <FileText className="w-4 h-4 text-zinc-700 dark:text-zinc-200" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-800 dark:text-zinc-100 font-medium truncate">
                            {file.name}
                          </p>
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(file.id)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-600"
                        >
                          <X className="w-3 h-3 text-zinc-700 dark:text-zinc-200" />
                        </button>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={isCreateMediaMode ? "Describe the image or video you want to create..." : isWebDevMode ? "Describe the website you want to build..." : "Ask anything..."}
              className="w-full bg-transparent pt-3.5 pb-14 pl-5 pr-5 text-zinc-900 dark:text-zinc-100 text-base md:text-lg placeholder-zinc-400 dark:placeholder-zinc-500 outline-none resize-none min-h-[105px] max-h-[240px] leading-relaxed scrollbar-none focus:ring-0 border-0 font-normal rounded-[28px]"
              disabled={isLoading}
            />

            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              className="hidden"
            />

            {/* Attach Menu Button & Inline Web Dev Mode Tag (Bottom Left) */}
            <div className="absolute left-3.5 bottom-3.5 flex items-center space-x-2 z-20" ref={attachMenuRef}>
              <div className="relative flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)}
                  className={`w-8 h-8 rounded-full transition-colors duration-150 cursor-pointer shrink-0 flex items-center justify-center ${
                    isAttachMenuOpen
                      ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white rotate-45"
                      : "text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70"
                  }`}
                  aria-label="Upload file"
                  title="Upload file"
                >
                  <Plus className="w-5 h-5 stroke-[2] transition-transform duration-200" />
                </button>

                {/* Attach Popup Menu */}
                <AnimatePresence>
                  {isAttachMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="absolute left-0 bottom-full mb-2.5 w-52 sm:w-56 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 p-1.5 z-50 overflow-hidden text-zinc-900 dark:text-white"
                    >
                      {/* Option: Upload File */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsAttachMenuOpen(false);
                          fileInputRef.current?.click();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-800 dark:text-zinc-200 text-xs sm:text-sm font-medium transition-colors cursor-pointer flex items-center space-x-2.5 group"
                      >
                        <Paperclip className="w-4 h-4 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white shrink-0" />
                        <span>Upload file</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Inline Web Dev Mode Tag (Kimi / ChatGPT style next to + button) */}
              <AnimatePresence>
                {isWebDevMode && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, x: -6 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9, x: -6 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="flex items-center shrink-0 select-none"
                  >
                    <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#48A04C]/15 dark:bg-[#48A04C]/25 text-[#48A04C] dark:text-[#52b857] border border-[#48A04C]/35 hover:bg-[#48A04C]/20 hover:border-[#48A04C]/50 transition-all duration-200 ease-out text-xs font-semibold shadow-2xs group">
                      <Code2 className="w-3.5 h-3.5 text-[#48A04C] dark:text-[#52b857] shrink-0" />
                      <span>Web Dev</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsWebDevMode(false);
                        }}
                        className="ml-0.5 p-0.5 rounded-full hover:bg-[#48A04C]/25 text-[#48A04C]/80 hover:text-[#48A04C] dark:text-[#52b857]/80 dark:hover:text-[#52b857] transition-colors cursor-pointer"
                        aria-label="Remove Web Dev mode"
                        title="Remove Web Dev mode"
                      >
                        <X className="w-3 h-3 stroke-[2.5]" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Inline Create Media Mode Tag */}
              <AnimatePresence>
                {isCreateMediaMode && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, x: -6 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9, x: -6 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="flex items-center shrink-0 select-none"
                  >
                    <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-purple-500/15 dark:bg-purple-500/25 text-purple-600 dark:text-purple-300 border border-purple-500/35 hover:bg-purple-500/20 hover:border-purple-500/50 transition-all duration-200 ease-out text-xs font-semibold shadow-2xs group">
                      <Wand2 className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                      <span>Create</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsCreateMediaMode(false);
                        }}
                        className="ml-0.5 p-0.5 rounded-full hover:bg-purple-500/25 text-purple-600/80 hover:text-purple-600 dark:text-purple-300/80 dark:hover:text-purple-300 transition-colors cursor-pointer"
                        aria-label="Remove Create mode"
                        title="Remove Create mode"
                      >
                        <X className="w-3 h-3 stroke-[2.5]" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mode / Send / Stop / Voice & Mic Buttons (Bottom Right) */}
            <div className="absolute right-3.5 bottom-3.5 flex items-center space-x-1.5 z-20">
              {/* Mode Dropdown Selector Pill Button (Qwen Style) */}
              <div className="relative flex items-center justify-center" ref={modeMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsModeMenuOpen(!isModeMenuOpen)}
                  className={`h-9 px-3.5 sm:px-4 rounded-full text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer flex items-center space-x-1.5 select-none ${
                    isModeMenuOpen
                      ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white"
                      : "text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70"
                  }`}
                  aria-label="Select mode"
                  title="Select response mode"
                >
                  <span className="capitalize">
                    {activeResponseMode === "auto" ? "Auto" : activeResponseMode === "fast" ? "Fast" : "Thinking"}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-zinc-500 dark:text-zinc-400 transition-transform duration-200 ${isModeMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {/* Mode Popup Menu */}
                <AnimatePresence>
                  {isModeMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="absolute right-0 top-full mt-2 w-40 sm:w-44 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 p-1.5 z-50 overflow-hidden text-zinc-900 dark:text-white"
                    >
                      <div className="space-y-1">
                        {[
                          { id: "auto", name: "Auto" },
                          { id: "thinking", name: "Thinking" },
                          { id: "fast", name: "Fast" },
                        ].map((m) => {
                          const isSelected = activeResponseMode === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setActiveResponseMode(m.id as "auto" | "fast" | "thinking");
                                setIsModeMenuOpen(false);
                              }}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-between group ${
                                isSelected
                                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400"
                              }`}
                            >
                              <span>{m.name}</span>
                              {isSelected && (
                                <div className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                                  <Check className="w-3 h-3 stroke-[2.5]" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Microphone Button - Simple Speech to Text into Input Field */}
              <div className="relative group/mic flex items-center justify-center">
                <button
                  type="button"
                  onClick={toggleTextInputMic}
                  className={`w-8 h-8 rounded-full transition-colors duration-150 cursor-pointer flex items-center justify-center ${
                    isTextInputListening
                      ? "text-red-600 dark:text-red-400 bg-red-100/80 dark:bg-red-950/60 animate-pulse"
                      : "text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70"
                  }`}
                  aria-label={isTextInputListening ? "Stop recording" : "Voice input"}
                >
                  <Mic className="w-5 h-5" />
                </button>
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium rounded-md opacity-0 pointer-events-none group-hover/mic:opacity-100 transition-opacity duration-150 delay-150 whitespace-nowrap shadow-sm z-30">
                  {isTextInputListening ? "Stop recording" : "Voice input"}
                </div>
              </div>

              {/* Green Voice Call Button (opens GNX Voice Mode) / Send Button */}
              <div>
                {isLoading ? (
                  <button
                    type="button"
                    onClick={handleStopGeneration}
                    className="w-9 h-9 rounded-full flex items-center justify-center bg-zinc-800 dark:bg-zinc-100 text-white dark:text-zinc-950 cursor-pointer shadow-xs border border-zinc-600 dark:border-zinc-300 group"
                    title="Stop generating"
                  >
                    <Square className="w-4 h-4 fill-current text-white dark:text-zinc-950" />
                  </button>
                ) : input.trim() || attachedFiles.length > 0 ? (
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-9 h-9 rounded-full flex items-center justify-center bg-[#48A04C] hover:bg-[#3E8A42] transition-colors duration-200 cursor-pointer text-white shadow-xs group"
                    title="Send message"
                  >
                    <ArrowUp className="w-5 h-5 stroke-[2.5]" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startVoiceCallMode}
                    className="voice-button-trigger w-9 h-9 rounded-full flex items-center justify-center cursor-pointer text-white shadow-xs transition-colors duration-200 bg-[#48A04C] hover:bg-[#3E8A42]"
                    title="Start voice call"
                  >
                    <AudioWaveformIcon className="w-5 h-5 text-white" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Grok-style persistent indicator text under input bar */}
          {isPrivateChat && (
            <p className="mt-2.5 text-center text-sm font-medium text-[#48A04C] tracking-tight transition-all duration-300 animate-in fade-in select-none">
              This chat won't be saved to your history and won't be used for AI training
            </p>
          )}

          {/* Quick Action Pills - Design & Web Dev (Only visible on empty home screen before chat starts) */}
          {!hasChatStarted && (
            <div className="flex items-center justify-center flex-wrap gap-3 mt-3 select-none">
              <button
                type="button"
                onClick={() => {
                  const next = !isCreateMediaMode;
                  setIsCreateMediaMode(next);
                  if (next) {
                    setTimeout(() => inputRef.current?.focus(), 50);
                  }
                }}
                className={`px-4.5 py-2 sm:px-5 sm:py-2.5 rounded-full text-sm font-medium flex items-center space-x-2 transition-all duration-200 cursor-pointer border shadow-xs ${
                  isCreateMediaMode
                    ? "bg-purple-500/15 dark:bg-purple-500/25 text-purple-600 dark:text-purple-300 border-purple-500/50"
                    : "bg-white/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border-zinc-200/90 dark:border-zinc-700/80 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white"
                }`}
                title="Toggle Design Mode"
              >
                <Wand2 className={`w-4 h-4 ${isCreateMediaMode ? "text-purple-500 dark:text-purple-300" : "text-purple-500"}`} />
                <span>Design</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = !isWebDevMode;
                  setIsWebDevMode(next);
                  if (next) {
                    setTimeout(() => inputRef.current?.focus(), 50);
                  }
                }}
                className={`px-4.5 py-2 sm:px-5 sm:py-2.5 rounded-full text-sm font-medium flex items-center space-x-2 transition-all duration-200 cursor-pointer border shadow-xs ${
                  isWebDevMode
                    ? "bg-[#48A04C]/15 dark:bg-[#48A04C]/25 text-[#48A04C] dark:text-[#52b857] border-[#48A04C]/50"
                    : "bg-white/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border-zinc-200/90 dark:border-zinc-700/80 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white"
                }`}
                title="Toggle Web Dev Mode"
              >
                <Code2 className={`w-4 h-4 ${isWebDevMode ? "text-[#48A04C] dark:text-[#52b857]" : "text-emerald-500"}`} />
                <span>Web Dev</span>
              </button>
            </div>
          )}
        </form>
      </div>
        </>
      )}

      {/* Full-screen Voice Call Mode Overlay (ChatGPT Style) */}
      <AnimatePresence>
        {isVoiceModeActive && (
          <motion.div
            initial={{ opacity: 1, scale: 1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0 }}
            className="fixed inset-0 z-[100] bg-[#141413] text-white flex flex-col items-center justify-between select-none overflow-hidden font-sans"
          >
            {/* Animated Cosmic / Space Background */}
            <CosmicBackground />

            {/* Top Bar Header inside Voice Mode */}
            <div className="w-full px-6 py-5 flex items-center justify-between z-10 shrink-0">
              <div className="flex items-center space-x-2.5">
                <span className="text-base font-bold tracking-tight text-white/90">
                  GNX Voice
                </span>
                {isPrivateChat && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/90 text-emerald-400 border border-emerald-800/60 font-semibold tracking-wide">
                    Private
                  </span>
                )}
              </div>

              {/* Active mode indicator */}
              <div className="flex items-center space-x-2 text-xs text-zinc-400 bg-zinc-900/80 px-3 py-1 rounded-full border border-zinc-800">
                <span className="w-2 h-2 rounded-full bg-[#48A04C] animate-pulse" />
                <span className="font-medium">
                  {speakingIndex !== null
                    ? "Speaking..."
                    : isLoading
                    ? "Thinking..."
                    : isVoiceModeListening
                    ? "Listening..."
                    : "Muted"}
                </span>
              </div>
            </div>

            {/* Revealed Conversation Message List when Orb is Minimized */}
            {isVoiceChatMinimized && (
              <div className="w-full max-w-2xl flex-1 overflow-y-auto px-4 py-3 space-y-3 z-10 min-h-0 scrollbar-thin scrollbar-thumb-zinc-800">
                {history.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-zinc-500 text-sm italic">
                    No messages yet in this call. Speak or type below!
                  </div>
                ) : (
                  history.map((msg, idx) => {
                    const isUser = msg.role === "user";
                    const textContent = msg.parts.map((p) => p.text || "").join("\n").trim();
                    if (!textContent) return null;
                    return (
                      <div
                        key={idx}
                        className={`flex flex-col ${isUser ? "items-end" : "items-start"} animate-in fade-in duration-200`}
                      >
                        <div
                          className={`max-w-[88%] px-4 py-2.5 rounded-2xl text-sm sm:text-base leading-relaxed ${
                            isUser
                              ? "bg-[#48A04C]/25 border border-[#48A04C]/50 text-emerald-100 rounded-br-xs"
                              : "bg-zinc-900/90 border border-zinc-800 text-zinc-100 rounded-bl-xs shadow-lg"
                          }`}
                        >
                          <div className="font-semibold text-[11px] mb-1 opacity-60">
                            {isUser ? "You" : "Zen"}
                          </div>
                          <div className="whitespace-pre-wrap">{textContent}</div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={voiceMessagesEndRef} />
              </div>
            )}

            {/* Center / Bottom Area with Glowing Voice Orb */}
            <div
              className={`relative w-full flex flex-col items-center justify-center pointer-events-none transition-all duration-200 ease-out z-10 ${
                isVoiceChatMinimized ? "py-2 shrink-0 my-1" : "my-auto flex-1"
              }`}
            >
              <div className="relative flex items-center justify-center pointer-events-auto">
                {/* Outer ambient glow */}
                <div
                  className={`absolute rounded-full blur-2xl sm:blur-3xl transition-all duration-200 pointer-events-none ${
                    isVoiceChatMinimized
                      ? "w-[100px] h-[100px] sm:w-[120px] sm:h-[120px]"
                      : "w-[300px] h-[300px] sm:w-[340px] sm:h-[340px]"
                  } ${
                    speakingIndex !== null || isLoading
                      ? "bg-[#48A04C]/45 scale-110 opacity-75"
                      : isVoiceModeListening
                      ? "bg-[#48A04C]/25 scale-100 opacity-50"
                      : "bg-emerald-900/20 scale-90 opacity-30"
                  }`}
                />

                {/* Glowing Orb Blob matching ChatGPT Voice Mode reference */}
                <motion.div
                  layout
                  animate={
                    speakingIndex !== null || isLoading
                      ? {
                          scale: [1, 1.05, 0.97, 1.04, 1],
                        }
                      : isVoiceModeListening
                      ? {
                          scale: [0.97, 1.03, 0.97],
                        }
                      : {
                          scale: [0.98, 1, 0.98],
                        }
                  }
                  transition={{
                    duration: speakingIndex !== null || isLoading ? 1.8 : 3.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                    layout: { duration: 0.18, ease: "easeInOut" },
                  }}
                  className={`relative rounded-full shadow-[0_0_80px_rgba(72,160,76,0.5)] transition-all duration-200 ease-out overflow-hidden cursor-pointer shrink-0 border border-emerald-400/20 ${
                    isVoiceChatMinimized
                      ? "w-20 h-20 sm:w-24 sm:h-24"
                      : "w-[260px] h-[260px] sm:w-[280px] sm:h-[280px]"
                  }`}
                  onClick={() => setIsVoiceChatMinimized((prev) => !prev)}
                  title={isVoiceChatMinimized ? "Click to expand orb" : "Click to show conversation"}
                  style={{
                    transformOrigin: "center center",
                    background:
                      "radial-gradient(circle at 35% 65%, #ffffff 0%, #bbf7d0 22%, #48A04C 60%, #15803d 100%)",
                  }}
                >
                  {/* Organic light reflection overlay */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/30 via-transparent to-black/40 mix-blend-overlay pointer-events-none" />
                  <div className="absolute inset-0 rounded-full shadow-[inset_-12px_-12px_28px_rgba(0,0,0,0.45)] pointer-events-none" />
                </motion.div>
              </div>

              {/* Helper text under orb */}
              <div className="mt-2 text-[11px] font-medium text-zinc-400/80 tracking-wide pointer-events-none select-none transition-opacity duration-200">
                {isVoiceChatMinimized ? "Tap orb to center" : "Tap orb to show conversation"}
              </div>
            </div>

            {/* Bottom Controls Pill Bar (Matching Reference) */}
            <div className="w-full max-w-2xl px-4 pb-6 sm:pb-10 z-20 shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (voiceInputText.trim()) {
                    const textToSend = voiceInputText.trim();
                    setVoiceInputText("");
                    voiceInputTextRef.current = "";
                    handleSubmit(undefined, textToSend);
                  }
                }}
                className="bg-zinc-900/90 border border-zinc-800/90 rounded-full p-2.5 flex items-center space-x-2.5 shadow-2xl backdrop-blur-2xl"
              >
                {/* Left "+" Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-10 h-10 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white transition-colors flex items-center justify-center shrink-0 cursor-pointer"
                  title="Attach file"
                >
                  <Plus className="w-5 h-5 stroke-[2]" />
                </button>

                {/* Middle Text Input */}
                <input
                  type="text"
                  value={voiceInputText}
                  onChange={(e) => {
                    setVoiceInputText(e.target.value);
                    voiceInputTextRef.current = e.target.value;
                  }}
                  placeholder="Type"
                  className="flex-1 bg-transparent text-white placeholder-zinc-500 focus:outline-none text-base px-2 py-1 font-medium"
                />

                {/* Microphone Toggle Button (Mute/Unmute Call Mic) */}
                <button
                  type="button"
                  onClick={toggleVoiceCallMute}
                  className={`w-10 h-10 rounded-full transition-all flex items-center justify-center shrink-0 cursor-pointer ${
                    isVoiceModeListening
                      ? "bg-red-600/90 hover:bg-red-500 text-white animate-pulse"
                      : "bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white"
                  }`}
                  title={isVoiceModeListening ? "Mute microphone" : "Unmute microphone"}
                >
                  <Mic className="w-5 h-5" />
                </button>

                {/* Right Close "X" Button (End Voice Call) */}
                <button
                  type="button"
                  onClick={stopVoiceCallMode}
                  className="w-10 h-10 rounded-full bg-white hover:bg-zinc-200 text-zinc-950 font-bold transition-all flex items-center justify-center shrink-0 cursor-pointer shadow-md hover:scale-105 active:scale-95"
                  title="End voice call"
                >
                  <X className="w-5 h-5 stroke-[2.5]" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pricing Modal */}
      <PricingModal
        isOpen={isPricingOpen}
        onClose={() => setIsPricingOpen(false)}
        userEmail={userEmail}
        userId={userEmail || "zen_user_1"}
      />
    </main>
  );
}
