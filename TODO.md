# Cloister Console — To-do / Roadmap

Stand der offenen Arbeiten an der Web-App (`apps/web`, app.cloister-protocol.com).
Erledigtes ist unten unter „Bereits live" gelistet.

---

## 1) Echtheit / Hardening (Demo → Produktion)
> Macht aus dem PoC-Demo einen produktionsnahen Stack. Höchste Priorität für „echt".

- [ ] **Echte E-Mail-Codes** im Onboarding (Mail-Service + Endpoint) statt des on-device PoC-Codes.
- [ ] **Echte KYC-Bindung** ans DFX-Konto — aktuell setzt `markVerifiedExternally` nur ein lokales Flag.
- [ ] **Fehlerbehandlung + Retry** beim Submit (Relayer-/Netzwerkfehler, idempotent erneut senden).
- [ ] **Relayer-/Indexer-Status (Health)** in der UI sichtbar machen.
- [ ] **Echtes Funding vom verbundenen Wallet** (gehaltenes USDC einzahlen) — Demo mintet aktuell Test-USDC.
- [ ] Echter On-Device-Prover-Pfad für die Web-App (heute Demo-Backend).

## 2) Maker-Checker — Tiefe
> Basis (4-Augen-Queue ab Schwelle) ist live. Es fehlt das Mehrnutzer-Modell.

- [ ] **Echte Rollen** (Initiator / Approver / Viewer) statt Single-User-Simulation.
- [ ] **Funktionstrennung erzwingen**: Approver ≠ Initiator.
- [ ] **Freigabe-Audit-Trail** (wer/wann freigegeben/abgelehnt).
- [ ] **Limits & Whitelist**: Tages-/Transaktionslimits, Empfänger-Whitelist, typ-/empfängerabhängige Regeln.

## 3) Recipients & Scheduling — Tiefe
- [ ] Empfänger **bearbeiten / löschen** (aktuell nur hinzufügen + Favorit).
- [ ] **Gruppen / Tags** für Empfänger.
- [ ] **Aus dem Adressbuch zahlen** — Einzel- & Sammelauszahlung aus gespeicherten Empfängern bauen (nicht nur CSV/Excel).
- [ ] **Echter Payroll-Zeitplan** (nächster Lauf, Budget-Cap-Durchsetzung, wiederkehrende Ausführung) — heute nur UI-Mock.
- [ ] **Aktivität**: Datumsbereich-Filter, Pro-Empfänger-Historie, Pagination.

## 4) UX-Politur — Rest
- [ ] Einheitliche **Empty-States** (Icon + CTA) über alle Listen.
- [ ] **Loading-Skeletons** konsistent.
- [ ] **Tablet/Responsive-Durchgang** der Console.
- [ ] **Zahlen-/Währungsformat** konsistent nach Sprache (de-DE vs en-US).

## 5) Internationalisierung — Rest
- [ ] **Demo-/Beispieldaten** auf Deutsch (Empfängernamen, Zwecke, Compliance-Listen-Werte aus mock/realApi).
- [ ] Alle Screens auf DE visuell prüfen (Umbrüche/Overflow durch längere deutsche Strings).

## 6) Rechnung/Excel-Upload — optional
- [ ] Mehr-Positionen-Rechnung → mehrere Überweisungen (Batch aus einer Rechnung).
- [ ] IBAN → On-chain-Adress-Mapping (heute wird IBAN nur erkannt).
- [ ] Mehr Währungen / Locale-Erkennung der Beträge.

## 7) Produktion (größer, außerhalb der App-UI)
- [ ] **Externe Security-Audits** (Contracts + Circuit).
- [ ] **Multi-Party Phase-2 Trusted-Setup-Zeremonie** (ersetzt die Single-Run-Keys).
- [ ] Echter **Relayer- + Indexer-Betrieb** in Produktion.

## 8) Infra / Sonstiges
- [ ] Cloudflare-**Cache-Purge-Token** mit Purge-Recht (aktueller Token schlug fehl).
- [ ] **SEA-Conversion-Tracking** + Search Console / Bing Webmaster + Sitemap-Submit (früher zurückgestellt).
- [ ] Docs für neue Features ergänzen (Approvals, Kontoauszüge).

---

## Bereits live (Referenz)
- DFX-AG-Branding entfernt (neutral) · Verify-Identity = E-Mail+Code, KYC im Dashboard · Website-Klartext/Fakten-Fixes · Coming-Soon + Website mobil optimiert
- Alle generierten Dokumente gebranded · Kontoauszüge (PDF/CSV/JSON)
- Excel-/CSV-Sammelauszahlung · Rechnungs-Upload (PDF-Text + OCR) · vollflächiges Drag-&-Drop
- PWA (installierbar + offline) + Install-/Update-Prompts
- Toast- + gebrandetes Confirm-System (statt Browser-Popups)
- Maker-Checker (4-Augen ab Schwelle) + Approvals-Screen + Sidebar-Badge
- Recipient-Favoriten · funktionale Settings (Profil/Präferenzen/Sign-out) · Fund hinter KYC (nur DFX/Wallet)
- Deutsch/Englisch umschaltbar (alle Screens + Komponenten)
