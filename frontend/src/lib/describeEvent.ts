import type { AuditEvent, User, UserSummary } from "./api";

/** "You" or the person's name, as the subject of a sentence. */
function subject(person: UserSummary | null, me: User): string {
  if (!person) return "Someone";
  return person.id === me.id ? "You" : person.name;
}

/** "you" or the person's name, as the object of a sentence. */
function object(person: UserSummary | null, me: User): string {
  if (!person) return "someone";
  return person.id === me.id ? "you" : person.name;
}

/** "your", "their" (when it is the actor's own) or "Name's". */
function possessive(person: UserSummary | null, actor: UserSummary | null, me: User): string {
  if (!person) return "a";
  if (person.id === me.id) return "your";
  if (actor && person.id === actor.id) return "their";
  return `${person.name}'s`;
}

/** Turn an audit event into a plain-language sentence from the viewer's point of view. */
export function describeEvent(event: AuditEvent, me: User): string {
  const actor = subject(event.actor, me);
  const target = object(event.target, me);
  const targets = possessive(event.target, event.actor, me);
  switch (event.action) {
    case "login":
      return `${actor} signed in`;
    case "login_failed":
      return `Failed sign-in attempt on ${possessive(event.target, null, me)} account`;
    case "logout":
      return `${actor} signed out`;
    case "password_changed":
      return `${actor} changed ${actor === "You" ? "your" : "their"} password`;
    case "study_created":
      return `${actor} ran an AI analysis for ${target}`;
    case "study_discarded":
      return `${actor} discarded a draft study for ${target}`;
    case "study_published":
      return `${actor} signed and published a report for ${target}`;
    case "file_viewed":
      return `${actor} opened ${targets} ${event.detail === "scan" ? "scan" : "report"}`;
    case "access_granted":
      return `${actor} shared records with ${target}`;
    case "access_revoked":
      return `${actor} stopped sharing records with ${target}`;
    case "user_created":
      return `${event.actor ? actor : "Setup"} created ${targets} ${event.detail ?? ""} account`.replace(
        "  ",
        " ",
      );
    case "user_deactivated":
      return `${actor} deactivated ${targets} account`;
    case "user_reactivated":
      return `${actor} reactivated ${targets} account`;
    case "report_verified":
      return "A copy of a report was verified against the registry";
    default:
      return event.action.replaceAll("_", " ");
  }
}
