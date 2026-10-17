/**
 * `ChatResponse.intent` is a free-form string. Today the backend emits only:
 *   alert | outcome | recall | owner | reassign | no_incident | help | error
 * and nothing for the Evidence Shock / stress-test flow, so this value is UNCONFIRMED.
 * It is wired up so that the Stress Test tab opens as soon as the backend reports such an intent;
 * until then it never fires. Confirm the exact string with the backend owners (Nikhil / Abhi) before relying on it.
 */
export const STRESS_TEST_INTENT = "stress_test";
