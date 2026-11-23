"""
Generate the Westline Auto Parts sample dataset.

Westline is a fictional four-yard auto parts distributor in California that sells
on credit to body shops, repair shops, dealers and fleets. Nothing here is real.

Output (in ../data):
  customers.csv  one row per credit account, with the limit currently on file
  invoices.csv   every invoice for 15 months, with paid date if settled

The dataset is built to look like a real credit book: most accounts pay on time,
some pay late every month, a few are getting worse while buying more, and the
credit limits on file were set by many different people over many years, so a
lot of them no longer match how the customer actually buys.

Run:  python3 generate_sample_data.py
"""
import csv
import math
import os
import random
from datetime import date, timedelta

SEED = 20261031
AS_OF = date(2026, 10, 31)
START = date(2025, 8, 1)
N_CUSTOMERS = 520

rng = random.Random(SEED)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
os.makedirs(OUT, exist_ok=True)

YARDS = ["Sacramento", "Fresno", "Oakland", "Bakersfield"]
YARD_W = [0.32, 0.22, 0.28, 0.18]

SEGMENTS = [  # name, share, spend multiplier, usual terms
    ("Body shop", 0.45, 1.15, 30),
    ("Repair shop", 0.35, 0.75, 30),
    ("Dealer", 0.08, 2.1, 45),
    ("Fleet", 0.06, 1.6, 45),
    ("Retail / other", 0.06, 0.45, 15),
]

# How each kind of account pays: mean and spread of days beyond terms
ARCHETYPES = [  # name, share
    ("prompt", 0.35),
    ("steady_late", 0.25),
    ("slow", 0.12),
    ("deteriorating", 0.07),
    ("improving", 0.08),
    ("dispute_prone", 0.05),
    ("bouncer", 0.03),
    ("dark", 0.03),
    ("new", 0.02),
]

LIMIT_SETTERS = [
    ("A. Ruiz (Sales)", 0.18), ("K. Patel (Sales)", 0.15), ("T. Nguyen (Sales)", 0.12),
    ("D. Kim (Yard manager)", 0.12), ("Counter staff", 0.10), ("L. Moreno (AR)", 0.10),
    ("R. Shah (Controller)", 0.08), ("Not recorded", 0.15),
]

FIRST = ["Valley", "Golden", "Delta", "Summit", "Pacific", "Redwood", "Sierra", "Bayview",
         "Central", "Oak", "Cedar", "Pioneer", "Capitol", "Riverside", "Mission", "Harbor",
         "Eastside", "Westgate", "Northgate", "Sunrise", "Foothill", "Canyon", "Lakeside",
         "Highway 99", "Granite", "Orchard", "Vista", "Monarch", "Liberty", "Precision",
         "Elite", "Pro", "Quality", "Express", "Premier", "Classic", "Allied", "United",
         "Diamond", "Ace", "Star", "Eagle", "Falcon", "Bear Creek", "Twin Oaks", "Almond",
         "Sutter", "Tulare", "Kern", "Merced", "Alameda", "Fremont", "Hayes", "Garcia",
         "Lopez", "Martinez", "Hernandez", "Singh", "Tran", "Romero", "Castillo", "Reyes",
         "Johnson", "Miller", "Davis", "Anderson", "Thompson", "Walker", "Brooks", "Kowalski"]
SUFFIX = {
    "Body shop": ["Collision", "Auto Body", "Collision Center", "Body & Paint", "Collision Repair"],
    "Repair shop": ["Auto Repair", "Automotive", "Auto Care", "Garage", "Car Care", "Transmission"],
    "Dealer": ["Motors", "Auto Group", "Chevrolet Service", "Ford Service", "Pre-Owned"],
    "Fleet": ["Fleet Services", "Transport", "Logistics Fleet", "Towing", "Rentals Fleet"],
    "Retail / other": ["Auto Parts Resale", "Customs", "Detailing", "Tire & Wheel", "Mobile Mechanic"],
}


