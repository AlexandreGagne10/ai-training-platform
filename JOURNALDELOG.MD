# Journal de log

Ce fichier sert à consigner les erreurs rencontrées, les correctifs appliqués et d'autres informations pertinentes pour le développement de ce projet.

Tâches importantes:
- Tu dois entretenir un journal de log régulièrement entre toutes les modifications au code.
- Tu dois indiquer tous les bugs rencontrés, la cause, les effets, la solution pour régler.
- Tu dois aussi indiquer le code en question (bloc).
- Avant d'effectué une correction, tu dois vérifiés si le bug n'a pas déjà été rencontré, ou si la correction n'a pas déjà été envisagée.

---
**Date:** 2025-07-28

### 1. Erreur d'entraînement YOLO : `WorkerLostError`

*   **Erreur Rencontrée:** Les tâches d'entraînement YOLO échouaient systématiquement avec l'erreur `billiard.exceptions.WorkerLostError: Worker exited prematurely: signal 6 (SIGABRT)`.
*   **Cause Probable:** Cette erreur indique que le processus Celery a été terminé brutalement par le système. La cause la plus fréquente est un manque de mémoire, en particulier la VRAM du GPU (OOM - Out of Memory), lorsque le processus tente d'allouer plus de ressources que disponibles. Les paramètres `batch_size` et `image_size` sont les plus gourmands en VRAM.
*   **Effets:** Toutes les tâches d'entraînement échouaient, remplissant la liste des "Active Jobs" de tâches en état `FAILURE`.
*   **Correctifs Appliqués:**
    1.  **Meilleure Gestion d'Erreur (`backend/tasks.py`):** Le bloc `try...except` de la tâche `train_yolo_model` a été modifié pour capturer spécifiquement `WorkerLostError` et enregistrer un message d'erreur plus clair dans la base de données, guidant l'utilisateur vers la cause probable (mémoire) et les solutions (réduire `batch_size` ou `image_size`).
    2.  **Optimisation des Ressources (`docker-compose.yml`):** La directive `shm_size: '2gb'` a été retirée du service `api` où elle était inutile, pour s'assurer que la mémoire partagée est pleinement disponible pour le `celery-worker`.

### 2. Impossibilité de Supprimer les Tâches Échouées

*   **Problème Rencontré:** L'interface utilisateur ne proposait aucune option pour supprimer les tâches terminées ou échouées, ce qui encombrait la vue "Active Jobs".
*   **Solution Appliquée:** Une fonctionnalité complète de suppression a été ajoutée.
    1.  **Tâche de Suppression (`backend/tasks.py`):** Création d'une nouvelle tâche Celery asynchrone `delete_job_from_db` qui supprime l'enregistrement de la tâche de la base de données ET le dossier contenant les modèles et logs associés sur le disque (`/app/models/{job_id}`).
    2.  **Route API (`backend/main.py`):** Création d'une nouvelle route `DELETE /api/v1/training/jobs/{job_id}/delete` qui déclenche la tâche de suppression en arrière-plan.
    3.  **Interface Utilisateur (`frontend/static/app.js`):**
        *   Ajout d'un bouton "Delete" sur les cartes des tâches qui sont dans un état final (`completed`, `failed`, `cancelled`).
        *   Le bouton déclenche un appel à la nouvelle route API après une modale de confirmation.
        *   La tâche est immédiatement retirée de l'interface pour une meilleure expérience utilisateur.

### 3. Erreur de Syntaxe Docker Compose

*   **Erreur Rencontrée:** Lors de la tentative de reconstruction (`docker-compose up --build`), l'erreur `services.volumes must be a mapping` est apparue.
*   **Cause:** Une commande `replace` défectueuse de ma part a corrompu le fichier `docker-compose.yml`. L'intégralité du service `api` a été remplacée par un simple bloc `volumes`, ce qui a invalidé la syntaxe YAML.
*   **Effets:** Impossible de démarrer ou de reconstruire l'environnement Docker.
*   **Correctif Appliqué:** Le fichier `docker-compose.yml` a été lu pour constater les dégâts. Une nouvelle commande `replace`, plus spécifique, a été utilisée pour restaurer le bloc du service `api` tout en s'assurant que la modification originale (suppression de `shm_size`) était correctement appliquée.
---