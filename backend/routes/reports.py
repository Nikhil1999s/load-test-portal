from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import json

from database import get_db
import models
from generators.pdf_generator import generate_pdf

router = APIRouter(prefix="/reports", tags=["reports"])


class PDFRequest(BaseModel):
    run_id: int
    custom_obs: Optional[str] = None
    qa_name: Optional[str] = None


@router.get("/")
def list_reports(lob_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(models.TestRun).filter(models.TestRun.status == "done")
    if lob_id:
        query = query.filter(models.TestRun.lob_id == lob_id)
    runs = query.order_by(models.TestRun.created_at.desc()).limit(100).all()
    result = []
    for run in runs:
        lob = db.query(models.LOB).filter(models.LOB.id == run.lob_id).first()
        metrics = {}
        if run.report_json:
            data = json.loads(run.report_json)
            metrics = data.get("metrics", {})
        result.append({
            "id": run.id, "lob_id": run.lob_id,
            "lob_name": lob.name if lob else "Unknown",
            "lob_env": lob.environment if lob else "",
            "tool": run.tool,
            "virtual_users": run.virtual_users,
            "duration_seconds": run.duration_seconds,
            "status": run.status,
            "created_at": run.created_at.isoformat(),
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            "total_requests": metrics.get("total_requests", 0),
            "p99_ms": metrics.get("p99_ms", 0),
            "error_rate_pct": metrics.get("error_rate_pct", 0),
            "avg_ms": metrics.get("avg_ms", 0),
        })
    return result


@router.get("/{run_id}")
def get_report(run_id: int, db: Session = Depends(get_db)):
    run = db.query(models.TestRun).filter(models.TestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    lob = db.query(models.LOB).filter(models.LOB.id == run.lob_id).first()
    threshold = db.query(models.LOBThreshold).filter(models.LOBThreshold.lob_id == run.lob_id).first()
    metrics = {}
    raw = {}
    if run.report_json:
        raw = json.loads(run.report_json)
        metrics = raw.get("metrics", {})
    return {
        "run": {"id": run.id, "tool": run.tool, "virtual_users": run.virtual_users,
                "duration_seconds": run.duration_seconds, "ramp_up_seconds": run.ramp_up_seconds,
                "iterations": run.iterations, "status": run.status,
                "created_at": run.created_at.isoformat(),
                "finished_at": run.finished_at.isoformat() if run.finished_at else None},
        "lob": {"id": lob.id, "name": lob.name, "base_url": lob.base_url,
                "environment": lob.environment} if lob else {},
        "metrics": metrics,
        "raw_output": raw.get("stdout", ""),
        "thresholds": {
            "p99_max_ms": threshold.p99_max_ms if threshold else 2000,
            "p90_max_ms": threshold.p90_max_ms if threshold else 1000,
            "error_rate_max_pct": threshold.error_rate_max_pct if threshold else 5.0,
            "min_rps": threshold.min_rps if threshold else 0,
        },
    }


@router.post("/pdf")
def download_pdf(payload: PDFRequest, db: Session = Depends(get_db)):
    run = db.query(models.TestRun).filter(models.TestRun.id == payload.run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    lob = db.query(models.LOB).filter(models.LOB.id == run.lob_id).first()
    if not lob:
        raise HTTPException(status_code=404, detail="LOB not found")
    threshold = db.query(models.LOBThreshold).filter(models.LOBThreshold.lob_id == run.lob_id).first()
    if not threshold:
        threshold = models.LOBThreshold(lob_id=run.lob_id)
    metrics = {}
    if run.report_json:
        data = json.loads(run.report_json)
        metrics = data.get("metrics", {})
    if not metrics:
        raise HTTPException(status_code=400, detail="No metrics available. Run must complete successfully first.")
    buf = generate_pdf(run, lob, metrics, threshold,
                       custom_obs=payload.custom_obs,
                       qa_name=payload.qa_name,
                       version='internal')
    slug = lob.name.lower().replace(' ', '_')
    filename = f"{slug}_run{run.id}_report.pdf"
    return Response(content=buf.read(), media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={filename}"})
