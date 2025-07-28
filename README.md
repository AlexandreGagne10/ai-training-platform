# 🚀 AI Training Platform

Une plateforme complète et **fonctionnelle** pour l'entraînement de modèles IA, supportant YOLO et Gemma 3 nano.

## ✨ Fonctionnalités

### 🎯 Entraînement YOLO Réel
- **Modèles supportés**: YOLOv8n/s/m, YOLOv11n/s
- **Utilise Ultralytics** pour un vrai entraînement
- **Métriques réelles**: mAP, loss, accuracy
- **GPU optimisé** avec CUDA
- **Formats de dataset**: COCO, YOLO, Pascal VOC

### 💬 Fine-tuning Gemma 3 Nano
- **Modèles supportés**: Gemma 1B et 4B
- **Utilise Unsloth + Transformers** pour l'optimisation
- **LoRA fine-tuning** efficace
- **Tâches**: génération de texte, Q&A, résumé
- **Quantization 4-bit** pour économiser la mémoire

### 🏗️ Architecture Production
- **FastAPI** pour l'API REST
- **Celery + Redis** pour les tâches asynchrones
- **PostgreSQL** pour les métadonnées
- **MinIO** pour le stockage des datasets/modèles
- **Docker Compose** pour le déploiement facile

## 🚀 Démarrage Rapide

### Prérequis
- Docker Desktop installé et démarré
- GPU NVIDIA (optionnel mais recommandé)
- Windows 10/11 avec WSL2

### Installation Automatique (Windows)

1. **Téléchargez le projet** et naviguez vers le dossier :
```cmd
cd ai-training-platform
```

2. **Lancez le script d'installation** :
```cmd
scripts\setup.bat
```

### Installation Manuelle

1. **Arrêter les services existants** :
```cmd
docker-compose down -v
```

2. **Construire et démarrer** :
```cmd
docker-compose up --build -d
```

3. **Vérifier le statut** :
```cmd
docker-compose ps
```

## 🌐 Services Disponibles

Une fois démarrée, la plateforme est accessible sur :

| Service | URL | Description |
|---------|-----|-------------|
| **API FastAPI** | http://localhost:8000 | API principale |
| **Documentation** | http://localhost:8000/docs | Interface Swagger |
| **Console MinIO** | http://localhost:9001 | Gestion des fichiers |
| **Flower** | http://localhost:5555 | Monitoring Celery |

### Identifiants MinIO
- **Utilisateur**: `minioadmin`
- **Mot de passe**: `minioadmin123`

## 📋 Utilisation de l'API

### 1. Entraînement YOLO

```bash
curl -X POST "http://localhost:8000/api/v1/training/yolo/" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Vehicle Detection",
    "model": "yolov8n",
    "dataset_path": "/app/datasets/vehicles",
    "epochs": 50,
    "batch_size": 16,
    "image_size": 640,
    "learning_rate": 0.001
  }'
```

### 2. Fine-tuning Gemma

```bash
curl -X POST "http://localhost:8000/api/v1/training/gemma/" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Text Summarization",
    "model": "google/gemma-1b",
    "dataset_path": "/app/datasets/text_data.json",
    "task": "text-generation",
    "epochs": 3,
    "batch_size": 4,
    "learning_rate": 2e-4
  }'
```

### 3. Vérifier le statut

```bash
# Lister tous les jobs
curl "http://localhost:8000/api/v1/training/jobs/"

# Détails d'un job spécifique
curl "http://localhost:8000/api/v1/training/jobs/{job_id}"

# Lister les modèles entraînés
curl "http://localhost:8000/api/v1/models/"
```

## 📁 Structure du Projet

