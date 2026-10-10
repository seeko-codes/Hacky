-- Keeps teams.search_tsv current for keyword (full-text) search, like
-- member_profiles in 0002. Weights: wanted skills A, name + track B, idea C.
CREATE FUNCTION teams_search_tsv() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', array_to_string(NEW.wanted_skills, ' ')), 'A') ||
    setweight(to_tsvector('english', concat_ws(' ', NEW.name, NEW.track)), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.idea, '')), 'C');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER teams_search_tsv
  BEFORE INSERT OR UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION teams_search_tsv();
--> statement-breakpoint
-- member_profiles: motivations join weight B (interests + motivations + track).
-- Existing rows all have empty motivations, so their search_tsv is unchanged.
CREATE OR REPLACE FUNCTION member_profiles_search_tsv() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', array_to_string(NEW.skills, ' ')), 'A') ||
    setweight(to_tsvector('english', concat_ws(' ',
      array_to_string(NEW.interests, ' '),
      array_to_string(NEW.motivations, ' '),
      NEW.track)), 'B') ||
    setweight(to_tsvector('english', concat_ws(' ', NEW.idea, NEW.summary)), 'C');
  RETURN NEW;
END;
$$;
