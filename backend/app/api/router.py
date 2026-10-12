from fastapi import APIRouter

from . import auth, chat, collections, dashboard, documents, jobs, notes, search, tools

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(documents.router)
api_router.include_router(jobs.router)
api_router.include_router(chat.router)
api_router.include_router(search.router)
api_router.include_router(collections.router)
api_router.include_router(notes.router)
api_router.include_router(tools.router)
api_router.include_router(dashboard.router)