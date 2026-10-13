"""Unit tests for the calculation engine.

All money is in integer paise. These tests verify split calculations,
balance computation, and debt simplification — the financial core of
RoomSplit. A bug here means real money errors.
"""

import pytest
from engine import (
    split_equal,
    split_custom,
    split_percentage,
    split_attendance,
    compute_split,
    compute_balances,
    simplify_debts,
    SplitError,
)


# ─── split_equal ─────────────────────────────────────────────────────────────

class TestSplitEqual:
    def test_basic_even_split(self):
        result = split_equal(300, [1, 2, 3])
        assert result == {1: 100, 2: 100, 3: 100}

    def test_remainder_distribution(self):
        # 100 paise / 3 = 33 remainder 1 — first sorted user gets extra
        result = split_equal(100, [1, 2, 3])
        assert result == {1: 34, 2: 33, 3: 33}
        assert sum(result.values()) == 100

    def test_remainder_two_extra(self):
        # 101 / 3 = 33 remainder 2 — first two sorted users get extra
        result = split_equal(101, [1, 2, 3])
        assert result == {1: 34, 2: 34, 3: 33}
        assert sum(result.values()) == 101

    def test_single_member(self):
        result = split_equal(500, [42])
        assert result == {42: 500}

    def test_large_amount(self):
        result = split_equal(100000, [1, 2, 3, 4])
        assert sum(result.values()) == 100000
        assert all(v == 25000 for v in result.values())

    def test_empty_raises(self):
        with pytest.raises(SplitError):
            split_equal(100, [])

    def test_deterministic(self):
        """Same input must always produce same output (auditability)."""
        r1 = split_equal(100, [3, 1, 2])
        r2 = split_equal(100, [3, 1, 2])
        assert r1 == r2

    def test_zero_amount(self):
        result = split_equal(0, [1, 2])
        assert result == {1: 0, 2: 0}


# ─── split_custom ────────────────────────────────────────────────────────────

class TestSplitCustom:
    def test_valid_custom_split(self):
        result = split_custom(500, {1: 200, 2: 300})
        assert result == {1: 200, 2: 300}

    def test_sum_mismatch_raises(self):
        with pytest.raises(SplitError, match="sum to 400"):
            split_custom(500, {1: 200, 2: 200})

    def test_empty_raises(self):
        with pytest.raises(SplitError):
            split_custom(100, {})

    def test_single_member_full_amount(self):
        result = split_custom(999, {7: 999})
        assert result == {7: 999}


# ─── split_percentage ────────────────────────────────────────────────────────

class TestSplitPercentage:
    def test_valid_percentage(self):
        result = split_percentage(1000, {1: 50, 2: 50})
        assert result == {1: 500, 2: 500}

    def test_uneven_percentage(self):
        result = split_percentage(1000, {1: 33.33, 2: 33.33, 3: 33.34})
        assert sum(result.values()) == 1000

    def test_sum_not_100_raises(self):
        with pytest.raises(SplitError, match="expected 100"):
            split_percentage(1000, {1: 50, 2: 40})

    def test_empty_raises(self):
        with pytest.raises(SplitError):
            split_percentage(100, {})

    def test_last_member_absorbs_remainder(self):
        """Last member (by sorted order) gets rounding remainder."""
        result = split_percentage(100, {1: 33.3, 2: 33.3, 3: 33.4})
        assert sum(result.values()) == 100
        # Last sorted user (3) should absorb any rounding gap
        assert result[3] >= 33


# ─── split_attendance ────────────────────────────────────────────────────────

class TestSplitAttendance:
    def test_basic_attendance(self):
        result = split_attendance(600, [1, 2, 3])
        assert result == {1: 200, 2: 200, 3: 200}

    def test_subset_present(self):
        result = split_attendance(600, [1, 2])
        assert result == {1: 300, 2: 300}

    def test_single_present(self):
        result = split_attendance(500, [2])
        assert result == {2: 500}

    def test_empty_raises(self):
        with pytest.raises(SplitError):
            split_attendance(100, [])


# ─── compute_split dispatcher ────────────────────────────────────────────────

class TestComputeSplit:
    def test_dispatches_equal(self):
        result = compute_split("equal", 300, user_ids=[1, 2, 3])
        assert result == {1: 100, 2: 100, 3: 100}

    def test_dispatches_custom(self):
        result = compute_split("custom", 500, shares={1: 200, 2: 300})
        assert result == {1: 200, 2: 300}

    def test_dispatches_percentage(self):
        result = compute_split("percentage", 1000, percentages={1: 50, 2: 50})
        assert result == {1: 500, 2: 500}

    def test_dispatches_attendance(self):
        result = compute_split("attendance", 600, present_user_ids=[1, 2, 3])
        assert result == {1: 200, 2: 200, 3: 200}

    def test_unknown_type_raises(self):
        with pytest.raises(SplitError, match="Unknown split type"):
            compute_split("invalid", 100, user_ids=[1])


# ─── compute_balances ────────────────────────────────────────────────────────

class FakeExpense:
    def __init__(self, id, paid_by, amount_minor, deleted=False):
        self.id = id
        self.paid_by = paid_by
        self.amount_minor = amount_minor
        self.deleted = deleted


