from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from database import get_db
import models

router = APIRouter(prefix="/thresholds", tags=["thresholds"])


class ThresholdUpdate(BaseModel):
    p99_max_ms: int = 2000
    p90_max_ms: int = 1000
    error_rate_max_pct: float = 5.0
    min_rps: float = 0.0


class ThresholdResponse(BaseModel):
    id: int
    lob_id: int
    p99_max_ms: int
    p90_max_ms: int
    error_rate_max_pct: float
    min_rps: float
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/{lob_id}", response_model=ThresholdResponse)
def get_threshold(lob_id: int, db: Session = Depends(get_db)):
    t = db.query(models.LOBThreshold).filter(models.LOBThreshold.lob_id == lob_id).first()
    if not t:
        t = models.LOBThreshold(lob_id=lob_id)
        db.add(t)
        db.commit()
        db.refresh(t)
    return t


@router.put("/{lob_id}", response_model=ThresholdResponse)
def save_threshold(lob_id: int, payload: ThresholdUpdate, db: Session = Depends(get_db)):
    lob = db.query(models.LOB).filter(models.LOB.id == lob_id).first()
    if not lob:
        raise HTTPException(status_code=404, detail="LOB not found")
    t = db.query(models.LOBThreshold).filter(models.LOBThreshold.lob_id == lob_id).first()
    if not t:
        t = models.LOBThreshold(lob_id=lob_id)
        db.add(t)
    t.p99_max_ms = payload.p99_max_ms
    t.p90_max_ms = payload.p90_max_ms
    t.error_rate_max_pct = payload.error_rate_max_pct
    t.min_rps = payload.min_rps
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
    return t
