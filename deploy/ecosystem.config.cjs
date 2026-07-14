// PM2 Process Manager Config
// Run: pm2 start ecosystem.config.cjs
// Then: pm2 save && pm2 startup

module.exports = {
  apps: [
    {
      name: 'salesbot-backend',
      cwd: './backend',
      script: 'src/index.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'salesbot-stt',
      cwd: './servers',
      script: 'stt_server.py',
      interpreter: 'python3',
      env: {
        WHISPER_MODEL: 'base'
      },
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'salesbot-tts',
      cwd: './servers',
      script: 'startup_tts.sh',
      interpreter: 'bash',
      env: {
        PIPER_VOICE: 'en_US-lessac-medium'
      },
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
