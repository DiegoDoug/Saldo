"""Builds the `DraftBankAnalysis` the frontend renders.

Reconciles each raw movement against the user's real data: an id the model
returned is only trusted if it actually belongs to the user (an unknown or
hallucinated id is dropped and demoted to a name-based `*_ref` proposal). The
proposed-entity lists are then rebuilt from what the reconciled movements
reference, so the client always has a create-first list that exactly covers the
new entities the movements need — no orphan proposals, no missing ones.
"""

import uuid

from app.modules.bank_import.ai.base import BankExtractionContext, RawBankExtraction, RawMovement
from app.modules.bank_import.schemas import DraftBankAnalysis, DraftMovement, ProposedEntity

_VALID_TYPES = {"income", "expense", "transfer"}


def build(raw: RawBankExtraction, context: BankExtractionContext) -> DraftBankAnalysis:
    known_accounts = {a.id for a in context.accounts}
    known_categories = {c.id for c in context.categories}
    known_merchants = {m.id for m in context.merchants}

    movements = [
        _reconcile(m, known_accounts, known_categories, known_merchants) for m in raw.movements
    ]
    existing_tags = {t.name.casefold() for t in context.tags}

    return DraftBankAnalysis(
        bank_name=raw.bank_name,
        currency=raw.currency or context.default_currency,
        movements=movements,
        new_accounts=_dedupe(m.account_ref for m in movements),
        new_categories=_categories_from(movements, raw),
        new_merchants=_dedupe(m.merchant_ref for m in movements),
        new_tags=_new_tags(movements, existing_tags),
        warnings=raw.warnings,
        overall_confidence=_overall(raw, movements),
    )


def _reconcile(
    m: RawMovement,
    accounts: set[uuid.UUID],
    categories: set[uuid.UUID],
    merchants: set[uuid.UUID],
) -> DraftMovement:
    account_id = m.account_id if m.account_id in accounts else None
    category_id = m.category_id if m.category_id in categories else None
    merchant_id = m.merchant_id if m.merchant_id in merchants else None
    return DraftMovement(
        date=m.date,
        description=m.description,
        type=m.type if m.type in _VALID_TYPES else "expense",
        amount=abs(m.amount) if m.amount is not None else None,
        currency=m.currency,
        account_id=account_id,
        account_ref=None if account_id else (m.account_name or None),
        category_id=category_id,
        category_ref=None if category_id else (m.category_name or None),
        merchant_id=merchant_id,
        merchant_ref=None if merchant_id else (m.merchant_name or None),
        tags=[t for t in m.tags if t.strip()],
        is_recurring=m.is_recurring,
        notes=m.notes,
        confidence=_clamp(m.confidence),
    )


def _dedupe(names) -> list[ProposedEntity]:
    seen: dict[str, ProposedEntity] = {}
    for name in names:
        if name and name.casefold() not in seen:
            seen[name.casefold()] = ProposedEntity(name=name)
    return list(seen.values())


def _categories_from(
    movements: list[DraftMovement], raw: RawBankExtraction
) -> list[ProposedEntity]:
    """Categories carry a `kind`, so keep the model's proposed kind where the
    referenced name matches, defaulting to "variable" for anything left over."""
    kinds = {c.name.casefold(): (c.kind or "variable") for c in raw.new_categories}
    seen: dict[str, ProposedEntity] = {}
    for m in movements:
        if m.category_ref and m.category_ref.casefold() not in seen:
            key = m.category_ref.casefold()
            seen[key] = ProposedEntity(name=m.category_ref, kind=kinds.get(key, "variable"))
    return list(seen.values())


def _new_tags(movements: list[DraftMovement], existing: set[str]) -> list[ProposedEntity]:
    seen: dict[str, ProposedEntity] = {}
    for m in movements:
        for tag in m.tags:
            key = tag.casefold()
            if key not in existing and key not in seen:
                seen[key] = ProposedEntity(name=tag)
    return list(seen.values())


def _overall(raw: RawBankExtraction, movements: list[DraftMovement]) -> float:
    if raw.overall_confidence is not None:
        return _clamp(raw.overall_confidence) or 0.0
    scored = [m.confidence for m in movements if m.confidence is not None]
    return round(sum(scored) / len(scored), 2) if scored else 0.0


def _clamp(value: float | None) -> float | None:
    if value is None:
        return None
    return max(0.0, min(1.0, value))
