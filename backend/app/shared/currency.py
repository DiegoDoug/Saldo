"""Foreign-exchange conversion via the Frankfurter API.

Frankfurter is free, keyless, and sourced from European Central Bank reference
rates (see TECH_STACK.md). Rates are cached per (base, target) for the current
day, so a user who mixes currencies triggers at most one request per pair per
day, and a user who never mixes currencies triggers none.

The provider is injected as a FastAPI dependency (`get_fx_provider`) so tests
can substitute a deterministic stub instead of hitting the network.
"""

from datetime import date

import httpx

FRANKFURTER_BASE_URL = "https://api.frankfurter.app"


class FxRateProvider:
    """Daily-cached FX rate lookup."""

    def __init__(self) -> None:
        # (base, target) -> (as_of_day, rate)
        self._cache: dict[tuple[str, str], tuple[date, float]] = {}

    async def get_rate(self, base: str, target: str) -> float:
        base, target = base.upper(), target.upper()
        if base == target:
            return 1.0

        today = date.today()
        cached = self._cache.get((base, target))
        if cached is not None and cached[0] == today:
            return cached[1]

        rate = await self._fetch(base, target)
        self._cache[(base, target)] = (today, rate)
        return rate

    async def _fetch(self, base: str, target: str) -> float:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{FRANKFURTER_BASE_URL}/latest",
                params={"from": base, "to": target},
            )
            resp.raise_for_status()
            data = resp.json()
        try:
            return float(data["rates"][target])
        except (KeyError, TypeError, ValueError) as exc:  # pragma: no cover - network shape
            raise ValueError(f"Unexpected FX response for {base}->{target}: {data}") from exc


# Process-wide singleton so the daily cache is shared across requests.
_provider = FxRateProvider()


def get_fx_provider() -> FxRateProvider:
    """FastAPI dependency yielding the shared FX provider (overridable in tests)."""
    return _provider
