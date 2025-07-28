from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse # Import StreamingResponse for potential downloads
from pydantic import BaseModel
from typing import Optional, Dict, Any
import uuid
from datetime import datetime
import json
import os
import mimetypes # Import mimetypes for file serving
import stat # Import stat for file size

from sqlalchemy.orm import Session # Import Session
from .celery_app import celery_app
from .database import init_db, get_db # Import get_db
from .models import TrainingJob, JobStatus, TrainedModel, ModelType # Import TrainedModel and ModelType

# --- App Definition ---
app = FastAPI(
    title="AI Training Platform",
    description="Real AI model training platform with YOLO and Gemma support",
    version="1.0.0"
)

# --- Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Mount Static Files ---
app.mount("/static", StaticFiles(directory="/app/frontend/static"), name="static")

# Pydantic models for API
class YOLOTrainingRequest(BaseModel):
    name: str
    model: str = "yolov8n"  # yolov8n, yolov8s, yolov8m, yolov11n, yolov11s
    dataset_path: str
    epochs: int = 100
    batch_size: int = 16
    image_size: int = 640
    learning_rate: float = 0.001
    device: str = "auto" # 'auto' will let ultralytics decide, 'cpu' or '0' for specific GPU

class GemmaTrainingRequest(BaseModel):
    name: str
    model: str = "google/gemma-1b"  # google/gemma-1b, google/gemma-4b  
    dataset_path: str
    task: str = "text-generation"  # text-generation, question-answering, summarization
    epochs: int = 3
    batch_size: int = 4
    learning_rate: float = 2e-4
    max_length: int = 512

class JobResponse(BaseModel):
    job_id: str
    status: str
    message: str
    name: Optional[str] # Add name to JobResponse for frontend


@app.on_event("startup")
async def startup_event():
    await init_db()

# --- Serve Frontend ---
@app.get("/", include_in_schema=False)
async def read_index():
    """Serves the frontend's index.html file"""
    return FileResponse('/app/frontend/index.html')

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow()}

@app.post("/api/v1/training/yolo/", response_model=JobResponse)
async def create_yolo_training_job(request: YOLOTrainingRequest, db: Session = Depends(get_db)):
    """Create a new YOLO training job"""
    job_id = str(uuid.uuid4())

    # Create and save job record to database
    training_job = TrainingJob(
        id=job_id,
        name=request.name,
        type=ModelType.YOLO, # Use ModelType Enum
        config=request.dict(),
        status=JobStatus.PENDING, # Use JobStatus Enum
        created_at=datetime.utcnow()
    )
    db.add(training_job)
    db.commit() # Commit to save the job before sending to Celery
    db.refresh(training_job)


    # Start Celery task
    task = celery_app.send_task(
        "backend.tasks.train_yolo_model",
        args=[job_id, request.dict()],
        task_id=job_id
    )

    return JobResponse(
        job_id=job_id,
        name=request.name,
        status="pending",
        message=f"YOLO training job '{request.name}' created successfully"
    )

@app.post("/api/v1/training/gemma/", response_model=JobResponse)
async def create_gemma_training_job(request: GemmaTrainingRequest, db: Session = Depends(get_db)):
    """Create a new Gemma training job"""
    job_id = str(uuid.uuid4())

    # Create and save job record to database
    training_job = TrainingJob(
        id=job_id,
        name=request.name,
        type=ModelType.GEMMA, # Use ModelType Enum
        config=request.dict(),
        status=JobStatus.PENDING, # Use JobStatus Enum
        created_at=datetime.utcnow()
    )
    db.add(training_job)
    db.commit() # Commit to save the job before sending to Celery
    db.refresh(training_job)

    # Start Celery task
    task = celery_app.send_task(
        "backend.tasks.train_gemma_model",
        args=[job_id, request.dict()],
        task_id=job_id
    )

    return JobResponse(
        job_id=job_id,
        name=request.name,
        status="pending",
        message=f"Gemma training job '{request.name}' created successfully"
    )

@app.get("/api/v1/training/jobs/")
async def list_training_jobs(db: Session = Depends(get_db)):
    """
    List all training jobs from the database.
    This endpoint is designed to be resilient and will not query Celery.
    The frontend is responsible for polling individual job endpoints for real-time status.
    """
    # Query all jobs from the database
    jobs = db.query(TrainingJob).all()

    # Format the results for the frontend
    formatted_jobs = []
    for job in jobs:
        formatted_jobs.append({
            "job_id": str(job.id),
            "name": job.name,
            "model_type": job.type.value,
            "status": job.status.value,
            "progress": job.progress,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "config": job.config,
            "results": job.results,
            "metrics": job.results.get('final_metrics', {}) if job.results else {},
            "error_message": job.error_message
        })
        
    # Sort by created_at in descending order
    formatted_jobs.sort(key=lambda x: x['created_at'] if x['created_at'] else '', reverse=True)
    return {"jobs": formatted_jobs}

