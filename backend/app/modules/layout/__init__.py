"""Layout module: per-user dashboard widget layout and theme.

One row per user holding a JSON blob (which widgets are shown, in what order,
and the chosen theme). Scoped by user id like everything else; reconciled with
the offline client via last-write-wins on `updated_at`.
"""
