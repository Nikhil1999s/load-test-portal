from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
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
    status_codes = {}   # track HTTP status code counts
    error_samples = []  # collect sample error details

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

        # track HTTP status codes
        if metric == "http_req_duration" and tags.get("status"):
            status = tags.get("status", "0")
            status_codes[status] = status_codes.get(status, 0) + 1

        # per-endpoint latency
        if metric == "http_req_duration" and name:
            ep = name.split("?")[0].split("//")[-1]
            ep = "/" + "/".join(ep.split("/")[1:]) if "/" in ep else ep
            method = tags.get("method", "GET").upper()
            status = tags.get("status", "0")
            if ep not in by_endpoint:
                by_endpoint[ep] = {"latencies": [], "errors": 0, "count": 0, "method": method, "status_codes": {}}
            by_endpoint[ep]["latencies"].append(value)
            by_endpoint[ep]["count"] += 1
            # Track status codes per endpoint
            by_endpoint[ep]["status_codes"][status] = by_endpoint[ep]["status_codes"].get(status, 0) + 1
            # Collect error samples (4xx/5xx)
            if status and status.startswith(('4','5')) and len(error_samples) < 10:
                error_samples.append({
                    "endpoint": ep,
                    "method": method,
                    "status_code": int(status),
                    "status_text": _http_status_text(int(status)),
                    "latency_ms": round(value),
                })

        if metric == "http_req_failed" and name:
            ep = name.split("?")[0].split("//")[-1]
            ep = "/" + "/".join(ep.split("/")[1:]) if "/" in ep else ep
            if ep not in by_endpoint:
                by_endpoint[ep] = {"latencies": [], "errors": 0, "count": 0, "status_codes": {}}
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

    errors = min(int(sum(1 for v in failed_vals if v == 1)), total_req) if failed_vals else 0
    total_time = sum(metrics.get("iteration_duration", [1000])) / 1000 or 1

    # Summarise status codes
    status_summary = {
        "2xx": sum(v for k,v in status_codes.items() if k.startswith('2')),
        "3xx": sum(v for k,v in status_codes.items() if k.startswith('3')),
        "4xx": sum(v for k,v in status_codes.items() if k.startswith('4')),
        "5xx": sum(v for k,v in status_codes.items() if k.startswith('5')),
        "details": status_codes,
    }

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
        "status_summary":   status_summary,
        "error_samples":    error_samples,
        "by_endpoint":      {
            ep: {
                "count":        d["count"],
                "errors":       d["errors"],
                "method":       d.get("method", "GET"),
                "status_codes": d.get("status_codes", {}),
                "p50_ms":       pct(d["latencies"], 50),
                "p90_ms":       pct(d["latencies"], 90),
                "p99_ms":       pct(d["latencies"], 99),
            }
            for ep, d in by_endpoint.items()
        }
    }
    return result


def _http_status_text(code: int) -> str:
    texts = {
        400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
        404: "Not Found", 405: "Method Not Allowed", 408: "Request Timeout",
        429: "Too Many Requests", 500: "Internal Server Error",
        502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout",
    }
    return texts.get(code, f"HTTP {code}")


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


@router.post("/run/jmx-upload")
async def run_jmx_upload(
    file: UploadFile = File(...),
    iterations: str = Form(...),
    db: Session = Depends(get_db)
):
    """Run an uploaded JMX file directly — no LOB needed, auth is inside the JMX."""
    import json as _json
    iter_configs = _json.loads(iterations)

    # Save uploaded JMX to temp file
    with tempfile.NamedTemporaryFile(mode='wb', suffix='.jmx', delete=False) as f:
        content = await file.read()
        f.write(content)
        jmx_path = f.name

    results = []
    overall_status = 'done'

    for i, cfg in enumerate(iter_configs, 1):
        vus      = int(cfg.get('virtual_users', 10))
        duration = int(cfg.get('duration_seconds', 60))
        ramp     = int(cfg.get('ramp_up_seconds', 10))

        # Patch VUs and duration into JMX via temp copy
        patched_path = jmx_path.replace('.jmx', f'_iter{i}.jmx')
        with open(jmx_path, 'r', encoding='utf-8', errors='replace') as f:
            jmx_content = f.read()

        # Replace common JMeter thread count and duration properties
        import re
        jmx_content = re.sub(r'(<stringProp name="ThreadGroup\.num_threads">)\d+(</stringProp>)', f'\\g<1>{vus}\\2', jmx_content)
        jmx_content = re.sub(r'(<stringProp name="ThreadGroup\.duration">)\d+(</stringProp>)', f'\\g<1>{duration}\\2', jmx_content)
        jmx_content = re.sub(r'(<stringProp name="ThreadGroup\.ramp_time">)\d+(</stringProp>)', f'\\g<1>{ramp}\\2', jmx_content)

        with open(patched_path, 'w', encoding='utf-8') as f:
            f.write(jmx_content)

        try:
            result_dir = tempfile.mkdtemp()
            result_jtl = os.path.join(result_dir, 'result.jtl')

            proc = subprocess.run(
                ['jmeter', '-n', '-t', patched_path, '-l', result_jtl],
                capture_output=True, text=True,
                timeout=duration + 120
            )

            metrics = _parse_jtl(result_jtl) if os.path.exists(result_jtl) else {}
            status = 'done' if proc.returncode == 0 else 'failed'

        except Exception as e:
            metrics = {'error': str(e)}
            status = 'failed'
            overall_status = 'failed'
        finally:
            if os.path.exists(patched_path):
                os.unlink(patched_path)

        results.append({
            'iteration': i,
            'virtual_users': vus,
            'duration_seconds': duration,
            'status': status,
            'metrics': metrics,
        })

    # Cleanup
    if os.path.exists(jmx_path):
        os.unlink(jmx_path)

    report = {
        'tool': 'jmeter',
        'source': 'upload',
        'filename': file.filename,
        'total_iterations': len(results),
        'iterations': results,
    }

    return {
        'status': overall_status,
        'report_json': json.dumps(report),
        'total_iterations': len(results),
    }


def _parse_jtl(jtl_path: str) -> dict:
    """Parse JMeter JTL result file into metrics dict."""
    import csv
    latencies = []
    errors = 0
    total = 0
    try:
        with open(jtl_path, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                total += 1
                elapsed = int(row.get('elapsed', 0))
                latencies.append(elapsed)
                rc = row.get('responseCode', '200')
                if not rc.startswith('2') and not rc.startswith('3'):
                    errors += 1
    except Exception:
        return {}

    def pct(data, p):
        if not data: return 0
        s = sorted(data)
        return s[int(len(s) * p / 100)]

    return {
        'total_requests': total,
        'errors': errors,
        'error_rate_pct': round(errors/total*100, 2) if total else 0,
        'avg_ms': round(sum(latencies)/len(latencies)) if latencies else 0,
        'min_ms': min(latencies) if latencies else 0,
        'max_ms': max(latencies) if latencies else 0,
        'p50_ms': pct(latencies, 50),
        'p90_ms': pct(latencies, 90),
        'p99_ms': pct(latencies, 99),
        'rps': round(total / (sum(latencies)/1000/len(latencies) if latencies else 1), 2),
    }
