export {};

declare global {
  interface Window {
    __SOBA_API_BASE_URL?: string;
    /** Set from root layout so client bundles honor runtime `NEXT_PUBLIC_SOBA_FEATURES_ALLOWED` (e.g. Docker). */
    __SOBA_FEATURES_ALLOWED?: string;
    /** Public URL of the designer (staff) app, injected from the server's runtime env. */
    __SOBA_DESIGNER_APP_URL?: string;
    /** Public URL of the forms (submitter) app, injected from the server's runtime env. */
    __SOBA_FORMS_APP_URL?: string;
  }
}
