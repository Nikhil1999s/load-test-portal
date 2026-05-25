from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class LOB(Base):
    __tablename__ = "lobs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    base_url = Column(String, nullable=False)
    environment = Column(String, nullable=False, default="dev")  # uat | demo | prod
    auth_type = Column(String, nullable=False, default="bearer")
    auth_header_name = Column(String, nullable=False, default="authorization")
    auth_header_value = Column(Text, nullable=False, default="")
    login_id = Column(String, nullable=True)
    login_password = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    api_mappings = relationship("LOBAPIMapping", back_populates="lob", cascade="all, delete-orphan")


class API(Base):
    __tablename__ = "apis"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    method = Column(String, nullable=False)
    endpoint = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    default_body = Column(Text, nullable=True)
    base_url_override = Column(String, nullable=True)  # if set, overrides LOB base URL
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    lob_mappings = relationship("LOBAPIMapping", back_populates="api", cascade="all, delete-orphan")


class LOBAPIMapping(Base):
    __tablename__ = "lob_api_mappings"

    id = Column(Integer, primary_key=True, index=True)
    lob_id = Column(Integer, ForeignKey("lobs.id"), nullable=False)
    api_id = Column(Integer, ForeignKey("apis.id"), nullable=False)
    enabled = Column(Boolean, default=True)
    weight = Column(Integer, default=50)
    custom_body = Column(Text, nullable=True)

    lob = relationship("LOB", back_populates="api_mappings")
    api = relationship("API", back_populates="lob_mappings")


class LOBThreshold(Base):
    __tablename__ = "lob_thresholds"

    id = Column(Integer, primary_key=True, index=True)
    lob_id = Column(Integer, ForeignKey("lobs.id"), unique=True, nullable=False)
    p99_max_ms = Column(Integer, default=2000)
    p90_max_ms = Column(Integer, default=1000)
    error_rate_max_pct = Column(Float, default=5.0)
    min_rps = Column(Float, default=0.0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TestSuite(Base):
    __tablename__ = "test_suites"

    id = Column(Integer, primary_key=True, index=True)
    lob_id = Column(Integer, ForeignKey("lobs.id"), nullable=False)
    tool = Column(String, default="k6")
    status = Column(String, default="pending")  # pending | running | done | failed
    report_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)

    runs = relationship("TestRun", back_populates="suite", cascade="all, delete-orphan")


class TestRun(Base):
    __tablename__ = "test_runs"

    id = Column(Integer, primary_key=True, index=True)
    lob_id = Column(Integer, ForeignKey("lobs.id"), nullable=False)
    suite_id = Column(Integer, ForeignKey("test_suites.id"), nullable=True)
    iteration_number = Column(Integer, nullable=True)
    tool = Column(String, default="k6")
    virtual_users = Column(Integer, default=10)
    duration_seconds = Column(Integer, default=60)
    ramp_up_seconds = Column(Integer, default=10)
    iterations = Column(Integer, nullable=True)
    status = Column(String, default="pending")
    report_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    test_started_at = Column(DateTime, nullable=True)  # When actual k6/jmeter subprocess starts
    finished_at = Column(DateTime, nullable=True)

    suite = relationship("TestSuite", back_populates="runs")