class FakeSplit:
    def __init__(self, user_id, amount_minor):
        self.user_id = user_id
        self.amount_minor = amount_minor


class FakeSettlement:
    def __init__(self, from_user, to_user, amount_minor):
        self.from_user = from_user
        self.to_user = to_user
        self.amount_minor = amount_minor


class TestComputeBalances:
    def test_simple_two_person(self):
        expenses = [FakeExpense(1, 1, 300)]
        splits = {1: [FakeSplit(1, 150), FakeSplit(2, 150)]}
        result = compute_balances(expenses, splits, [], [1, 2])
        assert result[1] == 150   # paid 300, owes 150 → net +150
        assert result[2] == -150  # owes 150 → net -150

    def test_three_person_chain(self):
        expenses = [
            FakeExpense(1, 1, 300),  # 1 paid, split 3 ways
            FakeExpense(2, 2, 600),  # 2 paid, split 3 ways
        ]
        splits = {
            1: [FakeSplit(1, 100), FakeSplit(2, 100), FakeSplit(3, 100)],
            2: [FakeSplit(1, 200), FakeSplit(2, 200), FakeSplit(3, 200)],
        }
        result = compute_balances(expenses, splits, [], [1, 2, 3])
        # 1: +300 -100 -200 = 0
        # 2: +600 -100 -200 = +300
        # 3: -100 -200 = -300
        assert result[1] == 0
        assert result[2] == 300
        assert result[3] == -300

    def test_settlement_reduces_balance(self):
        expenses = [FakeExpense(1, 1, 300)]
        splits = {1: [FakeSplit(1, 150), FakeSplit(2, 150)]}
        settlements = [FakeSettlement(2, 1, 100)]  # 2 paid 100 to 1
        result = compute_balances(expenses, splits, settlements, [1, 2])
        # 1: +150 (creditor) - 100 (received) = +50
        # 2: -150 (debtor) + 100 (paid) = -50
        assert result[1] == 50
        assert result[2] == -50

    def test_deleted_expense_ignored(self):
        expenses = [FakeExpense(1, 1, 300, deleted=True)]
        splits = {1: [FakeSplit(1, 150), FakeSplit(2, 150)]}
        result = compute_balances(expenses, splits, [], [1, 2])
        assert result[1] == 0
        assert result[2] == 0

    def test_already_settled(self):
        expenses = [FakeExpense(1, 1, 300)]
        splits = {1: [FakeSplit(1, 150), FakeSplit(2, 150)]}
        settlements = [FakeSettlement(2, 1, 150)]
        result = compute_balances(expenses, splits, settlements, [1, 2])
        assert result[1] == 0
        assert result[2] == 0


# ─── simplify_debts ──────────────────────────────────────────────────────────

class TestSimplifyDebts:
    def test_two_person(self):
        result = simplify_debts({1: 100, 2: -100})
        assert len(result) == 1
        assert result[0]["from"] == 2
        assert result[0]["to"] == 1
        assert result[0]["amount_minor"] == 100

    def test_three_person_chain(self):
        """A owes B, B owes C → simplified to A pays C directly."""
        # 1 owes 100, 2 is owed 100 by 1 but owes 100 to 3, 3 is owed 100
        # Net: 1: -100, 2: 0, 3: +100
        result = simplify_debts({1: -100, 2: 0, 3: 100})
        assert len(result) == 1
        assert result[0]["from"] == 1
        assert result[0]["to"] == 3
        assert result[0]["amount_minor"] == 100

    def test_complex_simplification(self):
        """Multiple debts reduced to minimal set."""
        # 1: -100, 2: -200, 3: +150, 4: +150
        result = simplify_debts({1: -100, 2: -200, 3: 150, 4: 150})
        # Should be 2 transactions: 1→3 (100), 2→3 (50) + 2→4 (150)
        # Or: 1→4 (100), 2→3 (150) + 2→4 (50)
        assert len(result) <= 3
        # Verify all balances cleared
        net = {1: -100, 2: -200, 3: 150, 4: 150}
        for tx in result:
            net[tx["from"]] += tx["amount_minor"]
            net[tx["to"]] -= tx["amount_minor"]
        assert all(v == 0 for v in net.values())

    def test_already_settled(self):
        result = simplify_debts({1: 0, 2: 0})
        assert result == []

    def test_deterministic(self):
        """Same input → same output (critical for audit trails)."""
        balances = {1: -100, 2: 50, 3: 50}
        r1 = simplify_debts(balances)
        r2 = simplify_debts(balances)
        assert r1 == r2

    def test_single_transaction(self):
        result = simplify_debts({1: -500, 2: 500})
        assert len(result) == 1
        assert result[0]["amount_minor"] == 500

    def test_uneven_amounts(self):
        """Debtor owes more than single creditor is owed."""
        # 1 owes 300, 2 is owed 100, 3 is owed 200
        result = simplify_debts({1: -300, 2: 100, 3: 200})
        assert len(result) == 2
        net = {1: -300, 2: 100, 3: 200}
        for tx in result:
            net[tx["from"]] += tx["amount_minor"]
            net[tx["to"]] -= tx["amount_minor"]
        assert all(v == 0 for v in net.values())
