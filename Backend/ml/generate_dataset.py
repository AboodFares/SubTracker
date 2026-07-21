"""
Synthetic training data generator for the subscription line classifier.

WHY SYNTHETIC DATA?
We need labeled examples ("this line is a subscription" / "this one isn't")
to train a classifier, but we don't have thousands of real labeled bank
statement lines yet. So we *generate* realistic ones: we know what
subscription charges look like on statements (NETFLIX.COM, APPLE.COM/BILL...)
and what non-subscriptions look like (TIM HORTONS #1234, ATM WITHDRAWAL...).

The generator deliberately mimics real bank-statement messiness:
merchant codes, city suffixes, phone numbers, store numbers, mixed case,
and several different bank line formats.

Over time, real labeled data gets ADDED to this:
  - data/custom_labeled.csv  -> lines you hand-label yourself
  - data/gpt_labeled.csv     -> lines GPT classified at runtime (feedback loop)
Training uses all three, so the model gradually shifts from synthetic to real.

Usage:
    python generate_dataset.py            # writes data/synthetic.csv
"""

import csv
import random
from pathlib import Path

random.seed(42)  # reproducible dataset

DATA_DIR = Path(__file__).parent / "data"

# ---------------------------------------------------------------------------
# 1. MERCHANT POOLS
#    label 1 = subscription, label 0 = not a subscription
#    Each entry is a list of "as seen on a statement" spelling variants,
#    because banks mangle merchant names differently.
# ---------------------------------------------------------------------------

SUBSCRIPTION_MERCHANTS = [
    ["NETFLIX.COM", "NETFLIX.COM AMSTERDAM", "NETFLIX INTERNATIONAL B.V."],
    ["SPOTIFY AB", "SPOTIFY P2B4F8", "SPOTIFY STOCKHOLM SE"],
    ["APPLE.COM/BILL", "APPLE.COM/BILL 866-712-7753", "APPLE.COM/BILL ON"],
    ["GOOGLE *YouTubePremium", "GOOGLE *YOUTUBE PREM", "GOOGLE YOUTUBE MEMBER"],
    ["DISNEY PLUS", "DISNEYPLUS.COM", "DISNEY+ BURBANK CA"],
    ["AMZN PRIME MEMBER", "AMAZON PRIME*2A3BC4", "PRIME MEMBER AMZN.CA/BILL"],
    ["ADOBE *CREATIVE CLD", "ADOBE INC SAN JOSE", "ADOBE *PHOTOGPHY PLAN"],
    ["MICROSOFT*M365", "MSFT * ONE MICROSOFT", "MICROSOFT 365 PERSONAL"],
    ["OPENAI *CHATGPT SUBSCR", "CHATGPT SUBSCRIPTION OPENAI.COM", "OPENAI SAN FRANCISCO"],
    ["ANTHROPIC CLAUDE.AI", "CLAUDE.AI SUBSCRIPTION", "ANTHROPIC PBC"],
    ["CRAVE ENTERTAINMENT", "CRAVETV BELL MEDIA", "CRAVE TORONTO ON"],
    ["GOODLIFE FITNESS", "GOODLIFE CLUBS MSP", "PLANET FITNESS CLUB FEES"],
    ["AUDIBLE.CA MEMBERSHIP", "AUDIBLE*UK8FN2", "AUDIBLE ADBL.CO/PYMT"],
    ["DROPBOX*H3JQ9F", "DROPBOX.COM", "DROPBOX INTL"],
    ["ICLOUD.COM/BILL", "APPLE ICLOUD 50GB", "ICLOUD+ STORAGE"],
    ["GOOGLE *GOOGLE ONE", "GOOGLE ONE STORAGE", "GOOGLE*ONE 100GB"],
    ["HELLOFRESH CANADA", "HELLOFRESH*WK26", "HELLO FRESH TORONTO"],
    ["PATREON* MEMBERSHIP", "PATREON.COM/BILL", "PATREON INTERNET"],
    ["NYTIMES DIGITAL", "NYT*NYTIMES SUBSCRIPTION", "NEW YORK TIMES DIGITAL"],
    ["CRUNCHYROLL MEMBERSHIP", "CRUNCHYROLL*SUB", "SONY CRUNCHYROLL"],
    ["NORDVPN.COM", "NORDVPN *SUBSCRIPTION", "NORDSEC LTD"],
    ["EXPRESSVPN.COM", "EXPRESSVPN SUBSCR", "EXPRESS TECH LTD"],
    ["PLAYSTATION NETWORK", "PLAYSTATIONNETWORK SUB", "SONY PSN MEMBERSHIP"],
    ["XBOX GAME PASS", "MICROSOFT*XBOX GAME PASS", "XBOX LIVE GOLD"],
    ["TWITCH SUBSCRIPTION", "TWITCHINTERACTIVE.COM", "TWITCH.TV/SUBS"],
]

