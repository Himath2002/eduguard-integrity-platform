from pydantic import BaseModel

class AdminDashboardStatsOut(BaseModel):
    instructors: int
    students: int
    pending_submissions: int