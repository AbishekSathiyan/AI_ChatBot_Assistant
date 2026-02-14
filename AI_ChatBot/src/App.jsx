import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  SiReact,
  SiPython,
  SiJavascript,
  SiTypescript,
  SiCss3,
} from "react-icons/si";
import { AiOutlineApi, AiOutlineBug, AiOutlineRocket } from "react-icons/ai";
import { MdInfo, MdVolumeUp } from "react-icons/md";
import "./App.css";
import "./index.css";

import Logo from "./Logo.png";

// Import voice components (only for text-to-speech)
import useVoiceAssistant from "./hooks/useVoiceAssistant";
import VoiceButton from "./components/VoiceButton";

// Production-ready API Configuration from environment variables
const ENV_CONFIG = {
  PUTER_API_KEY: process.env.REACT_APP_PUTER_API_KEY,
  PUTER_API_URL:
    process.env.REACT_APP_PUTER_API_URL || "https://api.puter.com/v2",
  PUTER_MODEL: process.env.REACT_APP_PUTER_MODEL || "gpt-4.1-nano",
  PUTER_SCRIPT_URL: process.env.REACT_APP_API_URL || "https://js.puter.com/v2/",
  PUTER_TIMEOUT: parseInt(process.env.REACT_APP_PUTER_TIMEOUT) || 30000,
  PUTER_MAX_RETRIES: parseInt(process.env.REACT_APP_PUTER_MAX_RETRIES) || 3,
  PUTER_RETRY_DELAY: parseInt(process.env.REACT_APP_PUTER_RETRY_DELAY) || 1000,
  USE_DIRECT_API: process.env.REACT_APP_USE_DIRECT_API === "true",

  MAX_INPUT_LENGTH: parseInt(process.env.REACT_APP_MAX_INPUT_LENGTH) || 4000,
  STREAMING_DELAY: parseInt(process.env.REACT_APP_STREAMING_DELAY) || 30,
  ENABLE_ANALYTICS: process.env.REACT_APP_ENABLE_ANALYTICS === "true",
  ENVIRONMENT: process.env.REACT_APP_ENVIRONMENT || "Live",

  VOICE_LANGUAGE: process.env.REACT_APP_VOICE_LANGUAGE || "en-US",
  VOICE_RATE: parseFloat(process.env.REACT_APP_VOICE_RATE) || 1,
  VOICE_PITCH: parseFloat(process.env.REACT_APP_VOICE_PITCH) || 1,
  VOICE_VOLUME: parseFloat(process.env.REACT_APP_VOICE_VOLUME) || 1,
};

// Error types for better error handling
const ErrorTypes = {
  NETWORK: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT_ERROR",
  AUTH: "AUTHENTICATION_ERROR",
  RATE_LIMIT: "RATE_LIMIT_ERROR",
  SERVER: "SERVER_ERROR",
  UNKNOWN: "UNKNOWN_ERROR",
};

