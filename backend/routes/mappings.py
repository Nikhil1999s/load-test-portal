from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
import models

router = APIRouter(prefix="/mappings", tags=["mappings"])


class MappingItem(BaseModel):
    api_id: int
    enabled: bool = True
    weight: int = 50
    custom_body: Optional[str] = None


class MappingBulkSave(BaseModel):
    mappings: list[MappingItem]


class MappingResponse(BaseModel):
    id: int
    lob_id: int
    api_id: int
    enabled: bool
    weight: int
    custom_body: Optional[str]
    api_name: str
    api_method: str
    api_endpoint: str
    api_description: Optional[str]
    api_default_body: Optional[str]

    class Config:
        from_attributes = True


@router.get("/{lob_id}", response_model=list[MappingResponse])
def get_mappings_for_lob(lob_id: int, db: Session = Depends(get_db)):
    lob = db.query(models.LOB).filter(models.LOB.id == lob_id).first()
    if not lob:
        raise HTTPException(status_code=404, detail="LOB not found")

    all_apis = db.query(models.API).filter(models.API.active == True).order_by(models.API.name).all()
    existing = {m.api_id: m for m in db.query(models.LOBAPIMapping).filter(models.LOBAPIMapping.lob_id == lob_id).all()}

    result = []
    for api in all_apis:
        mapping = existing.get(api.id)
        result.append(MappingResponse(
            id=mapping.id if mapping else 0,
            lob_id=lob_id,
            api_id=api.id,
            enabled=mapping.enabled if mapping else False,
            weight=mapping.weight if mapping else 50,
            custom_body=mapping.custom_body if mapping else None,
            api_name=api.name,
            api_method=api.method,
            api_endpoint=api.endpoint,
            api_description=api.description,
            api_default_body=api.default_body,
        ))
    return result


@router.post("/{lob_id}", status_code=200)
def save_mappings_for_lob(lob_id: int, payload: MappingBulkSave, db: Session = Depends(get_db)):
    lob = db.query(models.LOB).filter(models.LOB.id == lob_id).first()
    if not lob:
        raise HTTPException(status_code=404, detail="LOB not found")

    for item in payload.mappings:
        existing = db.query(models.LOBAPIMapping).filter(
            models.LOBAPIMapping.lob_id == lob_id,
            models.LOBAPIMapping.api_id == item.api_id
        ).first()

        if existing:
            existing.enabled = item.enabled
            existing.weight = item.weight
            existing.custom_body = item.custom_body
        else:
            db.add(models.LOBAPIMapping(
                lob_id=lob_id,
                api_id=item.api_id,
                enabled=item.enabled,
                weight=item.weight,
                custom_body=item.custom_body,
            ))

    db.commit()
    return {"status": "saved", "lob_id": lob_id, "count": len(payload.mappings)}
