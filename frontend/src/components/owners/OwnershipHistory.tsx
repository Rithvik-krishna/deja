import type { OwnerResponse } from "../../api/client";

type OwnershipRecord = OwnerResponse["history"][number];

interface OwnershipHistoryProps {
  history: OwnershipRecord[];
  /** The record the backend resolved for the queried date (matched by its returned `valid_from`), if any. */
  matchedValidFrom: string | null | undefined;
}

/**
 * Chronological list of the records the backend returned. "Current" is a record with no end date;
 * everything else was superseded. Dates are compared as the API's `YYYY-MM-DD` strings, never converted
 * through Date, so there is no timezone drift.
 */
export function OwnershipHistory({ history, matchedValidFrom }: OwnershipHistoryProps) {
  const records = [...history].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  if (records.length === 0) return <p className="state">The backend returned no ownership records for this service.</p>;

  return (
    <ol className="ownership-history">
      {records.map((r) => {
        const current = r.valid_to === null || r.valid_to === undefined;
        const onDate = matchedValidFrom != null && r.valid_from === matchedValidFrom;
        return (
          <li key={`${r.engineer}-${r.valid_from}`} className={current ? "is-current" : "is-superseded"}>
            <span className="own-name">{r.engineer}</span>
            <span className={`badge ${current ? "badge-resolved" : ""}`}>{current ? "Current" : "Superseded"}</span>
            {onDate && <span className="badge badge-sev3">Owner on selected date</span>}
            <span className="row-meta">
              {r.valid_from} → {current ? "present" : r.valid_to}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
