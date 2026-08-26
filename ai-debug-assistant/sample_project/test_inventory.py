# sample_project/test_inventory.py
# Tests for the inventory module.
#
# The test for get_item_quantity() passes because that function uses
# the correct key ("quantity"). The test for get_item_price() will
# FAIL at runtime due to the KeyError bug in inventory.py.

import pytest
import sys
import os

# Make sure Python can find the sample_project package when tests run
sys.path.insert(0, os.path.dirname(__file__))

from inventory import get_item_quantity, is_in_stock, get_item_price


# ── PASSING TEST ─────────────────────────────────────────────────────────────

def test_get_item_quantity():
    """Verify that quantity look-up works correctly.

    This test exercises get_item_quantity(), which uses the correct
    dictionary key ('quantity'), so it should always pass.
    """
    assert get_item_quantity("apple") == 100
    assert get_item_quantity("banana") == 200


def test_is_in_stock():
    """Verify that stock-check works correctly for known items."""
    assert is_in_stock("apple") is True
    assert is_in_stock("cherry") is True


# ── FAILING TEST (due to the bug) ────────────────────────────────────────────

def test_get_item_price():
    """Verify that price look-up returns the correct price.

    This test FAILS because get_item_price() reads 'cost' instead of
    'price' from the inventory dict, raising a KeyError.
    """
    assert get_item_price("apple") == 0.99
    assert get_item_price("banana") == 0.49
