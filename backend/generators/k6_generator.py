import json
import base64


def _build_auth_header(lob):
    """Returns (header_name, header_value) based on auth_type."""
    t = lob.auth_type
    name = lob.auth_header_name or 'authorization'
    val  = lob.auth_header_value or ''

    if t == 'bearer':
        # If value already starts with Bearer, use as-is
        if val.startswith('Bearer '):
            return name, val
        return name, f'Bearer {val}'
    elif t == 'basic':
        # val is stored as "username:password"
        encoded = base64.b64encode(val.encode()).decode()
        return name, f'Basic {encoded}'
    elif t == 'api_key_header':
        return name, val
    elif t == 'api_key_query':
        return None, None   # handled in URL, not header
    else:  # custom / default
        return name, val


def _build_base_url(lob):
    """For api_key_query, append ?param=key to every URL call."""
    if lob.auth_type == 'api_key_query':
        param = lob.auth_header_name or 'api_key'
        key   = lob.auth_header_value or ''
        return lob.base_url, f'?{param}={key}'
    return lob.base_url, ''


def generate_k6_script(lob, mappings, virtual_users, duration_seconds, ramp_up_seconds, iterations=None):
    enabled = [m for m in mappings if m.enabled]
    if not enabled:
        raise ValueError("No APIs enabled for this LOB")

    header_name, header_value = _build_auth_header(lob)
    base_url, url_suffix = _build_base_url(lob)

    scenarios = []
    for m in enabled:
        body_str = ""
        if m.api_method in ("POST", "PUT", "PATCH"):
            body = m.custom_body or m.api.default_body or "{}"
            try:
                json.loads(body)
                body_str = f"JSON.stringify({body})"
            except Exception:
                body_str = "JSON.stringify({})"

        scenarios.append({
            "name": m.api.name,
            "method": m.api_method,
            "endpoint": m.api.endpoint,
            "weight": m.weight,
            "body": body_str,
            "base_url_override": m.api.base_url_override or "",
        })

    total_weight = sum(s["weight"] for s in scenarios)

    scenario_blocks = []
    for s in scenarios:
        pct    = round(s["weight"] / total_weight * 100)
        method = s["method"].lower()
        endpoint = s["endpoint"] + url_suffix
        name   = s["name"]
        body_line = f', {s["body"]}' if s["body"] else ""
        # use API-level base URL override if present, else LOB base URL
        api_base = s.get("base_url_override") or base_url

        if method == "get":
            call = f'http.get(`{api_base}{endpoint}`, params)'
        else:
            call = f'http.{method}(`{api_base}{endpoint}`{body_line}, params)'

        scenario_blocks.append(f"""  // {name} — {pct}% traffic
  if (rnd < {pct / 100:.2f}) {{
    const res = {call};
    check(res, {{ '{name} status 2xx': (r) => r.status >= 200 && r.status < 300 }});
    errorRate.add(res.status >= 400);
  }}""")

    threshold_checks = "\n".join([
        "  http_req_duration: ['p(90)<10000', 'p(99)<30000'],",
        "  http_req_failed: ['rate<0.10'],",
    ])

    # Build headers block
    if header_name:
        headers_block = f"""const params = {{
  headers: {{
    'Content-Type': 'application/json',
    'lob': '{lob.name}',
    '{header_name}': '{header_value}',
  }},
}};"""
    else:
        headers_block = f"""const params = {{
  headers: {{
    'Content-Type': 'application/json',
    'lob': '{lob.name}',
  }},
}};"""

    duration_line = f"duration: '{duration_seconds}s'," if not iterations else f"iterations: {iterations},"

    script = f"""import http from 'k6/http';
import {{ check, sleep }} from 'k6';
import {{ Rate }} from 'k6/metrics';

const errorRate = new Rate('error_rate');
const BASE_URL = '{base_url}';

export const options = {{
  vus: {virtual_users},
  {duration_line}
  thresholds: {{
{threshold_checks}
  }},
}};

{headers_block}

export default function () {{
  const rnd = Math.random();

{"".join(chr(10) + s for s in scenario_blocks)}

  sleep(1);
}}
"""
    return script
