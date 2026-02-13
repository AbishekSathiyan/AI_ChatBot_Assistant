import React, { useState } from 'react';
import { MdMic, MdMicOff, MdVolumeUp, MdError } from 'react-icons/md';

const VoiceButton = ({
  onVoiceInput,
  isListening,
  onStartListening,
  onStopListening,
  isSpeaking,
  onSpeak,
  onStopSpeaking,
  disabled = false,
  isDarkMode = true,
  size = 'md',
  className = '',
  error = null,
  permissionStatus = 'prompt',
  isAudioLevelDetected = false,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const sizeClasses = {
    sm: 'p-1.5 text-xs',
    md: 'p-2 text-sm',
    lg: 'p-3 text-base',
  };

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const getButtonStyle = () => {
    if (disabled) {
      return isDarkMode
        ? 'bg-white/[0.03] text-white/20 cursor-not-allowed'
        : 'bg-gray-100 text-gray-400 cursor-not-allowed';
    }

    if (error) {
      return isDarkMode
        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/30'
        : 'bg-red-100 text-red-600 hover:bg-red-200 border-red-200';
    }

    if (isListening) {
      return isDarkMode
        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/30'
        : 'bg-red-100 text-red-600 hover:bg-red-200 border-red-200';
    }

    if (isSpeaking) {
      return isDarkMode
        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border-green-500/30'
        : 'bg-green-100 text-green-600 hover:bg-green-200 border-green-200';
    }

    if (permissionStatus === 'denied') {
      return isDarkMode
        ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border-yellow-500/30'
        : 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200 border-yellow-200';
    }

    return isDarkMode
      ? 'bg-white/[0.05] hover:bg-white/[0.1] text-white/60 hover:text-white/80 border-white/[0.05]'
      : 'bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800 border-gray-200';
  };

  const handleClick = () => {
    if (disabled) return;

    if (error) {
      // Clear error and try again
      onStartListening();
    } else if (isListening) {
      onStopListening();
      onVoiceInput();
    } else if (isSpeaking) {
      onStopSpeaking();
    } else {
      onStartListening();
    }
  };

  const handleSpeakClick = (e) => {
    e.stopPropagation();
    if (disabled || error) return;

    if (isSpeaking) {
      onStopSpeaking();
    } else {
      onSpeak();
    }
  };

  const getTooltipText = () => {
    if (error) return `Error: ${error}`;
    if (permissionStatus === 'denied') return 'Microphone access denied. Click to request permission.';
    if (isListening) return 'Listening... Click to stop';
    if (isSpeaking) return 'Speaking... Click to stop';
    return 'Click to start voice input';
  };

  const getIcon = () => {
    if (error) {
      return <MdError className={`${iconSizes[size]} text-red-400`} />;
    }
    if (isListening) {
      return <MdMic className={`${iconSizes[size]} animate-pulse`} />;
    }
    if (isSpeaking) {
      return <MdVolumeUp className={`${iconSizes[size]} voice-wave`} />;
    }
    if (permissionStatus === 'denied') {
      return <MdMicOff className={iconSizes[size]} />;
    }
    return <MdMic className={iconSizes[size]} />;
  };

  return (
    <div className="relative flex items-center gap-1">
      {/* Main Voice Button */}
      <button
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        disabled={disabled}
        className={`relative rounded-lg transition-all duration-200 border ${sizeClasses[size]} ${getButtonStyle()} ${className}`}
        title={getTooltipText()}
      >
        {getIcon()}
        
        {/* Pulse Animation for Listening */}
        {isListening && (
          <>
            <span className="absolute inset-0 rounded-lg animate-pulse bg-red-500/20"></span>
            <span className="absolute -inset-1 rounded-lg voice-ring"></span>
          </>
        )}

        {/* Wave Animation for Speaking */}
        {isSpeaking && (
          <span className="absolute inset-0 flex items-center justify-center gap-0.5">
            <span className="w-0.5 h-2 bg-green-400 rounded-full voice-wave" style={{ animationDelay: '0ms' }}></span>
            <span className="w-0.5 h-3 bg-green-400 rounded-full voice-wave" style={{ animationDelay: '150ms' }}></span>
            <span className="w-0.5 h-2 bg-green-400 rounded-full voice-wave" style={{ animationDelay: '300ms' }}></span>
          </span>
        )}

        {/* Audio Level Detection Indicator */}
        {isAudioLevelDetected && isListening && (
          <span className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 flex gap-0.5">
            <span className="w-0.5 h-2 bg-green-400 rounded-full animate-pulse"></span>
            <span className="w-0.5 h-3 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
            <span className="w-0.5 h-4 bg-green-600 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
          </span>
        )}

        {/* Error Indicator */}
        {error && (
          <span className="absolute -top-1 -right-1 w-2 h-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
        )}
      </button>

      {/* Speak Button (for reading responses) */}
      {!isListening && !isSpeaking && onSpeak && !error && (
        <button
          onClick={handleSpeakClick}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          disabled={disabled}
          className={`rounded-lg transition-all duration-200 border ${sizeClasses[size]} ${
            isDarkMode
              ? 'bg-white/[0.05] hover:bg-white/[0.1] text-white/40 hover:text-white/60 border-white/[0.05]'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-600 border-gray-200'
          }`}
          title="Read last response aloud"
        >
          <MdVolumeUp className={iconSizes[size]} />
        </button>
      )}

      {/* Tooltip */}
      {showTooltip && !disabled && (
        <div className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs rounded whitespace-nowrap z-50 ${
          error || permissionStatus === 'denied'
            ? 'bg-red-500 text-white'
            : isDarkMode
              ? 'bg-gray-800 text-white/80 border border-white/10'
              : 'bg-white text-gray-600 border border-gray-200 shadow-lg'
        }`}>
          {getTooltipText()}
          {isAudioLevelDetected && isListening && ' (Audio detected)'}
        </div>
      )}

      {/* Permission Status Indicator */}
      {permissionStatus === 'denied' && !error && (
        <div className="absolute -top-1 -right-1 w-2 h-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
        </div>
      )}
    </div>
  );
};

export default VoiceButton;