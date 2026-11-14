export type Move = 'Squat' | 'Bicep curl' | 'Arm circles'
export type Point = { x: number; y: number; z?: number; visibility?: number; presence?: number }
export type LandmarkSample = { time_seconds: number; landmarks: { x: number; y: number; z: number; visibility: number }[] }
export type PoseSummary = {
  exercise: Move
  duration_seconds: number
  reps: number
  analyzed_frames: number
  average_confidence: number
  range_of_motion: { min: number; max: number }
  form_cues: string[]
  landmark_samples: LandmarkSample[]
  source: 'webcam' | 'upload'
}
export type Reading = { reps: number; angle: number | null; confidence: number; side: 'left' | 'right' | null; feedback: string; frames: number; seconds: number }
const VISIBILITY = 0.65
const SIDES = { left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 }, right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 } }

/** World coordinates avoid image aspect distortion; image points are scaled first. */
export function jointAngle(a: Point, b: Point, c: Point): number {
  const u = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)]
  const v = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)]
  const length = Math.hypot(...u) * Math.hypot(...v)
  return length > 1e-8 ? Math.acos(Math.max(-1, Math.min(1, u.reduce((sum, n, i) => sum + n * v[i], 0) / length))) * 180 / Math.PI : NaN
}
function confidence(point?: Point): number {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? Math.min(point.visibility ?? 0, point.presence ?? 1) : 0
}

export class PoseAnalyzer {
  readonly exercise: Move
  private reps = 0
  private frames = 0
  private confidenceSum = 0
  private durationMs = 0
  private previousTime: number | null = null
  private side: 'left' | 'right' | null = null
  private smoothed: number | null = null
  private phase: 'unarmed' | 'extended' | 'contracted' = 'unarmed'
  private heldSince: number | null = null
  private phaseStarted = 0
  private previousTheta: number | null = null
  private circleStarted = 0
  private rotation = 0
  private lastRep = -Infinity
  private minAngle = Infinity
  private maxAngle = -Infinity
  private cues = new Set<string>()
  private landmarkSamples: LandmarkSample[] = []
  private lastSnapshotMs = -Infinity
  reading: Reading = { reps: 0, angle: null, confidence: 0, side: null, feedback: 'Keep the whole movement in frame in good lighting.', frames: 0, seconds: 0 }

  constructor(exercise: Move) { this.exercise = exercise }

  private resetMotion() {
    this.phase = 'unarmed'; this.smoothed = null; this.heldSince = null; this.previousTheta = null; this.rotation = 0
  }

  missing(): Reading {
    this.resetMotion(); this.previousTime = null
    this.reading = { ...this.reading, angle: null, confidence: 0, feedback: 'Move into view. Keep the working joints visible in good lighting.' }
    return this.reading
  }

