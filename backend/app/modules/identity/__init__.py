"""Identity module: users, registration, login, JWT sessions.

Thin wiring around fastapi-users. The one thing downstream modules import from
here is the protected-route dependency in `dependencies.py` — every query that
touches user data scopes by `current_active_user.id`.
"""
