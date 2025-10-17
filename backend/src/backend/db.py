from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from src.backend.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=True, future=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


# Dependency for FastAPI
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
