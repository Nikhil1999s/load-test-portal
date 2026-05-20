from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from database import get_db
import models

router = APIRouter(prefix="/apis", tags=["apis"])


class APICreate(BaseModel):
    name: str
    method: str
    endpoint: str
    description: Optional[str] = None
    default_body: Optional[str] = None
    base_url_override: Optional[str] = None
    active: bool = True


class APIUpdate(BaseModel):
    name: Optional[str] = None
    method: Optional[str] = None
    endpoint: Optional[str] = None
    description: Optional[str] = None
    default_body: Optional[str] = None
    base_url_override: Optional[str] = None
    active: Optional[bool] = None


class APIResponse(BaseModel):
    id: int
    name: str
    method: str
    endpoint: str
    description: Optional[str]
    default_body: Optional[str]
    base_url_override: Optional[str]
    active: bool
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/", response_model=list[APIResponse])
def list_apis(method: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.API)
    if method:
        query = query.filter(models.API.method == method.upper())
    return query.order_by(models.API.name).all()


@router.get("/{api_id}", response_model=APIResponse)
def get_api(api_id: int, db: Session = Depends(get_db)):
    api = db.query(models.API).filter(models.API.id == api_id).first()
    if not api:
        raise HTTPException(status_code=404, detail="API not found")
    return api


@router.post("/", response_model=APIResponse, status_code=201)
def create_api(payload: APICreate, db: Session = Depends(get_db)):
    existing = db.query(models.API).filter(models.API.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"API '{payload.name}' already exists")
    api = models.API(**payload.model_dump())
    db.add(api)
    db.commit()
    db.refresh(api)
    return api


@router.put("/{api_id}", response_model=APIResponse)
def update_api(api_id: int, payload: APIUpdate, db: Session = Depends(get_db)):
    api = db.query(models.API).filter(models.API.id == api_id).first()
    if not api:
        raise HTTPException(status_code=404, detail="API not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(api, field, value)
    db.commit()
    db.refresh(api)
    return api


@router.delete("/{api_id}", status_code=204)
def delete_api(api_id: int, db: Session = Depends(get_db)):
    api = db.query(models.API).filter(models.API.id == api_id).first()
    if not api:
        raise HTTPException(status_code=404, detail="API not found")
    db.delete(api)
    db.commit()