// Custom hook for Puter.ai API with production-ready features
const usePuterAI = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isPuterLoaded, setIsPuterLoaded] = useState(false);
  const [scriptLoadAttempted, setScriptLoadAttempted] = useState(false);
  const [apiHealth, setApiHealth] = useState("checking");

  useEffect(() => {
    if (ENV_CONFIG.USE_DIRECT_API || scriptLoadAttempted) return;

    let retryCount = 0;
    const maxRetries = 3;

    const loadPuterScript = () => {
      return new Promise((resolve, reject) => {
        if (document.querySelector('script[src*="puter.com"]')) {
          console.log("✅ Puter.ai script already loaded");
          setIsPuterLoaded(true);
          setApiHealth("healthy");
          resolve(true);
          return;
        }

        const script = document.createElement("script");
        script.src = ENV_CONFIG.PUTER_SCRIPT_URL;
        script.async = true;

        script.onload = () => {
          console.log("✅ Puter.ai script loaded successfully");
          setIsPuterLoaded(true);
          setApiHealth("healthy");
          resolve(true);
        };

        script.onerror = (error) => {
          console.error(
            `❌ Failed to load Puter.ai script (attempt ${retryCount + 1}/${maxRetries}):`,
            error,
          );

          if (retryCount < maxRetries) {
            retryCount++;
            console.log(
              `🔄 Retrying script load... (${retryCount}/${maxRetries})`,
            );
            setTimeout(() => {
              document.body.removeChild(script);
              loadPuterScript().then(resolve).catch(reject);
            }, ENV_CONFIG.PUTER_RETRY_DELAY * retryCount);
          } else {
            setApiHealth("unhealthy");
            reject(
              new Error(
                "Failed to load Puter.ai script after multiple attempts",
              ),
            );
          }
        };

        document.body.appendChild(script);
        setScriptLoadAttempted(true);
      });
    };

    loadPuterScript().catch((err) => {
      console.warn(
        "⚠️ Using fallback API due to script load failure:",
        err.message,
      );
      setApiHealth("unhealthy");
    });

    return () => {};
  }, [scriptLoadAttempted]);

  const callDirectAPI = useCallback(async (prompt, options = {}) => {
    const {
      model = ENV_CONFIG.PUTER_MODEL,
      timeout = ENV_CONFIG.PUTER_TIMEOUT,
      temperature = 0.7,
      max_tokens = 2000,
    } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      if (!ENV_CONFIG.PUTER_API_KEY) {
        throw new Error("API key is not configured");
      }

      const response = await fetch(`${ENV_CONFIG.PUTER_API_URL}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENV_CONFIG.PUTER_API_KEY}`,
          "X-Environment": ENV_CONFIG.ENVIRONMENT,
          "X-SDK-Version": "react-1.0.0",
        },
        body: JSON.stringify({
          prompt,
          model,
          stream: false,
          temperature,
          max_tokens,
          top_p: 0.95,
          frequency_penalty: 0,
          presence_penalty: 0,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        switch (response.status) {
          case 401:
            throw {
              type: ErrorTypes.AUTH,
              message: "Invalid API key",
              status: 401,
            };
          case 429:
            throw {
              type: ErrorTypes.RATE_LIMIT,
              message: "Rate limit exceeded",
              status: 429,
            };
          case 503:
          case 504:
            throw {
              type: ErrorTypes.SERVER,
              message: "Service unavailable",
              status: response.status,
            };
          default:
            throw {
              type: ErrorTypes.UNKNOWN,
              message: errorData.error || `API Error: ${response.status}`,
              status: response.status,
            };
        }
      }

      const data = await response.json();
      return (
        data.message?.content ||
        data.response ||
        data.text ||
        "No response generated"
      );
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === "AbortError" || error.name === "TimeoutError") {
        throw {
          type: ErrorTypes.TIMEOUT,
          message: "Request timeout",
          status: 408,
        };
      }

      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw {
          type: ErrorTypes.NETWORK,
          message: "Network connection failed",
          status: 0,
        };
      }

      throw error;
    }
  }, []);

  const callPuterAI = useCallback(
    async (prompt, options = {}) => {
      const {
        retries = ENV_CONFIG.PUTER_MAX_RETRIES,
        timeout = ENV_CONFIG.PUTER_TIMEOUT,
        model = ENV_CONFIG.PUTER_MODEL,
        temperature = 0.7,
        max_tokens = 2000,
      } = options;

      setIsLoading(true);
      setError(null);

      const startTime = Date.now();

      try {
        if (
          !ENV_CONFIG.USE_DIRECT_API &&
          window.puter?.ai?.chat &&
          isPuterLoaded
        ) {
          try {
            console.log("🤖 Using Puter.ai SDK");
            const response = await window.puter.ai.chat(prompt, {
              model,
              timeout,
              temperature,
              max_tokens,
            });

            const endTime = Date.now();
            console.log(`✅ SDK response received in ${endTime - startTime}ms`);

            if (typeof response === "string") {
              return response;
            } else if (response?.message?.content) {
              if (Array.isArray(response.message.content)) {
                return response.message.content[0]?.text || "";
              }
              return response.message.content;
            }
            throw new Error("Invalid SDK response format");
          } catch (sdkError) {
            console.warn(
              "⚠️ SDK failed, falling back to direct API:",
              sdkError.message,
            );
            return await callDirectAPI(prompt, {
              model,
              timeout,
              temperature,
              max_tokens,
            });
          }
        }

        if (ENV_CONFIG.PUTER_API_KEY) {
          console.log("🤖 Using direct Puter.ai API");
          return await callDirectAPI(prompt, {
            model,
            timeout,
            temperature,
            max_tokens,
          });
        } else {
          if (ENV_CONFIG.ENVIRONMENT === "development") {
            console.warn("⚠️ No API key configured, using mock response");
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return `This is a mock response from the AI assistant in development mode.\n\nYour prompt was: "${prompt}"\n\nTo use the real API, please add your Puter.ai API key to the .env file.`;
          }
          throw { type: ErrorTypes.AUTH, message: "API key is not configured" };
        }
      } catch (error) {
        console.error("❌ API Error:", error);

        const errorType = error.type || ErrorTypes.UNKNOWN;
        const errorMessage = error.message || "Unknown error occurred";

        if (
          retries > 0 &&
          (errorType === ErrorTypes.TIMEOUT ||
            errorType === ErrorTypes.NETWORK ||
            errorType === ErrorTypes.SERVER ||
            errorType === ErrorTypes.RATE_LIMIT)
        ) {
          console.log(`🔄 Retrying... (${retries} attempts left)`);
          await new Promise((resolve) =>
            setTimeout(resolve, ENV_CONFIG.PUTER_RETRY_DELAY),
          );
          return callPuterAI(prompt, { ...options, retries: retries - 1 });
        }

        let userFriendlyMessage;
        switch (errorType) {
          case ErrorTypes.TIMEOUT:
            userFriendlyMessage = "⏰ Request timed out. Please try again.";
            break;
          case ErrorTypes.NETWORK:
            userFriendlyMessage =
              "🌐 Network error. Please check your internet connection.";
            break;
          case ErrorTypes.AUTH:
            userFriendlyMessage =
              "🔑 Authentication failed. Please check your API configuration.";
            break;
          case ErrorTypes.RATE_LIMIT:
            userFriendlyMessage =
              "⏳ Rate limit exceeded. Please wait a moment and try again.";
            break;
          case ErrorTypes.SERVER:
            userFriendlyMessage =
              "🔧 Service temporarily unavailable. Please try again later.";
            break;
          default:
            userFriendlyMessage =
              "⚠️ An unexpected error occurred. Please try again.";
        }

        setError({ type: errorType, message: userFriendlyMessage });
        throw new Error(userFriendlyMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [isPuterLoaded, callDirectAPI],
  );

  const checkHealth = useCallback(async () => {
    try {
      if (window.puter?.ai?.chat) {
        setApiHealth("healthy");
        return true;
      }

      if (ENV_CONFIG.PUTER_API_KEY) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${ENV_CONFIG.PUTER_API_URL}/health`, {
          signal: controller.signal,
        }).catch(() => null);

        clearTimeout(timeoutId);

        if (response?.ok) {
          setApiHealth("healthy");
          return true;
        }
      }

      setApiHealth("unhealthy");
      return false;
    } catch {
      setApiHealth("unhealthy");
      return false;
    }
  }, []);

  return {
    callPuterAI,
    isLoading,
    error,
    isPuterLoaded,
    apiHealth,
    checkHealth,
  };
};

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState("javascript");
  const [copySuccess, setCopySuccess] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem("theme");
    return savedTheme ? savedTheme === "dark" : true;
  });
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);
  const streamIntervalRef = useRef(null);
  const codeRef = useRef(null);
  const abortControllerRef = useRef(null);

  const {
    callPuterAI,
    isLoading: isAPILoading,
    error: apiCallError,
    apiHealth,
  } = usePuterAI();

  // Only use text-to-speech functionality, no microphone input
  const {
    isSpeaking,
    voices,
    selectedVoice,
    setSelectedVoice,
    speak,
    stopSpeaking,
    voiceSupported,
  } = useVoiceAssistant({
    language: ENV_CONFIG.VOICE_LANGUAGE,
    rate: ENV_CONFIG.VOICE_RATE,
    pitch: ENV_CONFIG.VOICE_PITCH,
    volume: ENV_CONFIG.VOICE_VOLUME,
    // Don't enable speech recognition features
  });

  useEffect(() => {
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
    document.body.classList.toggle("light-mode", !isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages, isTyping, streamingMessage]);

  useEffect(() => {
    if (isInitialized) {
      inputRef.current?.focus();
    }
  }, [isInitialized]);

  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        chatContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom && scrollTop > 200);
    }
  }, []);

  useEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (chatContainer) {
      chatContainer.addEventListener("scroll", handleScroll);
      return () => chatContainer.removeEventListener("scroll", handleScroll);
    }
  }, [handleScroll]);

  const copyToClipboard = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, []);

  const extractCode = useCallback((text) => {
    const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const matches = [...text.matchAll(codeRegex)];
    if (matches.length > 0) {
      const language = matches[0][1] || "javascript";
      const code = matches[0][2];
      return { language, code };
    }
    return null;
  }, []);

  const formatMessage = useCallback(
    (text) => {
      const parts = text.split(/(```[\s\S]*?```)/g);
      return parts.map((part, index) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const firstLine = part.split("\n")[0];
          const language = firstLine.replace("```", "").trim() || "javascript";
          const code = part.split("\n").slice(1).join("\n").replace(/```$/, "");

          return (
            <div
              key={index}
              className={`code-block-wrapper my-3 md:my-4 group ${!isDarkMode ? "light" : ""}`}
            >
              <div
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  isDarkMode
                    ? "bg-gradient-to-r from-[#1E1E1E] to-[#252525] border-white/[0.08]"
                    : "bg-gradient-to-r from-gray-50 to-gray-100 border-gray-200"
                } border rounded-t-xl px-3 md:px-4 py-2 md:py-2.5`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-5 h-5 rounded ${isDarkMode ? "bg-blue-500/10" : "bg-blue-100"} flex items-center justify-center flex-shrink-0`}
                  >
                    <svg
                      className={`w-3 h-3 ${isDarkMode ? "text-blue-400" : "text-blue-600"}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
                      />
                    </svg>
                  </div>
                  <span
                    className={`text-xs font-medium uppercase tracking-wider ${
                      isDarkMode ? "text-white/70" : "text-gray-600"
                    }`}
                  >
                    {language}
                  </span>
                </div>
                <div className="flex items-center gap-1 ml-auto sm:ml-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(code);
                    }}
                    className={`flex items-center gap-1.5 px-2 md:px-2.5 py-1.5 rounded-lg transition-all duration-200 ${
                      isDarkMode
                        ? "bg-white/[0.05] hover:bg-white/[0.1] text-white/60 hover:text-white/80"
                        : "bg-gray-200/50 hover:bg-gray-200 text-gray-600 hover:text-gray-800"
                    }`}
                    title="Copy code to clipboard"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H9a2.25 2.25 0 01-2.25-2.25V9m12 0h.008v.008h-.008V9z"
                      />
                    </svg>
                    <span className="text-xs">
                      {copySuccess ? "Copied!" : "Copy"}
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setGeneratedCode(code);
                      setCodeLanguage(language);
                      setShowCodeModal(true);
                    }}
                    className={`flex items-center gap-1.5 px-2 md:px-2.5 py-1.5 rounded-lg transition-all duration-200 ${
                      isDarkMode
                        ? "bg-white/[0.05] hover:bg-white/[0.1] text-white/60 hover:text-white/80"
                        : "bg-gray-200/50 hover:bg-gray-200 text-gray-600 hover:text-gray-800"
                    }`}
                    title="Expand code view"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M20.25 20.25v-4.5m0 4.5h-4.5m4.5 0L15 15"
                      />
                    </svg>
                    <span className="text-xs">Expand</span>
                  </button>
                </div>
              </div>
              <pre
                className={`${
                  isDarkMode
                    ? "bg-[#0C0C0C] border-white/[0.08] text-white/80"
                    : "bg-white border-gray-200 text-gray-800"
                } border-x border-b rounded-b-xl p-3 md:p-4 overflow-x-auto text-xs md:text-sm`}
              >
                <code className={`language-${language} font-mono`}>{code}</code>
              </pre>
            </div>
          );
        } else {
          return <span key={index}>{part}</span>;
        }
      });
    },
    [isDarkMode, copySuccess, copyToClipboard],
  );

  const simulateStreaming = useCallback((fullText) => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
    }

    setIsStreaming(true);
    setStreamingMessage("");

    let index = 0;
    const words = fullText.split(" ");
    const delay = ENV_CONFIG.STREAMING_DELAY;

    streamIntervalRef.current = setInterval(() => {
      if (index < words.length) {
        setStreamingMessage((prev) => prev + (prev ? " " : "") + words[index]);
        index++;
      } else {
        clearInterval(streamIntervalRef.current);
        setIsStreaming(false);
        setMessages((prev) => [...prev, { sender: "ai", text: fullText }]);
        setStreamingMessage("");
      }
    }, delay);
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;
    if (input.length > ENV_CONFIG.MAX_INPUT_LENGTH) {
      alert(
        `Input is too long. Maximum length is ${ENV_CONFIG.MAX_INPUT_LENGTH} characters.`,
      );
      return;
    }

    const userMessage = { sender: "user", text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);
    setSelectedSuggestion(null);
    setApiError(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      const aiResponse = await callPuterAI(input, {
        retries: ENV_CONFIG.PUTER_MAX_RETRIES,
        timeout: ENV_CONFIG.PUTER_TIMEOUT,
        model: ENV_CONFIG.PUTER_MODEL,
        temperature: 0.7,
        max_tokens: 2000,
      });

      setIsTyping(false);
      simulateStreaming(aiResponse);
    } catch (err) {
      console.error("API Error:", err);
      setIsTyping(false);
      setApiError(err.message);

      setMessages((prev) => [...prev, { sender: "ai", text: err.message }]);
    }
  };

  const handleKey = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [input],
  );

  const handleInputChange = useCallback(
    (e) => {
      const value = e.target.value;
      if (value.length <= ENV_CONFIG.MAX_INPUT_LENGTH) {
        setInput(value);
        e.target.style.height = "auto";
        e.target.style.height = `${Math.min(e.target.scrollHeight, isMobile ? 100 : 150)}px`;
      }
    },
    [isMobile],
  );

  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => !prev);
  }, []);

  const clearChat = useCallback(() => {
    if (window.confirm("Are you sure you want to clear the chat history?")) {
      setMessages([]);
      setSelectedSuggestion(null);
      setApiError(null);
    }
  }, []);

  const exportChat = useCallback(() => {
    const chatHistory = messages.map((msg) => ({
      role: msg.sender,
      content: msg.text,
      timestamp: new Date().toISOString(),
    }));

    const blob = new Blob([JSON.stringify(chatHistory, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages]);

  const readResponse = useCallback(
    (text) => {
      if (!voiceSupported) {
        alert("Text-to-speech is not supported in your browser.");
        return;
      }

      // Clean text (remove code blocks, markdown, etc.)
      const cleanText = text
        .replace(/```[\s\S]*?```/g, "Code block omitted")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/#+\s/g, "")
        .replace(/\*\*/g, "")
        .replace(/\*/g, "");

      speak(cleanText, {
        rate: 0.9, // Slightly slower for better comprehension
        pitch: 1,
      });
    },
    [voiceSupported, speak],
  );

  const suggestions = useMemo(
    () => [
      {
        id: 1,
        title: "React Hook",
        description: "API fetching hook",
        icon: <SiReact className="w-4 h-4" />,
        color: "blue",
        prompt:
          "Create a React hook for API fetching with loading states and error handling",
      },
      {
        id: 2,
        title: "Python",
        description: "Sort dictionary",
        icon: <SiPython className="w-4 h-4" />,
        color: "purple",
        prompt: "Write a Python function to sort a dictionary by values",
      },
      {
        id: 3,
        title: "JavaScript",
        description: "Debounce function",
        icon: <SiJavascript className="w-4 h-4" />,
        color: "yellow",
        prompt: "Create a JavaScript debounce function with immediate option",
      },
      {
        id: 4,
        title: "API",
        description: "Express REST API",
        icon: <AiOutlineApi className="w-4 h-4" />,
        color: "green",
        prompt: "Build a REST API with Express.js and MongoDB",
      },
      {
        id: 5,
        title: "TypeScript",
        description: "Generic interface",
        icon: <SiTypescript className="w-4 h-4" />,
        color: "blue",
        prompt: "Create a TypeScript generic interface for API responses",
      },
      {
        id: 6,
        title: "CSS",
        description: "Glassmorphism",
        icon: <SiCss3 className="w-4 h-4" />,
        color: "pink",
        prompt: "Create a glassmorphism CSS card component",
      },
      {
        id: 7,
        title: "Explain",
        description: "Code explanation",
        icon: <MdInfo className="w-4 h-4" />,
        color: "indigo",
        prompt: "Explain this code to me like I'm a beginner",
      },
      {
        id: 8,
        title: "Debug",
        description: "Find errors",
        icon: <AiOutlineBug className="w-4 h-4" />,
        color: "red",
        prompt: "Debug this code and fix the errors",
      },
      {
        id: 9,
        title: "Optimize",
        description: "Performance",
        icon: <AiOutlineRocket className="w-4 h-4" />,
        color: "amber",
        prompt: "Optimize this code for better performance",
      },
    ],
    [],
  );

  const getApiStatusColor = useCallback(() => {
    if (apiError) return "red";
    if (apiHealth === "healthy") return "emerald";
    if (apiHealth === "unhealthy") return "red";
    return "yellow";
  }, [apiError, apiHealth]);

  const getApiStatusText = useCallback(() => {
    if (apiError) return "API Error";
    if (apiHealth === "healthy") return "AURA MIND";
    if (apiHealth === "unhealthy") return "API Unavailable";
    return "Connecting...";
  }, [apiError, apiHealth]);

  const renderVoiceSettings = () => (
    <div className="flex items-center gap-2">
      {voiceSupported && voices.length > 0 && !isMobile && (
        <select
          value={selectedVoice?.name || ""}
          onChange={(e) => {
            const voice = voices.find((v) => v.name === e.target.value);
            setSelectedVoice(voice);
          }}
          className={`text-[10px] px-2 py-1 rounded-lg ${
            isDarkMode
              ? "bg-white/[0.03] border-white/[0.05] text-white/60"
              : "bg-gray-100 border-gray-200 text-gray-600"
          } border`}
        >
          {voices
            .filter((v) => v.lang.includes("en"))
            .map((voice) => (
              <option key={voice.name} value={voice.name}>
                {voice.name.replace("Google ", "").replace("Microsoft ", "")}
              </option>
            ))}
        </select>
      )}

      {isSpeaking && (
        <div
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] ${
            isDarkMode
              ? "bg-green-500/10 text-green-400"
              : "bg-green-100 text-green-600"
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Speaking...
        </div>
      )}
    </div>
  );

  const renderInputActions = () => (
    <div className="flex items-center gap-0.5 sm:gap-1">
      {!isMobile && (
        <button
          onClick={() => setInput("")}
          className={`p-1.5 sm:p-2 rounded-lg transition-all duration-200 ${
            input && !isAPILoading
              ? isDarkMode
                ? "hover:bg-white/[0.06] text-white/40 hover:text-white/60"
                : "hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              : "opacity-0 pointer-events-none"
          }`}
          title="Clear input"
          disabled={isAPILoading}
        >
          <svg
            className="w-3.5 h-3.5 sm:w-4 sm:h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}

      <button
        onClick={sendMessage}
        disabled={
          !input.trim() ||
          isAPILoading ||
          isTyping ||
          isStreaming ||
          apiHealth === "unhealthy"
        }
        className={`relative group p-2 sm:p-2.5 md:p-3 rounded-lg sm:rounded-xl transition-all duration-300 ${
          input.trim() &&
          !isAPILoading &&
          !isTyping &&
          !isStreaming &&
          apiHealth !== "unhealthy"
            ? isDarkMode
              ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/30"
              : "bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 hover:scale-105 hover:shadow-xl hover:shadow-blue-500/40"
            : isDarkMode
              ? "bg-white/[0.03] text-white/20 cursor-not-allowed"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
        }`}
        title={apiHealth === "unhealthy" ? "API Unavailable" : "Send message"}
      >
        <svg
          className="w-3.5 h-3.5 sm:w-4 sm:h-4 transform transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
          />
        </svg>
        {!isMobile &&
          input.trim() &&
          !isAPILoading &&
          apiHealth !== "unhealthy" && (
            <span className="absolute -top-1 -right-1 w-2 h-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
          )}
      </button>
    </div>
  );

  const apiStatusColor = getApiStatusColor();
  const apiStatusText = getApiStatusText();

  return (
    <div className={`${isDarkMode ? "dark" : "light"}`}>
      <div
        className={`flex flex-col h-screen transition-colors duration-300 ${
          isDarkMode
            ? "bg-[#0A0A0A] text-white"
            : "bg-gradient-to-br from-blue-50 via-white to-indigo-50 text-gray-900"
        } overflow-hidden`}
      >
        {/* Header */}
        <div
          className={`relative border-b transition-colors duration-300 ${
            isDarkMode
              ? "border-white/[0.03] bg-black/40"
              : "border-gray-200/50 bg-white/70"
          } backdrop-blur-2xl px-4 sm:px-6 py-3 sm:py-4`}
        >
          <div
            className={`absolute inset-0 ${
              isDarkMode
                ? "bg-gradient-to-r from-blue-500/5 via-transparent to-purple-500/5"
                : "bg-gradient-to-r from-blue-100/30 via-transparent to-purple-100/30"
            }`}
          ></div>

          <div className="max-w-6xl mx-auto flex items-center justify-between relative z-10">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="relative group">
                <div
                  className={`absolute inset-0 blur-xl sm:blur-2xl opacity-30 animate-pulse rounded-xl sm:rounded-2xl ${
                    isDarkMode ? "bg-blue-500" : "bg-blue-400"
                  }`}
                ></div>
                <div
                  className={`absolute inset-0 blur-lg sm:blur-xl opacity-20 animate-pulse delay-300 rounded-xl sm:rounded-2xl ${
                    isDarkMode ? "bg-indigo-500" : "bg-indigo-400"
                  }`}
                ></div>

                <div className="relative w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg sm:rounded-xl md:rounded-2xl overflow-hidden shadow-xl sm:shadow-2xl group-hover:scale-110 transition-transform duration-300">
                  <img
                    src={Logo}
                    alt="AI Assistant Logo"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = "none";
                      e.target.parentElement.innerHTML +=
                        '<span class="text-xl sm:text-2xl md:text-3xl">🤖</span>';
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <h1
                    className={`text-base sm:text-lg md:text-xl font-semibold ${
                      isDarkMode
                        ? "bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent"
                        : "text-gray-900"
                    }`}
                  >
                    {isMobile ? "AI" : "AI Assistant"}
                  </h1>
                  <span
                    className={`px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[10px] font-medium rounded-full uppercase tracking-wider ${
                      isDarkMode
                        ? "bg-blue-500/10 border border-blue-500/20 text-blue-400"
                        : "bg-blue-100 border border-blue-200 text-blue-600"
                    }`}
                  >
                    {ENV_CONFIG.ENVIRONMENT === "production"
                      ? "Production"
                      : "Aura Mind"}
                  </span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 mt-0.5">
                  <div className="flex items-center gap-1">
                    <span className="relative flex h-1 sm:h-1.5 w-1 sm:w-1.5">
                      <span
                        className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                          apiStatusColor === "emerald"
                            ? "bg-emerald-400"
                            : apiStatusColor === "red"
                              ? "bg-red-400"
                              : "bg-yellow-400"
                        } opacity-75`}
                      ></span>
                      <span
                        className={`relative inline-flex rounded-full h-1 sm:h-1.5 w-1 sm:w-1.5 ${
                          apiStatusColor === "emerald"
                            ? "bg-emerald-500"
                            : apiStatusColor === "red"
                              ? "bg-red-500"
                              : "bg-yellow-500"
                        }`}
                      ></span>
                    </span>
                    <span
                      className={`text-[8px] sm:text-[10px] ${
                        isDarkMode ? "text-white/40" : "text-gray-500"
                      }`}
                    >
                      {ENV_CONFIG.PUTER_MODEL.split("-").slice(0, 2).join(" ")}
                    </span>
                  </div>
                  {!isMobile && (
                    <>
                      <span
                        className={`text-[8px] sm:text-[10px] ${isDarkMode ? "text-white/20" : "text-gray-300"}`}
                      >
                        •
                      </span>
                      <span
                        className={`text-[8px] sm:text-[10px] ${isDarkMode ? "text-white/40" : "text-gray-500"}`}
                      >
                        {ENV_CONFIG.ENVIRONMENT === "production"
                          ? "Production Ready"
                          : "Production"}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {renderVoiceSettings()}

              {!isMobile && messages.length > 0 && (
                <>
                  <button
                    onClick={exportChat}
                    className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-200 ${
                      isDarkMode
                        ? "bg-white/[0.03] hover:bg-white/[0.06] text-white/60 hover:text-white/80"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800"
                    }`}
                    title="Export chat history"
                  >
                    Export
                  </button>
                  <button
                    onClick={clearChat}
                    className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-200 ${
                      isDarkMode
                        ? "bg-white/[0.03] hover:bg-white/[0.06] text-white/60 hover:text-white/80"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800"
                    }`}
                    title="Clear chat history"
                  >
                    Clear
                  </button>
                </>
              )}

              <button
                onClick={toggleTheme}
                className={`relative w-12 sm:w-14 h-6 sm:h-7 rounded-full transition-all duration-500 ${
                  isDarkMode
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600"
                    : "bg-gradient-to-r from-yellow-400 to-orange-400"
                } shadow-lg hover:shadow-xl transform hover:scale-105`}
                title="Toggle theme"
              >
                <div
                  className={`absolute top-1 left-1 w-4 sm:w-5 h-4 sm:h-5 rounded-full bg-white shadow-md transform transition-transform duration-500 flex items-center justify-center ${
                    isDarkMode
                      ? "translate-x-6 sm:translate-x-7"
                      : "translate-x-0"
                  }`}
                >
                  {isDarkMode ? (
                    <svg
                      className="w-2.5 sm:w-3 h-2.5 sm:h-3 text-indigo-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                    </svg>
                  ) : (
                    <svg
                      className="w-2.5 sm:w-3 h-2.5 sm:h-3 text-yellow-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Chat Container */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto scroll-smooth relative"
          style={{
            background: isDarkMode
              ? "radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.03) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(139, 92, 246, 0.03) 0%, transparent 40%)"
              : "radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.05) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(139, 92, 246, 0.05) 0%, transparent 40%)",
          }}
        >
          <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-5 md:space-y-6">
            {messages.length === 0 && !isStreaming ? (
              <div
                className={`min-h-[70vh] sm:min-h-[75vh] md:min-h-[80vh] flex flex-col items-center justify-center text-center space-y-6 sm:space-y-8 md:space-y-10 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {/* Welcome content */}
                <div className="relative group">
                  <div
                    className={`absolute inset-0 blur-[50px] sm:blur-[80px] md:blur-[100px] opacity-30 rounded-full animate-pulse ${
                      isDarkMode ? "bg-blue-500" : "bg-blue-400"
                    }`}
                  ></div>
                  <div
                    className={`absolute inset-0 blur-[40px] sm:blur-[60px] md:blur-[80px] opacity-20 rounded-full animate-pulse delay-300 ${
                      isDarkMode ? "bg-indigo-500" : "bg-indigo-400"
                    }`}
                  ></div>

                  <div
                    className={`relative w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-2xl sm:rounded-2xl md:rounded-3xl backdrop-blur-2xl border-2 flex items-center justify-center group-hover:scale-110 transition-all duration-500 overflow-hidden ${
                      isDarkMode
                        ? "bg-gradient-to-tr from-blue-500/10 via-indigo-500/10 to-purple-500/10 border-white/[0.08]"
                        : "bg-gradient-to-tr from-blue-100/50 via-indigo-100/50 to-purple-100/50 border-gray-200"
                    }`}
                  >
                    <img
                      src={Logo}
                      alt="AI Assistant Logo"
                      className="w-16 h-16 sm:w-20 sm:h-20 md:w-28 md:h-28 object-contain animate-float"
                      onError={(e) => {
                        e.target.style.display = "none";
                        e.target.parentElement.innerHTML +=
                          '<div class="text-4xl sm:text-5xl md:text-6xl">🤖</div>';
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2 sm:space-y-3 md:space-y-4 max-w-2xl px-4">
                  <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light tracking-tight">
                    How can I{" "}
                    <span className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent animate-gradient relative">
                      help
                      <span
                        className={`absolute -bottom-1 sm:-bottom-2 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full ${
                          isDarkMode ? "opacity-100" : "opacity-70"
                        }`}
                      ></span>
                    </span>{" "}
                    you today?
                  </h2>
                  <p
                    className={`text-xs sm:text-sm font-light max-w-lg mx-auto leading-relaxed px-2 ${
                      isDarkMode ? "text-white/30" : "text-gray-600"
                    }`}
                  >
                    {isMobile
                      ? "Production-ready AI assistant for coding, debugging & optimization"
                      : `Production-ready AI assistant powered by Aura Mind— ready to help with coding, debugging, optimization, and complex problem-solving.`}
                  </p>
                </div>

                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                    isDarkMode
                      ? `bg-${apiStatusColor}-500/10 border-${apiStatusColor}-500/20`
                      : `bg-${apiStatusColor}-100 border-${apiStatusColor}-200`
                  }`}
                >
                  <span className="relative flex h-2 w-2">
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-${apiStatusColor}-400 opacity-75`}
                    ></span>
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 bg-${apiStatusColor}-500`}
                    ></span>
                  </span>
                  <span
                    className={`text-[10px] sm:text-xs font-medium ${
                      isDarkMode
                        ? `text-${apiStatusColor}-400`
                        : `text-${apiStatusColor}-600`
                    }`}
                  >
                    {apiStatusText}
                  </span>
                </div>

                <div
                  className={`flex flex-wrap justify-center items-center gap-3 sm:gap-4 md:gap-6 text-[10px] sm:text-xs ${
                    isDarkMode ? "text-white/20" : "text-gray-400"
                  } px-4`}
                >
                  <div className="flex items-center gap-1 sm:gap-2">
                    <svg
                      className="w-3 h-3 sm:w-4 sm:h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                      />
                    </svg>
                    <span>30+ Languages</span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <svg
                      className="w-3 h-3 sm:w-4 sm:h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
                      />
                    </svg>
                    <span>Analysis</span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <svg
                      className="w-3 h-3 sm:w-4 sm:h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                      />
                    </svg>
                    <span>Debug</span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <svg
                      className="w-3 h-3 sm:w-4 sm:h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                      />
                    </svg>
                    <span>Secure</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 w-full max-w-4xl mt-4 sm:mt-6 md:mt-8 px-2 sm:px-4">
                  {suggestions.slice(0, isMobile ? 6 : 9).map((suggestion) => (
                    <button
                      key={suggestion.id}
                      onClick={() => {
                        setInput(suggestion.prompt);
                        setSelectedSuggestion(suggestion.id);
                        inputRef.current?.focus();
                      }}
                      disabled={isAPILoading}
                      className={`group relative p-2 sm:p-3 md:p-4 rounded-lg sm:rounded-xl transition-all duration-500 hover:scale-105 hover:shadow-2xl overflow-hidden ${
                        isDarkMode
                          ? `bg-white/[0.02] hover:bg-white/[0.04] border ${selectedSuggestion === suggestion.id ? `border-${suggestion.color}-500/50 bg-${suggestion.color}-500/5` : "border-white/[0.05] hover:border-white/[0.12]"}`
                          : `bg-white hover:bg-gray-50 border ${selectedSuggestion === suggestion.id ? `border-${suggestion.color}-500 bg-${suggestion.color}-50/50` : "border-gray-200 hover:border-gray-300"}`
                      } ${isAPILoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      title={!isMobile ? `Generate: ${suggestion.prompt}` : ""}
                    >
                      <div
                        className={`absolute inset-0 bg-gradient-to-r from-${suggestion.color}-500/0 via-${suggestion.color}-500/0 to-${suggestion.color}-500/0 group-hover:from-${suggestion.color}-500/5 group-hover:via-${suggestion.color}-500/5 group-hover:to-${suggestion.color}-500/0 transition-all duration-700`}
                      ></div>

                      <div className="relative z-10">
                        <div
                          className={`w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center mb-1.5 sm:mb-2 md:mb-3 group-hover:scale-110 transition-transform duration-300 mx-auto sm:mx-0 ${
                            isDarkMode
                              ? `bg-${suggestion.color}-500/10 text-${suggestion.color}-400`
                              : `bg-${suggestion.color}-100 text-${suggestion.color}-600`
                          }`}
                        >
                          {suggestion.icon}
                        </div>
                        <h3
                          className={`text-xs sm:text-sm font-medium transition-colors duration-300 ${
                            isDarkMode
                              ? `text-white/90 group-hover:text-${suggestion.color}-400`
                              : `text-gray-700 group-hover:text-${suggestion.color}-600`
                          }`}
                        >
                          {isMobile
                            ? suggestion.title.substring(0, 4)
                            : suggestion.title}
                        </h3>
                        {!isMobile && (
                          <p
                            className={`text-[8px] sm:text-[10px] mt-1 transition-colors duration-300 ${
                              isDarkMode
                                ? "text-white/40 group-hover:text-white/60"
                                : "text-gray-500 group-hover:text-gray-700"
                            }`}
                          >
                            {suggestion.description}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"} animate-slideIn px-1 sm:px-0 relative group`}
                  >
                    <div
                      className={`relative max-w-[90%] sm:max-w-[80%] md:max-w-[70%] ${
                        msg.sender === "user"
                          ? isDarkMode
                            ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-2xl shadow-blue-600/20"
                            : "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-xl shadow-blue-500/30"
                          : isDarkMode
                            ? "bg-white/[0.03] backdrop-blur-sm border border-white/[0.05] text-white/90 hover:border-white/[0.12]"
                            : "bg-white backdrop-blur-sm border border-gray-200 text-gray-800 hover:border-gray-300 shadow-sm"
                      } rounded-2xl ${
                        msg.sender === "user"
                          ? "rounded-tr-none"
                          : "rounded-tl-none"
                      } transition-all duration-300`}
                    >
                      {msg.sender === "ai" && (
                        <>
                          <div
                            className={`absolute -left-2 sm:-left-3 top-1/2 -translate-y-1/2 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg ${
                              isDarkMode
                                ? "shadow-blue-500/30"
                                : "shadow-blue-500/40"
                            } animate-pulse-slow overflow-hidden`}
                          >
                            <img
                              src={Logo}
                              alt="AI"
                              className="w-4 h-4 sm:w-5 sm:h-5 object-cover"
                              onError={(e) => {
                                e.target.style.display = "none";
                                e.target.parentElement.innerHTML +=
                                  '<span class="text-xs">🤖</span>';
                              }}
                            />
                          </div>
                          {voiceSupported && (
                            <button
                              onClick={() => readResponse(msg.text)}
                              className={`absolute -right-2 -top-2 p-1.5 rounded-full transition-all duration-200 opacity-0 group-hover:opacity-100 ${
                                isDarkMode
                                  ? "bg-white/[0.05] hover:bg-white/[0.1] text-white/60 hover:text-white/80 border border-white/[0.05]"
                                  : "bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800 border border-gray-200"
                              }`}
                              title="Listen to this response"
                            >
                              <MdVolumeUp className="w-3 h-3" />
                            </button>
                          )}
                        </>
                      )}
                      <div className="px-3 sm:px-4 md:px-5 py-2.5 sm:py-3 md:py-4">
                        <div className="whitespace-pre-wrap break-words text-xs sm:text-sm md:text-[0.95rem] leading-relaxed font-light">
                          {formatMessage(msg.text)}
                        </div>
                        <div
                          className={`flex items-center justify-between mt-2 sm:mt-3 pt-1.5 sm:pt-2 border-t ${
                            msg.sender === "user"
                              ? isDarkMode
                                ? "border-blue-400/20"
                                : "border-white/20"
                              : isDarkMode
                                ? "border-white/[0.05]"
                                : "border-gray-200"
                          }`}
                        >
                          <div
                            className={`text-[8px] sm:text-[9px] tracking-wider uppercase flex items-center gap-1 ${
                              msg.sender === "user"
                                ? "text-blue-200/50"
                                : isDarkMode
                                  ? "text-white/20"
                                  : "text-gray-400"
                            }`}
                          >
                            <svg
                              className="w-2 h-2 sm:w-2.5 sm:h-2.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            {new Date().toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>

                          {msg.sender === "ai" && extractCode(msg.text) && (
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[8px] sm:text-[9px] flex items-center gap-1 ${
                                  isDarkMode ? "text-white/30" : "text-gray-500"
                                }`}
                              >
                                <svg
                                  className="w-2 h-2 sm:w-2.5 sm:h-2.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H9a2.25 2.25 0 01-2.25-2.25V9m12 0h.008v.008h-.008V9z"
                                  />
                                </svg>
                                {!isMobile && "Code detected"}
                                {isMobile && "Code"}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {isStreaming && (
                  <div className="flex justify-start animate-slideIn px-1 sm:px-0">
                    <div
                      className={`relative max-w-[90%] sm:max-w-[80%] md:max-w-[70%] backdrop-blur-sm border rounded-2xl rounded-tl-none ${
                        isDarkMode
                          ? "bg-white/[0.03] border-white/[0.05] text-white/90"
                          : "bg-white border-gray-200 text-gray-800"
                      }`}
                    >
                      <div className="absolute -left-2 sm:-left-3 top-1/2 -translate-y-1/2 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30 animate-pulse overflow-hidden">
                        <img
                          src={Logo}
                          alt="AI"
                          className="w-4 h-4 sm:w-5 sm:h-5 object-cover"
                          onError={(e) => {
                            e.target.style.display = "none";
                            e.target.parentElement.innerHTML +=
                              '<span class="text-xs">🤖</span>';
                          }}
                        />
                      </div>
                      <div className="px-3 sm:px-4 md:px-5 py-2.5 sm:py-3 md:py-4">
                        <div className="whitespace-pre-wrap break-words text-xs sm:text-sm md:text-[0.95rem] leading-relaxed font-light">
                          {streamingMessage}
                          <span className="inline-block w-0.5 h-3 sm:h-4 ml-1 bg-gradient-to-r from-blue-400 to-purple-400 animate-blink"></span>
                        </div>
                        <div
                          className={`flex flex-wrap items-center gap-2 sm:gap-3 mt-2 sm:mt-3 pt-1.5 sm:pt-2 border-t ${
                            isDarkMode
                              ? "border-white/[0.05]"
                              : "border-gray-200"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex gap-1">
                              <span
                                className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-blue-400 rounded-full animate-bounce"
                                style={{ animationDelay: "0ms" }}
                              ></span>
                              <span
                                className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-indigo-400 rounded-full animate-bounce"
                                style={{ animationDelay: "150ms" }}
                              ></span>
                              <span
                                className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-purple-400 rounded-full animate-bounce"
                                style={{ animationDelay: "300ms" }}
                              ></span>
                            </div>
                            <span
                              className={`text-[8px] sm:text-[10px] uppercase tracking-wider ${
                                isDarkMode ? "text-white/40" : "text-gray-500"
                              }`}
                            >
                              {isMobile
                                ? "AI typing..."
                                : "Generating response"}
                            </span>
                          </div>
                          <span
                            className={`text-[8px] sm:text-[9px] flex items-center gap-1 ${
                              isDarkMode ? "text-white/20" : "text-gray-400"
                            }`}
                          >
                            <svg
                              className="w-2 h-2 sm:w-2.5 sm:h-2.5 animate-spin-slow"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                              />
                            </svg>
                            {streamingMessage.split(" ").length} words
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {isTyping && !isStreaming && (
                  <div className="flex justify-start animate-slideIn px-1 sm:px-0">
                    <div
                      className={`relative backdrop-blur-sm border rounded-2xl rounded-tl-none px-4 sm:px-6 py-3 sm:py-4 ${
                        isDarkMode
                          ? "bg-white/[0.02] border-white/[0.05]"
                          : "bg-white border-gray-200"
                      }`}
                    >
                      <div className="absolute -left-2 sm:-left-3 top-1/2 -translate-y-1/2 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30 overflow-hidden">
                        <img
                          src={Logo}
                          alt="AI"
                          className="w-4 h-4 sm:w-5 sm:h-5 object-cover"
                          onError={(e) => {
                            e.target.style.display = "none";
                            e.target.parentElement.innerHTML +=
                              '<span class="text-xs">🤖</span>';
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2 sm:gap-4 pl-2 sm:pl-2">
                        <div className="flex gap-1 sm:gap-1.5">
                          <span
                            className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-400 rounded-full animate-pulse"
                            style={{ animationDelay: "0ms" }}
                          ></span>
                          <span
                            className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-indigo-400 rounded-full animate-pulse"
                            style={{ animationDelay: "200ms" }}
                          ></span>
                          <span
                            className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-400 rounded-full animate-pulse"
                            style={{ animationDelay: "400ms" }}
                          ></span>
                        </div>
                        <span
                          className={`text-[10px] sm:text-xs font-light ${
                            isDarkMode ? "text-white/40" : "text-gray-500"
                          }`}
                        >
                          {isMobile ? "Thinking..." : "Processing your request"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className={`fixed bottom-20 sm:bottom-24 md:bottom-28 right-4 sm:right-6 md:right-8 z-40 w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 animate-bounce-slow ${
              isDarkMode
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700"
                : "bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600"
            }`}
            title="Scroll to bottom"
          >
            <svg
              className="w-5 h-5 sm:w-5.5 sm:h-5.5 md:w-6 md:h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7-7-7m14-6l-7 7-7-7"
              />
            </svg>
          </button>
        )}

        {/* Input Area */}
        <div
          className={`relative border-t transition-colors duration-300 ${
            isDarkMode
              ? "border-white/[0.03] bg-black/40"
              : "border-gray-200/50 bg-white/70"
          } backdrop-blur-2xl`}
        >
          <div
            className={`absolute inset-0 ${
              isDarkMode
                ? "bg-gradient-to-r from-blue-500/5 via-transparent to-purple-500/5"
                : "bg-gradient-to-r from-blue-100/30 via-transparent to-purple-100/30"
            }`}
          ></div>

          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3 md:py-4 relative z-10">
            <div className="relative">
              <div
                className={`relative flex items-end gap-2 sm:gap-3 rounded-xl sm:rounded-2xl border transition-all duration-300 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 ${
                  isDarkMode
                    ? "bg-gradient-to-b from-white/[0.03] to-white/[0.02] border-white/[0.05] focus-within:border-blue-500/30 focus-within:shadow-2xl focus-within:shadow-blue-500/10"
                    : "bg-white border-gray-200 focus-within:border-blue-400 focus-within:shadow-lg focus-within:shadow-blue-500/20"
                }`}
              >
                <textarea
                  ref={inputRef}
                  className={`flex-1 bg-transparent resize-none focus:outline-none text-xs sm:text-sm leading-relaxed py-2 sm:py-2.5 md:py-3 px-1 sm:px-2 font-light transition-colors duration-300 ${
                    isDarkMode
                      ? "text-white/90 placeholder-white/30"
                      : "text-gray-900 placeholder-gray-400"
                  }`}
                  rows={1}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKey}
                  placeholder={
                    isMobile
                      ? "Ask anything..."
                      : "Ask me anything — code, explain, debug, optimize..."
                  }
                  disabled={isAPILoading || isTyping || isStreaming}
                  style={{
                    minHeight: isMobile ? "40px" : "44px",
                    height: "auto",
                    maxHeight: isMobile ? "100px" : "150px",
                  }}
                />

                {renderInputActions()}
              </div>

              <div className="flex flex-wrap justify-between items-center mt-1.5 sm:mt-2 md:mt-2.5 px-1 sm:px-2">
                <div className="flex items-center gap-2 sm:gap-4">
                  <span
                    className={`text-[8px] sm:text-[9px] md:text-[10px] flex items-center gap-1 sm:gap-1.5 ${
                      isDarkMode ? "text-white/30" : "text-gray-500"
                    }`}
                  >
                    <svg
                      className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M3 9.75v6.75m3-6.75v6.75m3-6.75v6.75M9 9.75h7.5M9 12h7.5M9 15h7.5M3 18h18M3 6h18"
                      />
                    </svg>
                    {!isMobile && <span>⏎ Send · </span>}
                    <span
                      className={isDarkMode ? "text-white/50" : "text-gray-600"}
                    >
                      {isMobile ? "↵" : "⇧+⏎ New line"}
                    </span>
                  </span>

                  {!isMobile && (
                    <span
                      className={`text-[8px] sm:text-[9px] md:text-[10px] flex items-center gap-1 sm:gap-1.5 ${
                        isDarkMode ? "text-white/20" : "text-gray-400"
                      }`}
                    >
                      <svg
                        className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                        />
                      </svg>
                      <span>AI may make mistakes</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  <span
                    className={`text-[8px] sm:text-[9px] md:text-[10px] font-mono flex items-center gap-1 sm:gap-1.5 ${
                      isDarkMode ? "text-white/30" : "text-gray-500"
                    }`}
                  >
                    <svg
                      className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M20.25 20.25v-4.5m0 4.5h-4.5m4.5 0L15 15"
                      />
                    </svg>
                    <span
                      className={
                        input.length > ENV_CONFIG.MAX_INPUT_LENGTH * 0.875
                          ? isDarkMode
                            ? "text-yellow-500/70"
                            : "text-yellow-600"
                          : isDarkMode
                            ? "text-white/30"
                            : "text-gray-500"
                      }
                    >
                      {isMobile
                        ? `${input.length}/${ENV_CONFIG.MAX_INPUT_LENGTH}`
                        : `${input.length}/${ENV_CONFIG.MAX_INPUT_LENGTH}`}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer with Credits - Compact Version */}
        <div
          className={`relative border-t transition-colors duration-300 ${
            isDarkMode
              ? "border-white/[0.03] bg-black/40"
              : "border-gray-200/50 bg-white/70"
          } backdrop-blur-2xl`}
        >
          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-2.5 relative z-10">
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[10px] sm:text-xs">
              <span className={isDarkMode ? "text-white/50" : "text-gray-500"}>
                Developed by Abishek Sathiyan
              </span>

              <span
                className={`w-0.5 h-0.5 rounded-full ${isDarkMode ? "bg-white/20" : "bg-gray-300"}`}
              ></span>
              <a
                href="https://abishek-portfolio-front-end.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1 transition-colors duration-200 ${
                  isDarkMode
                    ? "text-indigo-400 hover:text-indigo-300"
                    : "text-indigo-600 hover:text-indigo-700"
                } hover:underline`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <rect x="3" y="4" width="18" height="12" rx="2" />
                  <line x1="8" y1="20" x2="16" y2="20" />
                  <line x1="12" y1="16" x2="12" y2="20" />
                </svg>

                <span>Portfolio</span>
              </a>

              <a
                href="https://wa.me/+971556053387" // Replace with your number (country code + number)
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1 transition-colors duration-200 ${
                  isDarkMode
                    ? "text-green-400 hover:text-green-300"
                    : "text-green-600 hover:text-green-700"
                } hover:underline`}
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20.52 3.48A11.91 11.91 0 0012.01 0C5.38 0 .01 5.37 0 12c0 2.11.55 4.16 1.6 5.97L0 24l6.18-1.62A11.96 11.96 0 0012.01 24C18.63 24 24 18.63 24 12c0-3.19-1.24-6.19-3.48-8.52zM12 22a9.93 9.93 0 01-5.08-1.4l-.36-.21-3.67.96.98-3.58-.24-.37A9.94 9.94 0 1122 12c0 5.51-4.49 10-10 10zm5.38-7.41c-.29-.15-1.7-.84-1.97-.94-.27-.1-.46-.15-.65.15-.19.29-.75.94-.92 1.13-.17.19-.34.22-.63.07-.29-.15-1.23-.45-2.34-1.45-.87-.77-1.45-1.72-1.62-2.01-.17-.29-.02-.45.13-.6.14-.14.29-.36.44-.54.15-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.07-.15-.65-1.57-.89-2.16-.23-.55-.47-.47-.65-.48h-.55c-.19 0-.5.07-.76.36-.26.29-1 1-.98 2.44.02 1.44 1.03 2.83 1.18 3.03.15.19 2.03 3.1 4.92 4.35.69.3 1.23.48 1.65.62.69.22 1.32.19 1.81.12.55-.08 1.7-.69 1.94-1.35.24-.67.24-1.24.17-1.36-.07-.12-.26-.19-.55-.34z" />
                </svg>

                <span>WhatsApp</span>
              </a>

              <span
                className={`w-0.5 h-0.5 rounded-full ${isDarkMode ? "bg-white/20" : "bg-gray-300"}`}
              ></span>

              <a
                href="https://www.linkedin.com/in/abishek04/"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1 transition-colors duration-200 ${
                  isDarkMode
                    ? "text-blue-400 hover:text-blue-300"
                    : "text-blue-600 hover:text-blue-700"
                } hover:underline`}
              >
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                <span>LinkedIn</span>
              </a>

              <span
                className={`w-0.5 h-0.5 rounded-full ${isDarkMode ? "bg-white/20" : "bg-gray-300"}`}
              ></span>

              <a
                href="https://github.com/AbishekSathiyan"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1 transition-colors duration-200 ${
                  isDarkMode
                    ? "text-gray-300 hover:text-white"
                    : "text-gray-700 hover:text-gray-900"
                } hover:underline`}
              >
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                <span>GitHub</span>
              </a>
            </div>
          </div>
        </div>

        {/* Code Modal */}
        {showCodeModal && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-50 flex items-center justify-center p-2 sm:p-3 md:p-4 animate-fadeIn">
            <div
              className={`${
                isDarkMode
                  ? "bg-gradient-to-b from-[#0C0C0C] to-[#0A0A0A] border-white/[0.08] shadow-blue-500/5"
                  : "bg-gradient-to-b from-white to-gray-50 border-gray-200 shadow-xl"
              } border rounded-xl sm:rounded-2xl w-full max-w-full sm:max-w-5xl max-h-[90vh] sm:max-h-[85vh] flex flex-col animate-slideUp mx-2 sm:mx-0`}
            >
              <div
                className={`flex flex-col sm:flex-row sm:items-center justify-between px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 md:py-4 border-b gap-2 sm:gap-0 ${
                  isDarkMode
                    ? "border-white/[0.08] bg-gradient-to-r from-white/[0.02] to-transparent"
                    : "border-gray-200 bg-gradient-to-r from-gray-50 to-transparent"
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 overflow-hidden flex-shrink-0">
                    <img
                      src={Logo}
                      alt="Logo"
                      className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 object-cover"
                      onError={(e) => {
                        e.target.style.display = "none";
                        e.target.parentElement.innerHTML +=
                          '<span class="text-white text-sm">🤖</span>';
                      }}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 sm:gap-2">
                      <h3
                        className={`text-sm sm:text-base font-medium ${isDarkMode ? "text-white/90" : "text-gray-900"}`}
                      >
                        {isMobile ? "Code" : "Code Preview"}
                      </h3>
                      <span
                        className={`px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] font-medium rounded-full uppercase tracking-wider ${
                          isDarkMode
                            ? "bg-blue-500/10 border border-blue-500/20 text-blue-400"
                            : "bg-blue-100 border border-blue-200 text-blue-600"
                        }`}
                      >
                        {codeLanguage}
                      </span>
                    </div>
                    {!isMobile && (
                      <p
                        className={`text-[9px] sm:text-[10px] mt-0.5 ${isDarkMode ? "text-white/40" : "text-gray-500"}`}
                      >
                        Full screen code view with syntax highlighting
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 sm:gap-2 self-end sm:self-auto">
                  <button
                    onClick={() => copyToClipboard(generatedCode)}
                    className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all duration-200 group ${
                      isDarkMode
                        ? "bg-white/[0.05] hover:bg-white/[0.1]"
                        : "bg-gray-100 hover:bg-gray-200"
                    }`}
                    title="Copy code to clipboard"
                  >
                    <svg
                      className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
                        isDarkMode
                          ? "text-white/60 group-hover:text-white/80"
                          : "text-gray-600 group-hover:text-gray-800"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H9a2.25 2.25 0 01-2.25-2.25V9m12 0h.008v.008h-.008V9z"
                      />
                    </svg>
                    <span
                      className={`text-xs sm:text-xs font-medium ${
                        isDarkMode
                          ? "text-white/60 group-hover:text-white/80"
                          : "text-gray-600 group-hover:text-gray-800"
                      }`}
                    >
                      {copySuccess
                        ? "Copied!"
                        : isMobile
                          ? "Copy"
                          : "Copy Code"}
                    </span>
                  </button>
                  <button
                    onClick={() => setShowCodeModal(false)}
                    className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-all duration-200 ${
                      isDarkMode ? "hover:bg-white/[0.05]" : "hover:bg-gray-100"
                    }`}
                    title="Close modal"
                  >
                    <svg
                      className={`w-4 h-4 sm:w-5 sm:h-5 ${isDarkMode ? "text-white/60" : "text-gray-600"}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div
                className={`flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 ${isDarkMode ? "bg-[#0A0A0A]/50" : "bg-gray-50/50"}`}
              >
                <pre
                  className={`rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 overflow-x-auto border text-xs sm:text-sm ${
                    isDarkMode
                      ? "bg-gradient-to-b from-[#1E1E1E] to-[#1A1A1A] border-white/[0.05]"
                      : "bg-gradient-to-b from-white to-gray-50 border-gray-200"
                  }`}
                >
                  <code
                    ref={codeRef}
                    className={`language-${codeLanguage} font-mono whitespace-pre-wrap leading-relaxed ${
                      isDarkMode ? "text-white/80" : "text-gray-800"
                    }`}
                  >
                    {generatedCode}
                  </code>
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
