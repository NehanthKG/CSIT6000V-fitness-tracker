import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, Dumbbell, Flame, Heart, LayoutDashboard, Leaf, LoaderCircle, MessageCircle, Plus, Salad, Settings2, Sparkles, Target, TrendingUp, X } from 'lucide-react'
import { api } from './api'
import PoseCoach from './PoseCoach'
import type { Log, Plan, PlanContent, Profile } from './types'

type View = 'overview' | 'plan' | 'progress' | 'profile'
type Overview = { profile: Profile; stats: { workouts: number; minutes: number; avg_effort: number }; recent_workouts: Log[]; active_plan: Plan | null }
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function shortDate(value: string) { return new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z')).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }

export default function App() {
  const [view, setView] = useState<View>('overview')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [logs, setLogs] = useState<Log[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [draft, setDraft] = useState<Profile | null>(null)
  const [planDraft, setPlanDraft] = useState<Plan | null>(null)
  const [apiReady, setApiReady] = useState(false)
  const [llmReady, setLlmReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState<{ role: string; text: string }[]>([])
  const [showLog, setShowLog] = useState(false)
  const [logExercise, setLogExercise] = useState('Strength training')
  const [logMinutes, setLogMinutes] = useState('30')
  const [logEffort, setLogEffort] = useState('6')

  const refresh = useCallback(async () => {
    try {
      const [data, activity, health] = await Promise.all([api.get<Overview>('/api/overview'), api.get<Log[]>('/api/workouts'), api.get<{ status: string; llm_configured: boolean }>('/api/health')])
      setOverview(data); setProfile(data.profile); setDraft(data.profile); setLogs(activity); setApiReady(true); setLlmReady(health.llm_configured); setError('')
    } catch (e) { setApiReady(false); setError(e instanceof Error ? e.message : 'Could not connect to FitPilot API. Start the backend to continue.') }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(timer) }, [toast])

  const workoutsThisWeek = overview?.stats.workouts ?? 0
  const minutesThisWeek = overview?.stats.minutes ?? 0
  const activePlan = overview?.active_plan
  const todayName = dayNames[new Date().getDay()]
  const todayWorkout = activePlan?.content.workouts.find(w => w.day.toLowerCase().startsWith(todayName.toLowerCase())) ?? activePlan?.content.workouts[0]

  async function generatePlan() {
    setBusy(true); setError('')
    try { setPlanDraft(await api.post<Plan>('/api/plans/generate', {})); setView('plan') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not generate a plan') }
    finally { setBusy(false) }
  }
  async function approvePlan() {
    if (!planDraft) return
    setBusy(true)
    try { await api.post('/api/plans', planDraft); setPlanDraft(null); await refresh(); setToast('Your week is ready. Nice work!') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save your plan') }
    finally { setBusy(false) }
  }
  async function logWorkout(exercise = logExercise, duration = Number(logMinutes), effort = Number(logEffort), notes = '') {
    try { await api.post('/api/workouts', { exercise, duration_minutes: duration, perceived_effort: effort, notes }); await refresh(); setShowLog(false); setToast('Activity added to your week') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save workout') }
  }
  async function saveProfile() {
    if (!draft) return
    setBusy(true)
    try { const saved = await api.put<Profile>('/api/profile', draft); setProfile(saved); setDraft(saved); await refresh(); setToast('Your preferences are saved') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save preferences') }
    finally { setBusy(false) }
  }
  async function sendChat(e: React.FormEvent) {
    e.preventDefault(); const message = chatInput.trim(); if (!message) return
    setChatInput(''); setChatHistory(rows => [...rows, { role: 'you', text: message }])
    try { const result = await api.post<{ answer: string; source: string }>('/api/assistant/chat', { message }); setChatHistory(rows => [...rows, { role: 'coach', text: result.answer }]) }
    catch { setChatHistory(rows => [...rows, { role: 'coach', text: 'I could not reach the coach right now. Try again after checking that the API is running.' }]) }
  }

  const sectionTitle: Record<View, string> = { overview: 'Your space', plan: 'Your plan', progress: 'Your progress', profile: 'Your preferences' }
  const firstName = profile?.name.split(' ')[0] || 'there'
  const weekDays = useMemo(() => {
    const today = new Date(); const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return { name: dayNames[d.getDay()], date: d.getDate(), today: d.toDateString() === today.toDateString(), key: d.toDateString() } })
  }, [])
  const workoutDates = new Set(logs.map(x => new Date(x.completed_at.replace(' ', 'T') + (x.completed_at.includes('Z') ? '' : 'Z')).toDateString()))

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Activity size={20} strokeWidth={2.6} /></div><span>fitpilot<span className="brand-period">.</span></span></div>
      <div className="workspace-label">YOUR WELLNESS SPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        <button className={view === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => setView('overview')}><LayoutDashboard size={18} />Overview</button>
        <button className={view === 'plan' ? 'nav-item active' : 'nav-item'} onClick={() => setView('plan')}><CalendarDays size={18} />My week{activePlan && <i className="nav-dot" />}</button>
        <button className={view === 'progress' ? 'nav-item active' : 'nav-item'} onClick={() => setView('progress')}><TrendingUp size={18} />Progress</button>
        <div className="nav-rule" />
        <button className={view === 'profile' ? 'nav-item active' : 'nav-item'} onClick={() => setView('profile')}><Settings2 size={18} />Preferences</button>
      </nav>
      <div className="sidebar-spacer" />
      <div className="side-tip"><div className="tip-spark"><Sparkles size={17} /></div><strong>Small steps add up.</strong><p>A little movement today is still progress.</p><button onClick={() => setChatOpen(true)}>Talk to your coach <ArrowRight size={13} /></button></div>
      <button className="profile-chip" onClick={() => setView('profile')}><div className="avatar">{firstName.slice(0, 1).toUpperCase()}</div><span><strong>{profile?.name || 'Your profile'}</strong><small>{profile?.experience || 'Beginner'} journey</small></span><ChevronDown size={15} /></button>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="crumb"><span>FitPilot</span><span className="crumb-slash">/</span><strong>{sectionTitle[view]}</strong></div><div className="topbar-actions"><span className={apiReady ? 'connection-pill connected' : 'connection-pill'}><i />{!apiReady ? 'Connecting' : llmReady ? 'AI coach ready' : 'Starter mode'}</span><button className="help-button" onClick={() => setChatOpen(true)} aria-label="Open AI coach"><CircleHelp size={19} /></button><div className="top-avatar">{firstName.slice(0, 1).toUpperCase()}</div></div></header>
      {error && <div className="notice error-notice"><span>{apiReady ? error : 'The FitPilot API is offline. Start the backend to load your dashboard.'}</span><button onClick={() => void refresh()}>Retry</button></div>}
      {!apiReady ? <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>Getting your space ready…</span><code>cd backend &amp;&amp; uvicorn app.main:app --reload</code></div> : <>
        {view === 'overview' && <div className="page-content">
          <section className="welcome-row"><div><div className="date-eyebrow"><span className="sun-glyph">✳</span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</div><h1>{greeting()}, {firstName}<span className="title-dot">.</span></h1><p className="welcome-copy">A little progress goes a long way. Here’s your week, at a glance.</p></div><button className="primary-button" onClick={() => setChatOpen(true)}><Sparkles size={16} />Ask your coach</button></section>

          <section className="hero-card"><div className="hero-copy"><div className="hero-label"><span className="hero-label-dot" />YOUR NEXT GOOD THING</div><h2>{todayWorkout ? `A little ${todayWorkout.focus.toLowerCase()}.` : 'Your next good thing starts here.'}</h2><p>{todayWorkout ? `${todayWorkout.duration_minutes} minutes, at your pace. You’ve got this.` : 'Build a routine that fits your life, one small step at a time.'}</p><div className="hero-actions"><button className="hero-button" onClick={() => todayWorkout ? setView('plan') : void generatePlan()}>{todayWorkout ? 'See today’s plan' : 'Create my first plan'}<ArrowRight size={15} /></button><span className="hero-note"><Heart size={14} /> Progress over perfection</span></div></div><div className="hero-art"><div className="art-sun"/><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-leaf leaf-one"><Leaf size={54} /></div><div className="art-leaf leaf-two"><Leaf size={35} /></div><div className="art-ground"/><div className="art-sprout">✳</div><span className="art-caption">MOVE AT YOUR OWN PACE</span></div></section>

          <section className="metrics-grid"><Metric icon={<Dumbbell size={17}/>} label="WORKOUTS" value={`${workoutsThisWeek}`} suffix="sessions" trend="this week" tint="sage"/><Metric icon={<Clock3 size={17}/>} label="TIME MOVING" value={`${minutesThisWeek}`} suffix="minutes" trend="this week" tint="lavender"/><Metric icon={<Flame size={17}/>} label="WEEKLY RHYTHM" value={`${Math.min(100, Math.round((workoutsThisWeek / Math.max(1, profile?.weekly_days || 4)) * 100))}`} suffix="%" trend="of your goal" tint="peach"/></section>

          <section className="dashboard-grid"><div className="content-card week-card"><div className="card-heading"><div><span className="eyebrow">YOUR ROUTINE</span><h3>This week</h3></div><button className="text-link" onClick={() => setView('plan')}>See plan <ArrowRight size={14}/></button></div><div className="week-strip">{weekDays.map(d => <div key={d.key} className={`week-day ${d.today ? 'today' : ''}`}><span>{d.name}</span><div className={`day-circle ${workoutDates.has(d.key) ? 'completed' : ''} ${d.today ? 'is-today' : ''}`}>{workoutDates.has(d.key) ? <Check size={14}/> : d.date}</div><i className={activePlan?.content.workouts.some(w => w.day.toLowerCase().startsWith(d.name.toLowerCase())) ? 'plan-mark' : ''}/></div>)}</div><div className="week-footer"><span><span className="legend-dot done"/>Completed</span><span><span className="legend-dot planned"/>Planned</span><button onClick={() => setShowLog(true)}><Plus size={14}/>Log activity</button></div></div>
          <div className="content-card focus-card"><div className="card-heading"><div><span className="eyebrow">A GOOD PLACE TO START</span><h3>Today’s focus</h3></div><div className="focus-icon"><Target size={18}/></div></div>{todayWorkout ? <><div className="focus-main"><span className="focus-time"><Clock3 size={14}/>{todayWorkout.duration_minutes} min</span><strong>{todayWorkout.focus}</strong><span>{todayWorkout.exercises.slice(0, 3).map(x => x.name).join(' · ')}</span></div><button className="focus-link" onClick={() => setView('plan')}>View session <ArrowRight size={14}/></button></> : <><div className="focus-main empty-focus"><strong>Make it your own</strong><span>A plan shaped around your time, gear, and goals.</span></div><button className="focus-link" disabled={busy} onClick={() => void generatePlan()}>{busy ? 'Putting it together…' : 'Create a weekly plan'} <ArrowRight size={14}/></button></>}</div></section>

          <section className="bottom-grid"><div className="content-card recent-card"><div className="card-heading"><div><span className="eyebrow">YOU SHOWED UP</span><h3>Recent movement</h3></div><button className="text-link" onClick={() => setView('progress')}>All activity <ArrowRight size={14}/></button></div>{logs.length ? <div className="activity-list">{logs.slice(0, 3).map(log => <ActivityRow key={log.id} log={log}/>)}</div> : <div className="empty-row"><div className="empty-icon"><Activity size={18}/></div><span>Your movement will show up here.<br/><strong>Every session counts.</strong></span><button onClick={() => setShowLog(true)}>Add your first</button></div>}</div><div className="content-card meal-card"><div className="card-heading"><div><span className="eyebrow">FUEL THAT FEELS GOOD</span><h3>On your plate</h3></div><div className="meal-icon"><Salad size={19}/></div></div>{activePlan?.content.meals?.length ? <div className="meal-list">{activePlan.content.meals.slice(0, 2).map((meal, i) => <div className="meal-item" key={meal.name}><div className={`meal-index meal-${i}`}>{i === 0 ? '01' : '02'}</div><div><strong>{meal.name}</strong><span>{meal.why}</span></div></div>)}</div> : <div className="meal-empty">A few balanced ideas, made around what works for you.</div>}<button className="focus-link meal-link" onClick={() => setView('plan')}>Explore your meal ideas <ArrowRight size={14}/></button></div></section>
        </div>}

        {view === 'plan' && <div className="page-content subpage"><section className="subpage-heading"><div><div className="date-eyebrow"><span className="sun-glyph">✳</span>MADE FOR YOUR REAL LIFE</div><h1>Your week, your way<span className="title-dot">.</span></h1><p>Movement and meals that fit into the life you already have.</p></div><button className="primary-button" disabled={busy} onClick={() => void generatePlan()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Sparkles size={16}/>} {activePlan ? 'Refresh my plan' : 'Build my week'}</button></section>
          {planDraft ? <PlanView plan={planDraft} draft busy={busy} onApprove={() => void approvePlan()} onDiscard={() => setPlanDraft(null)}/> : activePlan ? <PlanView plan={activePlan}/> : <div className="empty-plan content-card"><div className="empty-plan-illustration"><CalendarDays size={33}/><Sparkles size={17}/></div><h2>Your next chapter starts with a plan.</h2><p>Share what you’re working toward and FitPilot will sketch out a flexible week. You’ll get to review everything before it’s saved.</p><button className="primary-button" disabled={busy} onClick={() => void generatePlan()}>{busy ? 'Making your plan…' : 'Create a plan for me'}<ArrowRight size={15}/></button><small>Uses your preferences. You’re always in control.</small></div>}
        </div>}

        {view === 'progress' && <div className="page-content subpage"><section className="subpage-heading"><div><div className="date-eyebrow"><span className="sun-glyph">✳</span>IT ALL COUNTS</div><h1>Look at you go<span className="title-dot">.</span></h1><p>Progress isn’t a straight line. Here’s what you’ve been building.</p></div><button className="primary-button" onClick={() => setShowLog(true)}><Plus size={16}/>Log activity</button></section><section className="metrics-grid progress-metrics"><Metric icon={<Dumbbell size={17}/>} label="TOTAL SESSIONS" value={`${logs.length}`} suffix="sessions" trend="all time" tint="sage"/><Metric icon={<Clock3 size={17}/>} label="TIME MOVING" value={`${logs.reduce((n, x) => n + x.duration_minutes, 0)}`} suffix="minutes" trend="all time" tint="lavender"/><Metric icon={<Flame size={17}/>} label="AVERAGE EFFORT" value={`${overview?.stats.avg_effort ? Number(overview.stats.avg_effort).toFixed(1) : '—'}`} suffix="/ 10" trend="this week" tint="peach"/></section><div className="content-card progress-card"><div className="card-heading"><div><span className="eyebrow">YOUR RECENT WINS</span><h3>Movement journal</h3></div><span className="journal-count">{logs.length} {logs.length === 1 ? 'entry' : 'entries'}</span></div>{logs.length ? <div className="activity-list large">{logs.map(log => <ActivityRow key={log.id} log={log}/>)}</div> : <div className="progress-empty"><div className="empty-icon"><TrendingUp size={18}/></div><strong>Every beginning is a win.</strong><span>Log a session to start your movement journal.</span><button className="primary-button small" onClick={() => setShowLog(true)}><Plus size={14}/>Log activity</button></div>}</div><PoseCoach onLog={(exercise, minutes, effort, notes) => logWorkout(exercise, minutes, effort, notes)}/></div>}

        {view === 'profile' && draft && <div className="page-content subpage"><section className="subpage-heading"><div><div className="date-eyebrow"><span className="sun-glyph">✳</span>BUILT AROUND YOU</div><h1>Your preferences<span className="title-dot">.</span></h1><p>Small details help make your plans feel like yours.</p></div><button className="primary-button" disabled={busy} onClick={() => void saveProfile()}><Check size={16}/>Save preferences</button></section><div className="profile-layout"><section className="content-card form-card"><div className="card-heading"><div><span className="eyebrow">A BIT ABOUT YOU</span><h3>Starting with what matters</h3></div><div className="form-illustration"><Heart size={18}/></div></div><div className="form-grid"><Field label="What should we call you?"><input value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})} placeholder="Your name"/></Field><Field label="Your main goal" wide><textarea value={draft.goal} onChange={e => setDraft({...draft, goal: e.target.value})} rows={2} placeholder="What would you like to work toward?"/></Field><Field label="Your experience"><select value={draft.experience} onChange={e => setDraft({...draft, experience: e.target.value})}><option value="beginner">Just getting started</option><option value="intermediate">Finding my rhythm</option><option value="advanced">Ready for a challenge</option></select></Field><Field label="Days you’d like to move"><select value={draft.weekly_days} onChange={e => setDraft({...draft, weekly_days: Number(e.target.value)})}>{[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n} days a week</option>)}</select></Field><Field label="Minutes per session"><select value={draft.minutes_per_session} onChange={e => setDraft({...draft, minutes_per_session: Number(e.target.value)})}>{[15,20,25,30,35,40,45,60].map(n => <option key={n} value={n}>{n} minutes</option>)}</select></Field><Field label="Equipment you have" wide><input value={draft.equipment} onChange={e => setDraft({...draft, equipment: e.target.value})} placeholder="e.g. Bodyweight, dumbbells"/></Field><Field label="Food preferences" wide><input value={draft.dietary_preferences} onChange={e => setDraft({...draft, dietary_preferences: e.target.value})} placeholder="e.g. Vegetarian, high protein, no peanuts"/></Field><Field label="Weekly meal budget (USD)"><input type="number" min="0" value={draft.weekly_budget} onChange={e => setDraft({...draft, weekly_budget: Number(e.target.value)})}/></Field></div></section><aside className="content-card profile-note"><div className="note-icon"><Sparkles size={20}/></div><h3>Your plan listens.</h3><p>FitPilot uses these details to make suggestions around your time, gear, food preferences, and goals.</p><div className="note-rule"/><span><Check size={15}/>You review plans before saving</span><span><Check size={15}/>You can change preferences any time</span><span><Check size={15}/>Your videos stay on your device</span></aside></div></div>}
      </>}
      <footer className="app-footer"><span>Take what feels good. Leave what doesn’t.</span><span><CircleHelp size={13}/> General wellness only · Not medical advice</span></footer>
    </main>

    <button className="coach-fab" onClick={() => setChatOpen(true)} aria-label="Open FitPilot coach"><MessageCircle size={20}/><span>Coach</span></button>
    {chatOpen && <div className="chat-backdrop" onClick={() => setChatOpen(false)}><section className="chat-panel" onClick={e => e.stopPropagation()}><div className="chat-head"><div className="coach-avatar"><Sparkles size={17}/></div><div><strong>Your FitPilot coach</strong><span><i className={llmReady ? 'online-dot' : 'offline-dot'}/>{llmReady ? 'Ready when you are' : 'Starter mode'}</span></div><button onClick={() => setChatOpen(false)} aria-label="Close coach"><X size={19}/></button></div><div className="chat-intro"><span className="chat-wave">✳</span><h3>Hey, {firstName}.</h3><p>What’s on your mind today? We can talk through your routine, meal ideas, or a small next step.</p><div className="suggestion-chips"><button onClick={() => setChatInput('Can you make my next workout shorter?')}>A shorter workout</button><button onClick={() => setChatInput('Suggest an affordable high-protein meal.')}>Easy meal idea</button></div></div><div className="chat-messages">{chatHistory.map((item, i) => <div key={i} className={`chat-bubble ${item.role === 'you' ? 'from-user' : 'from-coach'}`}>{item.text}</div>)}</div><form className="chat-compose" onSubmit={sendChat}><input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask anything about your plan…"/><button disabled={!chatInput.trim()} aria-label="Send message"><ArrowRight size={17}/></button></form><div className="chat-footnote">Wellness guidance, not medical advice.</div></section></div>}
    {showLog && <div className="modal-backdrop" onClick={() => setShowLog(false)}><section className="log-modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div className="modal-symbol"><Dumbbell size={19}/></div><button onClick={() => setShowLog(false)} aria-label="Close"><X size={19}/></button></div><span className="eyebrow">GIVE YOURSELF CREDIT</span><h2>Log some movement</h2><p>It doesn’t have to be a big workout to count.</p><label className="field"><span>What did you do?</span><input value={logExercise} onChange={e => setLogExercise(e.target.value)} /></label><div className="modal-fields"><label className="field"><span>Minutes</span><input type="number" min="1" max="300" value={logMinutes} onChange={e => setLogMinutes(e.target.value)}/></label><label className="field"><span>Effort · 1 to 10</span><input type="number" min="1" max="10" value={logEffort} onChange={e => setLogEffort(e.target.value)}/></label></div><button className="primary-button modal-submit" onClick={() => void logWorkout()}><Check size={16}/>Save this win</button></section></div>}
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
  </div>
}

function Metric({ icon, label, value, suffix, trend, tint }: { icon: React.ReactNode; label: string; value: string; suffix: string; trend: string; tint: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tint}`}>{icon}</div><span className="metric-label">{label}</span><div className="metric-value">{value}<small>{suffix}</small></div><div className="metric-trend"><span className="trend-arrow"><ArrowUpRight size={13}/></span>{trend}</div></div>
}
function ActivityRow({ log }: { log: Log }) {
  return <div className="activity-row"><div className="activity-symbol"><Dumbbell size={16}/></div><div className="activity-title"><strong>{log.exercise}</strong><span>{log.notes || `${log.perceived_effort}/10 effort`}</span></div><div className="activity-duration"><strong>{log.duration_minutes}<small> min</small></strong><span>{shortDate(log.completed_at)}</span></div><div className="activity-effort"><span>EFFORT</span><strong>{log.perceived_effort}<small>/10</small></strong></div></div>
}
function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) { return <label className={`field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label> }

function PlanView({ plan, draft, busy, onApprove, onDiscard }: { plan: Plan; draft?: boolean; busy?: boolean; onApprove?: () => void; onDiscard?: () => void }) {
  const content: PlanContent = plan.content
  return <div className="plan-layout">{draft && <div className="plan-review-banner"><div className="review-icon"><Sparkles size={17}/></div><div><strong>Take a look before it’s yours.</strong><span>This is a draft based on your preferences. Make sure it feels right for you.</span></div><span className="source-pill">{plan.source === 'tacc_qwen' ? 'AI COACH' : 'STARTER PLAN'}</span></div>}<div className="plan-summary content-card"><div className="plan-summary-copy"><span className="eyebrow">A FLEXIBLE STARTING POINT</span><h2>Your balanced week</h2><p>{content.summary}</p><div className="plan-meta"><span><CalendarDays size={14}/>{content.workouts.length} movement days</span><span><Clock3 size={14}/>{content.workouts.reduce((n, w) => n + w.duration_minutes, 0)} min total</span></div></div><div className="plan-sun">✳</div></div><section className="content-card schedule-card"><div className="card-heading"><div><span className="eyebrow">MOVEMENT, AT YOUR PACE</span><h3>Your workout rhythm</h3></div><span className="schedule-tag"><Activity size={13}/> {content.workouts.length} sessions</span></div><div className="workout-schedule">{content.workouts.map((workout, i) => <article className="workout-day" key={`${workout.day}-${i}`}><div className="workout-day-meta"><div className="workout-day-number">{String(i + 1).padStart(2, '0')}</div><span>{workout.day}</span></div><div className="workout-main"><strong>{workout.focus}</strong><span>{workout.duration_minutes} minutes · Choose a comfortable pace</span><div className="exercise-chips">{workout.exercises.map((ex, j) => <span key={`${ex.name}-${j}`}>{ex.name}{ex.sets ? ` · ${ex.sets} sets` : ''}</span>)}</div></div><div className="workout-clock"><Clock3 size={14}/>{workout.duration_minutes}m</div></article>)}</div></section><section className="content-card meals-card"><div className="card-heading"><div><span className="eyebrow">A FEW IDEAS, NOT RULES</span><h3>Simple meal inspiration</h3></div><div className="meal-icon"><Salad size={19}/></div></div><div className="meal-grid">{content.meals.map((meal, i) => <div className="plan-meal" key={`${meal.name}-${i}`}><div className="meal-plate"><Salad size={18}/></div><div><strong>{meal.name}</strong><span>{meal.why}</span></div><span className="meal-number">0{i + 1}</span></div>)}</div></section><div className="plan-notes"><div className="adapt-note"><TrendingUp size={16}/><span><strong>Room to adapt</strong>{content.adaptation_note}</span></div><div className="safety-note"><Heart size={16}/><span>{content.safety_note}</span></div></div>{draft && <div className="plan-approval"><span><Check size={15}/>You’re in charge. Only save this if it feels right.</span><div><button className="quiet-button" onClick={onDiscard}>Not now</button><button className="primary-button" disabled={busy} onClick={onApprove}>{busy ? 'Saving…' : 'Save my week'}<ArrowRight size={15}/></button></div></div>}</div>
}
