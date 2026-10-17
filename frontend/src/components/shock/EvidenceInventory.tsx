import type { HypothesisResponse } from "../../api/client";
import { compareSources, sourceLabel } from "./types";

type HypothesisItem = HypothesisResponse["hypotheses"][number];
type Evidence = NonNullable<HypothesisItem["evidence"]>[number];

interface EvidenceInventoryProps {
  hypotheses: HypothesisItem[];
  selectedIds: Set<string>;
  selectedSources: Set<string>;
  /** Ids the backend reported as removed in the latest result. */
  removedIds: Set<string>;
  /** Source -> aggregate impact, only when a result has supplied critical_sources. */
  sourceImpact: Map<string, number>;
  disabled: boolean;
  onToggleId: (id: string) => void;
  onToggleSource: (source: string) => void;
}

/** Backend-supplied evidence ids are the stable identifiers; items are de-duplicated by id and grouped by `source`. */
export function EvidenceInventory({ hypotheses, selectedIds, selectedSources, removedIds, sourceImpact, disabled, onToggleId, onToggleSource }: EvidenceInventoryProps) {
  const byId = new Map<string, Evidence>();
  hypotheses.forEach((h) => h.evidence?.forEach((e) => byId.set(e.id, e)));
  const groups = new Map<string, Evidence[]>();
  byId.forEach((e) => groups.set(e.source, [...(groups.get(e.source) ?? []), e]));
  const sources = [...groups.keys()].sort(compareSources);

  if (sources.length === 0) return <p className="state">The backend returned no evidence items for this incident.</p>;

  return (
    <div className="evidence-inventory">
      {sources.map((source) => {
        const items = groups.get(source) ?? [];
        const sourceOn = selectedSources.has(source);
        const impact = sourceImpact.get(source);
        return (
          <fieldset key={source} className={`evidence-group${sourceOn ? " is-selected" : ""}`} disabled={disabled} aria-label={sourceLabel(source)}>
            <label className="group-head">
              <input type="checkbox" checked={sourceOn} onChange={() => onToggleSource(source)} aria-label={`Remove entire source: ${sourceLabel(source)}`} />
              <span className="group-name">{sourceLabel(source)}</span>
              <code className="group-id">{source}</code>
              <span className="row-meta">
                {items.length} item{items.length === 1 ? "" : "s"}
                {impact !== undefined && <> · impact {impact}</>}
              </span>
            </label>
            <ul>
              {items.map((e) => {
                const viaSource = sourceOn;
                const picked = selectedIds.has(e.id) || viaSource;
                const removed = removedIds.has(e.id);
                return (
                  <li key={e.id} className={`${picked ? "is-selected " : ""}${removed ? "is-removed" : ""}`}>
                    <label>
                      <input type="checkbox" checked={picked} disabled={viaSource} onChange={() => onToggleId(e.id)} />
                      <span className="ev-label">{e.label}</span>
                    </label>
                    <span className="ev-meta row-meta">
                      <code>{e.id}</code> · {e.owner_service} · weight {e.weight}
                    </span>
                    <span className="ev-badges">
                      {viaSource ? (
                        <span className="badge badge-sev3">Selected via source</span>
                      ) : (
                        picked && <span className="badge badge-sev3">Selected for removal</span>
                      )}
                      {removed && <span className="badge badge-failed">Removed in latest result</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
    </div>
  );
}