def pick(pairs):
    r = rng.random()
    acc = 0.0
    for item, w in pairs:
        acc += w
        if r <= acc:
            return item
    return pairs[-1][0]


def month_starts(start, end):
    d = date(start.year, start.month, 1)
    while d <= end:
        yield d
        d = date(d.year + (d.month == 12), d.month % 12 + 1, 1)


def add_months(d, n):
    y, m = d.year + (d.month - 1 + n) // 12, (d.month - 1 + n) % 12 + 1
    return date(y, m, min(d.day, 28))


def business_day(d):
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def months_before_asof(d):
    return (AS_OF.year - d.year) * 12 + (AS_OF.month - d.month)


def nice(x):
    """Round a credit limit the way people actually write them."""
    if x <= 0:
        return 0
    step = 250 if x < 5000 else 500 if x < 20000 else 1000
    return max(step, int(round(x / step) * step))


def dbt_for(arch, months_back, cust):
    """Days beyond terms for an invoice raised `months_back` months before as-of."""
    if arch == "prompt":
        return rng.gauss(-2, 4)
    if arch == "steady_late":
        return rng.gauss(cust["late_mu"], 6)
    if arch == "slow":
        return rng.gauss(cust["late_mu"] + 20, 10)
    if arch == "deteriorating":
        # pays well until about 6 months ago, then slides
        if months_back >= 6:
            return rng.gauss(1, 4)
        return rng.gauss(4 + (6 - months_back) * 9, 6)
    if arch == "improving":
        if months_back >= 7:
            return rng.gauss(38, 10)
        return rng.gauss(max(2, 38 - (7 - months_back) * 6), 5)
    if arch == "dispute_prone":
        return rng.gauss(12, 8)
    if arch == "bouncer":
        return rng.gauss(18, 9)
    if arch == "dark":
        return rng.gauss(14, 7)
    if arch == "new":
        return rng.gauss(6, 6)
    return 0


customers = []
used_names = set()
for i in range(N_CUSTOMERS):
    seg = pick([(s, s[1]) for s in SEGMENTS])
    seg_name, _, spend_mult, base_terms = seg
    arch = pick(ARCHETYPES)
    while True:
        name = f"{rng.choice(FIRST)} {rng.choice(SUFFIX[seg_name])}"
        if name not in used_names:
            used_names.add(name)
            break
    monthly_spend = math.exp(rng.gauss(math.log(450), 0.85)) * spend_mult
    terms = base_terms if rng.random() > 0.15 else rng.choice([15, 30, 45])
    if arch == "new":
        opened = AS_OF - timedelta(days=rng.randint(60, 120))
    else:
        opened = date(rng.randint(2016, 2025), rng.randint(1, 12), rng.randint(1, 28))
        if opened > START:
            opened = START - timedelta(days=rng.randint(30, 400))
    cust = {
        "id": f"C{1000 + i}",
        "name": name,
        "yard": rng.choices(YARDS, YARD_W)[0],
        "segment": seg_name,
        "terms": terms,
        "opened": opened,
        "arch": arch,
        "spend": monthly_spend,
        "late_mu": rng.uniform(8, 20),
        "statement_payer": rng.random() < 0.55,
        "pay_day": rng.randint(5, 25),
        "card_on_file": rng.random() < 0.33,
    }
    customers.append(cust)

