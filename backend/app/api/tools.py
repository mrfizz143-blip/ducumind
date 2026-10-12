from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import (
    CompareRequest,
    ExplainRequest,
    ExtractRequest,
    LiteratureRequest,
    NotesRequest,
    SimilarRequest,
    SummarizeRequest,
)
from ..services import tools_service

router = APIRouter(prefix="/api/tools", tags=["research-tools"])


@router.post("/summarize")
def summarize(payload: SummarizeRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return tools_service.summarize_document(db, user, payload.document_id, payload.length)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/compare")
def compare(payload: CompareRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return tools_service.compare_documents(db, user, payload.document_a_id, payload.document_b_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/extract")
def extract(payload: ExtractRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.kind not in ("findings", "methodology", "objectives", "results"):
        raise HTTPException(422, "kind must be one of findings|methodology|objectives|results")
    try:
        return tools_service.extract_kind(db, user, payload.document_id, payload.kind)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/similar")
def similar(payload: SimilarRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return tools_service.find_similar(db, user, payload.document_id, payload.top_k)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/explain")
def explain(payload: ExplainRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return tools_service.explain_passage(db, user, payload.chunk_id, payload.document_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/references")
def references(payload: NotesRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"references": tools_service.generate_references(db, user, payload.document_ids)}


@router.post("/literature-review")
def literature_review(payload: LiteratureRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return tools_service.literature_review(db, user, payload.document_ids, payload.focus)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/research-notes")
def research_notes(payload: NotesRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return tools_service.generate_research_notes(db, user, payload.document_ids, payload.prompt)
    except ValueError as exc:
        raise HTTPException(404, str(exc))