NON_SUBSCRIPTION_MERCHANTS = [
    # food & coffee (repeat often but are NOT subscriptions -> hard negatives)
    ["TIM HORTONS #2231", "TIM HORTONS #0187 TORONTO", "TIMHORTONS 4415"],
    ["STARBUCKS #04521", "STARBUCKS COFFEE T886", "STARBUCKS 800-782-7282"],
    ["MCDONALD'S #40265", "MCDONALDS Q04 MISSISSAUGA", "MCD #33851"],
    ["SUBWAY 42117-0", "SUBWAY REST 12244", "SUBWAY FRANCHISE"],
    ["UBER EATS", "UBER *EATS PENDING", "UBEREATS.COM/BILL"],
    ["DOORDASH*BURGER KING", "DD DOORDASH SUSHI", "DOORDASH*PIZZA PIZZA"],
    # groceries / retail
    ["WALMART STORE #3115", "WAL-MART #1061", "WALMART.CA"],
    ["NO FRILLS #866", "NOFRILLS FERRI'S", "LOBLAWS #1029"],
    ["COSTCO WHOLESALE W550", "COSTCO GAS W1275", "COSTCO.CA ONLINE"],
    ["SHOPPERS DRUG MART #0984", "SHOPPERSDRUGMART 984", "SDM #1121 TORONTO"],
    ["DOLLARAMA #423", "DOLLARAMA S-1182", "DOLLARAMA MTL"],
    # one-time online shopping (hard negatives vs Amazon Prime / Google One!)
    ["AMZN MKTP CA*2B4FZ8", "AMAZON.CA*ORDER", "AMZN MKTP CA WWW.AMAZON.CA"],
    ["GOOGLE *PLAY APP", "GOOGLE PLAY STORE PURCH", "GOOGLE*HELP.PAY# ONE-TIME"],
    ["APPLE STORE R121", "APPLE STORE YORKDALE", "APPLE ONLINE STORE ORDER"],
    ["BESTBUY.CA #937", "BEST BUY #611", "BESTBUY ONLINE ORDER"],
    ["EBAY O*12-34567", "EBAY COMMERCE CDA", "PAYPAL *EBAY SELLER"],
    # transport / fuel
    ["UBER TRIP", "UBER *TRIP HELP.UBER.COM", "UBER BV TRIP 4X2"],
    ["LYFT *RIDE THU 9AM", "LYFT RIDE 27-04", "LYFT CANADA INC"],
    ["SHELL C02931", "SHELL EASYPAY 4482", "SHELL CANADA PRODUCTS"],
    ["ESSO CIRCLE K 71234", "ESSO 7-ELEVEN", "PETRO-CANADA 06715"],
    ["PRESTO FARE TORONTO", "PRESTO AUTOLOAD", "GO TRANSIT UNION STN"],
    ["GREEN P PARKING", "IMPARK00120199U", "PRECISE PARKLINK TOR"],
    # banking noise (recurring but NOT subscriptions -> hard negatives)
    ["MONTHLY ACCOUNT FEE", "MONTHLY PLAN FEE", "ACCOUNT MAINTENANCE FEE"],
    ["E-TRANSFER SENT J. SMITH", "INTERAC E-TRF SENT", "E-TRANSFER RECEIVED"],
    ["ATM WITHDRAWAL 004412", "ABM WITHDRAWAL BR 2214", "CASH WITHDRAWAL ATM"],
    ["NSF FEE", "OVERDRAFT INTEREST", "OVERDRAFT PROTECTION FEE"],
    ["PAYROLL DEPOSIT ACME LTD", "DIRECT DEPOSIT PAYROLL", "PAY EMPLOYER DEPOSIT"],
    # bills & recurring obligations (recurring, but per product rules NOT subs)
    ["BELL CANADA BILL PAYMENT", "BELL MOBILITY PREAUTH", "BELL CANADA OB"],
    ["ROGERS COMMUNICATIONS", "ROGERS PREAUTH PAYMT", "FIDO MOBILE PAYMENT"],
    ["HYDRO ONE PREAUTH", "TORONTO HYDRO BILL", "ENBRIDGE GAS PAYMENT"],
    ["WAWANESA INSURANCE", "TD INSURANCE PREAUTH", "INTACT INSURANCE PYMT"],
    ["RENT PAYMENT PREAUTH", "PROPERTY MGMT RENT", "MORTGAGE PAYMENT TD"],
    # restaurants / misc
    ["THE KEG STEAKHOUSE", "BOSTON PIZZA #318", "SWISS CHALET 1214"],
    ["LCBO/RAO #522", "THE BEER STORE 2104", "WINE RACK #123"],
    ["CINEPLEX #7712", "CINEPLEX ODEON QUEENSWAY", "LANDMARK CINEMAS"],
]

