"""OpenObserve (Pulse) log search client — SSE _search_stream API."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import httpx

from utils.env_loader import load_env
from utils.openobserve_defaults import (
    HARDCODED_BASE_URL,
    HARDCODED_COOKIE,
    HARDCODED_MAX_HITS,
    HARDCODED_ORG,
    HARDCODED_STREAM,
)

DEFAULT_BASE_URL = HARDCODED_BASE_URL

# OpenTelemetry severity: WARN=13, ERROR=17, FATAL=21
_ERROR_SEVERITIES = ("ERROR", "WARN", "FATAL", "CRITICAL", "13", "17", "21")


def _cfg() -> dict[str, str]:
    return load_env()


def use_hardcoded() -> bool:
    e = _cfg()
    if e.get("OPENOBSERVE_USE_HARDCODED", "true").lower() in ("0", "false", "no"):
        return False
    return bool(HARDCODED_COOKIE)


def is_configured() -> bool:
    if use_hardcoded():
        return True
    e = _cfg()
    return bool(
        e.get("OPENOBSERVE_BASE_URL")
        and (
            e.get("OPENOBSERVE_JWT")
            or e.get("OPENOBSERVE_SCTOKEN")
            or e.get("OPENOBSERVE_COOKIE")
        )
    )


def get_config_status() -> dict[str, Any]:
    e = _cfg()
    hardcoded = use_hardcoded()
    return {
        "configured": is_configured(),
        "auth_mode": "hardcoded_curl" if hardcoded else ("env" if is_configured() else "none"),
        "allow_browser_auth": True,
        "default_base_url": e.get("OPENOBSERVE_BASE_URL") or DEFAULT_BASE_URL,
        "base_url": (e.get("OPENOBSERVE_BASE_URL") or DEFAULT_BASE_URL) if hardcoded else e.get("OPENOBSERVE_BASE_URL", ""),
        "org_default": e.get("OPENOBSERVE_ORG") or HARDCODED_ORG,
        "stream": e.get("OPENOBSERVE_STREAM") or HARDCODED_STREAM,
        "max_hits": int(e.get("OPENOBSERVE_MAX_HITS") or HARDCODED_MAX_HITS),
        "buffer_seconds": int(e.get("OPENOBSERVE_TIME_BUFFER_SECONDS", "30")),
    }


def has_auth(auth_override: dict[str, str] | None = None) -> bool:
    if use_hardcoded():
        return True
    if is_configured():
        return True
    o = auth_override or {}
    return bool(o.get("jwt") or o.get("sctoken") or o.get("cookie"))


def org_for_environment(lob_environment: str) -> str:
    """Map LOB environment (demo/uat/prod) to OpenObserve org identifier."""
    e = _cfg()
    default = e.get("OPENOBSERVE_ORG") or HARDCODED_ORG
    raw = e.get("OPENOBSERVE_ORG_MAP", "")
    if raw:
        for part in raw.split(","):
            part = part.strip()
            if ":" in part:
                key, val = part.split(":", 1)
                if key.strip().lower() == (lob_environment or "").lower():
                    return val.strip()
    return default


def _stream() -> str:
    return _cfg().get("OPENOBSERVE_STREAM") or HARDCODED_STREAM


def build_lob_sql(lob_name: str, stream: str | None = None) -> str:
    """Same as provided Pulse curl."""
    stream = stream or _stream()
    lob_esc = lob_name.replace("'", "''")
    return f'select * from "{stream}" WHERE lob = \'{lob_esc}\''


def build_api_error_sql(lob_name: str) -> str:
    """HTTP failures during load test (api_request events)."""
    stream = _stream()
    lob_esc = lob_name.replace("'", "''")
    return (
        f'select * from "{stream}" WHERE lob = \'{lob_esc}\' '
        f"AND event_type = 'api_request' AND http_status_code >= 400"
    )


def build_http_aggregation_sql(lob_name: str) -> str:
    """Pulse dashboard: Http Call Aggregation."""
    lob_esc = lob_name.replace("'", "''")
    return f"""SELECT
    lob,
    http_url_path,
    http_status_code,
    avg(http_duration) AS average,
    max(http_duration) AS max_duration,
    CASE WHEN http_status_code < 400 THEN 'SUCCESS' ELSE 'FAILURE' END AS status,
    COUNT(*) AS hits
