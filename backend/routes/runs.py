from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse, Response
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
from generators.jmx_generator import generate_jmx

router = APIRouter(prefix="/runs", tags=["runs"])


class RunConfig(BaseModel):
    lob_id: int
    tool: str = "k6"
    virtual_users: int = 10
    duration_seconds: int = 60
    ramp_up_seconds: int = 10
    iterations: Optional[int] = None
    api_filter: str = "all"  # all | get | post


class RunResponse(BaseModel):
    id: int
    lob_id: int
    tool: str
    virtual_users: int
    duration_seconds: int
    ramp_up_seconds: int
    iterations: Optional[int]
    status: str
    report_json: Optional[str]
    created_at: datetime
    finished_at: Optional[datetime]

    class Config:
        from_attributes = True


def _load_lob_and_mappings(lob_id: int, db: Session, api_filter: str = "all"):
    lob = db.query(models.LOB).filter(models.LOB.id == lob_id).first()
    if not lob:
        raise HTTPException(status_code=404, detail="LOB not found")

    query = (
        db.query(models.LOBAPIMapping)
        .options(joinedload(models.LOBAPIMapping.api))
        .filter(
            models.LOBAPIMapping.lob_id == lob_id,
            models.LOBAPIMapping.enabled == True,
        )
    )
    mappings = query.all()

    # Apply API method filter
    if api_filter == "get":
        mappings = [m for m in mappings if m.api.method.upper() == "GET"]
    elif api_filter == "post":
        mappings = [m for m in mappings if m.api.method.upper() in ("POST", "PUT", "PATCH")]

    if not mappings:
        detail = "No APIs enabled for this LOB."
        if api_filter != "all":
            detail = f"No {api_filter.upper()} APIs enabled for this LOB."
        raise HTTPException(status_code=400, detail=detail)

    for m in mappings:
        m.api_method = m.api.method

    return lob, mappings


@router.post("/preview/k6", response_class=PlainTextResponse)
def preview_k6(config: RunConfig, db: Session = Depends(get_db)):
    lob, mappings = _load_lob_and_mappings(config.lob_id, db, config.api_filter)
    script = generate_k6_script(
        lob, mappings,
        config.virtual_users, config.duration_seconds,
        config.ramp_up_seconds, config.iterations
    )
    return script


