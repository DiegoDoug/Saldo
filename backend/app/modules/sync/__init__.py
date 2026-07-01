"""Sync module: reconcile the offline Dexie store with the server.

Two endpoints — push (client → server) and pull (server → client) — with
last-write-wins conflict resolution on `updated_at`. This is the "source of
truth across devices" seam described in ARCHITECTURE.md; the on-device source of
truth stays Dexie. Deletions travel as tombstones (`deleted=True`) so an offline
delete is not silently lost.
"""
