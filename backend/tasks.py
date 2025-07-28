from celery import current_task
from .celery_app import celery_app
import os
import torch
import logging
import ultralytics
from typing import Dict, Any
from datetime import datetime
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from .models import TrainingJob, TrainedModel, JobStatus, ModelType
from .database import Base
import yaml
import shutil
import json
from billiard.exceptions import WorkerLostError

# Configuration du logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration base de données
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres123@postgres:5432/ai_trainer")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)



@celery_app.task(bind=True)
def train_yolo_model(self, job_id: str, config: Dict[str, Any]):
    """Entraîner un modèle YOLO avec Ultralytics"""

    db = SessionLocal()
    training_job = None
    try:
        from ultralytics import YOLO

        # Mettre à jour l'état de la tâche
        self.update_state(
            state='PROGRESS',
            meta={'status': 'initializing', 'progress': 0, 'message': "Mise en place de l'entraînement YOLO..."}
        )

        # Charger la tâche d'entraînement en base
        training_job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
        if not training_job:
            raise ValueError(f"Tâche d'entraînement {job_id} non trouvée en base de données.")

        training_job.status = JobStatus.RUNNING
        training_job.started_at = datetime.utcnow()
        db.add(training_job)
        db.commit()
        db.refresh(training_job)

        # Extraire la config
        model_version = config.get("model", "yolov8n")
        dataset_path = config.get("dataset_path")
        epochs = config.get("epochs", 100)
        batch_size = config.get("batch_size", 16)
        image_size = config.get("image_size", 640)
        learning_rate = config.get("learning_rate", 0.001)
        device = config.get("device", "auto")

        logger.info(f"Démarrage de la tâche d'entraînement YOLO {job_id} avec modèle {model_version}")

        # Créer dossier de sortie
        output_dir = f"/app/models/{job_id}"
        os.makedirs(output_dir, exist_ok=True)

        # Vérifier que dataset existe
        if not os.path.exists(dataset_path):
            raise FileNotFoundError(f"Chemin du jeu de données non trouvé : {dataset_path}")

        self.update_state(
            state='PROGRESS',
            meta={'status': 'loading_model', 'progress': 10, 'message': f'Chargement du modèle {model_version}...'}
        )

        logger.info(f"Chargement du modèle {model_version}")
        model = YOLO(f"{model_version}.pt")

        # Préparer dataset.yaml
        dataset_config = {
            'train': os.path.join(dataset_path, 'train'),
            'val': os.path.join(dataset_path, 'val'),
            'nc': 1,
            'names': ['vehicle']  # par défaut
        }
        dataset_yaml_path = os.path.join(dataset_path, 'dataset.yaml')
        if os.path.exists(dataset_yaml_path):
            with open(dataset_yaml_path, 'r') as f:
                loaded_dataset_config = yaml.safe_load(f)
                dataset_config['nc'] = loaded_dataset_config.get('nc', dataset_config['nc'])
                dataset_config['names'] = loaded_dataset_config.get('names', dataset_config['names'])

        dataset_config_path = os.path.join(output_dir, 'dataset.yaml')
        with open(dataset_config_path, 'w') as f:
            yaml.dump(dataset_config, f)

        self.update_state(
            state='PROGRESS',
            meta={'status': 'training', 'progress': 20, 'message': "Démarrage de l'entraînement du modèle..."}
        )

        # Lancer l'entraînement
        results = model.train(
            data=dataset_config_path,
            epochs=epochs,
            imgsz=image_size,
            batch=batch_size,
            lr0=learning_rate,
            device=device,
            project=output_dir,
            name='training',
            exist_ok=True,
            verbose=True,
        )

        # Validation
        self.update_state(
            state='PROGRESS',
            meta={'status': 'validating', 'progress': 90, 'message': "Validation du modèle entraîné..."}
        )
        validation_results = model.val()

        # Export du modèle
        self.update_state(
            state='PROGRESS',
            meta={'status': 'exporting', 'progress': 95, 'message': "Exportation du modèle entraîné..."}
        )

        # Sauvegarder meilleur modèle
        best_model_path_in_run_dir = os.path.join(output_dir, 'training', 'weights', 'best.pt')
        final_model_filename = f"{job_id}_best.pt"
        final_model_path_for_db = os.path.join(output_dir, final_model_filename)

        if os.path.exists(best_model_path_in_run_dir):
            shutil.copy2(best_model_path_in_run_dir, final_model_path_for_db)
            logger.info(f"Modèle sauvegardé dans {final_model_path_for_db}")
        else:
            raise FileNotFoundError("Fichier du meilleur modèle non trouvé après entraînement.")

        # Préparer métriques finales
        final_metrics = {
            'mAP50': float(validation_results.box.map50) if hasattr(validation_results, 'box') else 0.0,
            'mAP50-95': float(validation_results.box.map) if hasattr(validation_results, 'box') else 0.0,
            'epochs_completed': epochs,
            'loss': float(results.results_dict['metrics/loss']) if hasattr(results, 'results_dict') and 'metrics/loss' in results.results_dict else 0.0,
            'precision': float(validation_results.box.p50) if hasattr(validation_results.box, 'p50') else 0.0,
            'recall': float(validation_results.box.r50) if hasattr(validation_results.box, 'r50') else 0.0,
        }

        # Rapport JSON entraînement
        report_data = {
            'job_id': job_id,
            'model_path': final_model_path_for_db,
            'model_type': ModelType.YOLO.value,
            'model_version': model_version,
            'epochs_completed': epochs,
            'final_metrics': final_metrics,
            'training_config': config,
            'completed_at': datetime.utcnow().isoformat()
        }
        report_path = os.path.join(output_dir, f"{job_id}_report.json")
        with open(report_path, 'w') as f:
            json.dump(report_data, f, indent=2)

        # Sauvegarder modèle entraîné en base de données
        trained_model = TrainedModel(
            id=job_id,
            job_id=job_id,
            name=config.get("name", f"Modèle YOLO {job_id[:8]}"),
            type=ModelType.YOLO,
            model_path=final_model_path_for_db,
            metrics=final_metrics,
            created_at=datetime.utcnow()
        )
        db.add(trained_model)

        # Mettre à jour statut tâche
        training_job.status = JobStatus.COMPLETED
        training_job.progress = 100
        training_job.completed_at = datetime.utcnow()
        training_job.results = report_data
        db.add(training_job)

        db.commit()
        logger.info(f"Tâche d'entraînement YOLO {job_id} terminée avec succès")

        return {
            'status': 'completed',
            'progress': 100,
            'message': "Entraînement du modèle YOLO terminé avec succès",
            'results': report_data
        }

    except WorkerLostError as e:
        import traceback
        logger.error(f"WorkerLostError dans la tâche {job_id}: Le worker a été terminé prématurément. Cause probable: Manque de mémoire (OOM).")
        logger.error(traceback.format_exc())
        if training_job:
            training_job.status = JobStatus.FAILED
            training_job.error_message = "Le worker a été terminé prématurément (WorkerLostError). Cela est souvent dû à un manque de mémoire (RAM ou VRAM du GPU). Essayez de réduire la taille du lot (batch size) ou la résolution de l'image."
            training_job.completed_at = datetime.utcnow()
            db.add(training_job)
            db.commit()
        # Ne pas retourner de dictionnaire ici, l'exception est gérée par Celery

    except Exception as e:
        import traceback
        logger.error(f"La tâche d'entraînement YOLO {job_id} a échoué : {str(e)}")
        logger.error(traceback.format_exc())
        if training_job:
            training_job.status = JobStatus.FAILED
            training_job.error_message = str(e)
            training_job.completed_at = datetime.utcnow()
            db.add(training_job)
            db.commit()
        return {
            'status': 'failed',
            'error': str(e),
            'message': f"L'entraînement YOLO a échoué : {str(e)}"
        }
    finally:
        if db.is_active:
            db.close()

@celery_app.task
def delete_job_from_db(job_id: str):
    """Supprime une tâche et les modèles associés de la base de données et du disque."""
    db = SessionLocal()
    try:
        # Supprimer le modèle entraîné s'il existe
        trained_model = db.query(TrainedModel).filter(TrainedModel.job_id == job_id).first()
        if trained_model:
            # Supprimer le dossier du modèle sur le disque
            model_dir = os.path.dirname(trained_model.model_path)
            if os.path.exists(model_dir):
                shutil.rmtree(model_dir)
                logger.info(f"Dossier du modèle {model_dir} supprimé.")
            
            db.delete(trained_model)
            logger.info(f"Modèle entraîné pour la tâche {job_id} supprimé de la base de données.")

        # Supprimer la tâche d'entraînement
        training_job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
        if training_job:
            db.delete(training_job)
            logger.info(f"Tâche d'entraînement {job_id} supprimée de la base de données.")
        
        db.commit()
        return {"status": "success", "message": f"Tâche {job_id} et fichiers associés supprimés."}
    except Exception as e:
        db.rollback()
        logger.error(f"Erreur lors de la suppression de la tâche {job_id}: {e}")
        return {"status": "error", "message": str(e)}
    finally:
        db.close()