@router.post("/download/k6")
def download_k6(config: RunConfig, db: Session = Depends(get_db)):
    lob, mappings = _load_lob_and_mappings(config.lob_id, db, config.api_filter)
    script = generate_k6_script(
        lob, mappings,
        config.virtual_users, config.duration_seconds,
        config.ramp_up_seconds, config.iterations
    )
    filename = f"{lob.name.lower().replace(' ', '_')}_k6.js"
    return Response(
        content=script,
        media_type="application/javascript",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/download/jmx")
def download_jmx(config: RunConfig, db: Session = Depends(get_db)):
    lob, mappings = _load_lob_and_mappings(config.lob_id, db, config.api_filter)
    jmx = generate_jmx(
        lob, mappings,
        config.virtual_users, config.duration_seconds,
        config.ramp_up_seconds, config.iterations
    )
    filename = f"{lob.name.lower().replace(' ', '_')}_jmeter.jmx"
    return Response(
        content=jmx,
        media_type="application/xml",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


def _parse_k6_output(stdout: str) -> dict:
    """Parse k6 --out json=- output into metrics dict."""
    metrics = {}
    by_endpoint = {}

    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except Exception:
            continue

        if obj.get("type") != "Point":
            continue

        metric = obj.get("metric", "")
        value  = obj.get("data", {}).get("value", 0)
        tags   = obj.get("data", {}).get("tags", {})
        name   = tags.get("name", tags.get("url", ""))

        # collect per-metric raw values
        if metric not in metrics:
            metrics[metric] = []
        metrics[metric].append(value)

        # per-endpoint latency
        if metric == "http_req_duration" and name:
            ep = name.split("?")[0].split("//")[-1]
            ep = "/" + "/".join(ep.split("/")[1:]) if "/" in ep else ep
            method = tags.get("method", "GET").upper()
            if ep not in by_endpoint:
                by_endpoint[ep] = {"latencies": [], "errors": 0, "count": 0, "method": method}
            by_endpoint[ep]["latencies"].append(value)
            by_endpoint[ep]["count"] += 1

        if metric == "http_req_failed" and name:
            ep = name.split("?")[0].split("//")[-1]
            ep = "/" + "/".join(ep.split("/")[1:]) if "/" in ep else ep
            if ep not in by_endpoint:
                by_endpoint[ep] = {"latencies": [], "errors": 0, "count": 0}
            if value == 1:
                by_endpoint[ep]["errors"] += 1

    def pct(data, p):
        if not data:
            return 0
        s = sorted(data)
        return round(s[min(int(len(s) * p / 100), len(s)-1)])

    durations   = metrics.get("http_req_duration", [])
    failed_vals = metrics.get("http_req_failed", [])
    total_req   = len(durations)

    # http_req_failed is a rate metric (0 or 1 per request)
    # Count actual failures — number of 1s, capped at total_req
    errors = min(int(sum(1 for v in failed_vals if v == 1)), total_req) if failed_vals else 0

    # Calculate total time from actual duration span
    total_time  = sum(metrics.get("iteration_duration", [1000])) / 1000 or 1

    result = {
        "total_requests":   total_req,
        "errors":           errors,
        "error_rate_pct":   round(errors / total_req * 100, 2) if total_req else 0,
        "p50_ms":           pct(durations, 50),
        "p90_ms":           pct(durations, 90),
        "p99_ms":           pct(durations, 99),
        "avg_ms":           round(sum(durations) / total_req) if total_req else 0,
        "min_ms":           round(min(durations)) if durations else 0,
        "max_ms":           round(max(durations)) if durations else 0,
        "rps":              round(total_req / total_time, 2),
        "by_endpoint":      {
            ep: {
                "count":   d["count"],
                "errors":  d["errors"],
                "method":  d.get("method", "GET"),
                "p50_ms":  pct(d["latencies"], 50),
                "p90_ms":  pct(d["latencies"], 90),
                "p99_ms":  pct(d["latencies"], 99),
            }
            for ep, d in by_endpoint.items()
        }
    }
    return result


@router.post("/run/k6", response_model=RunResponse)
def run_k6(config: RunConfig, db: Session = Depends(get_db)):
    lob, mappings = _load_lob_and_mappings(config.lob_id, db, config.api_filter)

    run = models.TestRun(
        lob_id=config.lob_id,
        tool="k6",
        virtual_users=config.virtual_users,
        duration_seconds=config.duration_seconds,
        ramp_up_seconds=config.ramp_up_seconds,
        iterations=config.iterations,
        status="running",
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    script = generate_k6_script(
        lob, mappings,
        config.virtual_users, config.duration_seconds,
        config.ramp_up_seconds, config.iterations
    )

    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False) as f:
            f.write(script)
            script_path = f.name

        result = subprocess.run(
            ["k6", "run", "--out", "json=-", script_path],
            capture_output=True, text=True,
            timeout=config.duration_seconds + 120
        )

        os.unlink(script_path)

        metrics = _parse_k6_output(result.stdout or "")

        report = {
            "stdout": result.stderr[-3000:] if result.stderr else "",
            "returncode": result.returncode,
            "lob": lob.name,
            "tool": "k6",
            "virtual_users": config.virtual_users,
            "duration_seconds": config.duration_seconds,
            "metrics": metrics,
        }

        run.status = "done" if result.returncode == 0 else "failed"
        run.report_json = json.dumps(report)
        run.finished_at = datetime.utcnow()

    except FileNotFoundError:
        run.status = "failed"
        run.report_json = json.dumps({"error": "k6 not installed on server."})
        run.finished_at = datetime.utcnow()
    except subprocess.TimeoutExpired:
        run.status = "failed"
        run.report_json = json.dumps({"error": "Test run timed out."})
        run.finished_at = datetime.utcnow()
    except Exception as e:
        run.status = "failed"
        run.report_json = json.dumps({"error": str(e)})
        run.finished_at = datetime.utcnow()

    db.commit()
    db.refresh(run)
    return run


def _parse_jtl(jtl_path: str) -> dict:
    """Parse JMeter JTL CSV results into summary metrics."""
    import csv
    rows = []
    try:
        with open(jtl_path, newline='') as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(row)
    except Exception:
        return {"error": "Could not parse JTL results file"}

    if not rows:
        return {"error": "No results in JTL file"}

    latencies = []
    errors = 0
    by_label = {}

    for row in rows:
        try:
            elapsed = int(row.get("elapsed", 0))
            success = row.get("success", "true").lower() == "true"
            label = row.get("label", "unknown")
            latencies.append(elapsed)
            if not success:
                errors += 1
            if label not in by_label:
                by_label[label] = {"count": 0, "errors": 0, "latencies": []}
            by_label[label]["count"] += 1
            by_label[label]["latencies"].append(elapsed)
            if not success:
                by_label[label]["errors"] += 1
        except Exception:
            continue

    def percentile(data, p):
        if not data:
            return 0
        s = sorted(data)
        idx = int(len(s) * p / 100)
        return s[min(idx, len(s) - 1)]

    total = len(latencies)
    summary = {
        "total_requests": total,
        "errors": errors,
        "error_rate_pct": round(errors / total * 100, 2) if total else 0,
        "p50_ms": percentile(latencies, 50),
        "p90_ms": percentile(latencies, 90),
        "p99_ms": percentile(latencies, 99),
        "avg_ms": round(sum(latencies) / total) if total else 0,
        "min_ms": min(latencies) if latencies else 0,
        "max_ms": max(latencies) if latencies else 0,
        "by_endpoint": {
            label: {
                "count": d["count"],
                "errors": d["errors"],
                "p50_ms": percentile(d["latencies"], 50),
                "p90_ms": percentile(d["latencies"], 90),
                "p99_ms": percentile(d["latencies"], 99),
            }
            for label, d in by_label.items()
        }
    }
    return summary


@router.post("/run/jmeter", response_model=RunResponse)
def run_jmeter(config: RunConfig, db: Session = Depends(get_db)):
    lob, mappings = _load_lob_and_mappings(config.lob_id, db, config.api_filter)

    run = models.TestRun(
        lob_id=config.lob_id,
        tool="jmeter",
        virtual_users=config.virtual_users,
        duration_seconds=config.duration_seconds,
        ramp_up_seconds=config.ramp_up_seconds,
        iterations=config.iterations,
        status="running",
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    jmx_content = generate_jmx(
        lob, mappings,
        config.virtual_users, config.duration_seconds,
        config.ramp_up_seconds, config.iterations
    )

    try:
        tmp_dir = tempfile.mkdtemp()
        jmx_path = os.path.join(tmp_dir, "test.jmx")
        jtl_path = os.path.join(tmp_dir, "results.jtl")
        report_dir = os.path.join(tmp_dir, "report")

        with open(jmx_path, "w") as f:
            f.write(jmx_content)

        result = subprocess.run(
            ["jmeter", "-n", "-t", jmx_path, "-l", jtl_path, "-e", "-o", report_dir],
            capture_output=True, text=True,
            timeout=config.duration_seconds + 120
        )

        metrics = _parse_jtl(jtl_path) if os.path.exists(jtl_path) else {}

        report = {
            "tool": "jmeter",
            "lob": lob.name,
            "virtual_users": config.virtual_users,
            "duration_seconds": config.duration_seconds,
            "returncode": result.returncode,
            "stdout": result.stdout[-3000:] if result.stdout else "",
            "stderr": result.stderr[-2000:] if result.stderr else "",
            "metrics": metrics,
        }

        run.status = "done" if result.returncode == 0 else "failed"
        run.report_json = json.dumps(report)
        run.finished_at = datetime.utcnow()

    except FileNotFoundError:
        run.status = "failed"
        run.report_json = json.dumps({"error": "JMeter not installed on server. Install with: brew install jmeter (Mac) or apt-get install jmeter (Linux)"})
        run.finished_at = datetime.utcnow()
    except subprocess.TimeoutExpired:
        run.status = "failed"
        run.report_json = json.dumps({"error": "JMeter test run timed out."})
        run.finished_at = datetime.utcnow()
    except Exception as e:
        run.status = "failed"
        run.report_json = json.dumps({"error": str(e)})
        run.finished_at = datetime.utcnow()

    db.commit()
    db.refresh(run)
    return run


@router.get("/", response_model=list[RunResponse])
def list_runs(lob_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(models.TestRun)
    if lob_id:
        query = query.filter(models.TestRun.lob_id == lob_id)
    return query.order_by(models.TestRun.created_at.desc()).limit(50).all()


@router.get("/{run_id}", response_model=RunResponse)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(models.TestRun).filter(models.TestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run
