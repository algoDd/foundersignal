import logging
import firebase_admin
from firebase_admin import auth, credentials, firestore
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import get_settings

logger = logging.getLogger("foundersignal.firebase")

# Global instances
_firebase_app = None
_db = None

def init_firebase():
    global _firebase_app, _db
    if _firebase_app is not None:
        return _firebase_app
    
    settings = get_settings()
    if not settings.firebase_project_id:
        logger.warning("FIREBASE_PROJECT_ID not set. Firebase integration may not work.")
        return None

    try:
        # Initialize app
        # For local development, this requires Application Default Credentials (ADC)
        # or a service account key file.
        _firebase_app = firebase_admin.initialize_app(
            options={'projectId': settings.firebase_project_id}
        )

        logger.info("Firebase Admin initialized successfully.")
        return _firebase_app
    except Exception as e:
        logger.error("--- FIREBASE AUTH ERROR ---")
        logger.error("Failed to initialize Firebase Admin: %s", e)
        logger.error("To fix this locally, run: gcloud auth application-default login")
        logger.error("Or set GOOGLE_APPLICATION_CREDENTIALS to your service-account.json path.")
        logger.error("---------------------------")
        return None


def get_db():
    global _db
    if _db is not None:
        return _db
    
    app = init_firebase()
    if not app:
        return None
        
    try:
        _db = firestore.client()
        return _db
    except Exception as e:
        logger.warning("Could not initialize Firestore client (likely missing credentials): %s", e)
        return None


security = HTTPBearer(auto_error=False)

async def get_current_user(token: HTTPAuthorizationCredentials = Depends(security)):
    """Dependency to verify Firebase ID token and return user data."""
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    app = init_firebase()
    if not app:
        settings = get_settings()
        if settings.allow_dev_auth_bypass and settings.debug:
            logger.warning("Bypassing Auth in debug mode: Firebase Admin not initialized.")
            return {"uid": "dev_user_123", "email": "dev@foundersignal.com"}
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is not configured",
        )

    try:
        decoded_token = auth.verify_id_token(token.credentials)
        return decoded_token
    except Exception as e:
        # If token verification fails, we still want to block unless in absolute dev override
        logger.error("Token verification failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