# Typical monthly price points for subscriptions vs the wider spread of
# everyday purchases. Amount alone doesn't decide the label, but realistic
# amounts help the model learn realistic co-occurrence patterns.
SUB_AMOUNTS = [4.99, 5.99, 7.99, 9.99, 10.99, 11.99, 12.99, 14.99, 15.49,
               16.49, 17.99, 19.99, 22.99, 24.99, 29.99, 54.99]
NONSUB_AMOUNTS = None  # drawn randomly below


# ---------------------------------------------------------------------------
# 2. LINE FORMATTING
#    Real statements wrap the merchant in different layouts depending on the
#    bank. We simulate the most common ones so the model doesn't overfit to
#    a single format.
# ---------------------------------------------------------------------------

def random_date() -> str:
    month = random.randint(1, 12)
    day = random.randint(1, 28)
    style = random.choice(["slash", "name", "iso"])
    if style == "slash":
        return f"{month:02d}/{day:02d}"
    if style == "name":
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        return f"{months[month - 1]} {day:02d}"
    return f"2026-{month:02d}-{day:02d}"


def format_line(merchant: str, amount: float) -> str:
    """Wrap a merchant + amount into one of several bank statement layouts."""
    date = random_date()
    amt = f"{amount:,.2f}"
    # running balance column — many banks print "AMOUNT  BALANCE" per line
    balance = f"{random.uniform(50, 9000):,.2f}"
    layouts = [
        f"{date} {merchant} ${amt}",
        f"{date} {merchant} {amt}",
        f"{date} {merchant} {amt} {balance}",            # amount + balance
        f"{date} {merchant} ${amt} ${balance}",
        f"{date} POS PURCHASE {merchant} ${amt}",
        f"{date} CONTACTLESS PURCHASE {merchant} {amt}",
        f"{date} PRE-AUTHORIZED PAYMENT {merchant} ${amt}",
        f"{merchant} {date} -{amt}",
        f"{date} {date} {merchant} {amt}",               # posted + transaction date
        f"{date} {date} {merchant} {amt} {balance}",
    ]
    line = random.choice(layouts)
    # occasional lowercase lines — some banks/pdf extractions do this
    if random.random() < 0.12:
        line = line.lower()
    return line


def generate(n_per_variant: int = 18):
    """Build the full labeled dataset: [(line_text, label), ...]"""
    rows = []
    for variants in SUBSCRIPTION_MERCHANTS:
        for merchant in variants:
            for _ in range(n_per_variant):
                amount = random.choice(SUB_AMOUNTS)
                rows.append((format_line(merchant, amount), 1))
    for variants in NON_SUBSCRIPTION_MERCHANTS:
        for merchant in variants:
            for _ in range(n_per_variant):
                amount = round(random.uniform(1.50, 260.0), 2)
                rows.append((format_line(merchant, amount), 0))
    random.shuffle(rows)
    return rows


def main():
    DATA_DIR.mkdir(exist_ok=True)
    rows = generate()

    out = DATA_DIR / "synthetic.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["text", "label"])   # label: 1=subscription, 0=not
        writer.writerows(rows)

    n_pos = sum(1 for _, y in rows if y == 1)
    print(f"Wrote {len(rows)} lines to {out}")
    print(f"  subscriptions:     {n_pos}")
    print(f"  non-subscriptions: {len(rows) - n_pos}")

    # Create the hand-label file with a header + examples, only if absent
    # (never overwrite your real labels!)
    custom = DATA_DIR / "custom_labeled.csv"
    if not custom.exists():
        with open(custom, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["text", "label"])
            writer.writerow(["06/03 NETFLIX.COM 866-579-7172 ON $20.99", 1])
            writer.writerow(["06/05 FRESHCO #8817 TORONTO $84.12", 0])
        print(f"Created {custom} — add your own real labeled lines here.")


if __name__ == "__main__":
    main()
