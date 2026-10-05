export default ({ config }) => ({
  ...config,
  android: {
    ...(config.android || {}),
    ...(process.env.GOOGLE_SERVICES_JSON_PATH
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON_PATH }
      : {}),
  },
});