# ---------------------------------------------------------------- invoices
invoices = []
inv_no = 400000
for c in customers:
    first_month = max(START, date(c["opened"].year, c["opened"].month, 1))
    for ms in month_starts(first_month, AS_OF):
        mb = months_before_asof(ms)
        growth = 1.0 + 0.018 * (14 - mb)          # the business is growing
        season = 1.0 + 0.08 * math.sin((ms.month - 3) / 12 * 2 * math.pi)
        spend = c["spend"] * growth * season
        arch = c["arch"]
        if arch == "deteriorating" and mb < 6:
            spend *= 1.0 + (6 - mb) * 0.22          # buying more while paying slower
        if arch == "dark":
            if mb < 2:
                continue                            # stopped ordering
        if arch == "new" and ms < date(c["opened"].year, c["opened"].month, 1):
            continue
        avg_inv = math.exp(rng.gauss(math.log(240), 0.25))
        lam = max(0.3, spend / avg_inv)
        # Poisson draw
        L, k, p = math.exp(-min(lam, 60)), 0, 1.0
        if lam > 60:
            n = max(0, int(rng.gauss(lam, math.sqrt(lam))))
        else:
            while p > L:
                k += 1
                p *= rng.random()
            n = k - 1
        days_in_month = (add_months(ms, 1) - ms).days if ms.month != 12 else 31
        month_invoices = []
        for _ in range(n):
            d = business_day(ms + timedelta(days=rng.randint(0, days_in_month - 1)))
            if d > AS_OF or d < c["opened"]:
                continue
            amt = round(math.exp(rng.gauss(math.log(avg_inv), 0.8)), 2)
            amt = max(18.0, min(amt, 9500.0))
            inv_no += rng.randint(1, 3)
            month_invoices.append({"id": f"W-{inv_no}", "cust": c["id"], "date": d,
                                   "due": d + timedelta(days=c["terms"]), "amount": amt})
        # how this month's invoices get paid
        stmt_lag = dbt_for(arch, mb, c)
        for inv in month_invoices:
            inv_mb = months_before_asof(inv["date"])
            if c["statement_payer"]:
                # pays the whole month's statement in one go
                nxt = add_months(date(inv["date"].year, inv["date"].month, 1), 1)
                base = date(nxt.year, nxt.month, c["pay_day"]) + timedelta(days=max(0, c["terms"] - 30))
                pay = base + timedelta(days=round(stmt_lag + rng.gauss(0, 2)))
            else:
                pay = inv["due"] + timedelta(days=round(dbt_for(arch, inv_mb, c)))
            pay = max(pay, inv["date"] + timedelta(days=2))
            disputed = False
            returned = False
            settled_by = "payment"
            dispute_p = 0.22 if arch == "dispute_prone" else 0.012
            if rng.random() < dispute_p:
                disputed = True
                if rng.random() < 0.55:
                    settled_by = "credit"           # turned out to be a missed credit
                    pay = inv["date"] + timedelta(days=rng.randint(25, 80))
                else:
                    pay += timedelta(days=rng.randint(15, 45))
            bounce_p = 0.07 if arch == "bouncer" else 0.002
            if settled_by == "payment" and rng.random() < bounce_p:
                returned = True
                pay += timedelta(days=rng.randint(10, 25))
            if arch == "dark" and pay > AS_OF - timedelta(days=110):
                pay = AS_OF + timedelta(days=999)   # never paid
            pay = business_day(pay)
            inv["paid"] = pay if pay <= AS_OF else None
            inv["settled_by"] = settled_by if inv["paid"] else ""
            inv["disputed"] = disputed
            inv["returned"] = returned
            # future pay date kept only for the generator's own sanity check
            inv["_true_pay"] = business_day(pay) if pay.year < 2028 else None
            invoices.append(inv)

# ---------------------------------------------------------------- credit limits on file
by_cust = {}
for inv in invoices:
    by_cust.setdefault(inv["cust"], []).append(inv)

