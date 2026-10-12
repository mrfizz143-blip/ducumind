from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth ----------
class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(ORMModel):
    id: int
    email: str
    full_name: str


# ---------- Documents ----------
class DocumentOut(ORMModel):
    id: int
    title: str
    original_filename: str
    file_type: str
    size_bytes: int
    status: str
    error_message: str
    author: str
    page_count: int
    duration_seconds: float
    language: str
    embedding_count: int
    created_at: object
    updated_at: object


class DocumentDetail(DocumentOut):
    extracted_text: str = ""
    toc_json: str = "[]"
    metadata_json: str = "{}"


class ChunkOut(ORMModel):
    id: int
    document_id: int
    chunk_index: int
    content: str
    page: int
    section: str
    timestamp: float
    score: float = 0


# ---------- Jobs ----------
class JobOut(ORMModel):
    id: int
    document_id: int
    stage: str
    progress: int
    detail: str
    status: str
    error: str
    created_at: object
    updated_at: object


# ---------- Collections ----------
class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    color: str = "indigo"


class CollectionOut(ORMModel):
    id: int
    name: str
    description: str
    color: str
    created_at: object
    document_count: int = 0


class CollectionDetail(CollectionOut):
    documents: list[DocumentOut] = []


# ---------- Notes ----------
class NoteCreate(BaseModel):
    title: str = "Untitled note"
    body: str = ""
    color: str = "paper"
    pinned: bool = False
    source_ids: list[int] = []


class NoteUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    color: str | None = None
    pinned: bool | None = None


class NoteSourceOut(ORMModel):
    document_id: int
    document_title: str = ""
    chunk_id: int
    page: int
    excerpt: str


class NoteOut(ORMModel):
    id: int
    title: str
    body: str
    color: str
    pinned: bool
    created_at: object
    updated_at: object
    source_count: int = 0


class NoteDetail(NoteOut):
    sources: list[NoteSourceOut] = []


# ---------- Conversations ----------
class ConversationOut(ORMModel):
    id: int
    title: str
    context_document_ids: str
    created_at: object
    updated_at: object


class MessageOut(ORMModel):
    id: int
    role: str
    content: str
    answer_html: str
    citations_json: str
    sources_json: str
    created_at: object


class ChatRequest(BaseModel):
    conversation_id: int | None = None
    message: str = Field(min_length=1, max_length=4000)
    document_ids: list[int] = Field(default_factory=list)
    top_k: int = Field(default=6, ge=1, le=20)
    threshold: float = Field(default=0.0, ge=0.0, le=1.0)


# ---------- Search ----------
class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    semantic: bool = True
    keyword: bool = True
    file_types: list[str] | None = None
    collection_id: int | None = None
    document_id: int | None = None
    date_from: str | None = None
    date_to: str | None = None
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


# ---------- Tools ----------
class SummarizeRequest(BaseModel):
    document_id: int
    length: str = "medium"  # short | medium | detailed


class CompareRequest(BaseModel):
    document_a_id: int
    document_b_id: int


class ExtractRequest(BaseModel):
    document_id: int
    kind: str  # findings | methodology | objectives | results


class SimilarRequest(BaseModel):
    document_id: int
    top_k: int = 5


class ExplainRequest(BaseModel):
    chunk_id: int
    document_id: int


class LiteratureRequest(BaseModel):
    document_ids: list[int]
    focus: str = ""


class NotesRequest(BaseModel):
    document_ids: list[int]
    prompt: str = ""


# ---------- Misc ----------
class Message(BaseModel):
    message: str


AuthResponse.model_rebuild()
