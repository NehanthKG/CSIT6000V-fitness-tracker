from __future__ import annotations

import json
import os
import re
from datetime import date, timedelta
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .schemas import ProfileUpdate, WorkoutLog
from .tacc import ModelUnavailable, ask

app = FastAPI(title="FitPilot API", version="0.1.0", description="Personal fitness planning and progress API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["GET", "POST", "PUT"], allow_headers=["Content-Type"])


@app.on_event("startup")
def startup() -> None:
    db.initialize()


def get_profile() -> dict[str, Any]:
    profile = db.one("SELECT * FROM profiles WHERE id=1")
    if not profile:
        raise HTTPException(500, "Profile has not been initialized")
    return profile


def fallback_plan(profile: dict[str, Any]) -> dict[str, Any]:
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    stride = max(1, round(7 / profile["weekly_days"]))
    chosen = days[::stride][: profile["weekly_days"]]
    for day in days:
        if len(chosen) >= profile["weekly_days"]:
            break
        if day not in chosen:
            chosen.append(day)
    use_dumbbells = "dumbbell" in profile["equipment"].lower()
    workouts = []
    for i, day in enumerate(chosen):
        lower = i % 2 == 0
        names = ["Bodyweight squats", "Glute bridges", "Reverse lunges"] if lower else ["Incline push-ups", "Dumbbell bicep curls" if use_dumbbells else "Backpack rows", "Arm circles"]
        workouts.append({"day": day, "focus": "Lower body + core" if lower else "Upper body + mobility", "duration_minutes": profile["minutes_per_session"], "exercises": [{"name": names[0], "sets": 3, "reps": "8-12", "rest_seconds": 60}, {"name": names[1], "sets": 3, "reps": "10-12", "rest_seconds": 60}, {"name": names[2], "sets": 2, "reps": "30 sec", "rest_seconds": 45}]})
    meals = [{"name": "Greek yogurt berry bowl", "why": "Protein-rich breakfast with fruit and fiber."}, {"name": "Chicken rice power bowl", "why": "Balanced lunch with lean protein and whole grains."}, {"name": "Lentil tomato soup", "why": "Budget-friendly dinner with plant protein."}]
    if any(tag in profile["dietary_preferences"].lower() for tag in ("vegetarian", "vegan", "plant")):
        meals[1] = {"name": "Peanut tofu stir-fry", "why": "Plant-based protein with vegetables and whole grains."}
    return {"summary": f"A balanced {profile['weekly_days']}-day starter week built around your goal: {profile['goal']}.", "workouts": workouts, "meals": meals, "adaptation_note": "Start at a comfortable effort. Log how each session felt and adjust next week.", "safety_note": "Stop if you feel pain, dizziness, or unusual shortness of breath. This is general wellness guidance."}


def parse_plan(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.IGNORECASE)
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("The model did not return a JSON plan")
    value = json.loads(cleaned[start : end + 1])
    if not isinstance(value.get("workouts"), list) or not value["workouts"] or not isinstance(value.get("meals"), list):
        raise ValueError("The generated plan is missing workouts or meals")
    value["workouts"] = value["workouts"][:7]
    value["meals"] = value["meals"][:7]
    for workout in value["workouts"]:
        workout["duration_minutes"] = max(10, min(int(workout.get("duration_minutes", 30)), 180))
        workout["exercises"] = workout.get("exercises", [])[:8]
    return value


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "llm_configured": bool(os.getenv("QWEN_BASE_URL", "").strip())}


@app.get("/api/profile")
def profile() -> dict[str, Any]:
    return get_profile()


@app.put("/api/profile")
def update_profile(body: ProfileUpdate) -> dict[str, Any]:
    v = body.model_dump()
    db.execute("UPDATE profiles SET name=?,goal=?,experience=?,weekly_days=?,minutes_per_session=?,equipment=?,dietary_preferences=?,weekly_budget=?,updated_at=CURRENT_TIMESTAMP WHERE id=1", (v["name"], v["goal"], v["experience"], v["weekly_days"], v["minutes_per_session"], v["equipment"], v["dietary_preferences"], v["weekly_budget"]))
    return get_profile()


@app.get("/api/overview")
def overview() -> dict[str, Any]:
    monday = (date.today() - timedelta(days=date.today().weekday())).isoformat()
    stats = db.one("SELECT COUNT(*) AS workouts, COALESCE(SUM(duration_minutes),0) AS minutes, COALESCE(AVG(perceived_effort),0) AS avg_effort FROM workout_logs WHERE date(completed_at)>=?", (monday,)) or {"workouts": 0, "minutes": 0, "avg_effort": 0}
    recent = db.rows("SELECT * FROM workout_logs ORDER BY completed_at DESC LIMIT 5")
    plan = db.one("SELECT id,title,content_json,source,created_at FROM plans WHERE is_active=1 ORDER BY id DESC LIMIT 1")
    if plan:
        plan["content"] = json.loads(plan.pop("content_json"))
    return {"profile": get_profile(), "stats": stats, "recent_workouts": recent, "active_plan": plan}


