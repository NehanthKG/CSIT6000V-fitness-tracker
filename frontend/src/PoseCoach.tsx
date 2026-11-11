import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Camera, Check, LoaderCircle, Play, RotateCcw, Upload } from 'lucide-react'
import { DrawingUtils, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

type Move = 'Squat' | 'Bicep curl' | 'Arm circles'
type Props = { onLog: (exercise: string, minutes: number, effort: number, notes: string) => Promise<void> }
type Point = { x: number; y: number; visibility?: number }

function angle(a: Point, b: Point, c: Point) {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x)
  const degrees = Math.abs((radians * 180) / Math.PI)
  return degrees > 180 ? 360 - degrees : degrees
}

export default function PoseCoach({ onLog }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const taskRef = useRef<PoseLandmarker | null>(null)
  const rafRef = useRef<number>(0)
  const previousAngle = useRef(180)
  const previousCircle = useRef<number | null>(null)
  const circleTurns = useRef(0)
  const phase = useRef('up')
  const [exercise, setExercise] = useState<Move>('Squat')
  const [videoUrl, setVideoUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('Choose a clip to begin. Your video stays on this device.')
  const [reps, setReps] = useState(0)
  const [duration, setDuration] = useState(0)
  const [saved, setSaved] = useState(false)

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    taskRef.current?.close()
    if (videoUrl) URL.revokeObjectURL(videoUrl)
  }, [videoUrl])

  async function handleFile(file?: File) {
    if (!file) return
    if (!file.type.startsWith('video/')) { setError('Choose a video file.'); return }
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(URL.createObjectURL(file)); setFileName(file.name); setError(''); setFeedback('Video ready. Press play to analyze movement.'); setReps(0); setSaved(false)
    previousAngle.current = 180; previousCircle.current = null; circleTurns.current = 0; phase.current = 'up'
  }

  async function initialize() {
    if (taskRef.current) return taskRef.current
    setLoading(true); setError('')
    try {
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm')
      taskRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'GPU' },
        runningMode: 'VIDEO', numPoses: 1,
      })
      return taskRef.current
    } catch {
      setError('Pose model could not load. Check your internet connection and try again.')
      return null
    } finally { setLoading(false) }
  }

  function analyze(landmarks: Point[]) {
    const left = landmarks[23]
    const ankle = landmarks[27], knee = landmarks[25], hip = landmarks[23], elbow = landmarks[13], shoulder = landmarks[11], wrist = landmarks[15]
    if (exercise === 'Squat' && left && knee && ankle) {
      const kneeAngle = angle(hip, knee, ankle)
      if (kneeAngle < 95 && phase.current === 'up') { phase.current = 'down'; setFeedback('Good depth. Press through your whole foot to stand.') }
      if (kneeAngle > 155 && phase.current === 'down') { phase.current = 'up'; setReps(r => r + 1); setFeedback('Nice rep. Keep your chest comfortable and knees tracking over toes.') }
      if (Math.abs(knee.x - ankle.x) > 0.16) setFeedback('Try keeping your knee tracking in line with your foot.')
      previousAngle.current = kneeAngle
    } else if (exercise === 'Bicep curl' && shoulder && elbow && wrist) {
      const elbowAngle = angle(shoulder, elbow, wrist)
      if (elbowAngle < 55 && phase.current === 'up') { phase.current = 'down'; setFeedback('At the top. Lower the weight slowly with control.') }
      if (elbowAngle > 145 && phase.current === 'down') { phase.current = 'up'; setReps(r => r + 1); setFeedback('Nice rep. Keep your elbow close to your side.') }
      if (Math.abs(elbow.x - shoulder.x) > 0.12) setFeedback('Keep your upper arm close to your body.')
      previousAngle.current = elbowAngle
    } else if (exercise === 'Arm circles' && shoulder && wrist) {
      const theta = Math.atan2(wrist.y - shoulder.y, wrist.x - shoulder.x)
      if (previousCircle.current !== null) {
        let delta = theta - previousCircle.current
        if (delta > Math.PI) delta -= 2 * Math.PI
        if (delta < -Math.PI) delta += 2 * Math.PI
        circleTurns.current += delta
        if (Math.abs(circleTurns.current) > Math.PI * 2) { setReps(r => r + 1); circleTurns.current = 0; setFeedback('Circle complete. Keep the movement smooth and controlled.') }
      }
      previousCircle.current = theta
      setFeedback('Make slow, comfortable circles with a relaxed shoulder.')
    }
  }

  async function start() {
    const video = videoRef.current, canvas = canvasRef.current
    if (!video || !canvas || !videoUrl) return
    const task = await initialize()
    if (!task) return
    await video.play()
    setDuration(Math.max(1, Math.round(video.duration / 60)))
    const draw = () => {
      if (!video || !canvas || video.paused || video.ended) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = video.clientWidth * devicePixelRatio; canvas.height = video.clientHeight * devicePixelRatio
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const result = task.detectForVideo(video, performance.now())
      if (result.landmarks[0]) {
        const painter = new DrawingUtils(ctx)
        painter.drawConnectors(result.landmarks[0], PoseLandmarker.POSE_CONNECTIONS, { color: '#a5d96b', lineWidth: 3 })
        painter.drawLandmarks(result.landmarks[0], { color: '#f9fcf5', fillColor: '#426b29', lineWidth: 1, radius: 3 })
        analyze(result.landmarks[0] as Point[])
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    draw()
  }

  return <section className="pose-card">
    <div className="section-heading"><div><span className="eyebrow">MOVE WITH CONFIDENCE</span><h2>Form check</h2><p>On-device pose feedback for your movement practice.</p></div><span className="privacy-tag"><Check size={13} /> Video stays private</span></div>
    <div className="pose-controls">
      <label className="field compact"><span>Exercise</span><select value={exercise} onChange={e => { setExercise(e.target.value as Move); setReps(0); phase.current = 'up'; previousCircle.current = null }}><option>Squat</option><option>Bicep curl</option><option>Arm circles</option></select></label>
      <label className="upload-button"><Upload size={16} /> {fileName ? 'Change clip' : 'Choose video'}<input type="file" accept="video/*" onChange={e => handleFile(e.target.files?.[0])} /></label>
      <span className="file-name">{fileName || 'MP4, MOV, or WebM'}</span>
    </div>
    <div className="video-stage">
      {videoUrl ? <><video ref={videoRef} src={videoUrl} controls playsInline onPlay={start} /><canvas ref={canvasRef} className="pose-overlay" /></> : <div className="video-empty"><div className="camera-orbit"><Camera size={28} /></div><strong>Bring a movement clip</strong><span>Pick a short video from your device to see pose landmarks and gentle form cues.</span><label className="primary-button small"><Upload size={15} /> Select video<input type="file" accept="video/*" onChange={e => handleFile(e.target.files?.[0])} /></label></div>}
      {loading && <div className="video-loading"><LoaderCircle className="spin" /> Loading pose model…</div>}
    </div>
    {error && <div className="inline-error"><AlertCircle size={16} />{error}</div>}
    <div className="pose-bottom"><div className="rep-count"><strong>{String(reps).padStart(2, '0')}</strong><span>reps detected</span></div><div className="form-feedback"><span className="live-dot" /> <span>{feedback}</span></div><button className="quiet-button" onClick={() => { setReps(0); phase.current = 'up'; circleTurns.current = 0; setSaved(false) }}><RotateCcw size={15} /> Reset</button><button className="primary-button small" disabled={!reps || saved} onClick={async () => { await onLog(exercise, duration || 5, 5, `${reps} reps detected by on-device pose check`); setSaved(true) }}>{saved ? <Check size={15} /> : <Play size={14} />}{saved ? 'Logged' : 'Log session'}</button></div>
  </section>
}