```
ai-training-platform/
├── docker-compose.yml          # Configuration des services
├── Dockerfile.backend          # Image pour l'API et Celery
├── requirements.txt            # Dépendances Python
├── .env.example               # Variables d'environnement
├── backend/                   # Code de l'application
│   ├── main.py               # API FastAPI
│   ├── tasks.py              # Tâches Celery (entraînement réel)
│   ├── celery_app.py         # Configuration Celery
│   ├── models.py             # Modèles de base de données
│   └── database.py           # Configuration PostgreSQL
├── scripts/                   # Scripts utilitaires
│   ├── setup.bat             # Installation automatique
│   └── fix-docker-errors.bat # Correction d'erreurs
├── datasets/                  # Datasets d'entraînement
├── models/                    # Modèles entraînés
└── logs/                      # Logs d'entraînement
```

## 🔧 Dépannage

### Erreur "Dockerfile.backend not found"
```cmd
# Utilisez le script de correction
scripts\fix-docker-errors.bat
```

### Erreur "Image not found"
```cmd
# Téléchargez manuellement les images
docker pull redis:7-alpine
docker pull postgres:15-alpine
docker pull minio/minio:latest
docker pull minio/mc:latest
```

### Docker Desktop ne démarre pas
1. Redémarrez Docker Desktop
2. Vérifiez WSL2 : `wsl --status`
3. Redémarrez votre ordinateur
4. Lancez en tant qu'administrateur

### Services ne démarrent pas
```cmd
# Vérifiez les logs
docker-compose logs -f

# Redémarrez les services
docker-compose restart
```

## 💻 Développement

### Variables d'environnement
Copiez `.env.example` vers `.env` et ajustez selon vos besoins.

### Logs de développement
```cmd
# Logs en temps réel
docker-compose logs -f

# Logs spécifiques à un service
docker-compose logs -f api
docker-compose logs -f celery-worker
```

### Tests
```cmd
# Executer dans le container API
docker-compose exec api python -m pytest
```

## 🎯 Exemples de Datasets

### Format YOLO
```
datasets/
├── train/
│   ├── images/
│   └── labels/
└── val/
    ├── images/
    └── labels/
```

### Format Gemma (JSON)
```json
[
  {
    "text": "Question: Qu'est-ce que l'IA? Réponse: L'intelligence artificielle..."
  },
  {
    "question": "Comment ça marche?",
    "answer": "Le processus fonctionne en..."
  }
]
```

## 🔐 Production

### SSL/TLS
Ajoutez un reverse proxy (nginx/traefik) pour HTTPS en production.

### Sécurité
- Changez tous les mots de passe par défaut
- Utilisez des secrets Docker pour les credentials
- Configurez les firewalls appropriés

### Monitoring
- Prometheus + Grafana pour les métriques
- ELK Stack pour les logs centralisés
- Alerting avec PagerDuty/Slack

## 🤝 Support

### Logs utiles
```cmd
# Voir tous les logs
docker-compose logs

# Filtrer par service
docker-compose logs api
docker-compose logs celery-worker
```

### Commandes utiles
```cmd
# Redémarrer un service
docker-compose restart api

# Reconstruire un service
docker-compose up --build api

# Entrer dans un container
docker-compose exec api bash
```

## 📄 Licence

MIT License - Voir le fichier LICENSE pour plus de détails.

---

## ⚡ Différences avec l'Ancienne Version

| **Aspect** | **Ancienne Version** | **✅ Nouvelle Version** |
|------------|---------------------|------------------------|
| **Entraînement** | Interface de démonstration | **Vrai entraînement** avec Ultralytics/Unsloth |
| **Métriques** | Fausses données générées | **Vraies métriques** d'entraînement |
| **Backend** | Pas de backend fonctionnel | **Backend complet** FastAPI + Celery |
| **Modèles** | Simulation visuelle | **Vrais modèles** sauvegardés |
| **Monitoring** | Interface statique | **Monitoring temps réel** |
| **Stockage** | Pas de persistance | **MinIO + PostgreSQL** |
| **API** | Endpoints factices | **API REST complète** |

Cette plateforme peut maintenant **réellement entraîner** des modèles YOLO et Gemma 3 nano, produisant des modèles utilisables en production ! 🎉
