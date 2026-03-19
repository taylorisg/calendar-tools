/**
 * CLI entry point for notes → tasks conversion
 */

import { createTasksFromNotes } from './motionNotesAgent.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadEnvironmentVariables() {
  try {
    const envPath = join(__dirname, '..', '.env');
    const envContent = readFileSync(envPath, 'utf8');
    const envVars: Record<string, string> = {};
    
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          envVars[key.trim()] = valueParts.join('=').trim();
        }
      }
    });
    
    return envVars;
  } catch (error) {
    console.error('❌ Error loading .env file:', error instanceof Error ? error.message : 'Unknown error');
    console.log('💡 Make sure you have a .env file with MOTION_API_KEY, MOTION_WORKSPACE_ID, and OPENAI_API_KEY');
    process.exit(1);
  }
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const forceTriage = args.includes('--triage') || args.includes('-t');
  const notes = args.filter(arg => !arg.startsWith('--') && arg !== '-t').join(' ').trim();
  
  if (!notes) {
    console.error('Usage: npm run motion-notes -- "your notes here" [--triage]');
    console.error('\nOptions:');
    console.error('  --triage, -t    Send all tasks to triage project (skip project matching)');
    console.error('\nExamples:');
    console.error('  npm run motion-notes -- "Follow up with engineering on pricing API. Due by Friday."');
    console.error('  npm run motion-notes -- "Review PR and update docs" --triage');
    process.exit(1);
  }

  // Load environment variables
  const env = loadEnvironmentVariables();

  // Set environment variables on process.env so they're available to all modules
  Object.entries(env).forEach(([key, value]) => {
    process.env[key] = value;
  });

  // Validate required environment variables
  if (!env.MOTION_API_KEY) {
    console.error('❌ Missing MOTION_API_KEY in .env file');
    process.exit(1);
  }

  if (!env.MOTION_WORKSPACE_ID) {
    console.error('❌ Missing MOTION_WORKSPACE_ID in .env file');
    process.exit(1);
  }

  if (!env.OPENAI_API_KEY) {
    console.error('❌ Missing OPENAI_API_KEY in .env file');
    console.error('💡 Get your API key from: https://platform.openai.com/api-keys');
    process.exit(1);
  }

  try {
    await createTasksFromNotes(notes, env.MOTION_API_KEY, env.MOTION_WORKSPACE_ID, forceTriage);
    console.log('🎉 Notes → Tasks conversion completed!');
  } catch (error) {
    console.error('\n❌ Fatal error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Unhandled error:', err);
  process.exit(1);
});

