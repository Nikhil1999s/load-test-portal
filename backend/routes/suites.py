from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional
import subprocess
import tempfile
import os
import json
from datetime import datetime

from database import get_db
import models
from generators.k6_generator import generate_k6_script
from routes.runs import _load_lob_and_mappings, _parse_k6_output

router = APIRouter(prefix="/suites", tags=["suites"])


class IterationConfig(BaseModel):
    virtual_users: int
    duration_seconds: int = 300
    ramp_up_seconds: int = 120


class SuiteConfig(BaseModel):
    lob_id: int
    tool: str = "k6"
    iterations: list[IterationConfig]


class SuiteResponse(BaseModel):
    id: int
    lob_id: int
    tool: str
    status: str
    report_json: Optional[str]
    created_at: datetime
    finished_at: Optional[datetime]

    class Config:
        from_attributes = True


def _run_single_k6(lob, mappings, vus, duration, ramp_up, iteration_num, timeout):
    """Run a single k6 iteration and return metrics dict."""
    script = generate_k6_script(lob, mappings, vus, duration, ramp_up, None)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False) as f:
        f.write(script)
        script_path = f.name

    try:
        result = subprocess.run(
            ["k6", "run", "--out", "json=-", script_path],
            capture_output=True, text=True,
            timeout=timeout
        )
        os.unlink(script_path)
        metrics = _parse_k6_output(result.stdout or "")
        metrics["returncode"] = result.returncode
        metrics["stderr"] = result.stderr[-1000:] if result.stderr else ""
        return metrics
    except Exception as e:
        if os.path.exists(script_path):
            os.unlink(script_path)
        return {"error": str(e), "returncode": 1}


@router.post("/run", response_model=SuiteResponse)
def run_suite(config: SuiteConfig, db: Session = Depends(get_db)):
    if not config.iterations:
        raise HTTPException(status_code=400, detail="At least one iteration required")

    lob, mappings = _load_lob_and_mappings(config.lob_id, db)

    suite = models.TestSuite(
        lob_id=config.lob_id,
        tool=config.tool,
        status="running",
    )
    db.add(suite)
    db.commit()
    db.refresh(suite)

    iteration_results = []
    all_failed = False

    for i, iter_config in enumerate(config.iterations, 1):
        run = models.TestRun(
            lob_id=config.lob_id,
            suite_id=suite.id,
            iteration_number=i,
            tool=config.tool,
            virtual_users=iter_config.virtual_users,
            duration_seconds=iter_config.duration_seconds,
            ramp_up_seconds=iter_config.ramp_up_seconds,
            status="running",
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        timeout = iter_config.duration_seconds + 120
        metrics = _run_single_k6(
            lob, mappings,
            iter_config.virtual_users,
            iter_config.duration_seconds,
            iter_config.ramp_up_seconds,
            i, timeout
        )

        run.status = "done" if metrics.get("returncode", 1) == 0 else "failed"
        run.report_json = json.dumps({"metrics": metrics, "tool": config.tool, "lob": lob.name})
        run.finished_at = datetime.utcnow()
        db.commit()

        iteration_results.append({
            "iteration": i,
            "virtual_users": iter_config.virtual_users,
            "duration_seconds": iter_config.duration_seconds,
            "ramp_up_seconds": iter_config.ramp_up_seconds,
            "run_id": run.id,
            "status": run.status,
            "metrics": metrics,
        })

    suite_report = {
        "lob": lob.name,
        "tool": config.tool,
        "iterations": iteration_results,
        "total_iterations": len(iteration_results),
    }

    suite.status = "done" if all(r["status"] == "done" for r in iteration_results) else "failed"
    suite.report_json = json.dumps(suite_report)
    suite.finished_at = datetime.utcnow()
    db.commit()
    db.refresh(suite)
    return suite


@router.get("/", response_model=list[SuiteResponse])
def list_suites(lob_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(models.TestSuite)
    if lob_id:
        query = query.filter(models.TestSuite.lob_id == lob_id)
    return query.order_by(models.TestSuite.created_at.desc()).limit(50).all()


@router.get("/{suite_id}", response_model=SuiteResponse)
def get_suite(suite_id: int, db: Session = Depends(get_db)):
    suite = db.query(models.TestSuite).filter(models.TestSuite.id == suite_id).first()
    if not suite:
        raise HTTPException(status_code=404, detail="Suite not found")
    return suite
