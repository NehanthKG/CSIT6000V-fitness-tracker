from typing import Literal

from pydantic import BaseModel, Field


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    goal: str = Field(min_length=3, max_length=240)
    experience: Literal["beginner", "intermediate", "advanced"] = "beginner"
    weekly_days: int = Field(ge=1, le=7)
    minutes_per_session: int = Field(ge=10, le=180)
    equipment: str = Field(max_length=240)
    dietary_preferences: str = Field(max_length=240)
    weekly_budget: float = Field(ge=0, le=10000)


class WorkoutLog(BaseModel):
    exercise: str = Field(min_length=2, max_length=100)
    duration_minutes: int = Field(ge=1, le=300)
    perceived_effort: int = Field(ge=1, le=10)
    notes: str = Field(default="", max_length=500)
