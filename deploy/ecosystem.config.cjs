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
      // Cluster mode: run multiple instances across CPU cores
      // Requires Redis adapter for Socket.IO (set REDIS_URL)
      instances: process.env.BACKEND_INSTANCES || 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        MAX_SESSION_DURATION_SECONDS: 300,
        MAX_CONCURRENT_SESSIONS: 50,
      },
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '1G', // Auto-restart if memory exceeds 1GB per worker
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