FROM channelkart
WHERE event_type = 'api_request' AND lob = '{lob_esc}'
GROUP BY lob, http_url_path, http_status_code, status
ORDER BY hits DESC"""


def build_http_timeline_sql(lob_name: str, bucket_interval: str = "30 second") -> str:
    """Per-bucket avg/max latency during the run (api_request only)."""
    lob_esc = lob_name.replace("'", "''")
    return f"""SELECT
  histogram(_timestamp, '{bucket_interval}') AS bucket,
  avg(http_duration) AS avg_ms,
  max(http_duration) AS max_ms,
  count(*) AS hits
FROM channelkart
WHERE event_type = 'api_request' AND lob = '{lob_esc}'
GROUP BY bucket
ORDER BY bucket ASC"""


def build_cpu_sql(instance_prefix: str = "10.10.%") -> str:
    """Pulse dashboard: CPU Utilization (JVM). Uses 10.10.% for demo env hosts."""
    prefix_esc = instance_prefix.replace("'", "''")
    where = f"WHERE instance_id LIKE '{prefix_esc}'" if prefix_esc != "%" else ""
    return f"""SELECT
  concat(service_name, ':', SUBSTRING_INDEX(instance_id, ':', 1)) AS x_axis_1,
  MAX(value) * 100 AS y_axis_1
FROM jvm_cpu_recent_utilization
{where}
GROUP BY x_axis_1
ORDER BY y_axis_1 DESC"""


def build_cpu_timeline_sql(
    bucket_interval: str = "30 second", instance_prefix: str = "10.10.%"
) -> str:
    """CPU % over time during the run (all JVM services in scope)."""
    prefix_esc = instance_prefix.replace("'", "''")
    where = f"WHERE instance_id LIKE '{prefix_esc}'" if prefix_esc != "%" else ""
    return f"""SELECT
  histogram(_timestamp, '{bucket_interval}') AS bucket,
  MAX(value) * 100 AS max_cpu_percent,
  avg(value) * 100 AS avg_cpu_percent
FROM jvm_cpu_recent_utilization
{where}
GROUP BY bucket
ORDER BY bucket ASC"""


def build_http_errors_timeline_sql(lob_name: str, bucket_interval: str = "30 second") -> str:
    lob_esc = lob_name.replace("'", "''")
    return f"""SELECT
  histogram(_timestamp, '{bucket_interval}') AS bucket,
  count(*) AS error_count
