# Disclaimer

> **Status: Proof of Concept.** Cloister Protocol is under active development and is **not** yet
> production software. Do not use it with real funds.

## No production readiness

The contracts and zero-knowledge circuit have been hardened in an **internal adversarial audit**,
but they have **not** undergone independent external security audits, and the system uses keys from
a **single trusted-setup run**. Before any mainnet deployment, Cloister requires:

- one or more **independent external audits** of the contracts and circuit, and
- a **multi-party Phase-2 trusted-setup ceremony** to replace the single-run proving/verifying keys.

Until then, all deployments are **test/devnet only**, and any tokens involved are **test tokens**.

## No financial, legal or tax advice

This documentation is provided for **technical and informational purposes only**. Nothing here
constitutes financial, investment, legal, accounting or tax advice, or an offer or solicitation to
buy or sell any asset. The compliance features described (KYC-gated entry, association-set proofs,
viewing-key disclosure) are protocol mechanisms; they do **not** by themselves discharge any legal
or regulatory obligation that may apply to you or your business. Consult qualified professionals
for your specific situation and jurisdiction.

## Regulatory & availability

Availability of Cloister and any associated on-ramp may be restricted in certain jurisdictions.
Compliance features depend on third-party screening and on the policies of the
Association-Set-Provider and any integrated on-ramp; their accuracy and coverage are not
guaranteed. You are responsible for ensuring your use complies with applicable law.

## No warranty

The software and documentation are provided **"as is", without warranty of any kind**, express or
implied, including but not limited to warranties of merchantability, fitness for a particular
purpose, and non-infringement. Use of zero-knowledge cryptography, smart contracts and blockchain
networks carries inherent and irreducible risk, including the risk of total loss of funds.

## Limitation of liability

To the maximum extent permitted by law, the project maintainers and contributors shall not be liable for any
direct, indirect, incidental, special, consequential or exemplary damages arising from the use of,
or inability to use, the protocol, software or documentation.

---

See also the [Privacy policy](privacy-policy.html) and [Imprint](imprint.html). For the current
technical status, see [Security](security.html) and [Validation](validation.html).
