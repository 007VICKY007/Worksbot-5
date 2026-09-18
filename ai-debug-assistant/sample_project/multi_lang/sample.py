# sample.py
def calculate_tax(amount, rates=[]):
    try:
        rates.append(0.18)
        return amount * rates[0]
    except:
        return 0.0