@app.get("/api/v1/training/jobs/{job_id}")
async def get_training_job(job_id: str, db: Session = Depends(get_db)):
    """Get training job status and details"""
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    current_status = job.status.value
    current_progress = job.progress
    current_metrics = job.results.get('final_metrics', {}) if job.results else {}
    current_message = f"Status from DB: {current_status}"
    current_error = job.error_message

    try:
        task_result = celery_app.AsyncResult(job_id)
        current_message = f"Task status: {task_result.state}"

        if task_result.state == "PENDING":
            current_status = "pending"
            current_progress = task_result.info.get('progress', 0) if task_result.info else 0
            current_message = task_result.info.get('message', 'Task is waiting to be processed') if task_result.info else 'Task is waiting to be processed'
        elif task_result.state == "PROGRESS":
            current_status = "running"
            current_progress = task_result.info.get('progress', 0) if task_result.info else 0
            current_metrics = task_result.info.get('metrics', {}) if task_result.info else {}
            current_message = task_result.info.get('message', 'Task is currently running') if task_result.info else 'Task is currently running'
        elif task_result.state == "SUCCESS":
            current_status = "completed"
            current_progress = 100
            current_metrics = task_result.info.get('results', {}).get('final_metrics', {}) if task_result.info else (job.results.get('final_metrics', {}) if job.results else {})
            current_message = task_result.info.get('message', 'Task completed successfully') if task_result.info else 'Task completed successfully'
        elif task_result.state == "FAILURE":
            current_status = "failed"
            current_progress = task_result.info.get('progress', 0) if task_result.info else 0
            current_error = str(task_result.info)
            current_message = task_result.info.get('message', 'Task failed') if task_result.info else 'Task failed'
        elif task_result.state == "REVOKED":
            current_status = "cancelled"
            current_progress = job.progress # Keep last known progress
            current_message = "Task revoked (cancelled)"
    except Exception as e:
        current_message = "Could not connect to Celery to get real-time status."
        current_error = str(e)


    return {
        "job_id": str(job.id),
        "name": job.name,
        "type": job.type.value,
        "status": current_status,
        "progress": current_progress,
        "message": current_message,
        "error": current_error,
        "config": job.config,
        "results": job.results, # This will be the full results dict from DB
        "metrics": current_metrics, # This extracts/updates metrics from Celery or DB results
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }

@app.delete("/api/v1/training/jobs/{job_id}")
async def cancel_training_job(job_id: str, db: Session = Depends(get_db)):
    """Cancel a training job"""
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    celery_app.control.revoke(job_id, terminate=True)
    
    # Update job status in DB
    job.status = JobStatus.CANCELLED
    job.completed_at = datetime.utcnow()
    job.error_message = "Job cancelled by user." # Provide a message for cancellation
    db.add(job)
    db.commit()
    
    return {"job_id": job_id, "status": "cancelled", "message": "Job cancelled successfully"}

@app.delete("/api/v1/training/jobs/{job_id}/delete")
async def delete_training_job(job_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Delete a training job from the database and its associated files from disk.
    This is a permanent action.
    """
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found in the database.")

    # Use a background task to delete files and DB entries
    background_tasks.add_task(celery_app.send_task, "backend.tasks.delete_job_from_db", args=[job_id])

    return {"job_id": job_id, "status": "queued_for_deletion", "message": "Job and associated files are scheduled for deletion."}


@app.get("/api/v1/models/")
async def list_trained_models(db: Session = Depends(get_db)):
    """List all trained models from the database"""
    models = db.query(TrainedModel).all()
    
    formatted_models = []
    for model in models:
        formatted_models.append({
            "id": str(model.id),
            "job_id": str(model.job_id),
            "name": model.name,
            "type": model.type.value, # Use .value for enum
            "model_path": model.model_path,
            "metrics": model.metrics,
            "created_at": model.created_at.isoformat() if model.created_at else None
        })
    # Sort by created_at in descending order
    formatted_models.sort(key=lambda x: x['created_at'] if x['created_at'] else '', reverse=True)
    return {"models": formatted_models}


@app.get("/api/v1/models/{model_id}/download")
async def download_model(model_id: str, db: Session = Depends(get_db)):
    """Download a trained model file"""
    model_entry = db.query(TrainedModel).filter(TrainedModel.id == model_id).first()
    if not model_entry:
        raise HTTPException(status_code=404, detail="Model not found in database.")

    file_path = model_entry.model_path
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Model file not found on server at {file_path}. It might have been deleted or path is incorrect.")
    
    # Determine media type
    media_type, _ = mimetypes.guess_type(file_path)
    if not media_type:
        media_type = "application/octet-stream" # Default if type cannot be guessed

    # Determine filename for download
    filename = os.path.basename(file_path)
    if model_entry.type == ModelType.GEMMA:
        # For Gemma, model_path is a directory, not a single file.
        # We need to zip the directory for download, or provide instructions.
        # This is a more complex scenario. For now, raise an error or handle
        # differently.
        # Option 1: zip the directory on the fly
        # Option 2: instruct user (less ideal for direct download)
        # For this example, we'll indicate it's a directory.
        if os.path.isdir(file_path):
            raise HTTPException(status_code=400, detail=f"Gemma model is a directory, not a single file. Zipping not implemented for direct download yet. Path: {file_path}")
        else:
             # If it's a single file within the Gemma model_path (unlikely but cover)
            return FileResponse(path=file_path, filename=filename, media_type=media_type)
    else: # YOLO or other single-file models
        return FileResponse(path=file_path, filename=filename, media_type=media_type)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)