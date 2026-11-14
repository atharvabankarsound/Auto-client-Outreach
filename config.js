/* Site configuration.
   Paste your Google OAuth "Web application" client ID below (see README.md).
   Visitors can also paste their own client ID in Settings, which overrides this. */
window.OUTREACH_CONFIG = {
  googleClientId: "",          // e.g. "1234567890-abc123.apps.googleusercontent.com"
  appName: "Auto Client Outreach",
  defaultDelaySeconds: [25, 45], // random pause between emails (min, max)
  defaultDailyLimit: 100         // per sender per day; Gmail's own cap is ~500 (personal) / 2,000 (Workspace)
};
