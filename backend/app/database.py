from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


def _make_engine():
    url = settings.DATABASE_URL
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
        if url == "sqlite://":
            url = "sqlite:///./marginalia.db"
        if url.startswith("sqlite:///./") and "marginalia" in url:
            pass
    engine = create_engine(
        url,
        echo=False,
        connect_args=connect_args,
        pool_pre_ping=True,
    )
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
    return engine


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def init_db() -> None:
    from . import models  # noqa: F401

    if settings.is_postgres:
        _enable_pgvector()  # must exist before the embeddings table is created
    Base.metadata.create_all(bind=engine)


def _enable_pgvector() -> None:
    try:
        with engine.connect() as conn:
            conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
            conn.commit()
    except Exception as exc:
        print(f"[database] could not enable pgvector extension: {exc}")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