FROM channelkart
WHERE event_type = 'api_request' AND lob = '{lob_esc}' AND http_status_code >= 400
GROUP BY bucket
ORDER BY bucket ASC"""


def build_error_sql(lob_name: str, stream: str | None = None) -> str:
    stream = stream or _stream()
    lob_esc = lob_name.replace("'", "''")
    sev_list = ", ".join(f"'{s}'" for s in _ERROR_SEVERITIES)
    extra = _cfg().get("OPENOBSERVE_ERROR_SQL_EXTRA", "").strip()
    extra_clause = f" AND ({extra})" if extra else ""
    return (
        f'SELECT * FROM "{stream}" WHERE lob = \'{lob_esc}\' AND ('
        f"severity IN ({sev_list}) "
        f"OR (event_status IS NOT NULL AND lower(event_status) NOT IN ('success', '')) "
        f"OR lower(coalesce(body, '')) LIKE '%exception%' "
        f"OR lower(coalesce(body, '')) LIKE '%error%' "
        f"OR lower(coalesce(event_message, '')) LIKE '%fail%'"
        f"){extra_clause}"
    )


def dt_to_microseconds(dt: datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1_000_000)


def _auth_headers(auth_override: dict[str, str] | None = None) -> dict[str, str]:
    e = _cfg()
    o = auth_override or {}
    headers = {
        "accept": "*/*",
        "content-type": "application/json",
    }
    cookie = o.get("cookie") or e.get("OPENOBSERVE_COOKIE")
    jwt = o.get("jwt") or e.get("OPENOBSERVE_JWT")
    sctoken = o.get("sctoken") or e.get("OPENOBSERVE_SCTOKEN")

    if cookie:
        headers["Cookie"] = cookie
    elif jwt:
        headers["Cookie"] = f"jwt={jwt}"
        if sctoken:
            headers["Cookie"] += f"; sctoken={sctoken}"
    elif sctoken:
        headers["Cookie"] = f"sctoken={sctoken}"
    elif use_hardcoded():
        headers["Cookie"] = HARDCODED_COOKIE

    headers["origin"] = DEFAULT_BASE_URL
    return headers


def _parse_sse(text: str) -> tuple[list[dict], int, dict]:
    hits: list[dict] = []
    total = 0
    metadata: dict = {}
    current_event: str | None = None

    for line in text.split("\n"):
        line = line.strip("\r")
        if line.startswith("event:"):
            current_event = line[6:].strip()
        elif line.startswith("data:"):
            data = line[5:].strip()
            if data == "[[DONE]]":
                continue
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                continue
            if current_event == "search_response_metadata":
                metadata = payload
                total = payload.get("results", {}).get("total", 0)
            elif current_event == "search_response_hits":
                hits.extend(payload.get("hits", []))

    return hits, total, metadata


_OTEL_SEVERITY = {
    "1": "TRACE",
    "5": "DEBUG",
    "9": "INFO",
    "13": "WARN",
    "17": "ERROR",
    "21": "FATAL",
}

_MESSAGE_KEYS = (
    "body",
    "message",
    "event_message",
    "log",
    "_msg",
    "log_message",
    "exception.message",
    "error",
    "title",
    "description",
)

_SKIP_FALLBACK_KEYS = frozenset({
    "_timestamp",
    "timestamp",
    "severity",
    "service_name",
    "lob",
    "instance_id",
    "instrumentation_library_name",
    "telemetry_sdk_language",
    "telemetry_sdk_name",
    "telemetry_sdk_version",
    "observability_sdk",
    "observability_sdk_version",
    "observability_auto_configured",
    "deployment_environment",
    "dropped_attributes_count",
    "id",
})


def _first(raw: dict, *keys: str) -> Any:
    for key in keys:
        val = raw.get(key)
        if val is not None and val != "":
            return val
    return None


def _format_severity(raw: dict) -> str:
    sev = raw.get("severity")
    if sev is None:
        return ""
    s = str(sev).upper()
    return _OTEL_SEVERITY.get(s, s if s.isalpha() else str(sev))


def _build_message(raw: dict) -> str:
    for key in _MESSAGE_KEYS:
        val = raw.get(key)
        if val:
            return str(val)

    method = _first(raw, "http_method", "method")
    route = _first(raw, "http_route", "http_target", "url", "uri", "path", "endpoint")
    status = _first(raw, "http_status_code", "status_code", "status")
    duration = _first(
        raw, "event_duration", "duration", "latency", "response_time", "http_duration_ms"
    )

    if method or route:
        line = f"{method or ''} {route or ''}".strip()
        if status is not None:
            line += f" → {status}"
        if duration is not None:
            suffix = "ms" if isinstance(duration, (int, float)) else ""
            line += f" ({duration}{suffix})"
        return line

    span = _first(raw, "span_name", "name", "operation", "event_type")
    if span:
        return str(span)

    for key, val in sorted(raw.items()):
        if key in _SKIP_FALLBACK_KEYS or key.startswith("_"):
            continue
        if isinstance(val, (str, int, float, bool)) and str(val).strip():
            return f"{key}={val}"

    return ""


def _full_log_text(raw: dict) -> str:
    """All readable fields for debugging — nothing truncated."""
    lines: list[str] = []
    seen: set[str] = set()

    def add(label: str, val: Any) -> None:
        if val is None or val == "" or label in seen:
            return
        seen.add(label)
        lines.append(f"{label}: {val}")

    for key in _MESSAGE_KEYS:
        add(key, raw.get(key))
    add("event_message", raw.get("event_message"))
    add("event_topic", raw.get("event_topic"))
    add("event_type", raw.get("event_type"))
    add("event_status", raw.get("event_status"))
    add("http_method", raw.get("http_method"))
    add("http_url_path", raw.get("http_url_path"))
    add("http_status_code", raw.get("http_status_code"))
    add("http_duration", raw.get("http_duration"))
    add("service_name", raw.get("service_name"))
    add("instance_id", raw.get("instance_id"))
    add("lob", raw.get("lob"))
    add("user_name", raw.get("user_name"))
    add("instrumentation", raw.get("instrumentation_library_name"))

    for key, val in sorted(raw.items()):
        if key.startswith("_") or key in seen or key in _SKIP_FALLBACK_KEYS:
            continue
        if isinstance(val, (str, int, float, bool)):
            add(key, val)

    if lines:
        return "\n".join(lines)
    return json.dumps(raw, indent=2, default=str)


def _bucket_to_iso(bucket: Any) -> str | None:
    if bucket is None:
        return None
    try:
        ts = int(bucket)
        return datetime.fromtimestamp(ts / 1_000_000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError):
        return str(bucket)


def normalize_hit(raw: dict) -> dict[str, Any]:
    ts = raw.get("_timestamp")
    ts_iso = None
    if ts is not None:
        try:
            ts_iso = datetime.fromtimestamp(int(ts) / 1_000_000, tz=timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )
        except (TypeError, ValueError, OSError):
            ts_iso = str(ts)

    duration = _first(
        raw, "event_duration", "duration", "latency", "response_time", "http_duration_ms"
    )
    status = _first(raw, "event_status", "http_status_code", "status_code")
    method = _first(raw, "http_method", "method")
    route = _first(raw, "http_route", "http_target", "url", "uri", "path", "endpoint")

    return {
        "timestamp_us": ts,
        "timestamp": ts_iso,
        "severity": _format_severity(raw),
        "message": _build_message(raw),
        "service": raw.get("service_name", ""),
        "lob": raw.get("lob", ""),
        "http_method": str(method) if method is not None else "",
        "http_route": str(route) if route is not None else "",
        "http_status": str(status) if status is not None else "",
        "event_status": str(raw.get("event_status", "") or ""),
        "event_duration_ms": duration,
        "event_topic": raw.get("event_topic", ""),
        "event_type": raw.get("event_type", ""),
        "instance_id": raw.get("instance_id", ""),
        "instrumentation": raw.get("instrumentation_library_name", ""),
        "full_message": _full_log_text(raw),
    }


def _auth_mode_label(auth_override: dict[str, str] | None) -> str:
    if use_hardcoded() and not (auth_override or {}).get("jwt"):
        return "hardcoded_curl"
    if _cfg().get("OPENOBSERVE_JWT") or _cfg().get("OPENOBSERVE_COOKIE"):
        return "env"
    return "browser"


def search_stream_raw(
    sql: str,
    start_time_us: int,
    end_time_us: int,
    lob_environment: str = "demo",
    *,
    stream_type: str = "logs",
    search_type: str = "ui",
    auth_override: dict[str, str] | None = None,
    org_override: str | None = None,
    size: int | None = None,
) -> dict[str, Any]:
    if not has_auth(auth_override):
        raise ValueError("OpenObserve auth missing.")

    e = _cfg()
    base = (e.get("OPENOBSERVE_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    org = org_override or org_for_environment(lob_environment)
    if size is None:
        size = int(e.get("OPENOBSERVE_MAX_HITS") or HARDCODED_MAX_HITS)
        if search_type == "dashboards":
            size = -1

    url = f"{base}/api/{org}/_search_stream"
    params = {"type": stream_type, "search_type": search_type, "use_cache": "true"}
    body = {
        "query": {
            "sql": sql,
            "start_time": start_time_us,
            "end_time": end_time_us,
            "from": 0,
            "size": size,
            "quick_mode": False,
            "query_fn": None,
        }
    }

    timeout = float(e.get("OPENOBSERVE_TIMEOUT_SECONDS", "120"))
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(
            url, params=params, json=body, headers=_auth_headers(auth_override)
        )
        resp.raise_for_status()
        text = resp.text

    raw_hits, total, metadata = _parse_sse(text)
    if not total and raw_hits:
        total = len(raw_hits)

    return {
        "sql": sql,
        "org": org,
        "stream_type": stream_type,
        "start_time_us": start_time_us,
        "end_time_us": end_time_us,
        "total": total,
        "returned": len(raw_hits),
        "hits": raw_hits,
        "metadata": metadata,
        "auth_mode": _auth_mode_label(auth_override),
    }


def _summarize_http(hits: list[dict], lob_name: str) -> dict[str, Any]:
    rows = [h for h in hits if h.get("lob") == lob_name or not h.get("lob")]
    if not rows and hits:
        rows = hits

    total_hits = sum(int(h.get("hits") or 0) for h in rows)
    failures = [h for h in rows if h.get("status") == "FAILURE" or int(h.get("http_status_code") or 0) >= 400]
    successes = [h for h in rows if h not in failures]

    avg_vals = [float(h["average"]) for h in rows if h.get("average") is not None]
    max_vals = [float(h.get("max_duration") or h.get("average") or 0) for h in rows]

    return {
        "paths": [
            {
                "path": h.get("http_url_path", ""),
                "status_code": h.get("http_status_code"),
                "status": h.get("status"),
                "average_ms": round(float(h.get("average") or 0), 2),
                "max_ms": round(float(h.get("max_duration") or h.get("average") or 0), 2),
                "hits": int(h.get("hits") or 0),
            }
            for h in rows
        ],
        "summary": {
            "total_requests": total_hits,
            "failed_paths": len(failures),
            "success_paths": len(successes),
            "avg_response_ms": round(sum(avg_vals) / len(avg_vals), 2) if avg_vals else 0,
            "max_response_ms": round(max(max_vals), 2) if max_vals else 0,
        },
    }


def _parse_timeline(hits: list[dict]) -> dict[str, Any]:
    points = []
    for h in hits:
        points.append({
            "time": _bucket_to_iso(h.get("bucket")),
            "avg_ms": round(float(h.get("avg_ms") or 0), 2),
            "max_ms": round(float(h.get("max_ms") or 0), 2),
            "hits": int(h.get("hits") or 0),
        })
    peak = None
    if points:
        peak = max(points, key=lambda p: p["max_ms"])
    return {"points": points, "peak": peak}


def _parse_cpu_timeline(hits: list[dict]) -> dict[str, Any]:
    points = []
    for h in hits:
        points.append({
            "time": _bucket_to_iso(h.get("bucket")),
            "avg_cpu": round(float(h.get("avg_cpu_percent") or 0), 2),
            "max_cpu": round(float(h.get("max_cpu_percent") or 0), 2),
        })
    peak = None
    if points:
        peak = max(points, key=lambda p: p["max_cpu"])
    return {"points": points, "peak": peak}


def _parse_error_timeline(hits: list[dict]) -> dict[str, Any]:
    points = []
    for h in hits:
        points.append({
            "time": _bucket_to_iso(h.get("bucket")),
            "error_count": int(h.get("error_count") or 0),
        })
    total_errors = sum(p["error_count"] for p in points)
    peak = max(points, key=lambda p: p["error_count"]) if points else None
    return {"points": points, "total_errors": total_errors, "peak": peak}


def _cpu_instance_prefix() -> str:
    return _cfg().get("OPENOBSERVE_CPU_INSTANCE_PREFIX", "10.10.%")


def search_http_timeline(
    lob_name: str,
    start_time_us: int,
    end_time_us: int,
    lob_environment: str = "demo",
    auth_override: dict[str, str] | None = None,
    bucket_interval: str = "30 second",
) -> dict[str, Any]:
    sql = build_http_timeline_sql(lob_name, bucket_interval)
    raw = search_stream_raw(
        sql, start_time_us, end_time_us, lob_environment,
        stream_type="logs", search_type="dashboards", auth_override=auth_override,
    )
    timeline = _parse_timeline(raw["hits"])
    return {**raw, "timeline": timeline}


def search_http_stats(
    lob_name: str,
    start_time_us: int,
    end_time_us: int,
    lob_environment: str = "demo",
    auth_override: dict[str, str] | None = None,
) -> dict[str, Any]:
    sql = build_http_aggregation_sql(lob_name)
    raw = search_stream_raw(
        sql, start_time_us, end_time_us, lob_environment,
        stream_type="logs", search_type="dashboards", auth_override=auth_override,
    )
    stats = _summarize_http(raw["hits"], lob_name)
    return {**raw, **stats}


def search_cpu_timeline(
    start_time_us: int,
    end_time_us: int,
    lob_environment: str = "demo",
    auth_override: dict[str, str] | None = None,
    instance_prefix: str | None = None,
    bucket_interval: str = "30 second",
) -> dict[str, Any]:
    prefix = instance_prefix if instance_prefix is not None else _cpu_instance_prefix()
    prefixes_to_try = [prefix] if prefix != "%" else ["%"]
    if prefix != "%":
        prefixes_to_try.append("%")

    raw: dict = {"hits": []}
    sql = build_cpu_timeline_sql(bucket_interval, prefix)
    for pfx in prefixes_to_try:
        sql = build_cpu_timeline_sql(bucket_interval, pfx)
        raw = search_stream_raw(
            sql, start_time_us, end_time_us, lob_environment,
            stream_type="metrics", search_type="dashboards", auth_override=auth_override,
        )
        if raw["hits"]:
            break

    timeline = _parse_cpu_timeline(raw["hits"])
    return {**raw, "timeline": timeline, "instance_prefix": prefix}


def search_http_errors_timeline(
    lob_name: str,
    start_time_us: int,
    end_time_us: int,
    lob_environment: str = "demo",
    auth_override: dict[str, str] | None = None,
    bucket_interval: str = "30 second",
) -> dict[str, Any]:
    sql = build_http_errors_timeline_sql(lob_name, bucket_interval)
    raw = search_stream_raw(
        sql, start_time_us, end_time_us, lob_environment,
        stream_type="logs", search_type="dashboards", auth_override=auth_override,
    )
    return {**raw, "timeline": _parse_error_timeline(raw["hits"])}


def search_cpu_stats(
    start_time_us: int,
    end_time_us: int,
    lob_environment: str = "demo",
    auth_override: dict[str, str] | None = None,
    instance_prefix: str | None = None,
) -> dict[str, Any]:
    prefix = instance_prefix if instance_prefix is not None else _cpu_instance_prefix()
    prefixes_to_try = [prefix] if prefix != "%" else ["%"]
    if prefix != "%":
        prefixes_to_try.append("%")

    raw: dict = {"hits": []}
    for pfx in prefixes_to_try:
        sql = build_cpu_sql(pfx)
        raw = search_stream_raw(
            sql, start_time_us, end_time_us, lob_environment,
            stream_type="metrics", search_type="dashboards", auth_override=auth_override,
        )
        if raw["hits"]:
            break

    services = [
        {"service_host": h.get("x_axis_1", ""), "cpu_percent": round(float(h.get("y_axis_1") or 0), 2)}
        for h in raw["hits"]
    ]
    cpu_vals = [s["cpu_percent"] for s in services]
    return {
        **raw,
        "services": services,
        "summary": {
            "max_cpu_percent": max(cpu_vals) if cpu_vals else 0,
            "avg_cpu_percent": round(sum(cpu_vals) / len(cpu_vals), 2) if cpu_vals else 0,
            "service_count": len(services),
        },
    }


def build_mismatch_diagnostic_sql() -> dict[str, str]:
    """SQL queries to diagnose why k6 requests don't appear in Pulse."""
    stream = _stream()
    return {
        # Count all api_request logs (no LOB filter) - are there more with different LOB?
        "all_api_requests": f"""SELECT COUNT(*) as total FROM "{stream}" WHERE event_type = 'api_request'""",

        # Group by LOB to see which LOBs have logs
        "by_lob": f"""SELECT lob, COUNT(*) as count FROM "{stream}" WHERE event_type = 'api_request' GROUP BY lob ORDER BY count DESC""",

        # Group by user_agent to see k6 vs other traffic
        "by_user_agent": f"""SELECT http_user_agent, COUNT(*) as count FROM "{stream}" WHERE event_type = 'api_request' GROUP BY http_user_agent ORDER BY count DESC LIMIT 10""",

        # Group by endpoint to see which endpoints are logged
        "by_endpoint": f"""SELECT http_url_path, COUNT(*) as count FROM "{stream}" WHERE event_type = 'api_request' GROUP BY http_url_path ORDER BY count DESC LIMIT 20""",

        # Count all logs (any event_type) to see total activity
        "all_logs": f"""SELECT event_type, COUNT(*) as count FROM "{stream}" GROUP BY event_type ORDER BY count DESC LIMIT 10""",

        # Get first and last timestamp of api_request logs in window (for timing debug)
        "time_range": f"""SELECT MIN(_timestamp) as first_log_us, MAX(_timestamp) as last_log_us FROM "{stream}" WHERE event_type = 'api_request'""",
    }


