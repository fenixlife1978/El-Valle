const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// The base domain for Firebase Studio instances
const BASE_DOMAIN = 'firebase-studio-1755127519376.cluster-joak5ukfbnbyqspg4tewa33d24.cloudworkstations.dev';

// Path to the .env.local file
const envFilePath = path.join(process.cwd(), '.env.local');

// Spawn the 'next dev' command
// The `detached: true` and `stdio: 'pipe'` options are important for parent process to exit independently
const nextServer = spawn('npm', ['run', 'dev:next'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  detached: true,
  shell: process.platform === 'win32', // Use shell on Windows
});

let portDetected = false;

// Function to update the .env.local file
const updateEnvFile = (port) => {
  const devOrigin = `https://\${port}-${BASE_DOMAIN}`;
  const envContent = `DEV_ORIGIN=${devOrigin}\n`;

  fs.writeFile(envFilePath, envContent, (err) => {
    if (err) {
      console.error('❌ Error writing to .env.local:', err);
    } else {
      console.log('✅ .env.local updated with:');
      console.log(envContent.trim());
    }
  });
};

// Listen for stdout data from the Next.js server process
nextServer.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(output); // Pipe the output to the console so we see Next.js logs

  if (!portDetected) {
    // Regex to find the port number from Next.js startup log
    const portMatch = output.match(/- Local:\s+http:\/\/localhost:(\d+)/);

    if (portMatch && portMatch[1]) {
      const port = portMatch[1];
      console.log(`\n✨ Next.js port detected: ${port}`);
      updateEnvFile(port);
      portDetected = true; // Prevent multiple updates
    }
  }
});

// Listen for stderr data
nextServer.stderr.on('data', (data) => {
    const output = data.toString();
    console.error(output); // Pipe errors to the console

    if (!portDetected) {
        // Next.js sometimes outputs the "port in use" message to stderr
        const portMatch = output.match(/using available port (\d+)/);
        if (portMatch && portMatch[1]) {
            const port = portMatch[1];
            console.log(`\n✨ Next.js fallback port detected: ${port}`);
            updateEnvFile(port);
            portDetected = true;
        }
    }
});

nextServer.on('error', (err) => {
  console.error('❌ Failed to start Next.js server:', err);
});

// When the main script exits, ensure the child process is also killed.
process.on('exit', () => {
    if (nextServer.pid) {
        process.kill(-nextServer.pid, 'SIGKILL');
    }
});
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
