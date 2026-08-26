# sample_project/order_processor.py
# Processes customer orders using the inventory module.
# This file calls get_item_price(), which contains the bug.

from inventory import get_item_price, is_in_stock


def calculate_order_total(order: dict) -> float:
    """Calculate the total cost of an order.

    Args:
        order: dict mapping item names to quantities,
               e.g. {"apple": 3, "banana": 2}

    Returns:
        Total price as a float.

    Raises:
        KeyError: propagated from get_item_price() when the inventory
                  dict is accessed with the wrong key.
        ValueError: if an ordered item is not in stock.
    """
    total = 0.0
    for item_name, qty in order.items():
        if not is_in_stock(item_name):
            raise ValueError(f"Item '{item_name}' is out of stock.")
        # This line triggers the bug inside get_item_price()
        price = get_item_price(item_name)
        total += price * qty
    return round(total, 2)


def print_receipt(order: dict) -> None:
    """Print a simple receipt for an order."""
    total = calculate_order_total(order)
    print("=== Receipt ===")
    for item, qty in order.items():
        print(f"  {item} x{qty}")
    print(f"  TOTAL: ${total:.2f}")
