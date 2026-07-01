"""Budgeting module: categories, entries, and month/year summaries.

Everything here is a vertical slice — models, schemas, queries, routes — and
every query that reads or writes user data is scoped by the authenticated
user's id (see `dependencies.CurrentUser`). The summary endpoints delegate all
arithmetic to the pure domain core in `app/shared/domain/budgeting.py`.
"""
