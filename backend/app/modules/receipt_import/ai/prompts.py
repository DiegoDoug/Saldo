"""Prompt templates for DeepSeek receipt extraction (Phase 8 of the brief).

Kept separate from `deepseek_provider.py` so the prompt itself can be iterated
on — and regression-tested against fixture OCR text — without touching the
HTTP client code. See docs/receipt-import/05-ai-integration-design.md §4.
"""

import json

from app.modules.receipt_import.ai.base import ExtractionContext

SYSTEM_PROMPT = """\
You are a receipt-data extraction engine for Saldo, a personal finance app.
You will be given OCR text read from a photo of a purchase receipt. The OCR \
text may contain scanning errors: confused characters, missing line breaks, \
or truncated lines.

Return ONLY a single JSON object matching the schema below. No prose, no \
markdown code fences, no explanation before or after the JSON.

Schema:
{
  "merchant_name": string | null,
  "date": string | null,          // ISO 8601 YYYY-MM-DD
  "currency": string | null,      // ISO 4217, e.g. "USD", "EUR", "MXN"
  "total": number | null,
  "tax": number | null,
  "payment_method": string | null,
  "address": string | null,
  "receipt_number": string | null,
  "possible_category_id": string | null,   // one of the given category ids, if a good match exists
  "possible_category_name": string | null, // a short new-category suggestion, only if no id matches
  "possible_merchant_id": string | null,   // one of the given merchant ids, if this
                                            // looks like the same merchant under a
                                            // different spelling
  "notes": string | null,
  "confidence": { "<field name above>": number },  // 0.0-1.0 for each field you populated
  "warnings": [string],       // e.g. "OCR text looked truncated near the total"
  "missing_fields": [string]  // fields you could not determine
}

Priority order when the receipt is ambiguous or partially unreadable: \
merchant, date, currency, total, tax, payment method, address, receipt \
number, category, notes.

OCR-error resilience: OCR commonly confuses O/0, l/1/I, and S/5. Use numeric \
context to resolve these. The total is usually the largest amount on a line \
containing a word like TOTAL, AMOUNT DUE, or BALANCE — prefer that over the \
largest number anywhere on the receipt (which is sometimes a suggested-tip \
table, not the total). If the OCR text looks garbled or cut off, say so in \
"warnings" rather than guessing at what surrounds it.

Confidence honesty: if you are not reasonably certain of a field's value, set \
its confidence below 0.5 and add the field's name to "missing_fields" rather \
than fabricating a plausible-looking value. A field with a value and a \
confidence above 0.5 is treated as a claim worth acting on without a second \
human look.
"""

_FEW_SHOT_OCR_TEXT = (
    "STARBUCKS #04521\n123 MAIN ST\n07/O6/2O26\n"
    "GRANDE LATTE     4.95\nTAX              0.4O\n"
    "T0TAL            5.35\nVISA ****1234\n"
)

_FEW_SHOT_RESPONSE = {
    "merchant_name": "Starbucks",
    "date": "2026-07-06",
    "currency": "USD",
    "total": 5.35,
    "tax": 0.40,
    "payment_method": "VISA •••1234",
    "address": "123 Main St",
    "receipt_number": None,
    "possible_category_id": None,
    "possible_category_name": "Cafeterias",
    "possible_merchant_id": None,
    "notes": None,
    "confidence": {
        "merchant_name": 0.95,
        "date": 0.85,
        "currency": 0.9,
        "total": 0.95,
        "tax": 0.85,
        "payment_method": 0.7,
        "address": 0.8,
    },
    "warnings": ["OCR confused several 0/O and 1/l characters; resolved via numeric context"],
    "missing_fields": ["receipt_number"],
}


def build_user_prompt(ocr_text: str, context: ExtractionContext) -> str:
    """Assemble the per-request prompt: today's date and currency default,
    the user's own categories/merchants (so semantic matching rides in this
    same call — docs/receipt-import/05 §5), a worked example, then the OCR
    text to extract from.
    """
    lines = [
        f"Today's date: {context.today.isoformat()}",
        f"User's default currency: {context.default_currency}",
    ]
    if context.categories:
        lines.append("Existing categories (id: name [kind]):")
        lines += [f"- {c.id}: {c.name} [{c.kind}]" for c in context.categories]
    if context.recent_merchants:
        lines.append("Recently used merchants (id: name):")
        lines += [f"- {m.id}: {m.name}" for m in context.recent_merchants]

    lines.append("\nWorked example.")
    lines.append(f"OCR text:\n{_FEW_SHOT_OCR_TEXT}")
    lines.append(f"Expected JSON:\n{json.dumps(_FEW_SHOT_RESPONSE, ensure_ascii=False)}")

    lines.append("\nNow extract from this receipt's OCR text:")
    lines.append(ocr_text)
    return "\n".join(lines)
