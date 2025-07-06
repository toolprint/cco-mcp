const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;

async function recordUI(outputPath, durationMs = 300000) {
  console.log('Starting UI recording...');
  console.log(`Output path: ${outputPath}`);
  console.log(`Duration: ${durationMs}ms`);
  
  let browser;
  let context;
  let page;
  
  try {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });
    
    // Launch browser in headless mode
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // Create context with video recording enabled
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: {
        dir: outputDir,
        size: { width: 1280, height: 720 }
      }
    });
    
    // Create page and navigate
    page = await context.newPage();
    console.log('Navigating to CCO-MCP dashboard...');
    
    try {
      await page.goto('http://localhost:5180', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      console.log('Successfully connected to dashboard');
    } catch (error) {
      console.warn('Warning: Could not load dashboard:', error.message);
      console.log('Recording will continue with blank page');
      // Try navigating to the backend URL instead
      try {
        await page.goto('http://localhost:8660', { 
          waitUntil: 'domcontentloaded',
          timeout: 10000 
        });
        console.log('Connected to backend URL instead');
      } catch (backendError) {
        console.warn('Could not connect to backend either');
      }
    }
    
    // Set up signal handlers for graceful shutdown
    let isClosing = false;
    const closeHandler = async (signal) => {
      if (isClosing) return;
      isClosing = true;
      console.log(`\nReceived ${signal}, stopping recording...`);
      
      try {
        await saveVideo();
      } catch (error) {
        console.error('Error during shutdown:', error);
      }
      
      process.exit(0);
    };
    
    process.on('SIGINT', () => closeHandler('SIGINT'));
    process.on('SIGTERM', () => closeHandler('SIGTERM'));
    
    // Function to save video
    const saveVideo = async () => {
      if (!page || !context) return;
      
      console.log('Closing browser to save video...');
      await page.close();
      await context.close();
      
      // Wait a moment for video to be saved
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Find the video file (it will have a generated name)
      const files = await fs.readdir(outputDir);
      const videoFile = files.find(f => f.endsWith('.webm'));
      
      if (videoFile) {
        const sourcePath = path.join(outputDir, videoFile);
        
        // Rename to desired output path
        try {
          await fs.rename(sourcePath, outputPath);
          console.log(`Video saved to: ${outputPath}`);
        } catch (renameError) {
          console.error('Error renaming video file:', renameError);
          console.log(`Video saved with original name: ${sourcePath}`);
        }
      } else {
        console.error('No video file found');
      }
      
      if (browser) {
        await browser.close();
      }
    };
    
    // Wait for duration or until process is killed
    console.log(`Recording for ${durationMs / 1000} seconds...`);
    console.log('Press Ctrl+C to stop recording early');
    
    await new Promise(resolve => {
      setTimeout(resolve, durationMs);
    });
    
    if (!isClosing) {
      await saveVideo();
    }
    
  } catch (error) {
    console.error('Error during recording:', error);
    if (browser) {
      await browser.close();
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const outputPath = args[0] || path.join(__dirname, 'recordings', `ui-recording-${Date.now()}.mp4`);
const duration = parseInt(args[1]) || 300000; // Default 5 minutes

// Validate arguments
if (args.length > 0 && !args[0]) {
  console.error('Usage: node record-ui.js [output-path] [duration-ms]');
  process.exit(1);
}

// Start recording
recordUI(outputPath, duration).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});