import { useState, useEffect, useCallback, useRef } from 'react';

const useVoiceAssistant = (options = {}) => {
  const {
    language = 'en-US',
    continuous = false,
    interimResults = true,
    rate = 1,
    pitch = 1,
    volume = 1,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [error, setError] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState('prompt');

  const recognitionRef = useRef(null);
  const synthesisRef = useRef(window.speechSynthesis);
  const utteranceRef = useRef(null);
  const timeoutRef = useRef(null);

  // Check for browser support
  useEffect(() => {
    const isSpeechSupported = 'SpeechRecognition' in window || 
                             'webkitSpeechRecognition' in window;
    
    const isSynthesisSupported = 'speechSynthesis' in window;
    
    setVoiceSupported(isSpeechSupported && isSynthesisSupported);
    
    if (!isSpeechSupported) {
      setError('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
    }

    // Check microphone permission
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' })
        .then(permissionStatus => {
          setPermissionStatus(permissionStatus.state);
          permissionStatus.onchange = () => {
            setPermissionStatus(permissionStatus.state);
          };
        })
        .catch(() => {
          setPermissionStatus('prompt');
        });
    }
  }, []);

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = synthesisRef.current?.getVoices() || [];
      setVoices(availableVoices);
      
      if (availableVoices.length > 0 && !selectedVoice) {
        const defaultVoice = availableVoices.find(v => v.lang.includes(language)) || availableVoices[0];
        setSelectedVoice(defaultVoice);
      }
    };

    loadVoices();
    
    if (synthesisRef.current) {
      synthesisRef.current.onvoiceschanged = loadVoices;
    }

    return () => {
      if (synthesisRef.current) {
        synthesisRef.current.onvoiceschanged = null;
      }
    };
  }, [language, selectedVoice]);

  // Check microphone availability
  const checkMicrophoneAvailability = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some(device => device.kind === 'audioinput');
    } catch {
      return false;
    }
  }, []);

  // Request microphone permission
  const requestMicrophonePermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setPermissionStatus('granted');
      return true;
    } catch (error) {
      console.error('Microphone permission error:', error);
      setPermissionStatus('denied');
      setError('Microphone access is required for voice input. Please allow microphone access in your browser settings.');
      return false;
    }
  }, []);

  // Initialize speech recognition
  const initRecognition = useCallback(() => {
    if (!voiceSupported) return null;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Speech recognition not supported');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('Recognition started');
      setIsListening(true);
      setError(null);
      
      // Set timeout to stop if no speech detected
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        if (isListening) {
          console.log('No speech detected - stopping');
          setError('No speech detected. Please speak into your microphone and try again.');
          recognition.stop();
        }
      }, 5000);
    };

    recognition.onend = () => {
      console.log('Recognition ended');
      setIsListening(false);
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      
      let errorMessage = '';
      
      switch (event.error) {
        case 'no-speech':
          errorMessage = 'No speech was detected. Please speak clearly into your microphone and try again.';
          break;
        case 'audio-capture':
          errorMessage = 'No microphone was found. Please ensure your microphone is connected.';
          break;
        case 'not-allowed':
          errorMessage = 'Microphone permission was denied. Please allow microphone access.';
          setPermissionStatus('denied');
          break;
        case 'network':
          errorMessage = 'Network error occurred. Please check your internet connection.';
          break;
        default:
          errorMessage = `Speech recognition error: ${event.error}`;
      }
      
      setError(errorMessage);
    };

    recognition.onresult = (event) => {
      console.log('Got result:', event.results);
      
      // Clear the timeout since we got speech
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      // Get the transcript
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      setTranscript(finalTranscript || interimTranscript);
      
      // If this is a final result, stop listening
      if (finalTranscript && !continuous) {
        setTimeout(() => {
          recognition.stop();
        }, 500);
      }
    };

    return recognition;
  }, [voiceSupported, continuous, interimResults, language, isListening]);

  // Start listening
  const startListening = useCallback(async () => {
    if (!voiceSupported) {
      setError('Voice recognition not supported');
      return;
    }

    // Check and request microphone permission
    if (permissionStatus !== 'granted') {
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        return;
      }
    }

    // Check if microphone is available
    const hasMicrophone = await checkMicrophoneAvailability();
    if (!hasMicrophone) {
      setError('No microphone found. Please connect a microphone and try again.');
      return;
    }

    try {
      // Stop any existing recognition
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore errors when stopping
        }
      }

      const recognition = initRecognition();
      if (recognition) {
        recognitionRef.current = recognition;
        recognition.start();
        setTranscript('');
        setError(null);
      }
    } catch (err) {
      console.error('Failed to start listening:', err);
      setError('Failed to start voice recognition. Please try again.');
    }
  }, [voiceSupported, permissionStatus, requestMicrophonePermission, checkMicrophoneAvailability, initRecognition]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.error('Error stopping recognition:', err);
      }
      recognitionRef.current = null;
    }
    
    setIsListening(false);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Speak text
  const speak = useCallback((text, options = {}) => {
    if (!voiceSupported || !synthesisRef.current) {
      setError('Text-to-speech not supported');
      return;
    }

    try {
      // Stop any ongoing speech
      if (synthesisRef.current.speaking) {
        synthesisRef.current.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      
      utterance.voice = options.voice || selectedVoice || voices[0];
      utterance.rate = options.rate || rate;
      utterance.pitch = options.pitch || pitch;
      utterance.volume = options.volume || volume;
      utterance.lang = options.language || language;

      utterance.onstart = () => {
        setIsSpeaking(true);
        setError(null);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
      };

      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        setError(`Speech error: ${event.error}`);
        setIsSpeaking(false);
        utteranceRef.current = null;
      };

      utteranceRef.current = utterance;
      synthesisRef.current.speak(utterance);
    } catch (err) {
      console.error('Failed to speak:', err);
      setError('Failed to start text-to-speech');
    }
  }, [voiceSupported, selectedVoice, voices, rate, pitch, volume, language]);

  // Stop speaking
  const stopSpeaking = useCallback(() => {
    if (synthesisRef.current) {
      synthesisRef.current.cancel();
    }
    setIsSpeaking(false);
    utteranceRef.current = null;
  }, []);

  // Get transcript
  const getTranscript = useCallback(() => {
    return transcript;
  }, [transcript]);

  // Clear transcript
  const clearTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
      
      if (synthesisRef.current && synthesisRef.current.speaking) {
        synthesisRef.current.cancel();
      }
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    isListening,
    isSpeaking,
    transcript,
    voiceSupported,
    voices,
    selectedVoice,
    setSelectedVoice,
    error,
    permissionStatus,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    getTranscript,
    clearTranscript,
    checkMicrophoneAvailability,
    requestMicrophonePermission,
  };
};

export default useVoiceAssistant;