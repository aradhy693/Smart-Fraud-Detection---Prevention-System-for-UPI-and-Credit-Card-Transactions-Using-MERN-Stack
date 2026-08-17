from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.config import get_settings
from app.dependencies.auth import verify_api_key
from app.routes.fraud_routes import router as fraud_router
from app.routes.platform_routes import router as platform_router
from app.services.model_service import get_model_artifact


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_model_artifact()
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": str(exc.detail),
            "error": {"code": "HTTP_ERROR", "details": None},
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "message": "Request validation failed",
            "error": {"code": "VALIDATION_ERROR", "details": exc.errors()},
        },
    )


@app.get("/", dependencies=[Depends(verify_api_key)])
def root():
    return {
        "success": True,
        "message": "Fraud AI Engine Running",
        "health": "/health",
        "predict": "/predict",
        "train": "/train",
    }


app.include_router(fraud_router, tags=["fraud"])
app.include_router(fraud_router, prefix="/api/fraud", tags=["fraud-compat"])
app.include_router(platform_router)
app.include_router(platform_router, prefix="/api", tags=["ai-platform-compat"])
