import base64
import time
import json
import httpx
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import serialization

PUBLIC_KEY_B64 = (
    "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCvEbxPHVMhvoI4JVU0twKmV6+D"
    "0glCpxrAiN7+sp88xUvhA+IIrirRCGiq+v5rpG3VMJv3N5+Nxm/2JZwwMlw04tdC"
    "OoLdsp4iLc+UNq0iTZ5P2W/U7QhsQNDsA+qzPtZC28AUm1mfkNYu+FEkec5vkRxH"
    "k4Co7gd5RjGGlzSLmQIDAQAB"
)


def _encrypt_password(password: str) -> str:
    text = f"{int(time.time() * 1000)}:{password}"
    key_der = base64.b64decode(PUBLIC_KEY_B64)
    public_key = serialization.load_der_public_key(key_der)
    encrypted = public_key.encrypt(text.encode("utf-8"), padding.PKCS1v15())
    return base64.b64encode(encrypted).decode("utf-8")


def _find_jwt_in_response(response: httpx.Response) -> str:
    """
    Try every possible location the JWT could be:
    1. Response headers (Authorization, X-Auth-Token, X-Token, jwt, token)
    2. Response body JSON fields (token, accessToken, jwt, access_token, authToken)
    3. Any JSON field whose value starts with 'eyJ' (JWT signature)
    """
    # 1. Check response headers
    for header in ['authorization', 'x-auth-token', 'x-token', 'jwt', 'token', 'x-access-token']:
        val = response.headers.get(header, '')
        if val and len(val) > 20:
            # Strip 'Bearer ' prefix if present
            return val.replace('Bearer ', '').replace('bearer ', '').strip()

    # 2. Parse body
    try:
        body = response.json()
    except Exception:
        raise ValueError(f"Could not parse signin response as JSON: {response.text[:200]}")

    # 3. Check known token field names
    for key in ('token', 'accessToken', 'access_token', 'jwt', 'authToken', 'id_token', 'jwtToken'):
        val = body.get(key, '')
        if val and isinstance(val, str) and len(val) > 20:
            return val

    # 4. Deep search — find any string value starting with 'eyJ' (JWT)
    def deep_find_jwt(obj):
        if isinstance(obj, dict):
            for v in obj.values():
                result = deep_find_jwt(v)
                if result:
                    return result
        elif isinstance(obj, list):
            for item in obj:
                result = deep_find_jwt(item)
                if result:
                    return result
        elif isinstance(obj, str) and obj.startswith('eyJ') and len(obj) > 50:
            return obj
        return None

    jwt_val = deep_find_jwt(body)
    if jwt_val:
        return jwt_val

    # 5. If short token found, use it as-is (some APIs use opaque tokens)
    short_token = body.get('token', '')
    if short_token:
        print(f"[token] WARNING: only short token found ({len(short_token)} chars) — using it")
        return short_token

    raise ValueError(f"No token found in response. Fields: {list(body.keys())}")


def generate_token(base_url: str, lob_name: str, login_id: str, password: str) -> str:
    encrypted_password = _encrypt_password(password)

    request_body = {
        "loginId": login_id,
        "password": encrypted_password,
        "lob": lob_name,
        "unlimitedExpiry": True,
    }

    url = base_url.rstrip("/") + "/signin"
    print(f"[token] calling: {url} for lob: {lob_name}")

    response = httpx.post(
        url,
        json=request_body,
        headers={"Content-Type": "application/json", "Lob": lob_name},
        timeout=30,
    )

    print(f"[token] status: {response.status_code}")
    print(f"[token] response headers: {dict(response.headers)}")
    print(f"[token] response body (first 300): {response.text[:300]}")

    if response.status_code != 200:
        raise ValueError(f"Signin failed — HTTP {response.status_code}: {response.text[:200]}")

    token = _find_jwt_in_response(response)
    print(f"[token] extracted token ({len(token)} chars): {token[:30]}...")

    # Store as Bearer token — works for this API
    full_value = f"Bearer {token}"
    print(f"[token] final auth header value: {full_value[:40]}...")
    return full_value
