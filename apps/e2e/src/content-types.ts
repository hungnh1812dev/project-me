/** Content type of the smoke stack with lists, rich text and relations. */
export const CV_PAGE_SLUG = 'cv-page';

/** Content type of the smoke stack with a media field and a list view. */
export const PROFILE_SLUG = 'profile';

const UUID_SEGMENT = '[0-9a-f-]{36}';

/** URL of an admin edit page for a document of `slug`. */
export const editUrlPattern = (slug: string): RegExp =>
  new RegExp(`/content/${slug}/${UUID_SEGMENT}$`);
