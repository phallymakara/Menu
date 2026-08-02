from fastapi import FastAPI

app = FastAPI(
    title="មីនុយ-Menu API",
    version="0.1.0",
)


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "name": "មីនុយ-Menu API",
        "status": "running",
    }


@app.get("/api/v1/health")
async def health_check() -> dict[str, str]:
    return {
        "status": "healthy",
    }