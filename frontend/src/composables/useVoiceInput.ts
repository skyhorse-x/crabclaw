import { ref, onUnmounted } from 'vue'

export interface VoiceInputOptions {
  lang?: string
  continuous?: boolean
  interimResults?: boolean
}

export function useVoiceInput(options: VoiceInputOptions = {}) {
  const isRecording = ref(false)
  const transcript = ref('')
  const interimTranscript = ref('')
  const error = ref<string | null>(null)

  let recognition: any = null
  let SpeechRecognition: any = null

  const initSpeechRecognition = () => {
    if (typeof window === 'undefined') return null

    SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      error.value = '当前浏览器不支持语音识别'
      return null
    }

    recognition = new SpeechRecognition()
    recognition.lang = options.lang || 'zh-CN'
    recognition.continuous = options.continuous ?? true
    recognition.interimResults = options.interimResults ?? true

    recognition.onstart = () => {
      isRecording.value = true
      error.value = null
    }

    recognition.onresult = (event: any) => {
      interimTranscript.value = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          transcript.value += result[0].transcript
        } else {
          interimTranscript.value += result[0].transcript
        }
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech') {
        error.value = `语音识别错误: ${event.error}`
      }
      isRecording.value = false
    }

    recognition.onend = () => {
      isRecording.value = false
    }

    return recognition
  }

  const start = () => {
    if (!recognition) {
      recognition = initSpeechRecognition()
    }
    if (!recognition) return

    try {
      recognition.start()
    } catch (e) {
      error.value = '启动语音识别失败'
    }
  }

  const stop = () => {
    if (recognition && isRecording.value) {
      recognition.stop()
    }
  }

  const reset = () => {
    transcript.value = ''
    interimTranscript.value = ''
    error.value = null
  }

  const getFullTranscript = () => {
    return transcript.value + interimTranscript.value
  }

  onUnmounted(() => {
    stop()
  })

  return {
    isRecording,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
    getFullTranscript,
    isSupported: () => {
      if (typeof window === 'undefined') return false
      return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    }
  }
}
