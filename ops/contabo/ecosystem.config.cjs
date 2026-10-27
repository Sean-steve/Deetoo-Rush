// Install to /srv/deetoo/shared/ecosystem.config.cjs.
// Run PM2 as the unprivileged deploy user, not root.
module.exports = {
  apps: [
    {
      name: 'deetoo-api',
      cwd: '/srv/deetoo/current',
      script: 'dist/api/server.cjs',
      node_args: '--import dotenv/config',
      env: { NODE_ENV: 'production', APP_ENV: 'production' },
      autorestart: true,
      max_memory_restart: '800M',
      time: true,
    },
    {
      name: 'deetoo-workers',
      cwd: '/srv/deetoo/current',
      script: 'pnpm',
      args: 'workers:start',
      interpreter: 'none',
      env: { NODE_ENV: 'production', APP_ENV: 'production' },
      autorestart: true,
      max_memory_restart: '800M',
      time: true,
    },
  ],
};
