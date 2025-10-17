from typing import Annotated

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.params import Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.api import documents
from src.backend.api import invites
from src.backend.config import settings
from src.backend.db import get_db
from src.backend.api import auth
from src.backend.api import rooms


app = FastAPI(title="LockBox", version="0.1.0", debug=True)

origins = [
    settings.FRONTEND_BASE.rstrip("/"),  # from your .env, e.g. http://localhost:3000
    "http://localhost:3000",
    "https://localhost:3000",
]

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/db-test")
async def db_test(db: Annotated[AsyncSession, Depends(get_db)]):
    result = await db.execute(text("SELECT 1"))
    return {"result": result.scalar()}
