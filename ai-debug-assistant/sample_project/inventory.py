# sample_project/inventory.py
# A simple inventory management module.
# DELIBERATE BUG: get_item_price() uses the key "cost" but the dict stores "price".
# This causes a KeyError at runtime.

INVENTORY = {
    "apple":  {"price": 0.99,  "quantity": 100},
    "banana": {"price": 0.49,  "quantity": 200},
    "cherry": {"price": 2.99,  "quantity": 50},
}


def get_item_price(item_name: str) -> float:
    """Return the price of an item from the inventory.

    Bug: accesses 'cost' instead of 'price', triggering a KeyError
    whenever this function is called with any valid item name.
    """
    item = INVENTORY[item_name]          # look up the item (this is fine)
    return item["cost"]                  # BUG: key should be "price", not "cost"


def get_item_quantity(item_name: str) -> int:
    """Return the available quantity of an item from the inventory."""
    item = INVENTORY[item_name]
    return item["quantity"]              # correct key — this works fine


def is_in_stock(item_name: str) -> bool:
    """Return True if the item has at least one unit in stock."""
    return get_item_quantity(item_name) > 0
