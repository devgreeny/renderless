from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import settings
from routers import generate_router
from routers.render import router as render_router
from routers.chat import router as chat_router
from models import HealthResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 Renderless API starting...")
    print(f"📡 Running on http://{settings.host}:{settings.port}")
    print(f"🔑 OpenAI API Key: {'configured' if settings.openai_api_key else 'NOT SET'}")
    print(f"🔄 Replicate API: {'configured' if settings.replicate_api_token else 'NOT SET'}")
    yield
    # Shutdown
    print("👋 Renderless API shutting down...")


app = FastAPI(
    title="Renderless API",
    description="AI-powered architectural rendering API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware - allow all origins in development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for dev
    allow_credentials=False,  # Must be False when using "*"
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include routers
app.include_router(generate_router)
app.include_router(render_router)
app.include_router(chat_router)


@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check():
    """Health check endpoint"""
    return HealthResponse(status="healthy", version="0.1.0")


@app.get("/", tags=["root"])
async def root():
    """Root endpoint with API info"""
    return {
        "name": "Renderless API",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )

