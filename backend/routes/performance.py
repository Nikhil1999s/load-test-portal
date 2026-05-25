from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import models
from utils.openobserve_client import (
    get_config_status,
    has_auth,
    search_logs,
    search_http_timeline,
    search_cpu_timeline,
    build_performance_snapshot,
    build_dashboard_snapshot,
    dt_to_microseconds,
    build_error_sql,
    build_lob_sql,
    build_api_error_sql,
)
import json
from utils.env_loader import load_env

router = APIRouter(prefix="/performance", tags=["performance"])


def _iso_utc(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _run_time_window(
    run: models.TestRun, buffer_seconds: int, *, strict: bool = False, end_buffer_seconds: int = 120
) -> tuple[datetime, datetime]:
    # Use test_started_at (actual subprocess start) if available, else fallback to created_at
    start = run.test_started_at if run.test_started_at else run.created_at
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)

    if run.finished_at:
        end = run.finished_at
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
    else:
        end = start + timedelta(seconds=run.duration_seconds or 60)

    # Buffer at START: accounts for k6/jmeter startup time (1-3 seconds)
    # and initial log sync lag in OpenObserve (can be 10-30 seconds)
    # Default start buffer: 30 seconds
    default_start_buffer = 30
    start_buf = timedelta(seconds=buffer_seconds if buffer_seconds > 0 else default_start_buffer)

    # Buffer at END: accounts for logs and CPU metrics that are recorded AFTER
    # the load test ends (log sync lag can be significant - up to 2 minutes)
    # Default end buffer: 120 seconds (2 minutes)
    # If test ended at 10:20, we fetch logs until 10:22
    end_buf = timedelta(seconds=end_buffer_seconds)

    return start - start_buf, end + end_buf


def _auth_from_headers(
    x_openobserve_jwt: Optional[str] = Header(None),
    x_openobserve_sctoken: Optional[str] = Header(None),
    x_openobserve_cookie: Optional[str] = Header(None),
) -> dict[str, str]:
    out: dict[str, str] = {}
    if x_openobserve_jwt:
        out["jwt"] = x_openobserve_jwt.strip()
    if x_openobserve_sctoken:
        out["sctoken"] = x_openobserve_sctoken.strip()
    if x_openobserve_cookie:
        out["cookie"] = x_openobserve_cookie.strip()
    return out


def _list_runs(lob_id: Optional[int], db: Session):
    query = db.query(models.TestRun).filter(
        models.TestRun.status.in_(["done", "failed"])
    )
    if lob_id:
        query = query.filter(models.TestRun.lob_id == lob_id)
    # Only show last 5 runs
    runs = query.order_by(models.TestRun.created_at.desc()).limit(5).all()
    result = []
    for run in runs:
        lob = db.query(models.LOB).filter(models.LOB.id == run.lob_id).first()
        result.append({
            "id": run.id,
            "lob_id": run.lob_id,
            "lob_name": lob.name if lob else "Unknown",
            "lob_env": lob.environment if lob else "",
            "tool": run.tool,
            "virtual_users": run.virtual_users,
            "duration_seconds": run.duration_seconds,
            "status": run.status,
            "created_at": run.created_at.isoformat(),
            "test_started_at": run.test_started_at.isoformat() if run.test_started_at else None,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        })
    return result


class TestSearchRequest(BaseModel):
    """Probe Pulse API with browser cookies — no .env required."""
    jwt: Optional[str] = None
    sctoken: Optional[str] = None
    cookie: Optional[str] = None
    org: str = "demo"
    lob: str = "demounnati"
    run_id: Optional[int] = None
    start_time_us: Optional[int] = None
    end_time_us: Optional[int] = None
    errors_only: bool = False


@router.get("/config")
def performance_config():
    status = get_config_status()
    status["error_sql_example"] = build_error_sql("your_lob_name")
    status["all_logs_sql_example"] = build_lob_sql("demounnati")
    status["api_error_sql_example"] = build_api_error_sql("demounnati")
    return status