def run_mismatch_diagnostic(
    lob_name: str,
    start_time_us: int,
    end_time_us: int,
    lob_environment: str = "demo",
    auth_override: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Run diagnostic queries to find why k6 requests are missing from Pulse."""
    results = {}
    sqls = build_mismatch_diagnostic_sql()

    for name, sql in sqls.items():
        try:
            raw = search_stream_raw(
                sql, start_time_us, end_time_us, lob_environment,
                stream_type="logs", search_type="dashboards", auth_override=auth_override,
            )
            results[name] = raw.get("hits", [])
        except Exception as e:
            results[name] = {"error": str(e)}

    # Build summary
    summary = {
        "total_api_requests_all_lobs": 0,
        "requests_by_lob": {},
        "requests_by_user_agent": {},
        "requests_by_endpoint": {},
        "event_types": {},
        "time_range": {},
    }

    # Parse results
    if isinstance(results.get("all_api_requests"), list) and results["all_api_requests"]:
        summary["total_api_requests_all_lobs"] = results["all_api_requests"][0].get("total", 0)

    if isinstance(results.get("by_lob"), list):
        for row in results["by_lob"]:
            lob = row.get("lob", "unknown")
            summary["requests_by_lob"][lob] = row.get("count", 0)

    if isinstance(results.get("by_user_agent"), list):
        for row in results["by_user_agent"]:
            ua = row.get("http_user_agent", "unknown")
            # Shorten user agent for display
            if len(ua) > 50:
                ua = ua[:47] + "..."
            summary["requests_by_user_agent"][ua] = row.get("count", 0)

    if isinstance(results.get("by_endpoint"), list):
        for row in results["by_endpoint"]:
            ep = row.get("http_url_path", "unknown")
            summary["requests_by_endpoint"][ep] = row.get("count", 0)

    if isinstance(results.get("all_logs"), list):
        for row in results["all_logs"]:
            evt = row.get("event_type", "unknown")
            summary["event_types"][evt] = row.get("count", 0)

    # Parse time range
    if isinstance(results.get("time_range"), list) and results["time_range"]:
        tr = results["time_range"][0]
        first_us = tr.get("first_log_us")
        last_us = tr.get("last_log_us")
        summary["time_range"] = {
            "first_log_us": first_us,
            "last_log_us": last_us,
            "query_start_us": start_time_us,
            "query_end_us": end_time_us,
            "first_log_iso": datetime.fromtimestamp(first_us / 1_000_000, tz=timezone.utc).isoformat() if first_us else None,
            "last_log_iso": datetime.fromtimestamp(last_us / 1_000_000, tz=timezone.utc).isoformat() if last_us else None,
        }
        # Check if logs are outside query window
        if first_us and last_us:
            if first_us < start_time_us or last_us > end_time_us:
                summary["time_range"]["warning"] = "Some logs in OpenObserve are OUTSIDE the query time window!"
            if first_us > end_time_us or last_us < start_time_us:
                summary["time_range"]["error"] = "Query window does NOT overlap with logs in OpenObserve!"

    return {
        "diagnostic": summary,
        "raw_results": results,
        "expected_lob": lob_name,
    }


def build_performance_snapshot(
    lob_name: str,
    start_time_us: int,
    end_time_us: int,
    lob_environment: str = "demo",
    auth_override: dict[str, str] | None = None,
    k6_metrics: dict | None = None,
) -> dict[str, Any]:
    """Aggregate all Pulse + k6 performance signals for one run window."""
    k6 = k6_metrics or {}
    errors: list[str] = []
    http_data: dict = {}
    http_tl: dict = {}
    cpu_data: dict = {}
    cpu_tl: dict = {}
    err_tl: dict = {}
    mismatch_info: dict = {}

    try:
        http_data = search_http_stats(lob_name, start_time_us, end_time_us, lob_environment, auth_override)
    except Exception as e:
        errors.append(f"HTTP: {e}")
    try:
        http_tl = search_http_timeline(lob_name, start_time_us, end_time_us, lob_environment, auth_override)
    except Exception as e:
        errors.append(f"RT timeline: {e}")
    try:
        cpu_data = search_cpu_stats(start_time_us, end_time_us, lob_environment, auth_override)
    except Exception as e:
        errors.append(f"CPU: {e}")
    try:
        cpu_tl = search_cpu_timeline(start_time_us, end_time_us, lob_environment, auth_override)
    except Exception as e:
        errors.append(f"CPU timeline: {e}")
    try:
        err_tl = search_http_errors_timeline(lob_name, start_time_us, end_time_us, lob_environment, auth_override)
    except Exception as e:
        errors.append(f"Errors timeline: {e}")

    http_sum = http_data.get("summary", {})
    cpu_sum = cpu_data.get("summary", {})
    k6_err = float(k6.get("error_rate_pct") or 0)
    http_fail = http_sum.get("failed_paths", 0)

    if k6_err > 5 or http_fail > 0:
        health = "degraded"
    elif k6_err > 0:
        health = "warning"
    else:
        health = "healthy"

    # Build endpoint comparison: k6 endpoints vs Pulse endpoints
    k6_endpoints = k6.get("by_endpoint", {})
    pulse_paths = http_data.get("paths", [])

    # Create a set of Pulse endpoint paths for comparison
    pulse_endpoint_set = set()
    for p in pulse_paths:
        if p.get("path"):
            pulse_endpoint_set.add(p["path"])

    # Build comparison data
    endpoint_comparison = []
    for ep, data in k6_endpoints.items():
        in_pulse = ep in pulse_endpoint_set
        # Also check if any pulse path contains this endpoint (partial match)
        if not in_pulse:
            for pulse_path in pulse_endpoint_set:
                if ep in pulse_path or pulse_path in ep:
                    in_pulse = True
                    break
        endpoint_comparison.append({
            "endpoint": ep,
            "method": data.get("method", "GET"),
            "k6_requests": data.get("count", 0),
            "k6_errors": data.get("errors", 0),
            "k6_status_codes": data.get("status_codes", {}),
            "in_pulse": in_pulse,
        })

    # Add Pulse-only endpoints (logged but not in k6 - unlikely but possible)
    k6_endpoint_set = set(k6_endpoints.keys())
    for p in pulse_paths:
        path = p.get("path", "")
        if path and path not in k6_endpoint_set:
            # Check partial match
            found = False
            for k6_ep in k6_endpoint_set:
                if path in k6_ep or k6_ep in path:
                    found = True
                    break
            if not found:
                endpoint_comparison.append({
                    "endpoint": path,
                    "method": "",
                    "k6_requests": 0,
                    "k6_errors": 0,
                    "k6_status_codes": {},
                    "in_pulse": True,
                    "pulse_only": True,
                })

    return {
        "health": health,
        "partial_errors": errors,
        "k6": {
            "avg_ms": k6.get("avg_ms"),
            "p90_ms": k6.get("p90_ms"),
            "p99_ms": k6.get("p99_ms"),
            "error_rate_pct": k6_err,
            "total_requests": k6.get("total_requests"),
            "peak_rps": k6.get("peak_rps"),
        },
        "http": {
            "summary": http_sum,
            "paths": pulse_paths,
        },
        "endpoint_comparison": endpoint_comparison,
        "timeline": http_tl.get("timeline", {"points": [], "peak": None}),
        "cpu": {
            "summary": cpu_sum,
            "services": cpu_data.get("services", []),
            "timeline": cpu_tl.get("timeline", {"points": [], "peak": None}),
        },
        "errors_timeline": err_tl.get("timeline", {"points": [], "total_errors": 0, "peak": None}),
    }


def search_logs(
    lob_name: str,
    start_time_us: int,
    end_time_us: int,
    lob_environment: str = "demo",
    *,
    errors_only: bool = True,
    log_mode: str = "generic",
    auth_override: dict[str, str] | None = None,
    org_override: str | None = None,
) -> dict[str, Any]:
    stream = _stream()
    if log_mode == "api_errors":
        sql = build_api_error_sql(lob_name)
    elif errors_only:
        sql = build_error_sql(lob_name, stream)
    else:
        sql = build_lob_sql(lob_name, stream)

    max_logs = int(_cfg().get("OPENOBSERVE_MAX_LOG_ROWS", "1000"))
    raw = search_stream_raw(
        sql, start_time_us, end_time_us, lob_environment,
        stream_type="logs", search_type="ui", auth_override=auth_override,
        org_override=org_override, size=max_logs,
    )
    logs = [normalize_hit(h) for h in raw["hits"]]

    return {
        **raw,
        "stream": stream,
        "errors_only": errors_only,
        "log_mode": log_mode,
        "logs": logs,
    }


def search_error_logs(
    lob_name: str,
    start_time_us: int,
    end_time_us: int,
    lob_environment: str = "demo",
    auth_override: dict[str, str] | None = None,
    org_override: str | None = None,
) -> dict[str, Any]:
    return search_logs(
        lob_name,
        start_time_us,
        end_time_us,
        lob_environment,
        errors_only=True,
        auth_override=auth_override,
        org_override=org_override,
    )
