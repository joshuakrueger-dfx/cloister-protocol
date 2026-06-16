import { useState } from "react";
import { useApi } from "../lib/ApiProvider";
import { useAsync } from "../lib/useAsync";
import { Button, Card, Field, ScreenHead } from "../components/primitives";
import { toast, confirmDialog } from "../lib/overlays";
import { useT } from "../lib/i18n";
import type { TeamMember, TeamRole } from "../lib/types";

const ROLES: TeamRole[] = ["admin", "approver", "initiator", "viewer"];

export function Team() {
  const api = useApi();
  const tr = useT();
  const { data, loading, error, reload } = useAsync<TeamMember[]>(() => api.getTeam(), []);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("approver");
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const members = data ?? [];
  const roleLabel = (r: TeamRole) =>
    r === "admin" ? tr("Admin", "Admin")
      : r === "approver" ? tr("Approver", "Freigeber")
        : r === "initiator" ? tr("Initiator", "Initiator")
          : tr("Viewer", "Betrachter");

  async function invite() {
    const e = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      toast(tr("Enter a valid email address.", "Bitte eine gültige E-Mail-Adresse eingeben."), "error");
      return;
    }
    setBusy(true);
    try {
      await api.inviteMember({ email: e, role });
      setEmail("");
      reload();
      toast(tr("Invitation sent", "Einladung gesendet"), "success");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(m: TeamMember, r: TeamRole) {
    setRowBusy(m.id);
    try {
      await api.updateMemberRole(m.id, r);
      reload();
    } finally {
      setRowBusy(null);
    }
  }

  async function remove(m: TeamMember) {
    const ok = await confirmDialog({
      title: tr("Remove from team?", "Aus dem Team entfernen?"),
      body: tr(`${m.email} will lose access.`, `${m.email} verliert den Zugriff.`),
      confirmLabel: tr("Remove", "Entfernen"),
      danger: true,
    });
    if (!ok) return;
    setRowBusy(m.id);
    try {
      await api.removeMember(m.id);
      reload();
      toast(tr("Member removed", "Mitglied entfernt"), "info");
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <section className="view">
      <ScreenHead
        eyebrow={tr("GOVERNANCE", "GOVERNANCE")}
        title={tr("Team", "Team")}
        sub={tr(
          "Invite people to your team and give them roles. Payments that need a second approver (four-eyes) are signed off by a team member — never the person who created them.",
          "Lade Personen in dein Team ein und gib ihnen Rollen. Zahlungen, die einen Zweit-Freigeber brauchen (Vier-Augen-Prinzip), werden von einem Team-Mitglied freigegeben — nie von der Person, die sie erstellt hat.",
        )}
      />

      <Card style={{ marginTop: 24 }}>
        <div className="clab">{tr("INVITE A MEMBER", "MITGLIED EINLADEN")}</div>
        <div className="grid g3" style={{ marginTop: 12, alignItems: "end" }}>
          <Field label={tr("EMAIL", "E-MAIL")} style={{ marginTop: 0 }}>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && invite()}
              placeholder="name@company.com"
            />
          </Field>
          <Field label={tr("ROLE", "ROLLE")} style={{ marginTop: 0 }}>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </select>
          </Field>
          <div className="actions" style={{ marginTop: 0 }}>
            <Button variant="solid" arrow onClick={invite} disabled={busy || !email.trim()}>
              {busy ? tr("Inviting…", "Lade ein…") : tr("Send invite", "Einladen")}
            </Button>
          </div>
        </div>
        <div className="note">
          {tr(
            "Admin: manage the team, create and approve. Approver: create and approve. Initiator: create payments (can't approve their own). Viewer: read-only.",
            "Admin: Team verwalten, erstellen und freigeben. Freigeber: erstellen und freigeben. Initiator: Zahlungen erstellen (nicht die eigenen freigeben). Betrachter: nur lesen.",
          )}
        </div>
      </Card>

      <Card style={{ marginTop: 18, padding: "18px 0 0" }}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{tr("Member", "Mitglied")}</th>
                <th>{tr("Role", "Rolle")}</th>
                <th>{tr("Status", "Status")}</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="loading-row"><td colSpan={4}>{tr("Loading…", "Lädt…")}</td></tr>
              ) : error ? (
                <tr className="error-row"><td colSpan={4}>{error}</td></tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id}>
                    <td className="addr">
                      {m.email}{m.owner ? <span className="chip" style={{ marginLeft: 8 }}>{tr("you · owner", "du · Inhaber")}</span> : null}
                    </td>
                    <td>
                      {m.owner ? (
                        roleLabel(m.role)
                      ) : (
                        <select
                          className="input"
                          style={{ width: "auto", padding: "6px 10px" }}
                          value={m.role}
                          disabled={rowBusy === m.id}
                          onChange={(e) => changeRole(m, e.target.value as TeamRole)}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{roleLabel(r)}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {m.status === "active"
                        ? <span className="tag-ok">{tr("active", "aktiv")}</span>
                        : <span className="chip">{tr("invited", "eingeladen")}</span>}
                    </td>
                    <td>
                      {m.owner ? null : (
                        <button className="reveal-btn" onClick={() => remove(m)} disabled={rowBusy === m.id}>
                          {tr("remove", "entfernen")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
