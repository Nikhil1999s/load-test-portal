from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import httpx

from database import get_db
import models

import httpx
from utils.token_generator import generate_token as _generate_token

router = APIRouter(prefix="/lobs", tags=["lobs"])


class LOBCreate(BaseModel):
    name: str
    base_url: str
    environment: str = "uat"
    auth_type: str = "custom"
    auth_header_name: str = "authorization"
    auth_header_value: str = ""
    login_password: Optional[str] = None
    active: bool = True


class LOBUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    environment: Optional[str] = None
    auth_type: Optional[str] = None
    auth_header_name: Optional[str] = None
    auth_header_value: Optional[str] = None
    login_id: Optional[str] = None
    login_password: Optional[str] = None
    active: Optional[bool] = None


class LOBResponse(BaseModel):
    id: int
    name: str
    base_url: str
    environment: str
    auth_type: str
    auth_header_name: str
    auth_header_value: str
    login_id: Optional[str]
    active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── healthcheck MUST be before /{lob_id} ──
@router.get("/healthcheck")
def healthcheck_lob(url: str):
    try:
        target = url.rstrip('/') + '/hckeck'
        print(f"[healthcheck] calling: {target}")
        resp = httpx.get(target, timeout=8)
        print(f"[healthcheck] status: {resp.status_code}")
        print(f"[healthcheck] body: {resp.text[:500]}")
        data = {}
        try:
            data = resp.json()
        except Exception:
            pass
        lob_names = data.get('systemInfo', {}).get('lobNames', [])
        print(f"[healthcheck] lobNames count: {len(lob_names)}")
        return {
            "reachable": True,
            "status_code": resp.status_code,
            "url": target,
            "message": "Environment is reachable",
            "lob_names": lob_names,
        }
    except httpx.ConnectError:
        return {"reachable": False, "url": url + '/hckeck', "message": "Connection refused — server unreachable", "lob_names": []}
    except httpx.TimeoutException:
        return {"reachable": False, "url": url + '/hckeck', "message": "Request timed out after 8s", "lob_names": []}
    except Exception as e:
        print(f"[healthcheck] error: {e}")
        return {"reachable": False, "url": url + '/hckeck', "message": str(e), "lob_names": []}


@router.get("/", response_model=list[LOBResponse])
def list_lobs(env: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.LOB)
    if env:
        query = query.filter(models.LOB.environment == env)
    return query.order_by(models.LOB.name).all()


@router.post("/{lob_id}/generate-token")
def generate_lob_token(lob_id: int, db: Session = Depends(get_db)):
    lob = db.query(models.LOB).filter(models.LOB.id == lob_id).first()
    if not lob:
        raise HTTPException(status_code=404, detail="LOB not found")
    if not lob.login_id or not lob.login_password:
        raise HTTPException(status_code=400, detail="LOB has no credentials. Add login ID and password first.")
    try:
        token_value = _generate_token(lob.base_url, lob.name, lob.login_id, lob.login_password)
        lob.auth_header_value = token_value
        lob.auth_type = "bearer"
        lob.auth_header_name = "authorization"
        lob.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(lob)
        return {"success": True, "message": "Token generated and saved successfully", "lob_id": lob_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{lob_id}", response_model=LOBResponse)
def get_lob(lob_id: int, db: Session = Depends(get_db)):
    lob = db.query(models.LOB).filter(models.LOB.id == lob_id).first()
    if not lob:
        raise HTTPException(status_code=404, detail="LOB not found")
    return lob


@router.post("/", response_model=LOBResponse, status_code=201)
def create_lob(payload: LOBCreate, db: Session = Depends(get_db)):
    existing = db.query(models.LOB).filter(models.LOB.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"LOB '{payload.name}' already exists")
    lob = models.LOB(**payload.model_dump())
    db.add(lob)
    db.commit()
    db.refresh(lob)
    return lob


@router.put("/{lob_id}", response_model=LOBResponse)
def update_lob(lob_id: int, payload: LOBUpdate, db: Session = Depends(get_db)):
    lob = db.query(models.LOB).filter(models.LOB.id == lob_id).first()
    if not lob:
        raise HTTPException(status_code=404, detail="LOB not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(lob, field, value)
    lob.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(lob)
    return lob


@router.delete("/{lob_id}", status_code=204)
def delete_lob(lob_id: int, db: Session = Depends(get_db)):
    lob = db.query(models.LOB).filter(models.LOB.id == lob_id).first()
    if not lob:
        raise HTTPException(status_code=404, detail="LOB not found")
    db.delete(lob)
    db.commit()