@app.get("/api/plans")
def plans() -> list[dict[str, Any]]:
    result = db.rows("SELECT id,title,content_json,source,created_at FROM plans ORDER BY id DESC LIMIT 10")
    for plan in result:
        plan["content"] = json.loads(plan.pop("content_json"))
    return result


@app.post("/api/plans/generate")
def generate_plan() -> dict[str, Any]:
    user = get_profile()
    exercises = db.rows("SELECT name,category,equipment,difficulty FROM exercises")
    recipes = db.rows("SELECT name,calories,protein_g,cost,dietary_tags FROM recipes")
    system = ("You are FitPilot, a cautious general-wellness planning assistant. Create realistic plans and never diagnose or prescribe treatment. Respect time, equipment, dietary, budget and experience constraints. Use the supplied exercise and recipe catalogs. Return valid JSON only: summary (string), workouts (array of {day,focus,duration_minutes,exercises:[{name,sets,reps,rest_seconds}]}), meals (array of {name,why}), adaptation_note and safety_note (strings). Include exactly the requested number of workout days.")
    prompt = {"profile": user, "exercise_catalog": exercises, "recipe_catalog": recipes, "constraints": "Do not exceed minutes_per_session or weekly_budget. Include exactly weekly_days sessions and respect dietary_preferences."}
    source = "tacc_qwen"
    try:
        raw = ask([{"role": "system", "content": system}, {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)}])
        content = parse_plan(raw)
    except (ModelUnavailable, ValueError, TypeError, json.JSONDecodeError):
        content, source = fallback_plan(user), "local_fallback"
    return {"title": "Your balanced week", "content": content, "source": source, "requires_approval": True}


@app.post("/api/plans")
def save_plan(body: dict[str, Any]) -> dict[str, Any]:
    content = body.get("content")
    if not isinstance(content, dict) or not content.get("workouts"):
        raise HTTPException(422, "A workout plan is required")
    with db.connect() as conn:
        conn.execute("UPDATE plans SET is_active=0 WHERE is_active=1")
        cur = conn.execute("INSERT INTO plans(title,content_json,source,is_active) VALUES(?,?,?,1)", (str(body.get("title", "Your balanced week"))[:100], db.json_dump(content), body.get("source", "local_fallback")))
        plan_id = cur.lastrowid
    return {"id": plan_id, "title": body.get("title", "Your balanced week"), "content": content}


@app.get("/api/workouts")
def workouts() -> list[dict[str, Any]]:
    return db.rows("SELECT * FROM workout_logs ORDER BY completed_at DESC LIMIT 50")


@app.post("/api/workouts")
def log_workout(body: WorkoutLog) -> dict[str, Any]:
    v = body.model_dump()
    row_id = db.execute("INSERT INTO workout_logs(exercise,duration_minutes,perceived_effort,notes) VALUES(?,?,?,?)", (v["exercise"], v["duration_minutes"], v["perceived_effort"], v["notes"]))
    return db.one("SELECT * FROM workout_logs WHERE id=?", (row_id,)) or {}


@app.post("/api/assistant/chat")
def assistant_chat(body: dict[str, Any]) -> dict[str, str]:
    question = str(body.get("message", "")).strip()
    if not question or len(question) > 1200:
        raise HTTPException(422, "Enter a message of up to 1200 characters")
    context = {"profile": get_profile(), "recent_activity": db.rows("SELECT exercise,duration_minutes,perceived_effort FROM workout_logs ORDER BY completed_at DESC LIMIT 5"), "message": question}
    system = "You are FitPilot, a supportive general fitness and meal-planning helper. Give practical, concise wellness suggestions. Do not diagnose, treat injuries, or make medical claims. If the user reports pain or alarming symptoms, advise stopping and consulting a qualified professional. Ask before suggesting major plan changes."
    try:
        answer = ask([{"role": "system", "content": system}, {"role": "user", "content": json.dumps(context, ensure_ascii=False)}], max_tokens=500)
        return {"answer": answer, "source": "tacc_qwen"}
    except ModelUnavailable:
        return {"answer": "The TACC Qwen service is not connected right now. You can still generate a starter plan and log your activity; connect the current TACC service URL in `QWEN_BASE_URL` to use the AI coach.", "source": "offline"}
