#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
function loadEnvironmentVariables() {
  try {
    const envContent = readFileSync(join(__dirname, '.env'), 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    });
    
    return envVars;
  } catch (error) {
    console.error('❌ Error loading .env file:', error.message);
    console.log('💡 Make sure you have a .env file with MOTION_API_KEY and MOTION_WORKSPACE_ID');
    process.exit(1);
  }
}

// API client for fetching projects
class MotionAPI {
  constructor(apiKey, workspaceId) {
    this.apiKey = apiKey;
    this.workspaceId = workspaceId;
  }

  async makeRequest(endpoint, method = 'GET', body = null) {
    const url = `https://api.usemotion.com/v1${endpoint}`;
    const options = {
      method,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`❌ API request failed: ${error.message}`);
      throw error;
    }
  }

  async getProjects() {
    return await this.makeRequest(`/projects?workspaceId=${this.workspaceId}`, 'GET');
  }
}

// Format date for display
function formatDate(dateString) {
  if (!dateString) return 'No due date';
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

// Format project status
function formatStatus(status) {
  if (!status) return 'Unknown';
  if (typeof status === 'object' && status.name) {
    return status.name;
  }
  if (typeof status === 'string') {
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  }
  return 'Unknown';
}

// Search projects by name (case-insensitive partial matching)
function searchProjects(projects, searchTerm) {
  if (!searchTerm) return projects;
  
  const searchLower = searchTerm.toLowerCase();
  return projects.filter(project => {
    const name = (project.name || project.title || '').toLowerCase();
    return name.includes(searchLower);
  });
}

// Main execution
async function main() {
  // Check for search term in command line arguments
  const searchTerm = process.argv[2];
  
  if (searchTerm) {
    console.log(`🔍 Searching for projects matching: "${searchTerm}"\n`);
  } else {
    console.log('🔍 Fetching Motion Projects...\n');
  }

  // Load configuration
  const env = loadEnvironmentVariables();

  // Validate required environment variables
  if (!env.MOTION_API_KEY || !env.MOTION_WORKSPACE_ID) {
    console.error('❌ Missing required environment variables:');
    console.error('   - MOTION_API_KEY');
    console.error('   - MOTION_WORKSPACE_ID');
    console.log('\n💡 Copy env.example to .env and fill in your values');
    process.exit(1);
  }

  const api = new MotionAPI(env.MOTION_API_KEY, env.MOTION_WORKSPACE_ID);
  
  try {
    const data = await api.getProjects();
    
    // Handle different possible response formats
    let allProjects = [];
    if (Array.isArray(data)) {
      allProjects = data;
    } else if (data.projects && Array.isArray(data.projects)) {
      allProjects = data.projects;
    } else if (data.data && Array.isArray(data.data)) {
      allProjects = data.data;
    } else {
      console.log('📋 API Response:');
      console.log(JSON.stringify(data, null, 2));
      console.log('\n💡 Please check the Motion API documentation for the correct projects endpoint.');
      return;
    }
    
    if (!allProjects || allProjects.length === 0) {
      console.log('📋 No projects found in your workspace.');
      console.log('💡 Create a project in Motion first, or check your workspace ID.');
      return;
    }

    // Filter projects if search term provided
    const projects = searchProjects(allProjects, searchTerm);
    
    if (projects.length === 0) {
      console.log(`❌ No projects found matching "${searchTerm}"`);
      console.log('\n💡 Try a different search term or run without arguments to see all projects:');
      console.log('   npm run fetch-projects');
      console.log('   npm run fetch-projects "specialty"');
      return;
    }

    if (searchTerm) {
      console.log(`📋 Found ${projects.length} project(s) matching "${searchTerm}":`);
    } else {
      console.log('📋 Projects in Workspace:');
    }
    console.log('=' .repeat(60));
    
    projects.forEach((project, index) => {
      console.log(`\n${index + 1}. ${project.name || project.title || 'Unnamed'}`);
      console.log(`   ID: ${project.id}`);
      console.log(`   Status: ${formatStatus(project.status)}`);
      console.log(`   Due: ${formatDate(project.dueDate)}`);
      
      if (project.description) {
        // Truncate long descriptions
        const description = project.description.length > 100 
          ? project.description.substring(0, 100) + '...'
          : project.description;
        console.log(`   Description: ${description}`);
      }
    });

    if (projects.length === 1) {
      console.log('\n✅ Perfect match! Copy this project ID:');
      console.log(`   ${projects[0].id}`);
      console.log('\n💡 Add it to your tasks.json:');
      console.log(`   { "projectId": "${projects[0].id}", "tasks": [...] }`);
    } else {
      console.log('\n💡 To use an existing project:');
      console.log('   1. Copy the project ID from above');
      console.log('   2. Add it to your tasks.json file:');
      console.log('      { "projectId": "proj_abc123", "tasks": [...] }');
      console.log('   3. Run: npm start');
    }
    
    if (searchTerm && projects.length < allProjects.length) {
      console.log(`\n💡 Found ${projects.length} of ${allProjects.length} total projects.`);
      console.log('   Try a broader search term to see more results.');
    }
    
  } catch (error) {
    console.error('❌ Error fetching projects:', error.message);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main function
main().catch(error => {
  console.error('❌ Main function error:', error.message);
  process.exit(1);
});
