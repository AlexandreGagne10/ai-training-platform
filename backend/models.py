from sqlalchemy import Column, String, DateTime, Text, Integer, Float, Enum
from sqlalchemy.dialects.postgresql import UUID, JSON
from .database import Base
import uuid
from datetime import datetime
import enum

class JobStatus(enum.Enum):
    PENDING = "pending"
    RUNNING = "running" 
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class ModelType(enum.Enum):
    YOLO = "yolo"
    GEMMA = "gemma"

class TrainingJob(Base):
    __tablename__ = "training_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    type = Column(Enum(ModelType), nullable=False)
    status = Column(Enum(JobStatus), default=JobStatus.PENDING)
    config = Column(JSON)
    results = Column(JSON)
    error_message = Column(Text)
    progress = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)

class TrainedModel(Base):
    __tablename__ = "trained_models"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(Enum(ModelType), nullable=False)
    model_path = Column(String(500), nullable=False)
    metrics = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
