"""End-to-end smoke test for the Marginalia RAG backend.

Run from the backend directory:
    python smoke_test.py
"""

import io
import os
import sys
import time

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_marginalia.db")
os.environ.setdefault("SECRET_KEY", "test-key")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PASS = 0
FAIL = 0


def check(name: str, cond: bool, extra: str = ""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}  {extra}")


def main():
    with TestClient(app) as client:

        print("== Health ==")
        r = client.get("/")
        check("root", r.status_code == 200)

        print("== Auth ==")
        email = "demo@marginalia.io"
        r = client.post("/api/auth/register", json={"email": email, "full_name": "Demo Researcher", "password": "password123"})
        if r.status_code == 409:
            r = client.post("/api/auth/login", json={"email": email, "password": "password123"})
        check("register/login", r.status_code in (200, 201))
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        check("me", client.get("/api/auth/me", headers=headers).status_code == 200)

        samples = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "samples")
        files = [
            ("france_overview.txt", "text/plain"),
            ("france_history.txt", "text/plain"),
            ("european_capitals.pdf", "application/pdf"),
        ]

        print("== Upload + Processing Pipeline ==")
        doc_ids = {}
        for fname, mime in files:
            with open(os.path.join(samples, fname), "rb") as fh:
                data = fh.read()
            r = client.post(
                "/api/documents/upload",
                headers=headers,
                files={"file": (fname, io.BytesIO(data), mime)},
            )
            check(f"upload {fname}", r.status_code == 201)
            job_id = r.json()["job_id"]
            doc_id = r.json()["document_id"]
            doc_ids[fname] = doc_id

            deadline = time.time() + 120
            final = None
            while time.time() < deadline:
                jr = client.get(f"/api/jobs/{job_id}", headers=headers)
                final = jr.json()
                if final["status"] in ("completed", "failed"):
                    break
                time.sleep(0.5)
            check(f"job completed {fname}", final["status"] == "completed", f"-> {final.get('error')}")
            dr = client.get(f"/api/documents/{doc_id}", headers=headers)
            check(f"doc ready {fname}", dr.json()["status"] == "ready")
            check(f"embeddings {fname}", dr.json()["embedding_count"] > 0, str(dr.json()["embedding_count"]))

        print("== RAG Chat ==")
        r = client.post(
            "/api/chat",
            headers=headers,
            json={"message": "What is the capital of France?", "top_k": 6},
        )
        body = r.json()
        answer = body["message"]["content"]
        check("chat ok", r.status_code == 200)
        check("answer mentions Paris", "Paris" in answer, answer[:200])
        check("has sources", len(body["sources"]) > 0)
        check("has citations", len(body["citations"]) > 0)
        if body["citations"]:
            c0 = body["citations"][0]
            check("citation has doc", bool(c0.get("document_title")), c0.get("document_title", ""))

        r = client.post(
            "/api/chat",
            headers=headers,
            json={"message": "What is the capital of the planet Krypton?"},
        )
        body = r.json()
        check(
            "insufficient evidence handling",
            "couldn't find sufficient evidence" in body["message"]["content"] or body["insufficient"],
            body["message"]["content"][:120],
        )

        print("== Search ==")
        r = client.post("/api/search", headers=headers, json={"query": "Mont Blanc highest peak", "limit": 10})
        body = r.json()
        check("search ok", r.status_code == 200)
        check("search returns passages", body["total"] > 0, str(body.get("total")))

        print("== Research Tools ==")
        id_a = doc_ids["france_overview.txt"]
        id_b = doc_ids["france_history.txt"]
        r = client.post("/api/tools/summarize", headers=headers, json={"document_id": id_a, "length": "medium"})
        check("summarize", r.status_code == 200 and len(r.json()["summary"]) > 50)
        r = client.post("/api/tools/compare", headers=headers, json={"document_a_id": id_a, "document_b_id": id_b})
        check("compare", r.status_code == 200 and r.json()["narrative"])
        r = client.post("/api/tools/extract", headers=headers, json={"document_id": id_a, "kind": "objectives"})
        check("extract", r.status_code == 200)
        r = client.post("/api/tools/similar", headers=headers, json={"document_id": id_a, "top_k": 3})
        check("similar", r.status_code == 200)
        r = client.post("/api/tools/references", headers=headers, json={"document_ids": [id_a, id_b]})
        check("references", r.status_code == 200 and len(r.json()["references"]) == 2)
        r = client.post("/api/tools/literature-review", headers=headers, json={"document_ids": [id_a, id_b], "focus": "geography"})
        check("literature review", r.status_code == 200 and r.json()["review"])
        r = client.post("/api/tools/research-notes", headers=headers, json={"document_ids": [id_a]})
        check("research notes", r.status_code == 200 and r.json()["notes"])

        print("== Collections ==")
        r = client.post("/api/collections", headers=headers, json={"name": "Europe", "color": "indigo"})
        check("collection create", r.status_code == 201)
        col_id = r.json()["id"]
        r = client.post(f"/api/collections/{col_id}/documents", headers=headers, params={"document_id": id_a})
        check("collection add doc", r.status_code == 200)
        r = client.get(f"/api/collections/{col_id}", headers=headers)
        check("collection detail", r.json()["document_count"] == 1)

        print("== Notes ==")
        r = client.post("/api/notes", headers=headers, json={"title": "Capital research", "body": "Paris is the capital.", "color": "paper"})
        check("note create", r.status_code == 201)
        note_id = r.json()["id"]
        r = client.patch(f"/api/notes/{note_id}", headers=headers, json={"pinned": True})
        check("note update", r.status_code == 200 and r.json()["pinned"] is True)

        print("== Dashboard ==")
        r = client.get("/api/dashboard", headers=headers)
        check("dashboard", r.status_code == 200 and r.json()["stats"]["documents"] >= 3)

        print("== Conversation history ==")
        r = client.get("/api/conversations", headers=headers)
        check("conversations list", r.status_code == 200 and len(r.json()) >= 1)

        print(f"\nRESULT: {PASS} passed, {FAIL} failed")
        sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()