export type Profile = { id: number; name: string; goal: string; experience: string; weekly_days: number; minutes_per_session: number; equipment: string; dietary_preferences: string; weekly_budget: number }
export type Exercise = { name: string; sets: number; reps: string; rest_seconds?: number }
export type Workout = { day: string; focus: string; duration_minutes: number; exercises: Exercise[] }
export type PlanContent = { summary: string; workouts: Workout[]; meals: { name: string; why: string }[]; adaptation_note: string; safety_note: string }
export type Plan = { id?: number; title: string; content: PlanContent; source: string; created_at?: string }
export type Log = { id: number; exercise: string; duration_minutes: number; perceived_effort: number; notes: string; completed_at: string }