  sample(points: Point[], world: Point[] | undefined, aspect: number, timestamp: number): Reading {
    const required = (side: keyof typeof SIDES) => {
      const s = SIDES[side]
      return this.exercise === 'Squat' ? [s.hip, s.knee, s.ankle] : [s.shoulder, s.elbow, s.wrist]
    }
    const sideConfidence = (side: keyof typeof SIDES) => Math.min(...required(side).map(i => confidence(points[i])))
    const best = sideConfidence('left') >= sideConfidence('right') ? 'left' : 'right'
    const chosen = this.side && sideConfidence(this.side) >= VISIBILITY ? this.side : best
    const visible = sideConfidence(chosen)
    if (visible < VISIBILITY) return this.missing()
    if (this.side !== chosen) { this.side = chosen; this.resetMotion() }
    if (this.previousTime !== null) {
      const delta = timestamp - this.previousTime
      if (delta < 0 || delta > 500) this.resetMotion()
      else this.durationMs += delta
    }
    this.previousTime = timestamp
    // Share at most eight numerical snapshots, sampled no more than once per
    // second of confident tracking. Images and video frames never leave the browser.
    if (this.durationMs - this.lastSnapshotMs >= 1000 && points.length === 33) {
      const landmarks = points.map(p => ({ x: p.x, y: p.y, z: p.z ?? 0, visibility: p.visibility ?? 0 }))
      if (landmarks.every(p => Number.isFinite(p.x) && p.x >= -2 && p.x <= 3 && Number.isFinite(p.y) && p.y >= -2 && p.y <= 3 && Number.isFinite(p.z) && p.z >= -10 && p.z <= 10 && Number.isFinite(p.visibility) && p.visibility >= 0 && p.visibility <= 1)) {
        this.landmarkSamples.push({ time_seconds: Number((this.durationMs / 1000).toFixed(3)), landmarks })
        this.landmarkSamples = this.landmarkSamples.slice(-8)
        this.lastSnapshotMs = this.durationMs
      }
    }
    this.frames++; this.confidenceSum += visible
    const s = SIDES[chosen]
    const coord = (index: number): Point => world?.[index] && Number.isFinite(world[index].z) ? world[index] : { x: points[index].x * aspect, y: points[index].y, z: 0 }
    let currentAngle: number
    let cue = ''
    if (this.exercise === 'Arm circles') {
      // Frontal image plane measures shoulder-relative rotation, not depth motion.
      const dx = (points[s.wrist].x - points[s.shoulder].x) * aspect
      const dy = points[s.wrist].y - points[s.shoulder].y
      const shoulderToElbow = Math.hypot((points[s.elbow].x - points[s.shoulder].x) * aspect, points[s.elbow].y - points[s.shoulder].y)
      if (Math.hypot(dx, dy) < Math.max(0.06, shoulderToElbow * 0.8)) {
        this.previousTheta = null; this.rotation = 0
        cue = 'Face the camera and extend your arm comfortably so the circle is visible.'
      } else {
        const theta = Math.atan2(dy, dx)
        if (this.previousTheta === null) this.circleStarted = timestamp
        if (this.previousTheta !== null) {
          let delta = theta - this.previousTheta
          if (delta > Math.PI) delta -= Math.PI * 2
          if (delta < -Math.PI) delta += Math.PI * 2
          // A large jump is a tracking discontinuity, not a valid rotation.
          if (Math.abs(delta) < Math.PI / 3) this.rotation += delta
          else this.rotation = 0
          if (Math.abs(this.rotation) >= Math.PI * 2 - 0.15 && timestamp - this.circleStarted >= 700 && timestamp - this.lastRep >= 700) {
            this.reps++; this.lastRep = timestamp; this.rotation = 0; this.circleStarted = timestamp
          }
        }
        this.previousTheta = theta
        cue = 'Make smooth circles facing the camera; keep your shoulder relaxed.'
      }
      currentAngle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360
    } else {
      const raw = this.exercise === 'Squat' ? jointAngle(coord(s.hip), coord(s.knee), coord(s.ankle)) : jointAngle(coord(s.shoulder), coord(s.elbow), coord(s.wrist))
      if (!Number.isFinite(raw)) return this.missing()
      this.smoothed = this.smoothed === null ? raw : this.smoothed * 0.6 + raw * 0.4
      currentAngle = this.smoothed
      const extended = this.exercise === 'Squat' ? 155 : 145
      const contracted = this.exercise === 'Squat' ? 100 : 60
      const atTarget = this.phase === 'extended' ? currentAngle < contracted : currentAngle > extended
      if (atTarget) {
        this.heldSince ??= timestamp
        if (timestamp - this.heldSince >= 100) {
          if (this.phase === 'extended') { this.phase = 'contracted'; this.phaseStarted = timestamp }
          else {
            if (this.phase === 'contracted' && timestamp - this.phaseStarted >= 300 && timestamp - this.lastRep >= 700) { this.reps++; this.lastRep = timestamp }
            this.phase = 'extended'
          }
          this.heldSince = null
        }
      } else this.heldSince = null
      cue = this.exercise === 'Squat'
        ? this.phase === 'unarmed' ? 'Stand comfortably tall to begin, then lower with control.' : this.phase === 'contracted' ? 'Rise with control to finish the repetition.' : 'Lower your hips at a comfortable depth, keeping your whole body in view.'
        : this.phase === 'unarmed' ? 'Begin with your arm comfortably extended.' : this.phase === 'contracted' ? 'Lower slowly to complete the curl.' : 'Curl with control and keep your upper arm steady.'
      if (this.exercise === 'Bicep curl') {
        const shoulder = points[s.shoulder], elbow = points[s.elbow], hip = points[s.hip]
        const torso = hip ? Math.hypot((hip.x - shoulder.x) * aspect, hip.y - shoulder.y) : 0
        if (confidence(hip) >= VISIBILITY && torso > 0 && Math.abs(elbow.x - shoulder.x) * aspect / torso > 0.45) cue = 'Bring your elbow closer to your side and reduce swinging.'
      }
    }
    this.minAngle = Math.min(this.minAngle, currentAngle); this.maxAngle = Math.max(this.maxAngle, currentAngle)
    this.cues.add(cue)
    this.reading = { reps: this.reps, angle: Math.round(currentAngle), confidence: visible, side: chosen, feedback: cue, frames: this.frames, seconds: this.durationMs / 1000 }
    return this.reading
  }

  summary(source: 'webcam' | 'upload'): PoseSummary {
    return {
      exercise: this.exercise, duration_seconds: Math.max(1, Number((this.durationMs / 1000).toFixed(3))), reps: this.reps,
      analyzed_frames: this.frames, average_confidence: this.frames ? Number((this.confidenceSum / this.frames).toFixed(3)) : 0,
      range_of_motion: { min: Number.isFinite(this.minAngle) ? Math.round(this.minAngle) : 0, max: Number.isFinite(this.maxAngle) ? Math.round(this.maxAngle) : 0 },
      form_cues: [...this.cues].slice(-8), landmark_samples: this.landmarkSamples.map(sample => ({ time_seconds: sample.time_seconds, landmarks: sample.landmarks.map(p => ({ ...p })) })), source,
    }
  }
}
