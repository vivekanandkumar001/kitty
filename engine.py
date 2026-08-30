"""
Core money-calculation engine. Everything here works in integer minor units
(paise) to avoid floating-point drift. This module has no Flask dependency
so it can be unit-tested in isolation.
"""


class SplitError(ValueError):
    pass


def split_equal(amount_minor, user_ids):
    """Deterministic remainder distribution: sorted user_ids get the extra
    paisa first, so re-running with the same inputs always gives the same
    result (important for audit trails)."""
    if not user_ids:
        raise SplitError("At least one member must be included in the split.")
    n = len(user_ids)
    base = amount_minor // n
    remainder = amount_minor - base * n
    ordered = sorted(user_ids)
    result = {}
    for i, uid in enumerate(ordered):
        result[uid] = base + (1 if i < remainder else 0)
    assert sum(result.values()) == amount_minor
    return result


def split_custom(amount_minor, shares):
    """shares: {user_id: amount_minor}. Must sum exactly to amount_minor."""
    if not shares:
        raise SplitError("At least one member must be included in the split.")
    total = sum(shares.values())
    if total != amount_minor:
        raise SplitError(f"Custom split amounts sum to {total}, expected {amount_minor}.")
    return dict(shares)


def split_percentage(amount_minor, percentages):
    """percentages: {user_id: percent (0-100, may be fractional)}. Must sum to 100."""
    if not percentages:
        raise SplitError("At least one member must be included in the split.")
    total_pct = sum(percentages.values())
    if abs(total_pct - 100) > 0.01:
        raise SplitError(f"Percentages sum to {total_pct}, expected 100.")
    ordered = sorted(percentages.keys())
    result = {}
    running = 0
    for i, uid in enumerate(ordered):
        if i == len(ordered) - 1:
            # last member absorbs any rounding remainder — deterministic, ledger stays balanced
            result[uid] = amount_minor - running
        else:
            share = int(round(amount_minor * percentages[uid] / 100))
            result[uid] = share
            running += share
    assert sum(result.values()) == amount_minor
    return result


def split_attendance(amount_minor, present_user_ids):
    """Equal split among only the members marked present."""
    if not present_user_ids:
        raise SplitError("At least one member must be marked present.")
    return split_equal(amount_minor, present_user_ids)


def compute_split(split_type, amount_minor, **kwargs):
    if split_type == "equal":
        return split_equal(amount_minor, kwargs["user_ids"])
    if split_type == "custom":
        return split_custom(amount_minor, kwargs["shares"])
    if split_type == "percentage":
        return split_percentage(amount_minor, kwargs["percentages"])
    if split_type == "attendance":
        return split_attendance(amount_minor, kwargs["present_user_ids"])
    raise SplitError(f"Unknown split type: {split_type}")


# ---------------------------------------------------------------------------
# Balance calculation
# ---------------------------------------------------------------------------
def compute_balances(expenses, splits_by_expense, settlements, member_user_ids):
    """
    Returns {user_id: net_balance_minor}.
    Positive = this member is owed money (creditor).
    Negative = this member owes money (debtor).

    balance[u] = (sum of expenses u paid) - (sum of u's splits across all expenses)
                 + (settlements u sent) - (settlements u received)
    """
    balance = {uid: 0 for uid in member_user_ids}

    for exp in expenses:
        if exp.deleted:
            continue
        balance[exp.paid_by] = balance.get(exp.paid_by, 0) + exp.amount_minor
        for split in splits_by_expense.get(exp.id, []):
            balance[split.user_id] = balance.get(split.user_id, 0) - split.amount_minor

    for s in settlements:
        balance[s.from_user] = balance.get(s.from_user, 0) + s.amount_minor
        balance[s.to_user] = balance.get(s.to_user, 0) - s.amount_minor

    return balance


# ---------------------------------------------------------------------------
# Debt simplification — greedy max-creditor / max-debtor matching
# ---------------------------------------------------------------------------
def simplify_debts(balances):
    """
    balances: {user_id: net_balance_minor}
    Returns a list of {"from": user_id, "to": user_id, "amount_minor": int}
    representing the minimum-ish set of payments that clears all balances.

    Deterministic: ties broken by user_id so the same input always produces
    the same transaction list.
    """
    creditors = []  # (balance, user_id) — owed money
    debtors = []    # (balance, user_id) — owe money
    for uid, bal in balances.items():
        if bal > 0:
            creditors.append([bal, uid])
        elif bal < 0:
            debtors.append([-bal, uid])  # store as positive "owes" amount

    creditors.sort(key=lambda x: (-x[0], x[1]))
    debtors.sort(key=lambda x: (-x[0], x[1]))

    transactions = []
    i, j = 0, 0
    while i < len(debtors) and j < len(creditors):
        debtor_amt, debtor_id = debtors[i]
        creditor_amt, creditor_id = creditors[j]
        pay = min(debtor_amt, creditor_amt)
        if pay > 0:
            transactions.append({"from": debtor_id, "to": creditor_id, "amount_minor": pay})
        debtors[i][0] -= pay
        creditors[j][0] -= pay
        if debtors[i][0] == 0:
            i += 1
        if creditors[j][0] == 0:
            j += 1
    return transactions
