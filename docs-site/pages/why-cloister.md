# Why Cloister

Stablecoins are becoming real payment rails — payroll, invoices, supplier settlement, treasury.
But the transparency that makes a blockchain trustworthy also makes it unusable for these flows:
**every payment publishes your counterparty, your amount, and your entire balance to the world.**
Cloister gives those flows the confidentiality they have always had in traditional banking, while
keeping the auditability regulators require.

## The problem, concretely

On a public chain, paying someone leaks far more than the payment:

- **Balance disclosure** — anyone who learns your address sees your full holdings and net worth.
- **Counterparty graph** — every supplier, employee and partner you pay becomes public and linkable.
- **Salary exposure** — pay an employee once and their address (and salary) is trivially trackable.
- **Competitive leakage** — competitors can watch your treasury moves, runway and burn in real time.
- **Targeting** — public wealth invites phishing, extortion and physical risk.

Businesses respond by **not** using stablecoins for anything sensitive. Cloister removes the
blocker without removing accountability.

## Who it is for

### Payment service providers & wallets
Offer private stablecoin payments as a feature. Cloister is an additive HTTP API + SDK — drop it
in alongside an existing rail (OpenCryptoPay is the first integration) with no lock-in and no
change to how funds are custodied. See [Integration](integration.html).

### Businesses paying salaries & suppliers
Pay employees and vendors in stablecoins without publishing payroll or your supplier list. The
counterparty receives funds privately; your treasury address is never linked to the payment.

### Treasuries & DAOs
Move funds, rebalance and settle without broadcasting strategy to competitors and front-runners —
while still being able to prove every flow to auditors and members via viewing keys.

### Individuals
Receive a salary or get paid without exposing your address, balance and history to everyone who
ever sends you money.

## Why not just use a mixer?

Mixers (and "anonymity pools" with no entry control) deliver privacy by accepting funds of
**unknown origin**. That is precisely what gets them sanctioned and makes them radioactive for
any regulated business. Cloister is the opposite design:

| | Anonymous mixer | **Cloister** |
|---|---|---|
| Entry | open to anyone | KYC + sanctions-screened on-ramp |
| Origin of funds | unknown / unprovable | proven ∈ compliance good-set, in zero knowledge |
| Auditability | none | selective disclosure via viewing keys |
| Regulatory posture | sanctioned | designed to be compliant; a Swiss product |
| Who can ship it | nobody regulated | banks, PSPs, regulated wallets |

Cloister proves clean origin **without** deanonymising the user, and lets the user (or an
authorized auditor) disclose **specific** history **without** giving up everything. Privacy and
compliance stop being a trade-off.

## What it does not do

Cloister is honest about its boundaries:

- It is **not** a way to launder funds — unscreened money cannot enter, and cannot be proven clean.
- It does **not** hide deposit/withdraw amounts at the pool boundary (tokens visibly cross it);
  it hides the *internal* graph. See [Privacy model](privacy.html).
- It is **not** a custodian — you hold your keys; proving happens on your device.

Next: **[How it works](how-it-works.html)** for the mechanics, or the
**[FAQ](faq.html)** for direct answers.
