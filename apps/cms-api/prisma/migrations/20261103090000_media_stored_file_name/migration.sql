-- Data migration: renames every file_library row (live and tombstoned) to
-- <stem>_<left(sha256, 8)>.<ext>, the same rule as storedFileNameOf in
-- modules/media/domain/MediaUpload.rules.ts (SPEC 15.2 MU-3). Changes only
-- file_name. Running it again changes no row.
WITH media_types (mime_type, canonical_extension, alternate_extension) AS (
  VALUES
    ('image/jpeg', 'jpg', 'jpeg'),
    ('image/png', 'png', NULL),
    ('image/webp', 'webp', NULL),
    ('image/gif', 'gif', NULL),
    ('image/avif', 'avif', NULL),
    ('application/pdf', 'pdf', NULL),
    ('video/mp4', 'mp4', NULL)
),
parsed AS (
  SELECT
    f.id,
    t.canonical_extension,
    t.alternate_extension,
    COALESCE(substring(f.file_name FROM '^(.+)\.[^.]*$'), f.file_name) AS raw_stem,
    lower(COALESCE(substring(f.file_name FROM '^.+\.([^.]*)$'), '')) AS original_extension,
    '_' || left(f.sha256, 8) AS hash_suffix
  FROM file_library f
  JOIN media_types t ON t.mime_type = f.mime_type
),
suffixed AS (
  SELECT
    id,
    CASE
      WHEN original_extension IN (canonical_extension, alternate_extension) THEN original_extension
      ELSE canonical_extension
    END AS extension,
    CASE
      WHEN right(raw_stem, length(hash_suffix)) = hash_suffix
        THEN left(raw_stem, -length(hash_suffix))
      ELSE raw_stem
    END AS stem,
    hash_suffix
  FROM parsed
),
renamed AS (
  SELECT
    id,
    left(stem, 255 - length(hash_suffix || '.' || extension)) || hash_suffix || '.' || extension AS new_name
  FROM suffixed
)
UPDATE file_library f
SET file_name = r.new_name
FROM renamed r
WHERE f.id = r.id
  AND f.file_name IS DISTINCT FROM r.new_name;
