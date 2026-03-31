'use client'

import { useRef, useState } from 'react'

export type VoiceCommand =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'setTimer'; minutes: number; seconds: number }
  | { type: 'checkIngredient'; name: string }
  | { type: 'readStep' }

interface VoiceControlProps {
  onCommand: (cmd: VoiceCommand) => void
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
}

function parseCommand(transcript: string): VoiceCommand | null {
  const t = transcript.trim()

  if (/^(next( step)?)/i.test(t)) return { type: 'next' }
  if (/^(back|previous|go back)/i.test(t)) return { type: 'prev' }

  const timerMatch = t.match(/set timer for (\d+) minutes?(?:\s+and\s+(\d+) seconds?)?/i)
  if (timerMatch) {
    return {
      type: 'setTimer',
      minutes: parseInt(timerMatch[1]!, 10),
      seconds: timerMatch[2] ? parseInt(timerMatch[2], 10) : 0,
    }
  }

  const checkMatch = t.match(/^check (.+)/i)
  if (checkMatch) return { type: 'checkIngredient', name: checkMatch[1]! }

  if (/read( this)? step/i.test(t)) return { type: 'readStep' }

  return null
}

export default function VoiceControl({ onCommand }: VoiceControlProps) {
  const [toast, setToast] = useState<string | null>(null)
  const recogRef = useRef<SpeechRecognition | null>(null)
  const [listening, setListening] = useState(false)

  // Hide if SpeechRecognition unavailable
  if (typeof window !== 'undefined' && !('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
    return null
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  function startRecognition() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return
    const recog = new SR()
    recog.continuous = false
    recog.interimResults = false
    recog.lang = 'en-US'
    recog.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      const cmd = parseCommand(transcript)
      if (cmd) {
        onCommand(cmd)
      } else {
        showToast("Didn't catch that")
      }
    }
    recog.onerror = () => {
      setListening(false)
    }
    recog.onend = () => {
      setListening(false)
    }
    recog.start()
    recogRef.current = recog
    setListening(true)
  }

  function stopRecognition() {
    recogRef.current?.stop()
    recogRef.current = null
    setListening(false)
  }

  return (
    <>
      <button
        type="button"
        aria-label={listening ? 'Listening…' : 'Push to talk'}
        onPointerDown={startRecognition}
        onPointerUp={stopRecognition}
        onPointerLeave={stopRecognition}
        className={`fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl transition-colors ${
          listening ? 'bg-red-500 text-white' : 'bg-sage-500 text-white'
        }`}
      >
        🎤
      </button>
      {toast && (
        <div
          role="status"
          className="fixed bottom-40 right-4 z-50 bg-stone-800 text-white text-sm rounded-lg px-4 py-2 shadow-lg"
        >
          {toast}
        </div>
      )}
    </>
  )
}
