module.exports = {
  apps: [{
    name: "mpw-pickleball",
    script: "npm",
    args: "start",
    cwd: "/var/www/mpw-pickleball/current",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_memory_restart: "750M",
    env: { NODE_ENV: "production", PORT: "3100" },
  }],
};
