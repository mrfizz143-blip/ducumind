from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import ProcessingJob, User
from ..schemas import JobOut

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = db.scalar(select(ProcessingJob).where(ProcessingJob.id == job_id, ProcessingJob.owner_id == user.id))
    if job is None:
        raise HTTPException(404, "Job not found")
    return JobOut.model_validate(job)


@router.get("")
def list_jobs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    jobs = db.execute(
        select(ProcessingJob).where(ProcessingJob.owner_id == user.id).order_by(ProcessingJob.created_at.desc()).limit(30)
    ).scalars().all()
    return [JobOut.model_validate(j) for j in jobs]