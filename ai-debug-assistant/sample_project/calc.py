def divide(a: float, b: float) -> float:
    """Divide a by b. Raises ZeroDivisionError if b == 0."""
    if b == 0:
        raise ZeroDivisionError("Cannot divide by zero")
    return a / b