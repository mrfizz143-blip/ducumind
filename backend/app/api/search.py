from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import SearchHistoryEntry, User
from ..schemas import SearchRequest
from ..services.search_service import search_all

router = APIRouter(prefix="/api/search", tags=["search"])


@router.post("")
def search(payload: SearchRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = search_all(
        db,
        user,
        payload.query,
        semantic=payload.semantic,
        keyword=payload.keyword,
        file_types=payload.file_types,
        collection_id=payload.collection_id,
        document_id=payload.document_id,
        date_from=payload.date_from,
        date_to=payload.date_to,
        limit=payload.limit,
        offset=payload.offset,
    )
    db.add(SearchHistoryEntry(owner_id=user.id, query=payload.query, result_count=result["total"]))
    db.commit()
    return result


@router.get("/history")
def search_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(SearchHistoryEntry).filter(SearchHistoryEntry.owner_id == user.id).order_by(
        SearchHistoryEntry.created_at.desc()
    ).limit(30).all()
    return [{"query": r.query, "result_count": r.result_count, "created_at": str(r.created_at)} for r in rows]