def _run_context(run_id: int, db: Session, *, strict: bool = False):
    run = db.query(models.TestRun).filter(models.TestRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    lob = db.query(models.LOB).filter(models.LOB.id == run.lob_id).first()
    if not lob:
        raise HTTPException(status_code=404, detail="LOB not found")
    env = load_env()
    start_buffer = 0 if strict else int(env.get("OPENOBSERVE_TIME_BUFFER_SECONDS", "30"))
    # 2-minute end buffer to capture logs/CPU metrics after load test ends
    end_buffer = 0 if strict else int(env.get("OPENOBSERVE_END_BUFFER_SECONDS", "120"))
    start_dt, end_dt = _run_time_window(run, start_buffer, strict=strict, end_buffer_seconds=end_buffer)
    return run, lob, start_buffer, end_buffer, start_dt, end_dt, strict


def _k6_metrics(run: models.TestRun) -> dict:
    if not run.report_json:
        return {}
    try:
        data = json.loads(run.report_json)
        metrics = data.get("metrics", {})
        # Include by_endpoint for comparison with Pulse
        metrics["by_endpoint"] = data.get("by_endpoint", {})
        return metrics
    except json.JSONDecodeError:
        return {}


@router.get("/runs")
def list_performance_runs(lob_id: Optional[int] = None, db: Session = Depends(get_db)):
    return _list_runs(lob_id, db)


@router.post("/test-search")
def test_openobserve_search(body: TestSearchRequest, db: Session = Depends(get_db)):
    """
    Verify OpenObserve _search_stream (same as your Pulse curl).
    Paste jwt + sctoken from DevTools; errors_only=false matches select * … WHERE lob=….
    """
    auth = {
        k: v
        for k, v in {
            "jwt": body.jwt,
            "sctoken": body.sctoken,
            "cookie": body.cookie,
        }.items()
        if v
    }
    if not has_auth(auth):
        raise HTTPException(
            status_code=400,
            detail="Provide jwt, sctoken, or cookie in request body",
        )

    lob_name = body.lob
    lob_env = "demo"
    start_us = body.start_time_us
    end_us = body.end_time_us
    env = load_env()
    start_buffer = int(env.get("OPENOBSERVE_TIME_BUFFER_SECONDS", "30"))
    end_buffer = int(env.get("OPENOBSERVE_END_BUFFER_SECONDS", "120"))

    if body.run_id:
        run = db.query(models.TestRun).filter(models.TestRun.id == body.run_id).first()
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        lob = db.query(models.LOB).filter(models.LOB.id == run.lob_id).first()
        if not lob:
            raise HTTPException(status_code=404, detail="LOB not found")
        lob_name = lob.name
        lob_env = lob.environment or "demo"
        start_dt, end_dt = _run_time_window(run, start_buffer, strict=False, end_buffer_seconds=end_buffer)
        start_us = dt_to_microseconds(start_dt)
        end_us = dt_to_microseconds(end_dt)

    if start_us is None or end_us is None:
        raise HTTPException(
            status_code=400,
            detail="Provide run_id or both start_time_us and end_time_us",
        )

    try:
        data = search_logs(
            lob_name=lob_name,
            start_time_us=start_us,
            end_time_us=end_us,
            lob_environment=lob_env,
            errors_only=body.errors_only,
            auth_override=auth,
            org_override=body.org,
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"OpenObserve {e.response.status_code}: {e.response.text[:400]}",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {
        "ok": True,
        "message": "OpenObserve API responded successfully",
        "lob": lob_name,
        **data,
    }


@router.get("/runs/{run_id}/errors")
def get_run_error_logs(
    run_id: int,
    db: Session = Depends(get_db),
    x_openobserve_jwt: Optional[str] = Header(None),
    x_openobserve_sctoken: Optional[str] = Header(None),
    x_openobserve_cookie: Optional[str] = Header(None),
    log_mode: str = "api_errors",
):
    """log_mode: api_errors (HTTP 4xx/5xx) | generic (severity/body filter) | all (raw lob filter)"""
    auth = _auth_from_headers(x_openobserve_jwt, x_openobserve_sctoken, x_openobserve_cookie)
    run, lob, start_buffer, end_buffer, start_dt, end_dt, strict = _run_context(run_id, db, strict=True)

    if not has_auth(auth):
        raise HTTPException(status_code=503, detail="OpenObserve not configured.")

    mode = log_mode if log_mode in ("api_errors", "generic", "all") else "api_errors"
    start_us = dt_to_microseconds(start_dt)
    end_us = dt_to_microseconds(end_dt)
    env = lob.environment or "demo"
    try:
        data = search_logs(
            lob_name=lob.name,
            start_time_us=start_us,
            end_time_us=end_us,
            lob_environment=env,
            errors_only=(mode == "generic"),
            log_mode=mode,
            auth_override=auth,
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"OpenObserve failed: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    try:
        timeline = search_http_timeline(lob.name, start_us, end_us, env, auth_override=auth)
        data["timeline"] = timeline.get("timeline", {})
    except Exception:
        data["timeline"] = {"points": [], "peak": None}

    try:
        cpu_tl = search_cpu_timeline(start_us, end_us, env, auth_override=auth)
        data["cpu"] = {"timeline": cpu_tl.get("timeline", {"points": [], "peak": None})}
    except Exception:
        data["cpu"] = {"timeline": {"points": [], "peak": None}}

    return _run_payload(run, lob, start_buffer, end_buffer, start_dt, end_dt, data, strict=strict)


@router.get("/runs/{run_id}/stats")
def get_run_performance_stats(
    run_id: int,
    db: Session = Depends(get_db),
    x_openobserve_jwt: Optional[str] = Header(None),
    x_openobserve_sctoken: Optional[str] = Header(None),
    x_openobserve_cookie: Optional[str] = Header(None),
):
    auth = _auth_from_headers(x_openobserve_jwt, x_openobserve_sctoken, x_openobserve_cookie)
    # Use 30 second start buffer and 2-minute end buffer to capture logs after test ends
    run, lob, start_buffer, end_buffer, start_dt, end_dt, strict = _run_context(run_id, db, strict=False)

    if not has_auth(auth):
        raise HTTPException(status_code=503, detail="OpenObserve not configured.")

    start_us = dt_to_microseconds(start_dt)
    end_us = dt_to_microseconds(end_dt)
    env = lob.environment or "demo"
    k6 = _k6_metrics(run)

    try:
        perf = build_performance_snapshot(
            lob.name, start_us, end_us, env, auth_override=auth, k6_metrics=k6
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"OpenObserve failed: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {**_run_payload(run, lob, start_buffer, end_buffer, start_dt, end_dt, {}, strict=strict), **perf}


def _run_payload(run, lob, start_buffer, end_buffer, start_dt, end_dt, data: dict, *, strict: bool = False) -> dict:
    # Calculate microsecond timestamps for debugging
    start_us = dt_to_microseconds(start_dt)
    end_us = dt_to_microseconds(end_dt)

    return {
        "run": {
            "id": run.id,
            "lob_name": lob.name,
            "lob_env": lob.environment,
            "created_at": _iso_utc(run.created_at),
            "test_started_at": _iso_utc(run.test_started_at) if run.test_started_at else None,
            "finished_at": _iso_utc(run.finished_at) if run.finished_at else None,
            "virtual_users": run.virtual_users,
            "duration_seconds": run.duration_seconds,
        },
        "window": {
            "start": _iso_utc(start_dt),
            "end": _iso_utc(end_dt),
            "start_buffer_seconds": start_buffer,
            "end_buffer_seconds": end_buffer,
            "note": f"Logs fetched from -{start_buffer}s before start to +{end_buffer}s after end (2-min buffer captures delayed logs/CPU)",
        },
        **data,
    }


@router.get("/runs/{run_id}/dashboard")
def get_run_dashboard(
    run_id: int,
    db: Session = Depends(get_db),
    x_openobserve_jwt: Optional[str] = Header(None),
    x_openobserve_sctoken: Optional[str] = Header(None),
    x_openobserve_cookie: Optional[str] = Header(None),
):
    """
    Fetch all dashboard panel data for a run:
    - LOB DB Connection Count
    - System DB Connection
    - Active HTTP Requests
    - CPU Utilization
    - Memory Utilization
    - Percentiles (p50, p90, p95, p99)
    - Percentiles Count
    """
    auth = _auth_from_headers(x_openobserve_jwt, x_openobserve_sctoken, x_openobserve_cookie)
    run, lob, start_buffer, end_buffer, start_dt, end_dt, strict = _run_context(run_id, db, strict=False)

    if not has_auth(auth):
        raise HTTPException(status_code=503, detail="OpenObserve not configured.")

    start_us = dt_to_microseconds(start_dt)
    end_us = dt_to_microseconds(end_dt)
    env = lob.environment or "demo"

    try:
        dashboard = build_dashboard_snapshot(
            lob.name, start_us, end_us, env, auth_override=auth
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"OpenObserve failed: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {**_run_payload(run, lob, start_buffer, end_buffer, start_dt, end_dt, {}, strict=strict), **dashboard}


class DashboardSearchRequest(BaseModel):
    """Request body for direct dashboard panel queries."""
    jwt: Optional[str] = None
    sctoken: Optional[str] = None
    cookie: Optional[str] = None
    org: str = "demo"
    start_time_us: int
    end_time_us: int


@router.post("/dashboard")
def search_dashboard_panels(body: DashboardSearchRequest):
    """
    Direct dashboard panel query without a run context.
    Useful for custom time ranges.
    """
    auth = {
        k: v
        for k, v in {
            "jwt": body.jwt,
            "sctoken": body.sctoken,
            "cookie": body.cookie,
        }.items()
        if v
    }
    if not has_auth(auth):
        raise HTTPException(
            status_code=400,
            detail="Provide jwt, sctoken, or cookie in request body",
        )

    try:
        dashboard = build_dashboard_snapshot(
            lob_name="",  # Not needed for these queries
            start_time_us=body.start_time_us,
            end_time_us=body.end_time_us,
            lob_environment=body.org,
            auth_override=auth,
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"OpenObserve {e.response.status_code}: {e.response.text[:400]}",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {
        "ok": True,
        "start_time_us": body.start_time_us,
        "end_time_us": body.end_time_us,
        **dashboard,
    }
