"""Money-safe rounding, shared across the domain core.

Mirrors the prototype's `round2` from reference/Presupuesto.tsx *exactly*,
including JavaScript's `Math.round` half-up semantics, so the Python and
TypeScript cores produce identical figures for identical inputs.

Do NOT replace this with Python's built-in `round()`: `round()` uses banker's
rounding (round-half-to-even), which would diverge from the frontend on values
like 0.125 (banker's → 0.12; this function → 0.13, matching JS).
"""

import math
import sys

# 2.220446049250313e-16 — identical to JavaScript's Number.EPSILON (both are the
# IEEE-754 double epsilon). The prototype nudges by this before rounding.
EPSILON = sys.float_info.epsilon


def round2(n: float) -> float:
    """Round to 2 decimals the way `Math.round((n + EPSILON) * 100) / 100` does.

    JS `Math.round(y)` is `floor(y + 0.5)` (half rounds toward +infinity), which
    we reproduce here so both language cores agree to the cent.
    """
    return math.floor((n + EPSILON) * 100 + 0.5) / 100
