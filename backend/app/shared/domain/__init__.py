"""Pure, framework-free domain core.

Nothing in this package may import FastAPI, SQLModel, or any I/O. These are the
budgeting rules and the Money value object — the actual product — kept clean so
they can be tested in isolation and mirror the frontend core exactly
(see ARCHITECTURE.md, "What DDD-lite keeps").
"""
