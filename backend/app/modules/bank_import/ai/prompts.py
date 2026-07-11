"""Prompt templates for DeepSeek bank-statement parsing.

Kept separate from `deepseek_provider.py` so the prompt can be iterated on — and
regression-tested against fixture statement text — without touching the HTTP
client. Mirrors `receipt_import/ai/prompts.py`'s structure (a strict JSON schema
in the system prompt, per-request context + the file text in the user prompt).
"""

import json

from app.modules.bank_import.ai.base import BankExtractionContext

SYSTEM_PROMPT = """\
You are a bank-statement parsing engine for Saldo, a personal finance app whose \
domain vocabulary is Spanish: movimientos (transactions), cuentas (accounts), \
categorias (categories), comercios (merchants), etiquetas (tags) and recibos \
(recurring bills).

You will be given the text of a bank statement exported as CSV or Markdown. \
Columns and formats vary by bank; infer which column is the date, the \
description/concept, and the amount. Amounts may use "." or "," as the decimal \
separator and may be split across debit/credit columns or carry a sign.

Return ONLY a single JSON object matching the schema below. No prose, no \
markdown code fences, no explanation before or after the JSON.

Schema:
{
  "bank_name": string | null,
  "currency": string | null,             // ISO 4217, e.g. "EUR", "USD", "MXN"
  "movements": [{
    "date": string | null,               // ISO 8601 YYYY-MM-DD
    "description": string | null,
    "type": "income" | "expense" | "transfer",
    "amount": number | null,             // POSITIVE magnitude; sign lives in "type"
    "currency": string | null,
    "account_id": string | null,         // an existing account id, if this row belongs to one
    "account_name": string | null,       // else a proposed account name
    "transfer_account_id": string | null,   // transfers only: the OTHER account, if it exists
    "transfer_account_name": string | null, // transfers only: else the other account's new name
    "category_id": string | null,        // an existing category id, if a good match exists
    "category_name": string | null,      // a short new-category suggestion, only if no id matches
    "merchant_id": string | null,        // an existing merchant id, if the concept is a known one
    "merchant_name": string | null,      // else a proposed merchant name
    "tags": [string],
    "is_recurring": boolean,             // true if this looks like a periodic bill (a "recibo")
    "notes": string | null,
    "confidence": number | null          // 0.0-1.0 for this row
  }],
  "new_accounts":   [{ "name": string, "kind": string | null }],
  // account kind: checking|savings|cash|credit_card|investment|crypto
  "new_categories": [{ "name": string, "kind": string | null }],  // kind: income|fixed|variable
  "new_merchants":  [{ "name": string, "kind": null }],
  "new_tags":       [{ "name": string, "kind": null }],
  "warnings": [string],
  "overall_confidence": number | null
}

Rules:
- Convert every amount to a positive number and set "type" from its sign \
(money leaving the account -> "expense", money arriving -> "income"). Movements \
between two of the user's own accounts are "transfer": put the account the \
money leaves in "account_id"/"account_name" and the account it arrives in in \
"transfer_account_id"/"transfer_account_name", and report the transfer only \
once rather than as two mirrored rows.
- Prefer matching a row to an existing account/category/merchant by returning \
its id over inventing a new one. Only populate the *_name fields (and the \
new_* arrays) for entities that genuinely don't exist yet.
- Every proposed new entity you reference from a movement MUST also appear once \
in the matching new_* array, so the client can create it before the movements.
- Confidence honesty: if a row is ambiguous or a column is unreadable, lower \
its confidence and add a note to "warnings" rather than fabricating values.
"""

_FEW_SHOT_TEXT = (
    "Fecha,Concepto,Importe\n"
    "2026-06-01,NOMINA ACME SL,1800.00\n"
    "2026-06-03,MERCADONA MADRID,-42.15\n"
    "2026-06-05,NETFLIX,-13.99\n"
)

_FEW_SHOT_RESPONSE = {
    "bank_name": None,
    "currency": "EUR",
    "movements": [
        {
            "date": "2026-06-01",
            "description": "NOMINA ACME SL",
            "type": "income",
            "amount": 1800.00,
            "currency": "EUR",
            "account_id": None,
            "account_name": "Cuenta principal",
            "category_id": None,
            "category_name": "Nomina",
            "merchant_id": None,
            "merchant_name": "Acme SL",
            "tags": [],
            "is_recurring": True,
            "notes": None,
            "confidence": 0.9,
        },
        {
            "date": "2026-06-03",
            "description": "MERCADONA MADRID",
            "type": "expense",
            "amount": 42.15,
            "currency": "EUR",
            "account_id": None,
            "account_name": "Cuenta principal",
            "category_id": None,
            "category_name": "Supermercado",
            "merchant_id": None,
            "merchant_name": "Mercadona",
            "tags": [],
            "is_recurring": False,
            "notes": None,
            "confidence": 0.92,
        },
        {
            "date": "2026-06-05",
            "description": "NETFLIX",
            "type": "expense",
            "amount": 13.99,
            "currency": "EUR",
            "account_id": None,
            "account_name": "Cuenta principal",
            "category_id": None,
            "category_name": "Suscripciones",
            "merchant_id": None,
            "merchant_name": "Netflix",
            "tags": [],
            "is_recurring": True,
            "notes": None,
            "confidence": 0.95,
        },
    ],
    "new_accounts": [{"name": "Cuenta principal", "kind": "checking"}],
    "new_categories": [
        {"name": "Nomina", "kind": "income"},
        {"name": "Supermercado", "kind": "variable"},
        {"name": "Suscripciones", "kind": "fixed"},
    ],
    "new_merchants": [
        {"name": "Acme SL", "kind": None},
        {"name": "Mercadona", "kind": None},
        {"name": "Netflix", "kind": None},
    ],
    "new_tags": [],
    "warnings": [],
    "overall_confidence": 0.92,
}


def build_user_prompt(file_text: str, context: BankExtractionContext) -> str:
    lines = [
        f"Today's date: {context.today.isoformat()}",
        f"User's default currency: {context.default_currency}",
    ]
    if context.accounts:
        lines.append("Existing accounts (id: name [currency, type]):")
        lines += [f"- {a.id}: {a.name} [{a.currency}, {a.type}]" for a in context.accounts]
    if context.categories:
        lines.append("Existing categories (id: name [kind]):")
        lines += [f"- {c.id}: {c.name} [{c.kind}]" for c in context.categories]
    if context.merchants:
        lines.append("Existing merchants (id: name):")
        lines += [f"- {m.id}: {m.name}" for m in context.merchants]
    if context.tags:
        lines.append("Existing tags: " + ", ".join(t.name for t in context.tags))

    lines.append("\nWorked example.")
    lines.append(f"Statement text:\n{_FEW_SHOT_TEXT}")
    lines.append(f"Expected JSON:\n{json.dumps(_FEW_SHOT_RESPONSE, ensure_ascii=False)}")

    lines.append("\nNow parse this statement's text:")
    lines.append(file_text)
    return "\n".join(lines)
