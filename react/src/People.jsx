import React from "react";
import { people } from "./people.js";
import { Avatar, Icon, Modal, Group } from "./ui.jsx";
import { connectionReason } from "./conversation-model.js";

export function Categories({ person }) {
  return (person.categories?.length ? person.categories : [person.kind])
    .filter(Boolean)
    .map((kind) => (
      <span
        key={kind}
        className="person-kind"
        data-kind={
          { Hacker: "hacker", Mentor: "mentor", Sponsor: "sponsor" }[kind] ||
          "other"
        }
      >
        {kind}
      </span>
    ));
}
export function Matches({ ids, query, onProfile }) {
  return (
    <Group label={`${ids.length} people`} className="">
      <div className="matches">
        {ids.slice(0, 4).map((id) => (
          <button
            key={id}
            type="button"
            className="match"
            aria-label={`View ${people[id].name} profile, ${(people[id].categories || [people[id].kind]).join(", ")}`}
            aria-haspopup="dialog"
            onClick={(event) => {
              event.currentTarget.focus({ preventScroll: true });
              onProfile(id, connectionReason(id, query));
            }}
          >
            <Avatar id={id} />
            <span className="info">
              <span className="name">{people[id].name}</span>
              <span className="match-role">
                {people[id].kind === "Hacker" ? "Student" : people[id].kind}
              </span>
            </span>
            <Icon name="back" className="card-chevron" />
          </button>
        ))}
      </div>
    </Group>
  );
}
function SocialIcon({ platform }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {platform === "github" ? (
        <path d="M9 19c-4 1-4-2-6-2m12 5v-4c0-1-.3-2-1-2 4-.5 7-2 7-6 0-1.5-.5-3-1.5-4 .2-1 0-2-.5-3-2 0-3 1-4 1a15 15 0 0 0-6 0c-1 0-2-1-4-1-.5 1-.7 2-.5 3C3.5 7 3 8.5 3 10c0 4 3 5.5 7 6-.7.5-1 1.5-1 2v4" />
      ) : (
        <>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M7 10v7m0-10v.1m5 9.9v-7m0 3c0-4 5-4 5 0v4" />
        </>
      )}
    </svg>
  );
}
export default function People({ profile, onClose, onMessage }) {
  const p = profile && people[profile.id];
  return (
    <Modal
      open={Boolean(p)}
      onClose={onClose}
      id="person-dialog"
      className="person-dialog"
      labelledBy="person-title"
      initialFocus="#close-person"
    >
      {p && (
        <div className="person-sheet">
          <header className="person-toolbar">
            <button id="close-person" className="toggle" onClick={onClose}>
              <Icon name="back" />
              Back
            </button>
          </header>
          <div id="person-content" className="person-content" key={profile.id}>
            <div className="profile-identity">
              <Avatar id={profile.id} />
              <h2 id="person-title">{p.name}</h2>
              <div className="profile-categories">
                <Categories person={p} />
              </div>
            </div>
            <section className="profile-section profile-reason">
              <h3>Why connect</h3>
              <p>{profile.reason || p.reason}</p>
            </section>
            <section className="profile-section">
              <h3>Stack &amp; focus</h3>
              <p>{p.stack || p.role}</p>
            </section>
            <div className="profile-links">
              <div className="socials">
                {["github", "linkedin"].map((platform) => (
                  <button
                    key={platform}
                    className="social-link"
                    disabled={!p[platform]}
                    aria-label={`${platform === "github" ? "GitHub" : "LinkedIn"} profile for ${p.name}${!p[platform] ? " unavailable" : ""}`}
                    onClick={() =>
                      window.open(p[platform], "_blank", "noopener,noreferrer")
                    }
                  >
                    <SocialIcon platform={platform} />
                    {platform === "github" ? "GitHub" : "LinkedIn"}
                  </button>
                ))}
                {!p.github && !p.linkedin && (
                  <p className="social-notice">
                    Demo links unavailable · no accounts connected
                  </p>
                )}
              </div>
            </div>
          </div>
          <footer className="person-footer">
            <button
              id="person-message"
              className="profile-message"
              onClick={() => onMessage(profile.id)}
            >
              Message {p.name.split(" ")[0]}
            </button>
            <p>Synthetic portrait · Fictional person · Local demo</p>
          </footer>
        </div>
      )}
    </Modal>
  );
}
