# Conventions archive
Moved out of `conventions.md` when it passed its size limit. Grep on demand; never read at start.

- Dev-only proxy body limit accepted (moved 2026-11-02 by the manager): a 10-20 MB upload through the dev web origin returns 500; the API's 413 is the correct answer; not a production issue.
