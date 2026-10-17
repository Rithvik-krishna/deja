// Deja schema: run once in Neo4j Browser / Aura query tab (loader also runs it)

CREATE CONSTRAINT service_id IF NOT EXISTS FOR (n:Service) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT engineer_id IF NOT EXISTS FOR (n:Engineer) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT deploy_id IF NOT EXISTS FOR (n:Deploy) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT incident_id IF NOT EXISTS FOR (n:Incident) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT fix_id IF NOT EXISTS FOR (n:Fix) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT attempt_id IF NOT EXISTS FOR (n:Attempt) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT session_id IF NOT EXISTS FOR (n:Session) REQUIRE n.id IS UNIQUE;
CREATE INDEX service_name IF NOT EXISTS FOR (s:Service) ON (s.name);
CREATE INDEX incident_symptom IF NOT EXISTS FOR (i:Incident) ON (i.symptom);
CREATE INDEX incident_started IF NOT EXISTS FOR (i:Incident) ON (i.started_at);
CREATE INDEX incident_status IF NOT EXISTS FOR (i:Incident) ON (i.status);
