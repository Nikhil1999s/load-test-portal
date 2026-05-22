from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine
import models
from routes import lobs, apis, mappings, runs, reports, thresholds, suites, performance

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Load Test Portal", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(lobs.router)
app.include_router(apis.router)
app.include_router(mappings.router)
app.include_router(runs.router)
app.include_router(reports.router)
app.include_router(thresholds.router)
app.include_router(suites.router)
app.include_router(performance.router)

@app.get("/")
def root():
    return {"status": "ok", "message": "Load Test Portal API"}

@app.get("/health")
def health():
    return {"status": "healthy"}
