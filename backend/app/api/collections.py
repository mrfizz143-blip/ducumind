from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Collection, CollectionDocument, Document, User
from ..schemas import CollectionCreate, CollectionDetail, CollectionOut, DocumentOut

router = APIRouter(prefix="/api/collections", tags=["collections"])


def _with_counts(db: Session, user: User) -> list[CollectionOut]:
    rows = db.execute(
        select(Collection, func.count(CollectionDocument.id).label("cnt"))
        .outerjoin(CollectionDocument, CollectionDocument.collection_id == Collection.id)
        .where(Collection.owner_id == user.id)
        .group_by(Collection.id)
        .order_by(Collection.created_at.desc())
    ).all()
    out = []
    for c, cnt in rows:
        item = CollectionOut.model_validate(c)
        item.document_count = cnt or 0
        out.append(item)
    return out


@router.get("", response_model=list[CollectionOut])
def list_collections(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _with_counts(db, user)


@router.post("", response_model=CollectionOut, status_code=201)
def create_collection(payload: CollectionCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = Collection(owner_id=user.id, name=payload.name.strip(), description=payload.description, color=payload.color)
    db.add(c)
    db.commit()
    db.refresh(c)
    out = CollectionOut.model_validate(c)
    out.document_count = 0
    return out


@router.get("/{collection_id}", response_model=CollectionDetail)
def get_collection(collection_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.scalar(select(Collection).where(Collection.id == collection_id, Collection.owner_id == user.id))
    if c is None:
        raise HTTPException(404, "Collection not found")
    docs = db.execute(
        select(Document)
        .join(CollectionDocument, CollectionDocument.document_id == Document.id)
        .where(CollectionDocument.collection_id == c.id)
        .order_by(CollectionDocument.added_at.desc())
    ).scalars().all()
    return CollectionDetail(
        id=c.id,
        name=c.name,
        description=c.description,
        color=c.color,
        created_at=c.created_at,
        document_count=len(docs),
        documents=[DocumentOut.model_validate(d) for d in docs],
    )


@router.patch("/{collection_id}", response_model=CollectionOut)
def update_collection(
    collection_id: int,
    payload: CollectionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.scalar(select(Collection).where(Collection.id == collection_id, Collection.owner_id == user.id))
    if c is None:
        raise HTTPException(404, "Collection not found")
    c.name = payload.name.strip()
    c.description = payload.description
    c.color = payload.color
    db.commit()
    db.refresh(c)
    out = CollectionOut.model_validate(c)
    cnt = db.scalar(select(func.count(CollectionDocument.id)).where(CollectionDocument.collection_id == c.id)) or 0
    out.document_count = cnt
    return out


@router.delete("/{collection_id}")
def delete_collection(collection_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.scalar(select(Collection).where(Collection.id == collection_id, Collection.owner_id == user.id))
    if c is None:
        raise HTTPException(404, "Collection not found")
    db.delete(c)
    db.commit()
    return {"status": "deleted"}


@router.post("/{collection_id}/documents")
def add_document(collection_id: int, document_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.scalar(select(Collection).where(Collection.id == collection_id, Collection.owner_id == user.id))
    doc = db.scalar(select(Document).where(Document.id == document_id, Document.owner_id == user.id))
    if c is None or doc is None:
        raise HTTPException(404, "Collection or document not found")
    exists = db.scalar(
        select(CollectionDocument).where(
            CollectionDocument.collection_id == c.id, CollectionDocument.document_id == doc.id
        )
    )
    if exists is None:
        db.add(CollectionDocument(collection_id=c.id, document_id=doc.id))
        db.commit()
    return {"status": "added"}


@router.delete("/{collection_id}/documents/{document_id}")
def remove_document(collection_id: int, document_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    link = db.scalar(
        select(CollectionDocument)
        .join(Collection, Collection.id == CollectionDocument.collection_id)
        .where(
            Collection.owner_id == user.id,
            CollectionDocument.collection_id == collection_id,
            CollectionDocument.document_id == document_id,
        )
    )
    if link is None:
        raise HTTPException(404, "Link not found")
    db.delete(link)
    db.commit()
    return {"status": "removed"}