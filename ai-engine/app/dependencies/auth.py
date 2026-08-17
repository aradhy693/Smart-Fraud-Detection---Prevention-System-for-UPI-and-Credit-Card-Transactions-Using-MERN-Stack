from fastapi import Header, HTTPException, status
from app.config import get_settings

async def verify_api_key(x_ai_api_key: str = Header(None, alias="X-AI-API-Key")) -> str:
    settings = get_settings()
    if not x_ai_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "success": False,
                "message": "API key is missing",
                "error": {
                    "code": "UNAUTHORIZED",
                    "details": "X-AI-API-Key header is required"
                }
            }
        )
    if x_ai_api_key != settings.ai_engine_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "success": False,
                "message": "Invalid API key",
                "error": {
                    "code": "UNAUTHORIZED",
                    "details": "The provided API key is invalid"
                }
            }
        )
    return x_ai_api_key