rows_c = []
for c in customers:
    invs = by_cust.get(c["id"], [])
    recent = [i for i in invs if i["date"] > AS_OF - timedelta(days=182)]
    avg_month = sum(i["amount"] for i in recent) / 6 if recent else c["spend"]
    need = avg_month * (c["terms"] + 15) / 30
    r = rng.random()
    if c["arch"] == "deteriorating" and rng.random() < 0.7:
        limit = nice(need * rng.uniform(1.4, 2.2))   # raised recently by sales
        setter = rng.choice(["A. Ruiz (Sales)", "K. Patel (Sales)", "T. Nguyen (Sales)"])
        set_date = AS_OF - timedelta(days=rng.randint(30, 150))
    else:
        if r < 0.40:
            limit = nice(need * rng.uniform(0.9, 1.6))
        elif r < 0.62:
            limit = nice(need * rng.uniform(0.08, 0.4))  # far below how they buy
        elif r < 0.77:
            limit = nice(need * rng.uniform(3, 8))      # far above how they buy
        elif r < 0.87:
            limit = 0                                   # no limit on file
        else:
            limit = nice(need * rng.choice([rng.uniform(0.5, 0.8), rng.uniform(1.8, 2.5)]))
        setter = pick(LIMIT_SETTERS)
        lo = c["opened"]
        set_date = lo + timedelta(days=rng.randint(0, max(1, (AS_OF - lo).days - 30)))
        if rng.random() < 0.55:  # most limits were set at onboarding and never revisited
            set_date = lo + timedelta(days=rng.randint(0, 20))
    if c["arch"] == "new":
        limit = nice(rng.choice([1000, 2500, 5000]))
        set_date = c["opened"]
        setter = rng.choice(["Counter staff", "A. Ruiz (Sales)"])
    promises = 0
    if c["arch"] in ("slow", "deteriorating", "dark", "bouncer"):
        promises = rng.choice([0, 1, 1, 2, 3])
    elif c["arch"] in ("steady_late", "dispute_prone"):
        promises = rng.choice([0, 0, 0, 1])
    rows_c.append({
        "customer_id": c["id"],
        "customer_name": c["name"],
        "yard": c["yard"],
        "segment": c["segment"],
        "terms_days": c["terms"],
        "credit_limit": limit if limit else "",
        "limit_set_by": setter if limit else "",
        "limit_set_date": set_date.isoformat() if limit else "",
        "account_opened": c["opened"].isoformat(),
        "card_on_file": "Y" if c["card_on_file"] else "N",
        "broken_promises_90d": promises,
    })

with open(os.path.join(OUT, "customers.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows_c[0].keys()))
    w.writeheader()
    w.writerows(rows_c)

invoices.sort(key=lambda i: (i["date"], i["id"]))
with open(os.path.join(OUT, "invoices.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["invoice_id", "customer_id", "invoice_date", "due_date", "amount",
                "paid_date", "settled_by", "disputed", "returned_payment"])
    for i in invoices:
        w.writerow([i["id"], i["cust"], i["date"].isoformat(), i["due"].isoformat(),
                    f'{i["amount"]:.2f}', i["paid"].isoformat() if i["paid"] else "",
                    i["settled_by"], "Y" if i["disputed"] else "N", "Y" if i["returned"] else "N"])

# ---------------------------------------------------------------- quick summary
open_inv = [i for i in invoices if not i["paid"]]
open_amt = sum(i["amount"] for i in open_inv)
def age(i): return (AS_OF - i["due"]).days
buckets = {"current": 0, "1-30": 0, "31-60": 0, "61-90": 0, "91-120": 0, "120+": 0}
for i in open_inv:
    a = age(i)
    k = "current" if a <= 0 else "1-30" if a <= 30 else "31-60" if a <= 60 else "61-90" if a <= 90 else "91-120" if a <= 120 else "120+"
    buckets[k] += i["amount"]
print(f"customers {len(rows_c)}  invoices {len(invoices)}")
for ms in month_starts(START, AS_OF):
    m_inv = [i for i in invoices if i["date"].year == ms.year and i["date"].month == ms.month]
    cash = sum(i["amount"] for i in invoices if i["paid"] and i["settled_by"] == "payment"
               and i["paid"].year == ms.year and i["paid"].month == ms.month)
    print(f"{ms:%Y-%m}  invoices {len(m_inv):5d}  sales ${sum(i['amount'] for i in m_inv):>10,.0f}  cash in ${cash:>10,.0f}")
print(f"open AR ${open_amt:,.0f}")
for k, v in buckets.items():
    print(f"  {k:8s} {v / open_amt * 100:5.1f}%  ${v:,.0f}")
